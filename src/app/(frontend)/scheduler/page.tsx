'use client'

import { useState, useMemo, useCallback, useRef, type MouseEvent } from 'react'
import { useStaff, type EngineStaffMember } from '@/hooks/useStaff'

// ─── Types ────────────────────────────────────────────────────────────────────

type RuleParams = {
  minRestHours?: number
  maxHours?: number
  penaltyPerHour?: number
  maxConsecutive?: number
  penaltyPerExtra?: number
  penaltyPerRankStep?: number
  maxWeekendShifts?: number
}

type WfmRule = {
  id: string
  type: 'hard' | 'soft'
  name: string
  description: string
  enabled: boolean
  params: RuleParams
  penaltyThreshold?: number
}

type StaffShiftHistory = {
  lastEndHour: number | null
  consecutiveDays: number
  weekendShifts: number
}
type SoftViolation = { ruleId: string; ruleName: string; penalty: number; detail: string }
type ScoreCandidateResult = {
  eligible: boolean
  hardViolation: string | null
  softPenalty: number
  softViolations: SoftViolation[]
}
type SlotUnmet = { skill: string; count: number }
type SlotScheduleWarning = SoftViolation & { staffId: string; staffName: string }
type AssignedWithPenalty = EngineStaffMember & { _softPenalty?: number }

type SlotConfig = {
  id: string
  start: number
  end: number
  type: string
  req: { skill: string; count: number }[]
}

type ScheduleSlotItem = {
  slot: SlotConfig
  assigned: AssignedWithPenalty[]
  unmet: SlotUnmet[]
  warnings: SlotScheduleWarning[]
  date: Date
  dayIndex: number
}

type ScheduleSlotOverride = Partial<Pick<ScheduleSlotItem, 'assigned' | 'unmet' | 'warnings'>>
type DayName = 'Sunday' | 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday'

// ─── Constants ────────────────────────────────────────────────────────────────

const INITIAL_RULES: WfmRule[] = [
  {
    id: 'hard-min-rest',
    type: 'hard',
    name: 'Minimum rest between shifts',
    description: 'Staff must rest for at least N hours between consecutive shifts.',
    enabled: true,
    params: { minRestHours: 8 },
  },
  {
    id: 'hard-max-weekly-hours',
    type: 'hard',
    name: 'Maximum weekly hours',
    description: 'Staff cannot exceed their contracted maximum weekly hours.',
    enabled: true,
    params: { maxHours: 40 },
  },
  {
    id: 'hard-workgroup-qualified',
    type: 'hard',
    name: 'Workgroup qualification required',
    description: 'Staff may only be assigned to workgroups in their skill profile.',
    enabled: true,
    params: {},
  },
  {
    id: 'soft-preferred-hours',
    type: 'soft',
    name: 'Preferred working hours',
    description: 'Hours outside preferred window carry a penalty.',
    enabled: true,
    penaltyThreshold: 20,
    params: { penaltyPerHour: 2 },
  },
  {
    id: 'soft-consecutive',
    type: 'soft',
    name: 'Consecutive shifts',
    description: 'Extra shifts beyond the consecutive limit are penalised.',
    enabled: true,
    penaltyThreshold: 15,
    params: { maxConsecutive: 3, penaltyPerExtra: 5 },
  },
  {
    id: 'soft-workgroup-rank',
    type: 'soft',
    name: 'Workgroup rank preference',
    description: 'Each rank step away from primary adds a penalty.',
    enabled: true,
    penaltyThreshold: 30,
    params: { penaltyPerRankStep: 3 },
  },
  {
    id: 'soft-weekend-balance',
    type: 'soft',
    name: 'Weekend shift balance',
    description: 'Distributes weekend shifts fairly.',
    enabled: false,
    penaltyThreshold: 12,
    params: { maxWeekendShifts: 2, penaltyPerExtra: 4 },
  },
]

const DAY_CONFIGS: Record<string, { slots: SlotConfig[] }> = {
  Monday: {
    slots: [
      { id: 'mon-am', start: 6, end: 14, type: 'morning', req: [{ skill: 'Sales', count: 2 }] },
      {
        id: 'mon-day',
        start: 8,
        end: 16,
        type: 'morning',
        req: [
          { skill: 'Supervisor', count: 1 },
          { skill: 'Support', count: 1 },
        ],
      },
      {
        id: 'mon-pm',
        start: 14,
        end: 22,
        type: 'afternoon',
        req: [
          { skill: 'Sales', count: 2 },
          { skill: 'Support', count: 1 },
        ],
      },
      { id: 'mon-n', start: 22, end: 24, type: 'night', req: [{ skill: 'Manager', count: 1 }] },
    ],
  },
  Tuesday: {
    slots: [
      {
        id: 'tue-am',
        start: 8,
        end: 16,
        type: 'morning',
        req: [
          { skill: 'Sales', count: 1 },
          { skill: 'Support', count: 1 },
        ],
      },
      {
        id: 'tue-pm',
        start: 14,
        end: 22,
        type: 'afternoon',
        req: [
          { skill: 'Sales', count: 2 },
          { skill: 'Supervisor', count: 1 },
        ],
      },
      { id: 'tue-n', start: 22, end: 24, type: 'night', req: [{ skill: 'Manager', count: 1 }] },
    ],
  },
  Wednesday: {
    slots: [
      { id: 'wed-e', start: 6, end: 14, type: 'morning', req: [{ skill: 'Sales', count: 1 }] },
      {
        id: 'wed-am',
        start: 8,
        end: 16,
        type: 'morning',
        req: [
          { skill: 'Supervisor', count: 1 },
          { skill: 'Support', count: 1 },
        ],
      },
      {
        id: 'wed-pm',
        start: 14,
        end: 22,
        type: 'afternoon',
        req: [
          { skill: 'Sales', count: 2 },
          { skill: 'Support', count: 1 },
        ],
      },
    ],
  },
  Thursday: {
    slots: [
      {
        id: 'thu-am',
        start: 8,
        end: 16,
        type: 'morning',
        req: [
          { skill: 'Sales', count: 2 },
          { skill: 'Supervisor', count: 1 },
        ],
      },
      {
        id: 'thu-pm',
        start: 16,
        end: 24,
        type: 'afternoon',
        req: [
          { skill: 'Sales', count: 1 },
          { skill: 'Support', count: 1 },
        ],
      },
      { id: 'thu-n', start: 22, end: 24, type: 'night', req: [{ skill: 'Manager', count: 1 }] },
    ],
  },
  Friday: {
    slots: [
      { id: 'fri-e', start: 6, end: 14, type: 'morning', req: [{ skill: 'Sales', count: 2 }] },
      {
        id: 'fri-pm',
        start: 14,
        end: 22,
        type: 'afternoon',
        req: [
          { skill: 'Sales', count: 2 },
          { skill: 'Support', count: 1 },
        ],
      },
      { id: 'fri-n', start: 22, end: 24, type: 'night', req: [{ skill: 'Manager', count: 1 }] },
    ],
  },
  Saturday: {
    slots: [
      {
        id: 'sat-am',
        start: 8,
        end: 16,
        type: 'morning',
        req: [
          { skill: 'Sales', count: 1 },
          { skill: 'Support', count: 1 },
        ],
      },
      { id: 'sat-pm', start: 16, end: 24, type: 'night', req: [{ skill: 'Sales', count: 1 }] },
    ],
  },
  Sunday: {
    slots: [
      { id: 'sun-am', start: 10, end: 18, type: 'morning', req: [{ skill: 'Sales', count: 1 }] },
      {
        id: 'sun-pm',
        start: 14,
        end: 22,
        type: 'afternoon',
        req: [{ skill: 'Support', count: 1 }],
      },
    ],
  },
}

const DAY_NAMES: DayName[] = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
]

// Light-mode shift type tokens
const SHIFT_TYPE_META: Record<
  string,
  {
    label: string
    accent: string
    bg: string
    border: string
    text: string
    pill: string
    pillText: string
  }
> = {
  morning: {
    label: 'Morning',
    accent: '#D97706',
    bg: '#FFFBEB',
    border: '#FDE68A',
    text: '#92400E',
    pill: '#FEF3C7',
    pillText: '#78350F',
  },
  afternoon: {
    label: 'Afternoon',
    accent: '#4F46E5',
    bg: '#EEF2FF',
    border: '#C7D2FE',
    text: '#3730A3',
    pill: '#E0E7FF',
    pillText: '#312E81',
  },
  night: {
    label: 'Night',
    accent: '#7C3AED',
    bg: '#F5F3FF',
    border: '#DDD6FE',
    text: '#5B21B6',
    pill: '#EDE9FE',
    pillText: '#4C1D95',
  },
  manager: {
    label: 'Manager',
    accent: '#059669',
    bg: '#ECFDF5',
    border: '#A7F3D0',
    text: '#065F46',
    pill: '#D1FAE5',
    pillText: '#064E3B',
  },
}

// ─── Colour helpers ───────────────────────────────────────────────────────────

// Avatar colour by initials
const AVATAR_COLORS = [
  { bg: '#EEF2FF', text: '#4F46E5' },
  { bg: '#FEF3C7', text: '#92400E' },
  { bg: '#ECFDF5', text: '#065F46' },
  { bg: '#FDF2F8', text: '#9D174D' },
  { bg: '#F0F9FF', text: '#0C4A6E' },
  { bg: '#FFF7ED', text: '#9A3412' },
]
const avatarColor = (id: string) => AVATAR_COLORS[id.charCodeAt(0) % AVATAR_COLORS.length]

// ─── Rule Engine ──────────────────────────────────────────────────────────────

function evaluateHardRules(
  staff: EngineStaffMember,
  slot: SlotConfig,
  _dayIndex: number,
  weeklyHoursUsed: Map<string, number>,
  shiftsThisWeek: Map<string, StaffShiftHistory>,
  rules: readonly WfmRule[],
): string | null {
  const dur = slot.end - slot.start
  for (const rule of rules.filter((r) => r.type === 'hard' && r.enabled)) {
    switch (rule.id) {
      case 'hard-workgroup-qualified': {
        const needed = slot.req.map((r) => r.skill)
        if (!needed.some((sk) => staff.workgroups.some((w) => w.id === sk)))
          return `Not qualified for ${needed.join(', ')}`
        break
      }
      case 'hard-max-weekly-hours': {
        const cap = rule.params.maxHours ?? 40
        const used = weeklyHoursUsed.get(staff.id) ?? 0
        if (used + dur > cap) return `Would exceed ${cap}h/week (${used}h used)`
        break
      }
      case 'hard-min-rest': {
        const minRest = rule.params.minRestHours ?? 8
        const lastEnd = shiftsThisWeek.get(staff.id)?.lastEndHour ?? null
        if (lastEnd !== null) {
          const gap = slot.start - lastEnd
          if (gap >= 0 && gap < minRest) return `Only ${gap}h rest (min ${minRest}h)`
        }
        break
      }
    }
  }
  return null
}

function evaluateSoftRules(
  staff: EngineStaffMember,
  slot: SlotConfig,
  dayIndex: number,
  weeklyHoursUsed: Map<string, number>,
  shiftsThisWeek: Map<string, StaffShiftHistory>,
  rules: readonly WfmRule[],
): { totalPenalty: number; violations: SoftViolation[] } {
  const dur = slot.end - slot.start
  let totalPenalty = 0
  const violations: SoftViolation[] = []
  for (const rule of rules.filter((r) => r.type === 'soft' && r.enabled)) {
    switch (rule.id) {
      case 'soft-preferred-hours': {
        const [ps, pe] = staff.preferredWindow
        const pph = rule.params.penaltyPerHour ?? 2
        const outside = dur - Math.max(0, Math.min(slot.end, pe) - Math.max(slot.start, ps))
        if (outside > 0) {
          const p = outside * pph
          totalPenalty += p
          violations.push({
            ruleId: rule.id,
            ruleName: rule.name,
            penalty: p,
            detail: `${outside}h outside preferred window`,
          })
        }
        break
      }
      case 'soft-consecutive': {
        const max = rule.params.maxConsecutive ?? 3
        const ppe = rule.params.penaltyPerExtra ?? 5
        const consec = shiftsThisWeek.get(staff.id)?.consecutiveDays ?? 0
        if (consec >= max) {
          const p = (consec - max + 1) * ppe
          totalPenalty += p
          violations.push({
            ruleId: rule.id,
            ruleName: rule.name,
            penalty: p,
            detail: `${consec + 1} consecutive days`,
          })
        }
        break
      }
      case 'soft-workgroup-rank': {
        const pps = rule.params.penaltyPerRankStep ?? 3
        for (const sk of slot.req.map((r) => r.skill)) {
          const wg = staff.workgroups.find((w) => w.id === sk)
          if (wg && wg.rank > 1) {
            const p = (wg.rank - 1) * pps
            totalPenalty += p
            violations.push({
              ruleId: rule.id,
              ruleName: rule.name,
              penalty: p,
              detail: `${sk} is rank-${wg.rank}`,
            })
          }
        }
        break
      }
      case 'soft-weekend-balance': {
        if (dayIndex === 0 || dayIndex === 6) {
          const maxW = rule.params.maxWeekendShifts ?? 2
          const ppe2 = rule.params.penaltyPerExtra ?? 4
          const wknd = shiftsThisWeek.get(staff.id)?.weekendShifts ?? 0
          if (wknd >= maxW) {
            totalPenalty += ppe2
            violations.push({
              ruleId: rule.id,
              ruleName: rule.name,
              penalty: ppe2,
              detail: `${wknd} weekend shifts already`,
            })
          }
        }
        break
      }
    }
  }
  return { totalPenalty, violations }
}

function scoreCandidate(
  staff: EngineStaffMember,
  slot: SlotConfig,
  dayIndex: number,
  weeklyHoursUsed: Map<string, number>,
  assignedToday: Set<string>,
  shiftsThisWeek: Map<string, StaffShiftHistory>,
  rules: readonly WfmRule[],
): ScoreCandidateResult {
  if (!staff.availability.includes(dayIndex))
    return {
      eligible: false,
      hardViolation: 'Not available this day',
      softPenalty: 0,
      softViolations: [],
    }
  if (assignedToday.has(staff.id))
    return {
      eligible: false,
      hardViolation: 'Already assigned today',
      softPenalty: 0,
      softViolations: [],
    }
  const hardViolation = evaluateHardRules(
    staff,
    slot,
    dayIndex,
    weeklyHoursUsed,
    shiftsThisWeek,
    rules,
  )
  if (hardViolation) return { eligible: false, hardViolation, softPenalty: 0, softViolations: [] }
  const { totalPenalty, violations } = evaluateSoftRules(
    staff,
    slot,
    dayIndex,
    weeklyHoursUsed,
    shiftsThisWeek,
    rules,
  )
  const hoursLoad = Math.floor((weeklyHoursUsed.get(staff.id) ?? 0) / 8)
  return {
    eligible: true,
    hardViolation: null,
    softPenalty: totalPenalty + hoursLoad,
    softViolations: violations,
  }
}

function autoAssign(weekDays: Date[], rules: readonly WfmRule[], staff: EngineStaffMember[]) {
  const weeklyHoursUsed = new Map<string, number>(staff.map((s) => [s.id, 0]))
  const shiftsThisWeek = new Map<string, StaffShiftHistory>(
    staff.map((s) => [s.id, { lastEndHour: null, consecutiveDays: 0, weekendShifts: 0 }]),
  )
  const result = new Map<string, ScheduleSlotItem[]>()
  let weekTotalPenalty = 0
  const hardFailures: string[] = []

  for (const date of weekDays) {
    const dayIndex = date.getDay()
    const dayName = DAY_NAMES[dayIndex]
    const config = DAY_CONFIGS[dayName]
    if (!config) {
      result.set(dayName, [])
      continue
    }
    const assignedToday = new Set<string>()
    const resolved: ScheduleSlotItem[] = []
    for (const slot of config.slots) {
      const dur = slot.end - slot.start
      const slotAssigned: AssignedWithPenalty[] = []
      const slotUnmet: SlotUnmet[] = []
      const slotWarnings: SlotScheduleWarning[] = []
      for (const req of slot.req) {
        let remaining = req.count
        const candidates = staff
          .filter((s) => s.workgroups.some((w) => w.id === req.skill))
          .map((s) => ({
            staff: s,
            ...scoreCandidate(
              s,
              slot,
              dayIndex,
              weeklyHoursUsed,
              assignedToday,
              shiftsThisWeek,
              rules,
            ),
          }))
          .sort((a, b) =>
            a.eligible !== b.eligible ? (a.eligible ? -1 : 1) : a.softPenalty - b.softPenalty,
          )
        for (const { staff: s, eligible, softPenalty, softViolations } of candidates) {
          if (remaining <= 0) break
          if (!eligible) continue
          slotAssigned.push({ ...s, _softPenalty: softPenalty })
          assignedToday.add(s.id)
          weeklyHoursUsed.set(s.id, (weeklyHoursUsed.get(s.id) ?? 0) + dur)
          weekTotalPenalty += softPenalty
          const hist = shiftsThisWeek.get(s.id)!
          hist.lastEndHour = slot.end
          hist.consecutiveDays += 1
          if (dayIndex === 0 || dayIndex === 6) hist.weekendShifts += 1
          softViolations.forEach((v) =>
            slotWarnings.push({ staffId: s.id, staffName: s.name, ...v }),
          )
          remaining--
        }
        if (remaining > 0) {
          slotUnmet.push({ skill: req.skill, count: remaining })
          hardFailures.push(`${slot.id}: ${remaining}× ${req.skill} unfilled`)
        }
      }
      resolved.push({
        slot,
        assigned: slotAssigned,
        unmet: slotUnmet,
        warnings: slotWarnings,
        date,
        dayIndex,
      })
    }
    result.set(dayName, resolved)
  }
  return { schedule: result, weekTotalPenalty, hardFailures }
}

// ─── Shared sub-components ────────────────────────────────────────────────────

function Avatar({ initials, id, size = 36 }: { initials: string; id: string; size?: number }) {
  const c = avatarColor(id)
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: size / 3,
        background: c.bg,
        color: c.text,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size * 0.3,
        fontWeight: 700,
        letterSpacing: '0.02em',
        flexShrink: 0,
      }}
    >
      {initials}
    </div>
  )
}

function Badge({
  children,
  variant = 'neutral',
}: {
  children: React.ReactNode
  variant?: 'success' | 'warning' | 'danger' | 'info' | 'neutral'
}) {
  const styles: Record<string, { bg: string; text: string; border: string }> = {
    success: { bg: '#ECFDF5', text: '#065F46', border: '#A7F3D0' },
    warning: { bg: '#FFFBEB', text: '#92400E', border: '#FDE68A' },
    danger: { bg: '#FEF2F2', text: '#991B1B', border: '#FECACA' },
    info: { bg: '#EEF2FF', text: '#3730A3', border: '#C7D2FE' },
    neutral: { bg: '#F9FAFB', text: '#374151', border: '#E5E7EB' },
  }
  const s = styles[variant]
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '0.04em',
        padding: '2px 8px',
        borderRadius: 6,
        background: s.bg,
        color: s.text,
        border: `1px solid ${s.border}`,
      }}
    >
      {children}
    </span>
  )
}

function Toggle({ on, onChange }: { on: boolean; onChange: () => void }) {
  return (
    <div
      onClick={onChange}
      style={{
        width: 36,
        height: 20,
        borderRadius: 10,
        background: on ? '#4F46E5' : '#E5E7EB',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        padding: '0 2px',
        transition: 'background 0.2s',
        flexShrink: 0,
      }}
    >
      <div
        style={{
          width: 16,
          height: 16,
          borderRadius: '50%',
          background: 'white',
          boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
          transform: on ? 'translateX(16px)' : 'translateX(0)',
          transition: 'transform 0.2s',
        }}
      />
    </div>
  )
}

// ─── Shift Detail / Assign Modal ──────────────────────────────────────────────

type ShiftModalProps = {
  item: ScheduleSlotItem
  staff: EngineStaffMember[]
  weeklyHoursUsed: Map<string, number>
  rules: readonly WfmRule[]
  mode: 'view' | { replacingStaff: EngineStaffMember } | { forSkill: string }
  onConfirm: (slotId: string, assigned: EngineStaffMember[], unmet: SlotUnmet[]) => void
  onClose: () => void
}

function ShiftModal({
  item,
  staff,
  weeklyHoursUsed,
  rules,
  mode,
  onConfirm,
  onClose,
}: ShiftModalProps) {
  const [activeMode, setActiveMode] = useState<ShiftModalProps['mode']>(mode)
  const [selectedId, setSelectedId] = useState<string | null>(
    typeof activeMode === 'object' && 'replacingStaff' in activeMode
      ? activeMode.replacingStaff.id
      : null,
  )

  const isAssigning = activeMode !== 'view'
  const replacingStaff =
    typeof activeMode === 'object' && 'replacingStaff' in activeMode
      ? activeMode.replacingStaff
      : null
  const forSkill =
    typeof activeMode === 'object' && 'forSkill' in activeMode ? activeMode.forSkill : null
  const targetSkill = (forSkill ?? replacingStaff) ? item.slot.req[0]?.skill : null
  const meta = SHIFT_TYPE_META[item.slot.type] ?? SHIFT_TYPE_META.morning

  const fmt = (h: number) => `${String(h % 24).padStart(2, '0')}:00`
  const dayStr = item.date.toLocaleDateString('en-ZA', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })

  const candidates = useMemo(() => {
    if (!isAssigning) return []
    const currentIds = new Set(item.assigned.map((s) => s.id))
    const replacingId = replacingStaff?.id ?? null
    const assignedToday = new Set(
      item.assigned.filter((s) => s.id !== replacingId).map((s) => s.id),
    )
    return staff
      .map((s) => {
        const { eligible, hardViolation, softPenalty, softViolations } = scoreCandidate(
          s,
          item.slot,
          item.dayIndex,
          weeklyHoursUsed,
          assignedToday,
          new Map(
            staff.map((x) => [x.id, { lastEndHour: null, consecutiveDays: 0, weekendShifts: 0 }]),
          ),
          rules,
        )
        const alreadyOn = currentIds.has(s.id) && s.id !== replacingId
        return {
          staff: s,
          eligible: eligible && !alreadyOn,
          ineligibleReason: !eligible ? hardViolation : alreadyOn ? 'Already on this shift' : null,
          softPenalty,
          softViolations,
          wgRank: s.workgroups.find((w) => w.id === targetSkill)?.rank ?? null,
        }
      })
      .sort((a, b) =>
        a.eligible !== b.eligible ? (a.eligible ? -1 : 1) : a.softPenalty - b.softPenalty,
      )
  }, [activeMode, item, staff, weeklyHoursUsed, rules, targetSkill])

  const eligible = candidates.filter((c) => c.eligible)
  const ineligible = candidates.filter((c) => !c.eligible)

  const handleConfirmAssign = () => {
    if (!selectedId) return
    const newStaff = staff.find((s) => s.id === selectedId)
    if (!newStaff) return
    let updatedAssigned = [...item.assigned]
    let updatedUnmet = [...item.unmet]
    if (replacingStaff) {
      updatedAssigned = updatedAssigned.map((p) => (p.id === replacingStaff.id ? newStaff : p))
    } else if (forSkill) {
      updatedAssigned = [...updatedAssigned, newStaff]
      updatedUnmet = updatedUnmet
        .map((u) => (u.skill === forSkill ? { ...u, count: u.count - 1 } : u))
        .filter((u) => u.count > 0)
    }
    onConfirm(item.slot.id, updatedAssigned, updatedUnmet)
    if (updatedUnmet.length > 0) {
      setActiveMode('view')
      setSelectedId(null)
    } else {
      onClose()
    }
  }

  const scoreColor = (p: number) =>
    p === 0 ? '#059669' : p <= 4 ? '#D97706' : p <= 9 ? '#EA580C' : '#DC2626'
  const scoreBg = (p: number) =>
    p === 0 ? '#ECFDF5' : p <= 4 ? '#FFFBEB' : p <= 9 ? '#FFF7ED' : '#FEF2F2'
  const scoreLabel = (p: number) =>
    p === 0 ? 'Perfect' : p <= 4 ? 'Good' : p <= 9 ? 'Fair' : 'Poor'

  return (
    <div
      onClick={(e) => e.target === e.currentTarget && onClose()}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 500,
        background: 'rgba(15,23,42,0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        backdropFilter: 'blur(6px)',
      }}
    >
      <div
        style={{
          background: '#FFFFFF',
          border: '1px solid #E5E7EB',
          borderRadius: 20,
          width: '100%',
          maxWidth: 560,
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 24px 64px -12px rgba(15,23,42,0.18), 0 0 0 1px rgba(15,23,42,0.04)',
        }}
      >
        {/* Modal header */}
        <div style={{ padding: '24px 24px 0', flexShrink: 0 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              marginBottom: 20,
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: meta.accent,
                    display: 'inline-block',
                  }}
                />
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: meta.text,
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                  }}
                >
                  {meta.label} shift
                </span>
              </div>
              <div
                style={{
                  fontSize: 26,
                  fontWeight: 800,
                  color: '#0F172A',
                  letterSpacing: '-0.04em',
                  lineHeight: 1,
                  fontFamily: "'Instrument Serif', Georgia, serif",
                }}
              >
                {fmt(item.slot.start)} – {fmt(item.slot.end)}
              </div>
              <div style={{ fontSize: 13, color: '#64748B', marginTop: 5, fontWeight: 500 }}>
                {dayStr}
              </div>
            </div>
            <button
              onClick={onClose}
              style={{
                width: 34,
                height: 34,
                borderRadius: 10,
                border: '1px solid #E5E7EB',
                background: '#F9FAFB',
                cursor: 'pointer',
                color: '#9CA3AF',
                fontSize: 16,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.15s',
              }}
              onMouseEnter={(e) => {
                ;(e.currentTarget as HTMLElement).style.background = '#F3F4F6'
                ;(e.currentTarget as HTMLElement).style.color = '#374151'
              }}
              onMouseLeave={(e) => {
                ;(e.currentTarget as HTMLElement).style.background = '#F9FAFB'
                ;(e.currentTarget as HTMLElement).style.color = '#9CA3AF'
              }}
            >
              ✕
            </button>
          </div>

          {/* Role requirements */}
          <div
            style={{
              background: '#F8FAFC',
              borderRadius: 12,
              padding: '12px 14px',
              marginBottom: 20,
              border: '1px solid #F1F5F9',
            }}
          >
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: '#94A3B8',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                marginBottom: 8,
              }}
            >
              Role requirements
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {item.slot.req.map((r) => {
                const met = item.assigned.filter((p) =>
                  p.workgroups.some((w) => w.id === r.skill),
                ).length
                const ok = met >= r.count
                return (
                  <div
                    key={r.skill}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      background: ok ? '#ECFDF5' : '#FEF2F2',
                      border: `1px solid ${ok ? '#A7F3D0' : '#FECACA'}`,
                      borderRadius: 8,
                      padding: '5px 10px',
                    }}
                  >
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        background: ok ? '#10B981' : '#EF4444',
                        flexShrink: 0,
                      }}
                    />
                    <span
                      style={{ fontSize: 11, fontWeight: 700, color: ok ? '#065F46' : '#991B1B' }}
                    >
                      {r.count}× {r.skill}
                    </span>
                    {!ok && (
                      <span style={{ fontSize: 10, color: '#EF4444' }}>
                        ({r.count - met} missing)
                      </span>
                    )}
                    {ok && <span style={{ fontSize: 10, color: '#10B981' }}>✓</span>}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Tab strip */}
          <div style={{ display: 'flex', borderBottom: '1px solid #F1F5F9', gap: 0 }}>
            <button
              onClick={() => {
                setActiveMode('view')
                setSelectedId(null)
              }}
              style={{
                flex: 1,
                padding: '10px 0',
                fontSize: 12,
                fontWeight: 600,
                border: 'none',
                borderBottom: `2px solid ${!isAssigning ? '#4F46E5' : 'transparent'}`,
                background: 'none',
                color: !isAssigning ? '#4F46E5' : '#94A3B8',
                cursor: 'pointer',
                transition: 'color 0.15s',
              }}
            >
              Assigned staff
            </button>
            {item.unmet.length > 0 && (
              <button
                onClick={() => {
                  setActiveMode({ forSkill: item.unmet[0].skill })
                  setSelectedId(null)
                }}
                style={{
                  flex: 1,
                  padding: '10px 0',
                  fontSize: 12,
                  fontWeight: 600,
                  border: 'none',
                  borderBottom: `2px solid ${typeof activeMode === 'object' && 'forSkill' in activeMode ? '#EF4444' : 'transparent'}`,
                  background: 'none',
                  color:
                    typeof activeMode === 'object' && 'forSkill' in activeMode
                      ? '#EF4444'
                      : '#94A3B8',
                  cursor: 'pointer',
                }}
              >
                Fill gaps ({item.unmet.reduce((n, u) => n + u.count, 0)})
              </button>
            )}
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
          {/* VIEW */}
          {!isAssigning && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {item.assigned.length === 0 && (
                <div style={{ textAlign: 'center', padding: '40px 0', color: '#CBD5E1' }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>—</div>
                  <div style={{ fontSize: 13 }}>No staff assigned yet</div>
                </div>
              )}
              {item.assigned.map((p) => {
                const staffWarnings = item.warnings.filter((w) => w.staffId === p.id)
                return (
                  <div
                    key={p.id}
                    style={{
                      background: staffWarnings.length > 0 ? '#FFFBEB' : '#FAFAFA',
                      border: `1px solid ${staffWarnings.length > 0 ? '#FDE68A' : '#F1F5F9'}`,
                      borderRadius: 12,
                      padding: '12px 14px',
                      transition: 'all 0.15s',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <Avatar initials={p.initials} id={p.id} size={38} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#0F172A' }}>
                          {p.name}
                        </div>
                        <div style={{ display: 'flex', gap: 4, marginTop: 3, flexWrap: 'wrap' }}>
                          {p.workgroups.map((wg) => (
                            <span
                              key={wg.id}
                              style={{
                                fontSize: 10,
                                padding: '1px 7px',
                                borderRadius: 5,
                                background: '#F1F5F9',
                                color: '#475569',
                                fontWeight: 600,
                              }}
                            >
                              {wg.rank === 1 ? '★ ' : ''}
                              {wg.id}
                              {wg.rank > 1 ? ` r${wg.rank}` : ''}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center' }}>
                        {staffWarnings.length > 0 && (
                          <Badge variant="warning">⚠ {staffWarnings.length}</Badge>
                        )}
                        <button
                          onClick={() => {
                            setActiveMode({ replacingStaff: p })
                            setSelectedId(p.id)
                          }}
                          style={{
                            fontSize: 11,
                            fontWeight: 600,
                            padding: '5px 12px',
                            borderRadius: 8,
                            border: '1px solid #E5E7EB',
                            background: 'white',
                            color: '#374151',
                            cursor: 'pointer',
                            transition: 'all 0.15s',
                          }}
                          onMouseEnter={(e) => {
                            ;(e.currentTarget as HTMLElement).style.background = '#4F46E5'
                            ;(e.currentTarget as HTMLElement).style.color = 'white'
                            ;(e.currentTarget as HTMLElement).style.borderColor = '#4F46E5'
                          }}
                          onMouseLeave={(e) => {
                            ;(e.currentTarget as HTMLElement).style.background = 'white'
                            ;(e.currentTarget as HTMLElement).style.color = '#374151'
                            ;(e.currentTarget as HTMLElement).style.borderColor = '#E5E7EB'
                          }}
                        >
                          Replace
                        </button>
                      </div>
                    </div>
                    {staffWarnings.length > 0 && (
                      <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {staffWarnings.map((w, j) => (
                          <span
                            key={j}
                            style={{
                              fontSize: 10,
                              padding: '2px 8px',
                              background: '#FEF3C7',
                              color: '#92400E',
                              border: '1px solid #FDE68A',
                              borderRadius: 5,
                            }}
                          >
                            {w.ruleName}: {w.detail}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* ASSIGN */}
          {isAssigning && (
            <div>
              <div style={{ fontSize: 12, color: '#64748B', marginBottom: 14, fontWeight: 500 }}>
                {replacingStaff ? `Replacing ${replacingStaff.name}` : `Filling ${forSkill} gap`} —
                select a staff member
              </div>
              {eligible.length === 0 && (
                <div
                  style={{ textAlign: 'center', padding: '32px 0', color: '#CBD5E1', fontSize: 13 }}
                >
                  No eligible staff available
                </div>
              )}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                  marginBottom: ineligible.length > 0 ? 20 : 0,
                }}
              >
                {eligible.map(({ staff: s, softPenalty, softViolations, wgRank }, i) => {
                  const isSelected = selectedId === s.id
                  const isCurrent = s.id === replacingStaff?.id
                  const hoursUsed = weeklyHoursUsed.get(s.id) ?? 0
                  const pct = Math.min(100, (hoursUsed / s.maxHours) * 100)
                  const barColor = pct > 85 ? '#EF4444' : pct > 60 ? '#F59E0B' : '#10B981'
                  return (
                    <div
                      key={s.id}
                      onClick={() => setSelectedId(isSelected ? null : s.id)}
                      style={{
                        background: isSelected ? '#EEF2FF' : 'white',
                        border: `1.5px solid ${isSelected ? '#4F46E5' : '#E5E7EB'}`,
                        borderRadius: 12,
                        padding: '12px 14px',
                        cursor: 'pointer',
                        transition: 'all 0.15s',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div
                          style={{
                            width: 26,
                            height: 26,
                            borderRadius: 8,
                            background: i === 0 ? '#ECFDF5' : '#F1F5F9',
                            border: `1px solid ${i === 0 ? '#A7F3D0' : '#E5E7EB'}`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 10,
                            fontWeight: 800,
                            color: i === 0 ? '#065F46' : '#94A3B8',
                            flexShrink: 0,
                          }}
                        >
                          {i + 1}
                        </div>
                        <Avatar initials={s.initials} id={s.id} size={36} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 6,
                              flexWrap: 'wrap',
                            }}
                          >
                            <span style={{ fontSize: 13, fontWeight: 700, color: '#0F172A' }}>
                              {s.name}
                            </span>
                            {isCurrent && <Badge variant="info">current</Badge>}
                            {i === 0 && !isCurrent && <Badge variant="success">best match</Badge>}
                            {wgRank && <Badge variant="neutral">rank {wgRank}</Badge>}
                          </div>
                          <div style={{ display: 'flex', gap: 3, marginTop: 4, flexWrap: 'wrap' }}>
                            {s.workgroups.map((wg) => (
                              <span
                                key={wg.id}
                                style={{
                                  fontSize: 10,
                                  padding: '1px 6px',
                                  borderRadius: 4,
                                  fontWeight: 600,
                                  background: wg.id === targetSkill ? '#ECFDF5' : '#F1F5F9',
                                  color: wg.id === targetSkill ? '#065F46' : '#64748B',
                                  border: `1px solid ${wg.id === targetSkill ? '#A7F3D0' : '#E5E7EB'}`,
                                }}
                              >
                                {wg.rank === 1 ? '★ ' : ''}
                                {wg.id}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'flex-end',
                            gap: 2,
                            flexShrink: 0,
                          }}
                        >
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 700,
                              padding: '2px 8px',
                              borderRadius: 6,
                              background: scoreBg(softPenalty),
                              color: scoreColor(softPenalty),
                            }}
                          >
                            {scoreLabel(softPenalty)}
                          </span>
                          <span style={{ fontSize: 10, color: '#94A3B8' }}>
                            {hoursUsed}h / {s.maxHours}h
                          </span>
                        </div>
                      </div>
                      {softViolations.length > 0 && (isSelected || softPenalty > 0) && (
                        <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {softViolations.map((v, j) => (
                            <span
                              key={j}
                              style={{
                                fontSize: 10,
                                padding: '2px 8px',
                                background: '#FFF7ED',
                                color: '#9A3412',
                                border: '1px solid #FDBA74',
                                borderRadius: 5,
                              }}
                            >
                              {v.ruleName}: {v.detail} (+{v.penalty}pts)
                            </span>
                          ))}
                        </div>
                      )}
                      <div
                        style={{
                          marginTop: 10,
                          height: 3,
                          background: '#F1F5F9',
                          borderRadius: 99,
                        }}
                      >
                        <div
                          style={{
                            height: '100%',
                            width: `${pct}%`,
                            background: barColor,
                            borderRadius: 99,
                            transition: 'width 0.4s ease',
                          }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
              {ineligible.length > 0 && (
                <div>
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: '#CBD5E1',
                      textTransform: 'uppercase',
                      letterSpacing: '0.1em',
                      marginBottom: 8,
                    }}
                  >
                    Not available ({ineligible.length})
                  </div>
                  {ineligible.map(({ staff: s, ineligibleReason }) => (
                    <div
                      key={s.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '8px 12px',
                        borderRadius: 10,
                        marginBottom: 4,
                        background: '#F8FAFC',
                        opacity: 0.55,
                      }}
                    >
                      <Avatar initials={s.initials} id={s.id} size={28} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: '#64748B' }}>
                          {s.name}
                        </div>
                        <div style={{ fontSize: 10, color: '#94A3B8' }}>{ineligibleReason}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {isAssigning && (
          <div
            style={{
              padding: '14px 24px',
              borderTop: '1px solid #F1F5F9',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 8,
              flexShrink: 0,
              background: '#FAFAFA',
            }}
          >
            <button
              onClick={() => {
                setActiveMode('view')
                setSelectedId(null)
              }}
              style={{
                height: 38,
                padding: '0 16px',
                borderRadius: 10,
                border: '1px solid #E5E7EB',
                background: 'white',
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 600,
                color: '#374151',
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleConfirmAssign}
              disabled={!selectedId || selectedId === replacingStaff?.id}
              style={{
                height: 38,
                padding: '0 20px',
                borderRadius: 10,
                border: 'none',
                background: selectedId && selectedId !== replacingStaff?.id ? '#4F46E5' : '#E5E7EB',
                cursor: selectedId && selectedId !== replacingStaff?.id ? 'pointer' : 'not-allowed',
                fontSize: 13,
                fontWeight: 700,
                color: selectedId && selectedId !== replacingStaff?.id ? 'white' : '#9CA3AF',
                transition: 'all 0.15s',
              }}
            >
              {replacingStaff ? 'Replace →' : 'Assign →'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Rule Config Panel ────────────────────────────────────────────────────────

function RuleConfigPanel({
  rules,
  onSave,
  onClose,
}: {
  rules: readonly WfmRule[]
  onSave: (r: WfmRule[]) => void
  onClose: () => void
}) {
  const [local, setLocal] = useState<WfmRule[]>(() => JSON.parse(JSON.stringify(rules)))
  const [tab, setTab] = useState<'hard' | 'soft'>('hard')
  const [confirm, setConfirm] = useState(false)
  const dirty = new Set(
    local.filter((r, i) => JSON.stringify(r) !== JSON.stringify(rules[i])).map((r) => r.id),
  )
  const hasDirty = dirty.size > 0
  const update = (r: WfmRule) => setLocal((prev) => prev.map((x) => (x.id === r.id ? r : x)))

  return (
    <div
      onClick={(e) => e.target === e.currentTarget && onClose()}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 400,
        background: 'rgba(15,23,42,0.3)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'flex-end',
        backdropFilter: 'blur(4px)',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 460,
          height: '100%',
          background: 'white',
          display: 'flex',
          flexDirection: 'column',
          borderLeft: '1px solid #E5E7EB',
          boxShadow: '-20px 0 60px rgba(15,23,42,0.12)',
        }}
      >
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid #F1F5F9',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div
              style={{ fontSize: 17, fontWeight: 800, color: '#0F172A', letterSpacing: '-0.02em' }}
            >
              Scheduling rules
            </div>
            <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 2 }}>
              Changes apply to next schedule run
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {hasDirty && (
              <button
                onClick={() => setLocal(JSON.parse(JSON.stringify(rules)))}
                style={{
                  fontSize: 12,
                  color: '#94A3B8',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                Reset
              </button>
            )}
            <button
              onClick={() => hasDirty && setConfirm(true)}
              disabled={!hasDirty}
              style={{
                height: 34,
                padding: '0 16px',
                borderRadius: 9,
                border: 'none',
                background: hasDirty ? '#4F46E5' : '#F1F5F9',
                cursor: hasDirty ? 'pointer' : 'not-allowed',
                fontSize: 12,
                fontWeight: 700,
                color: hasDirty ? 'white' : '#CBD5E1',
                transition: 'all 0.15s',
              }}
            >
              Save
            </button>
            <button
              onClick={onClose}
              style={{
                width: 34,
                height: 34,
                borderRadius: 9,
                border: '1px solid #E5E7EB',
                background: '#F9FAFB',
                cursor: 'pointer',
                color: '#94A3B8',
                fontSize: 16,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              ✕
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', borderBottom: '1px solid #F1F5F9' }}>
          {(['hard', 'soft'] as const).map((t) => {
            const act = local.filter((r) => r.type === t && r.enabled).length
            const cnt = local.filter((r) => r.type === t).length
            return (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  flex: 1,
                  padding: '11px 0',
                  fontSize: 12,
                  fontWeight: 700,
                  border: 'none',
                  borderBottom: `2px solid ${tab === t ? '#4F46E5' : 'transparent'}`,
                  background: 'none',
                  color: tab === t ? '#4F46E5' : '#94A3B8',
                  cursor: 'pointer',
                  textTransform: 'capitalize',
                  letterSpacing: '0.02em',
                  transition: 'color 0.15s',
                }}
              >
                {t} rules{' '}
                <span style={{ opacity: 0.6, fontWeight: 500 }}>
                  {act}/{cnt}
                </span>
              </button>
            )
          })}
        </div>

        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '16px 20px',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          {local
            .filter((r) => r.type === tab)
            .map((rule) => {
              const isDirty = dirty.has(rule.id)
              return (
                <div
                  key={rule.id}
                  style={{
                    border: '1px solid #F1F5F9',
                    borderRadius: 14,
                    background: rule.enabled ? 'white' : '#FAFAFA',
                    opacity: rule.enabled ? 1 : 0.6,
                    transition: 'all 0.2s',
                    boxShadow: rule.enabled ? '0 1px 4px rgba(15,23,42,0.04)' : 'none',
                  }}
                >
                  <div style={{ padding: '14px 16px', display: 'flex', gap: 12 }}>
                    <Toggle
                      on={rule.enabled}
                      onChange={() => update({ ...rule, enabled: !rule.enabled })}
                    />
                    <div style={{ flex: 1 }}>
                      <div
                        style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}
                      >
                        <span style={{ fontSize: 13, fontWeight: 700, color: '#0F172A' }}>
                          {rule.name}
                        </span>
                        <Badge variant={rule.type === 'hard' ? 'danger' : 'warning'}>
                          {rule.type}
                        </Badge>
                        {isDirty && (
                          <span style={{ fontSize: 10, color: '#4F46E5', fontWeight: 700 }}>
                            unsaved
                          </span>
                        )}
                      </div>
                      <p style={{ fontSize: 11, color: '#64748B', marginTop: 4, lineHeight: 1.6 }}>
                        {rule.description}
                      </p>
                      {rule.enabled && (
                        <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 14 }}>
                          {rule.id === 'hard-min-rest' && (
                            <NumberField
                              label="Min rest"
                              value={rule.params.minRestHours ?? 8}
                              unit="hrs"
                              min={2}
                              max={24}
                              onChange={(v) =>
                                update({ ...rule, params: { ...rule.params, minRestHours: v } })
                              }
                            />
                          )}
                          {rule.id === 'hard-max-weekly-hours' && (
                            <NumberField
                              label="Max hours"
                              value={rule.params.maxHours ?? 40}
                              unit="hrs"
                              min={10}
                              max={60}
                              onChange={(v) =>
                                update({ ...rule, params: { ...rule.params, maxHours: v } })
                              }
                            />
                          )}
                          {rule.id === 'soft-preferred-hours' && (
                            <NumberField
                              label="Penalty/hr"
                              value={rule.params.penaltyPerHour ?? 2}
                              unit="pts"
                              min={1}
                              max={20}
                              onChange={(v) =>
                                update({ ...rule, params: { ...rule.params, penaltyPerHour: v } })
                              }
                            />
                          )}
                          {rule.id === 'soft-consecutive' && (
                            <>
                              <NumberField
                                label="Max consecutive"
                                value={rule.params.maxConsecutive ?? 3}
                                unit="shifts"
                                min={2}
                                max={7}
                                onChange={(v) =>
                                  update({ ...rule, params: { ...rule.params, maxConsecutive: v } })
                                }
                              />
                              <NumberField
                                label="Penalty/extra"
                                value={rule.params.penaltyPerExtra ?? 5}
                                unit="pts"
                                min={1}
                                max={20}
                                onChange={(v) =>
                                  update({
                                    ...rule,
                                    params: { ...rule.params, penaltyPerExtra: v },
                                  })
                                }
                              />
                            </>
                          )}
                          {rule.id === 'soft-workgroup-rank' && (
                            <NumberField
                              label="Penalty/rank step"
                              value={rule.params.penaltyPerRankStep ?? 3}
                              unit="pts"
                              min={1}
                              max={15}
                              onChange={(v) =>
                                update({
                                  ...rule,
                                  params: { ...rule.params, penaltyPerRankStep: v },
                                })
                              }
                            />
                          )}
                          {rule.id === 'soft-weekend-balance' && (
                            <>
                              <NumberField
                                label="Max weekend"
                                value={rule.params.maxWeekendShifts ?? 2}
                                unit="shifts"
                                min={1}
                                max={5}
                                onChange={(v) =>
                                  update({
                                    ...rule,
                                    params: { ...rule.params, maxWeekendShifts: v },
                                  })
                                }
                              />
                              <NumberField
                                label="Penalty/extra"
                                value={rule.params.penaltyPerExtra ?? 4}
                                unit="pts"
                                min={1}
                                max={20}
                                onChange={(v) =>
                                  update({
                                    ...rule,
                                    params: { ...rule.params, penaltyPerExtra: v },
                                  })
                                }
                              />
                            </>
                          )}
                          {rule.type === 'soft' && (
                            <NumberField
                              label="Reject above"
                              value={rule.penaltyThreshold ?? 20}
                              unit="pts"
                              min={1}
                              max={100}
                              onChange={(v) => update({ ...rule, penaltyThreshold: v })}
                            />
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
        </div>

        {confirm && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(15,23,42,0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 10,
              padding: 24,
              backdropFilter: 'blur(4px)',
            }}
          >
            <div
              style={{
                background: 'white',
                border: '1px solid #E5E7EB',
                borderRadius: 18,
                padding: 24,
                width: '100%',
                maxWidth: 320,
                boxShadow: '0 20px 40px rgba(15,23,42,0.15)',
              }}
            >
              <div style={{ fontSize: 15, fontWeight: 800, color: '#0F172A', marginBottom: 6 }}>
                Save {dirty.size} rule change{dirty.size !== 1 ? 's' : ''}?
              </div>
              <div style={{ fontSize: 12, color: '#64748B', marginBottom: 14, lineHeight: 1.6 }}>
                Changes apply to the next schedule generation.
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 18 }}>
                {[...dirty].map((id) => {
                  const r = local.find((x) => x.id === id)
                  return r ? (
                    <div
                      key={id}
                      style={{
                        fontSize: 12,
                        color: '#374151',
                        display: 'flex',
                        gap: 8,
                        alignItems: 'center',
                      }}
                    >
                      <span
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: '50%',
                          background: '#4F46E5',
                          flexShrink: 0,
                        }}
                      />
                      {r.name}
                    </div>
                  ) : null
                })}
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button
                  onClick={() => setConfirm(false)}
                  style={{
                    height: 36,
                    padding: '0 14px',
                    borderRadius: 9,
                    border: '1px solid #E5E7EB',
                    background: 'white',
                    cursor: 'pointer',
                    fontSize: 12,
                    fontWeight: 600,
                    color: '#374151',
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    onSave(local)
                    setConfirm(false)
                  }}
                  style={{
                    height: 36,
                    padding: '0 18px',
                    borderRadius: 9,
                    border: 'none',
                    background: '#4F46E5',
                    cursor: 'pointer',
                    fontSize: 12,
                    fontWeight: 700,
                    color: 'white',
                  }}
                >
                  Save changes
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function NumberField({
  label,
  value,
  unit,
  min,
  max,
  onChange,
}: {
  label: string
  value: number
  unit?: string
  min?: number
  max?: number
  onChange: (v: number) => void
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          color: '#94A3B8',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
        }}
      >
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <input
          type="number"
          value={value}
          min={min}
          max={max}
          onChange={(e) => {
            const v = parseFloat(e.target.value)
            if (!isNaN(v)) onChange(v)
          }}
          style={{
            width: 60,
            padding: '5px 8px',
            fontSize: 13,
            borderRadius: 8,
            border: '1px solid #E5E7EB',
            background: '#F9FAFB',
            color: '#0F172A',
            outline: 'none',
            fontWeight: 700,
          }}
        />
        {unit && <span style={{ fontSize: 11, color: '#94A3B8', fontWeight: 500 }}>{unit}</span>}
      </div>
    </div>
  )
}

// ─── Main Calendar ────────────────────────────────────────────────────────────

export default function ScheduleCalendar() {
  const { staff, loading: staffLoading, error: staffError } = useStaff(true)
  const [weekOffset, setWeekOffset] = useState(0)
  const [rules, setRules] = useState<WfmRule[]>([...INITIAL_RULES])
  const [overrides, setOverrides] = useState<Record<string, ScheduleSlotOverride>>({})
  const [showRules, setShowRules] = useState(false)
  const [openModal, setOpenModal] = useState<{
    item: ScheduleSlotItem
    mode: ShiftModalProps['mode']
  } | null>(null)

  const today = useMemo(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d
  }, [])
  const weekStart = useMemo(() => {
    const d = new Date(today)
    d.setDate(today.getDate() + weekOffset * 7)
    return d
  }, [weekOffset, today])
  const weekDays = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const d = new Date(weekStart)
        d.setDate(weekStart.getDate() + i)
        return d
      }),
    [weekStart],
  )

  const {
    schedule: baseSchedule,
    weekTotalPenalty,
    hardFailures,
  } = useMemo(
    () =>
      staff.length > 0
        ? autoAssign(weekDays, rules, staff)
        : { schedule: new Map(), weekTotalPenalty: 0, hardFailures: [] },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [weekDays.map((d) => d.toDateString()).join(), JSON.stringify(rules), staff],
  )

  const schedule = useMemo(() => {
    const s = new Map<string, ScheduleSlotItem[]>()
    for (const [day, items] of baseSchedule.entries()) {
      s.set(
        day,
        items.map((item: { slot: { id: string } }) =>
          overrides[item.slot.id] ? { ...item, ...overrides[item.slot.id] } : item,
        ),
      )
    }
    return s
  }, [baseSchedule, overrides])

  const weeklyHoursUsed = useMemo(() => {
    const h = new Map(staff.map((s) => [s.id, 0]))
    for (const items of schedule.values())
      for (const item of items) {
        const dur = item.slot.end - item.slot.start
        for (const p of item.assigned) h.set(p.id, (h.get(p.id) ?? 0) + dur)
      }
    return h
  }, [schedule, staff])

  const handleScheduleChange = useCallback(
    (slotId: string, assigned: EngineStaffMember[], unmet: SlotUnmet[]) => {
      setOverrides((prev) => ({ ...prev, [slotId]: { assigned, unmet, warnings: [] } }))
      setOpenModal((prev) =>
        prev ? { ...prev, item: { ...prev.item, assigned, unmet, warnings: [] } } : null,
      )
    },
    [],
  )

  const handleSaveRules = useCallback((newRules: WfmRule[]) => {
    setRules(newRules)
    setOverrides({})
  }, [])

  const weekLabel = `${weekDays[0].toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })} – ${weekDays[6].toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })}`
  const allItems = [...schedule.values()].flat()
  const totalGaps = allItems.filter((x) => x.unmet.length > 0).length
  const totalWarnings = allItems.filter((x) => x.warnings.length > 0).length
  const activeOverrides = Object.keys(overrides).length

  const HOURS = Array.from({ length: 24 }, (_, i) => i)
  const HOUR_H = 52
  const HEADER_H = 72

  // ── Loading ──
  if (staffLoading)
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          background: '#F8FAFC',
          gap: 12,
          color: '#94A3B8',
          fontSize: 13,
          fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
        }}
      >
        <div
          style={{
            width: 18,
            height: 18,
            border: '2.5px solid #E2E8F0',
            borderTopColor: '#4F46E5',
            borderRadius: '50%',
            animation: 'spin 0.7s linear infinite',
          }}
        />
        Loading staff roster…
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    )

  if (staffError)
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          background: '#FEF2F2',
          color: '#991B1B',
          fontSize: 13,
          fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
        }}
      >
        Failed to load staff: {staffError}
      </div>
    )

  return (
    <div
      style={{
        fontFamily: "'Plus Jakarta Sans', 'DM Sans', system-ui, sans-serif",
        background: '#F8FAFC',
        minHeight: '100vh',
        color: '#0F172A',
      }}
    >
      {/* Google Fonts — load in your _document or layout instead if Next.js */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Instrument+Serif:ital@0;1&display=swap');
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 5px; height: 5px; }
        ::-webkit-scrollbar-track { background: #F8FAFC; }
        ::-webkit-scrollbar-thumb { background: #CBD5E1; border-radius: 99px; }
        ::-webkit-scrollbar-thumb:hover { background: #94A3B8; }
        .shift-block:hover { transform: translateY(-1px); box-shadow: 0 4px 16px -4px rgba(15,23,42,0.12) !important; }
        .nav-btn:hover { background: #F1F5F9 !important; color: #374151 !important; }
      `}</style>

      {/* ── Top bar ── */}
      <div
        style={{
          background: 'rgba(255,255,255,0.9)',
          borderBottom: '1px solid #F1F5F9',
          backdropFilter: 'blur(12px)',
          padding: '0 24px',
          height: 60,
          display: 'flex',
          alignItems: 'center',
          gap: 20,
          position: 'sticky',
          top: 0,
          zIndex: 100,
        }}
      >
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 10,
              background: '#4F46E5',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg
              width="16"
              height="16"
              fill="none"
              stroke="white"
              strokeWidth="2"
              viewBox="0 0 24 24"
            >
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <path d="M16 2v4M8 2v4M3 10h18" strokeLinecap="round" />
            </svg>
          </div>
          <span
            style={{ fontSize: 15, fontWeight: 800, color: '#0F172A', letterSpacing: '-0.03em' }}
          >
            Shift Scheduler
          </span>
        </div>

        <div style={{ width: 1, height: 22, background: '#E5E7EB' }} />

        {/* Week nav */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            className="nav-btn"
            onClick={() => {
              setWeekOffset((w) => w - 1)
              setOverrides({})
            }}
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              border: '1px solid #E5E7EB',
              background: 'white',
              cursor: 'pointer',
              color: '#64748B',
              fontSize: 16,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.15s',
            }}
          >
            ‹
          </button>
          <span
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: '#374151',
              minWidth: 190,
              textAlign: 'center',
            }}
          >
            {weekLabel}
          </span>
          <button
            className="nav-btn"
            onClick={() => {
              setWeekOffset((w) => w + 1)
              setOverrides({})
            }}
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              border: '1px solid #E5E7EB',
              background: 'white',
              cursor: 'pointer',
              color: '#64748B',
              fontSize: 16,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.15s',
            }}
          >
            ›
          </button>
          <button
            className="nav-btn"
            onClick={() => {
              setWeekOffset(0)
              setOverrides({})
            }}
            style={{
              height: 30,
              padding: '0 12px',
              borderRadius: 8,
              border: '1px solid #E5E7EB',
              background: 'white',
              cursor: 'pointer',
              fontSize: 10,
              fontWeight: 800,
              color: '#64748B',
              letterSpacing: '0.06em',
              transition: 'all 0.15s',
            }}
          >
            TODAY
          </button>
        </div>

        {/* Right badges */}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          {totalGaps > 0 ? (
            <Badge variant="danger">
              ⚠ {totalGaps} gap{totalGaps !== 1 ? 's' : ''}
            </Badge>
          ) : (
            <Badge variant="success">✓ Fully covered</Badge>
          )}
          {totalWarnings > 0 && (
            <Badge variant="warning">
              ! {totalWarnings} warning{totalWarnings !== 1 ? 's' : ''}
            </Badge>
          )}
          {activeOverrides > 0 && (
            <Badge variant="info">
              {activeOverrides} edit{activeOverrides !== 1 ? 's' : ''}
            </Badge>
          )}
          <span style={{ fontSize: 11, color: '#CBD5E1', fontWeight: 600 }}>
            Score: {weekTotalPenalty}pts
          </span>

          {/* Rules button */}
          <button
            onClick={() => setShowRules(true)}
            style={{
              height: 34,
              padding: '0 14px',
              borderRadius: 9,
              border: '1px solid #E5E7EB',
              background: 'white',
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 700,
              color: '#374151',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              transition: 'all 0.15s',
            }}
            onMouseEnter={(e) => {
              ;(e.currentTarget as HTMLElement).style.background = '#4F46E5'
              ;(e.currentTarget as HTMLElement).style.color = 'white'
              ;(e.currentTarget as HTMLElement).style.borderColor = '#4F46E5'
            }}
            onMouseLeave={(e) => {
              ;(e.currentTarget as HTMLElement).style.background = 'white'
              ;(e.currentTarget as HTMLElement).style.color = '#374151'
              ;(e.currentTarget as HTMLElement).style.borderColor = '#E5E7EB'
            }}
          >
            <svg
              width="13"
              height="13"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              viewBox="0 0 24 24"
            >
              <circle cx="12" cy="12" r="3" />
              <path
                d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"
                strokeLinecap="round"
              />
            </svg>
            Rules
          </button>
        </div>
      </div>

      {/* Hard failure banner */}
      {hardFailures.length > 0 && (
        <div
          style={{
            background: '#FEF2F2',
            borderBottom: '1px solid #FECACA',
            padding: '10px 24px',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <span style={{ fontSize: 12, fontWeight: 700, color: '#991B1B' }}>
            {hardFailures.length} slot{hardFailures.length !== 1 ? 's' : ''} unfilled
          </span>
          {hardFailures.slice(0, 3).map((f, i) => (
            <span
              key={i}
              style={{
                fontSize: 11,
                color: '#EF4444',
                background: 'white',
                padding: '2px 10px',
                borderRadius: 6,
                border: '1px solid #FECACA',
              }}
            >
              {f}
            </span>
          ))}
          {hardFailures.length > 3 && (
            <span style={{ fontSize: 11, color: '#F87171' }}>+{hardFailures.length - 3} more</span>
          )}
        </div>
      )}

      {/* ── Calendar grid ── */}
      <div
        style={{
          display: 'flex',
          overflow: 'auto',
          height: `calc(100vh - ${60 + (hardFailures.length > 0 ? 44 : 0)}px)`,
        }}
      >
        {/* Time gutter */}
        <div
          style={{
            width: 56,
            flexShrink: 0,
            borderRight: '1px solid #F1F5F9',
            paddingTop: HEADER_H,
            background: 'white',
          }}
        >
          {HOURS.map((h) => (
            <div
              key={h}
              style={{
                height: HOUR_H,
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'flex-end',
                paddingRight: 12,
                paddingTop: 5,
              }}
            >
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: '#CBD5E1',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {String(h).padStart(2, '0')}:00
              </span>
            </div>
          ))}
        </div>

        {/* Day columns */}
        <div
          style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', minWidth: 700 }}
        >
          {weekDays.map((date, di) => {
            const dayName = DAY_NAMES[date.getDay()]
            const isToday = date.toDateString() === today.toDateString()
            const isWeekend = date.getDay() === 0 || date.getDay() === 6
            const slots = schedule.get(dayName) ?? []
            const dayGaps = slots.filter((s) => s.unmet.length > 0).length
            const dayWarns = slots.filter((s) => s.warnings.length > 0).length

            return (
              <div
                key={di}
                style={{
                  borderRight: '1px solid #F1F5F9',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                {/* Day header */}
                <div
                  style={{
                    height: HEADER_H,
                    borderBottom: '1px solid #F1F5F9',
                    background: isToday ? '#EEF2FF' : isWeekend ? '#FAFAFA' : 'white',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 1,
                    position: 'sticky',
                    top: 0,
                    zIndex: 10,
                    flexShrink: 0,
                  }}
                >
                  <span
                    style={{
                      fontSize: 9,
                      fontWeight: 800,
                      textTransform: 'uppercase',
                      letterSpacing: '0.14em',
                      color: isToday ? '#4F46E5' : '#CBD5E1',
                    }}
                  >
                    {dayName.slice(0, 3)}
                  </span>
                  <span
                    style={{
                      fontSize: 30,
                      fontWeight: 400,
                      lineHeight: 1,
                      color: isToday ? '#4F46E5' : isWeekend ? '#D1D5DB' : '#1E293B',
                      fontFamily: "'Instrument Serif', Georgia, serif",
                      letterSpacing: '-0.02em',
                    }}
                  >
                    {date.getDate()}
                  </span>
                  <div style={{ display: 'flex', gap: 3, height: 14, alignItems: 'center' }}>
                    {dayGaps > 0 && (
                      <span style={{ fontSize: 8, color: '#EF4444', fontWeight: 800 }}>
                        ⚠{dayGaps}
                      </span>
                    )}
                    {dayWarns > 0 && (
                      <span style={{ fontSize: 8, color: '#D97706', fontWeight: 800 }}>
                        !{dayWarns}
                      </span>
                    )}
                  </div>
                </div>

                {/* Time grid */}
                <div
                  style={{
                    position: 'relative',
                    height: 24 * HOUR_H,
                    flexShrink: 0,
                    background: isWeekend ? '#FAFAFA' : 'white',
                  }}
                >
                  {HOURS.map((h) => (
                    <div
                      key={h}
                      style={{
                        position: 'absolute',
                        top: h * HOUR_H,
                        left: 0,
                        right: 0,
                        borderTop:
                          h === 0 ? 'none' : `1px solid ${h % 6 === 0 ? '#F1F5F9' : '#F8FAFC'}`,
                      }}
                    />
                  ))}

                  {/* Shift blocks */}
                  {slots.map((item) => {
                    const meta = SHIFT_TYPE_META[item.slot.type] ?? SHIFT_TYPE_META.morning
                    const top = item.slot.start * HOUR_H
                    const height = (item.slot.end - item.slot.start) * HOUR_H
                    const hasGap = item.unmet.length > 0
                    const hasWarn = item.warnings.length > 0

                    return (
                      <div
                        key={item.slot.id}
                        className="shift-block"
                        onClick={() => setOpenModal({ item, mode: 'view' })}
                        style={{
                          position: 'absolute',
                          top: top + 3,
                          left: 4,
                          right: 4,
                          height: height - 6,
                          borderRadius: 10,
                          background: meta.bg,
                          border: `1px solid ${hasGap ? '#FECACA' : hasWarn ? '#FDE68A' : meta.border}`,
                          borderLeft: `3px solid ${hasGap ? '#EF4444' : meta.accent}`,
                          cursor: 'pointer',
                          overflow: 'hidden',
                          transition: 'transform 0.15s, box-shadow 0.15s',
                          boxShadow: '0 1px 3px rgba(15,23,42,0.04)',
                        }}
                      >
                        {/* Time label */}
                        <div
                          style={{
                            padding: '6px 8px 3px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 4,
                          }}
                        >
                          <span
                            style={{
                              fontSize: 9,
                              fontWeight: 800,
                              color: meta.accent,
                              fontVariantNumeric: 'tabular-nums',
                              letterSpacing: '0.03em',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {String(item.slot.start).padStart(2, '0')}:00–
                            {String(item.slot.end % 24).padStart(2, '0')}:00
                          </span>
                          <div style={{ display: 'flex', gap: 2 }}>
                            {hasGap && <span style={{ fontSize: 8, color: '#EF4444' }}>⚠</span>}
                            {hasWarn && !hasGap && (
                              <span style={{ fontSize: 8, color: '#D97706' }}>!</span>
                            )}
                          </div>
                        </div>

                        {/* Role pills */}
                        <div
                          style={{
                            padding: '0 6px 4px',
                            display: 'flex',
                            flexWrap: 'wrap',
                            gap: 2,
                          }}
                        >
                          {item.slot.req.map((r) => {
                            const met = item.assigned.filter((p) =>
                              p.workgroups.some((w) => w.id === r.skill),
                            ).length
                            const ok = met >= r.count
                            return (
                              <span
                                key={r.skill}
                                style={{
                                  fontSize: 8,
                                  fontWeight: 700,
                                  padding: '1px 5px',
                                  borderRadius: 4,
                                  background: ok ? '#ECFDF5' : '#FEF2F2',
                                  color: ok ? '#065F46' : '#991B1B',
                                  border: `1px solid ${ok ? '#A7F3D0' : '#FECACA'}`,
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {r.count}×{r.skill}
                              </span>
                            )
                          })}
                        </div>

                        {/* Avatar stack */}
                        {height >= 60 && (
                          <div
                            style={{
                              padding: '0 6px 5px',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 4,
                            }}
                          >
                            <div style={{ display: 'flex' }}>
                              {item.assigned.slice(0, 4).map((p, pi) => {
                                const c = avatarColor(p.id)
                                return (
                                  <div
                                    key={p.id}
                                    style={{
                                      width: 18,
                                      height: 18,
                                      borderRadius: 5,
                                      background: c.bg,
                                      color: c.text,
                                      fontSize: 7,
                                      fontWeight: 800,
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      border: '1.5px solid white',
                                      marginLeft: pi === 0 ? 0 : -5,
                                      zIndex: 4 - pi,
                                      position: 'relative',
                                    }}
                                  >
                                    {p.initials}
                                  </div>
                                )
                              })}
                              {item.assigned.length > 4 && (
                                <div
                                  style={{
                                    width: 18,
                                    height: 18,
                                    borderRadius: 5,
                                    background: '#F1F5F9',
                                    color: '#94A3B8',
                                    fontSize: 6,
                                    fontWeight: 800,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    border: '1.5px solid white',
                                    marginLeft: -5,
                                  }}
                                >
                                  +{item.assigned.length - 4}
                                </div>
                              )}
                            </div>
                            {item.assigned.length === 0 ? (
                              <span style={{ fontSize: 8, color: '#EF4444', fontWeight: 700 }}>
                                Unassigned
                              </span>
                            ) : (
                              <span
                                style={{
                                  fontSize: 8,
                                  color: meta.text,
                                  fontWeight: 600,
                                  opacity: 0.7,
                                }}
                              >
                                {item.assigned.length} staff
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {openModal && (
        <ShiftModal
          item={openModal.item}
          staff={staff}
          weeklyHoursUsed={weeklyHoursUsed}
          rules={rules}
          mode={openModal.mode}
          onConfirm={handleScheduleChange}
          onClose={() => setOpenModal(null)}
        />
      )}
      {showRules && (
        <RuleConfigPanel
          rules={rules}
          onSave={handleSaveRules}
          onClose={() => setShowRules(false)}
        />
      )}
    </div>
  )
}
