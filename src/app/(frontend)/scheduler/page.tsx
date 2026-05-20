'use client'

import { useState, useMemo, useCallback, useEffect, useRef } from 'react'

// ─── Types & Seed Data ────────────────────────────────────────────────────────

const INITIAL_RULES = [
  {
    id: 'hard-min-rest',
    type: 'hard',
    name: 'Minimum rest between shifts',
    description: 'Staff must rest at least N hours between consecutive shifts.',
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
    description: 'Staff may only be assigned to workgroups listed in their skill profile.',
    enabled: true,
    params: {},
  },
  {
    id: 'soft-preferred-hours',
    type: 'soft',
    name: 'Preferred working hours',
    description: "Hours outside a staff member's preferred window carry a penalty.",
    enabled: true,
    penaltyThreshold: 20,
    params: { penaltyPerHour: 2 },
  },
  {
    id: 'soft-consecutive',
    type: 'soft',
    name: 'Consecutive shifts',
    description: 'Discourages assigning staff to more than N consecutive shifts.',
    enabled: true,
    penaltyThreshold: 15,
    params: { maxConsecutive: 3, penaltyPerExtra: 5 },
  },
  {
    id: 'soft-workgroup-rank',
    type: 'soft',
    name: 'Workgroup rank preference',
    description: "Each rank step away from a staff member's primary workgroup adds a penalty.",
    enabled: true,
    penaltyThreshold: 30,
    params: { penaltyPerRankStep: 3 },
  },
  {
    id: 'soft-weekend-balance',
    type: 'soft',
    name: 'Weekend shift balance',
    description: 'Distributes weekend shifts fairly across staff.',
    enabled: false,
    penaltyThreshold: 12,
    params: { maxWeekendShifts: 2, penaltyPerExtra: 4 },
  },
]

const STAFF = [
  {
    id: 's1',
    name: 'Sarah Chen',
    initials: 'SC',
    workgroups: [
      { id: 'Sales', rank: 1 },
      { id: 'Trainer', rank: 2 },
    ],
    availability: [1, 2, 3, 4, 5],
    maxHours: 40,
    preferredWindow: [6, 16],
  },
  {
    id: 's2',
    name: 'James Okafor',
    initials: 'JO',
    workgroups: [
      { id: 'Supervisor', rank: 1 },
      { id: 'Sales', rank: 2 },
    ],
    availability: [1, 2, 3, 4],
    maxHours: 40,
    preferredWindow: [8, 17],
  },
  {
    id: 's3',
    name: 'Priya Nair',
    initials: 'PN',
    workgroups: [
      { id: 'Sales', rank: 1 },
      { id: 'Support', rank: 2 },
    ],
    availability: [1, 2, 4, 5, 6],
    maxHours: 32,
    preferredWindow: [8, 16],
  },
  {
    id: 's4',
    name: 'Dana Steyn',
    initials: 'DS',
    workgroups: [{ id: 'Support', rank: 1 }],
    availability: [1, 2, 3, 4, 5],
    maxHours: 24,
    preferredWindow: [9, 17],
  },
  {
    id: 's5',
    name: 'Luca Ferrari',
    initials: 'LF',
    workgroups: [
      { id: 'Sales', rank: 1 },
      { id: 'Support', rank: 2 },
    ],
    availability: [1, 2, 3, 4, 5, 6],
    maxHours: 40,
    preferredWindow: [8, 18],
  },
  {
    id: 's6',
    name: 'Mia Thompson',
    initials: 'MT',
    workgroups: [
      { id: 'Support', rank: 1 },
      { id: 'Supervisor', rank: 2 },
    ],
    availability: [2, 3, 4, 5, 6, 0],
    maxHours: 40,
    preferredWindow: [10, 18],
  },
  {
    id: 's7',
    name: 'Noah Williams',
    initials: 'NW',
    workgroups: [
      { id: 'Manager', rank: 1 },
      { id: 'Supervisor', rank: 2 },
    ],
    availability: [1, 2, 3, 4, 5],
    maxHours: 40,
    preferredWindow: [8, 16],
  },
  {
    id: 's8',
    name: 'Aisha Diallo',
    initials: 'AD',
    workgroups: [
      { id: 'Support', rank: 1 },
      { id: 'Sales', rank: 2 },
    ],
    availability: [2, 3, 4, 5, 6],
    maxHours: 32,
    preferredWindow: [9, 17],
  },
  {
    id: 's9',
    name: 'Chen Wei',
    initials: 'CW',
    workgroups: [{ id: 'Sales', rank: 1 }],
    availability: [3, 4, 5, 6, 0],
    maxHours: 24,
    preferredWindow: [10, 18],
  },
  {
    id: 's10',
    name: 'Tariq Hassan',
    initials: 'TH',
    workgroups: [
      { id: 'Sales', rank: 1 },
      { id: 'Trainer', rank: 2 },
      { id: 'Supervisor', rank: 3 },
    ],
    availability: [1, 2, 4, 5, 6],
    maxHours: 40,
    preferredWindow: [8, 16],
  },
  {
    id: 's11',
    name: 'John Doe',
    initials: 'JD',
    workgroups: [
      { id: 'Sales', rank: 1 },
      { id: 'Support', rank: 2 },
    ],
    availability: [1, 2, 3, 4, 5, 6],
    maxHours: 40,
    preferredWindow: [8, 16],
  },
]

const DAY_CONFIGS = {
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

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

// ─── Rule Engine ──────────────────────────────────────────────────────────────

function evaluateHardRules(staff, slot, weeklyHoursUsed, shiftsThisWeek, rules) {
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
        if (used + dur > cap) return `Exceeds max hours (${used}+${dur}>${cap}h)`
        break
      }
      case 'hard-min-rest': {
        const minRest = rule.params.minRestHours ?? 8
        const last = shiftsThisWeek.get(staff.id)?.lastEndHour ?? null
        if (last !== null) {
          const gap = slot.start - last
          if (gap >= 0 && gap < minRest) return `Only ${gap}h rest (min ${minRest}h)`
        }
        break
      }
    }
  }
  return null
}

function evaluateSoftRules(staff, slot, dayIndex, weeklyHoursUsed, shiftsThisWeek, rules) {
  const dur = slot.end - slot.start
  let totalPenalty = 0
  const violations = []
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
            detail: `${outside}h outside ${ps}:00–${pe}:00`,
          })
        }
        break
      }
      case 'soft-consecutive': {
        const mc = rule.params.maxConsecutive ?? 3
        const ppe = rule.params.penaltyPerExtra ?? 5
        const consec = shiftsThisWeek.get(staff.id)?.consecutiveDays ?? 0
        if (consec >= mc) {
          const p = (consec - mc + 1) * ppe
          totalPenalty += p
          violations.push({
            ruleId: rule.id,
            ruleName: rule.name,
            penalty: p,
            detail: `${consec + 1} consecutive shifts (max ${mc})`,
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
              detail: `${sk} is rank-${wg.rank} skill`,
            })
          }
        }
        break
      }
      case 'soft-weekend-balance': {
        const isWknd = dayIndex === 0 || dayIndex === 6
        if (isWknd) {
          const mw = rule.params.maxWeekendShifts ?? 2
          const ppe = rule.params.penaltyPerExtra ?? 4
          const wknd = shiftsThisWeek.get(staff.id)?.weekendShifts ?? 0
          if (wknd >= mw) {
            totalPenalty += ppe
            violations.push({
              ruleId: rule.id,
              ruleName: rule.name,
              penalty: ppe,
              detail: `${wknd} weekend shifts this week`,
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
  staff,
  slot,
  dayIndex,
  weeklyHoursUsed,
  assignedToday,
  shiftsThisWeek,
  rules,
) {
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
  const hv = evaluateHardRules(staff, slot, weeklyHoursUsed, shiftsThisWeek, rules)
  if (hv) return { eligible: false, hardViolation: hv, softPenalty: 0, softViolations: [] }
  const { totalPenalty, violations } = evaluateSoftRules(
    staff,
    slot,
    dayIndex,
    weeklyHoursUsed,
    shiftsThisWeek,
    rules,
  )
  const load = Math.floor((weeklyHoursUsed.get(staff.id) ?? 0) / 8)
  return {
    eligible: true,
    hardViolation: null,
    softPenalty: totalPenalty + load,
    softViolations: violations,
  }
}

function autoAssign(weekDays, rules, staffList = STAFF) {
  const whu = new Map(staffList.map((s) => [s.id, 0]))
  const stw = new Map(
    staffList.map((s) => [s.id, { lastEndHour: null, consecutiveDays: 0, weekendShifts: 0 }]),
  )
  const result = new Map()
  let weekPenalty = 0
  const fails = []
  for (const date of weekDays) {
    const di = date.getDay()
    const dn = DAY_NAMES[di]
    const cfg = DAY_CONFIGS[dn]
    if (!cfg) {
      result.set(dn, [])
      continue
    }
    const atd = new Set()
    const resolved = []
    for (const slot of cfg.slots) {
      const dur = slot.end - slot.start
      const assigned = [],
        unmet = [],
        warnings = []
      for (const req of slot.req) {
        let rem = req.count
        const cands = staffList
          .filter((s) => s.workgroups.some((w) => w.id === req.skill))
          .map((s) => ({ staff: s, ...scoreCandidate(s, slot, di, whu, atd, stw, rules) }))
          .sort((a, b) =>
            a.eligible === b.eligible ? a.softPenalty - b.softPenalty : a.eligible ? -1 : 1,
          )
        for (const { staff, eligible, softPenalty, softViolations } of cands) {
          if (rem <= 0 || !eligible) continue
          assigned.push({ ...staff, _softPenalty: softPenalty })
          atd.add(staff.id)
          whu.set(staff.id, (whu.get(staff.id) ?? 0) + dur)
          weekPenalty += softPenalty
          const h = stw.get(staff.id)
          h.lastEndHour = slot.end
          h.consecutiveDays += 1
          if (di === 0 || di === 6) h.weekendShifts += 1
          softViolations.forEach((v) =>
            warnings.push({ staffId: staff.id, staffName: staff.name, ...v }),
          )
          rem--
        }
        if (rem > 0) {
          unmet.push({ skill: req.skill, count: rem })
          fails.push(`${slot.id}: ${rem}× ${req.skill} unfilled`)
        }
      }
      resolved.push({ slot, assigned, unmet, warnings, date, dayIndex: di })
    }
    result.set(dn, resolved)
  }
  return { schedule: result, weekTotalPenalty: weekPenalty, hardFailures: fails }
}

// ─── Design Tokens ────────────────────────────────────────────────────────────

const T = {
  // Shift types — morning now green, afternoon blue, night purple
  morning: {
    label: 'Morning',
    accentColor: '#16A34A',
    bgColor: '#F0FDF4',
    borderColor: '#BBF7D0',
    pillBg: '#DCFCE7',
    pillText: '#166534',
    trackColor: '#22C55E',
    badgeBg: '#D1FAE5',
    badgeText: '#064E3B',
  },
  afternoon: {
    label: 'Afternoon',
    accentColor: '#2563EB',
    bgColor: '#EFF6FF',
    borderColor: '#BFDBFE',
    pillBg: '#DBEAFE',
    pillText: '#1E40AF',
    trackColor: '#3B82F6',
    badgeBg: '#DBEAFE',
    badgeText: '#1E3A8A',
  },
  night: {
    label: 'Night',
    accentColor: '#7C3AED',
    bgColor: '#F5F3FF',
    borderColor: '#DDD6FE',
    pillBg: '#EDE9FE',
    pillText: '#5B21B6',
    trackColor: '#8B5CF6',
    badgeBg: '#EDE9FE',
    badgeText: '#3B0764',
  },
}
const getType = (t) => T[t] ?? T.morning

const SCORE = (p) =>
  p === 0
    ? { label: 'Perfect', color: '#16A34A', bg: '#F0FDF4', border: '#BBF7D0' }
    : p <= 4
      ? { label: 'Good fit', color: '#2563EB', bg: '#EFF6FF', border: '#BFDBFE' }
      : p <= 9
        ? { label: 'Acceptable', color: '#D97706', bg: '#FFFBEB', border: '#FDE68A' }
        : { label: 'Not ideal', color: '#DC2626', bg: '#FEF2F2', border: '#FECACA' }

const fmt2 = (n) => String(n % 24).padStart(2, '0')

// ─── Micro UI atoms ───────────────────────────────────────────────────────────

const Avatar = ({ initials, size = 32, bg = '#E2E8F0', color = '#475569' }) => (
  <div
    style={{
      width: size,
      height: size,
      borderRadius: '50%',
      background: bg,
      color,
      fontSize: size * 0.35,
      fontWeight: 700,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
      letterSpacing: '0.03em',
      userSelect: 'none',
    }}
  >
    {initials}
  </div>
)

const Badge = ({ children, color, bg, border }) => (
  <span
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      fontSize: 10,
      fontWeight: 700,
      padding: '2px 8px',
      borderRadius: 99,
      background: bg,
      color,
      border: `1px solid ${border}`,
      letterSpacing: '0.03em',
      whiteSpace: 'nowrap',
    }}
  >
    {children}
  </span>
)

const Tag = ({ children, active }) => (
  <span
    style={{
      fontSize: 10,
      padding: '1px 7px',
      borderRadius: 99,
      fontWeight: 600,
      background: active ? '#DCFCE7' : '#F1F5F9',
      color: active ? '#166534' : '#64748B',
      border: `1px solid ${active ? '#86EFAC' : '#E2E8F0'}`,
    }}
  >
    {children}
  </span>
)

// ─── Role Coverage Header ─────────────────────────────────────────────────────

function RoleCoverageHeader({ slot, assigned, unmet }) {
  return (
    <div
      style={{
        background: '#F8FAFC',
        border: '1px solid #E8EEF6',
        borderRadius: 12,
        padding: '14px 16px',
        marginBottom: 18,
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          color: '#94A3B8',
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          marginBottom: 10,
        }}
      >
        Role coverage required
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {slot.req.map((r) => {
          const met = assigned.filter((p) => p.workgroups.some((w) => w.id === r.skill)).length
          const ok = met >= r.count
          const gap = r.count - met
          return (
            <div
              key={r.skill}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 9,
                padding: '9px 13px',
                borderRadius: 10,
                background: ok ? '#F0FDF4' : '#FFF7ED',
                border: `1.5px solid ${ok ? '#BBF7D0' : '#FED7AA'}`,
              }}
            >
              <div
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  background: ok ? '#22C55E' : '#F97316',
                  flexShrink: 0,
                }}
              />
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: ok ? '#15803D' : '#92400E' }}>
                  {r.skill}
                </div>
                <div style={{ fontSize: 10, color: ok ? '#4ADE80' : '#FB923C', marginTop: 1 }}>
                  {ok ? `${met} / ${r.count} filled` : `${gap} still needed`}
                </div>
              </div>
            </div>
          )
        })}
        {unmet.length === 0 && (
          <div
            style={{
              fontSize: 11,
              color: '#22C55E',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: 5,
            }}
          >
            <span style={{ fontSize: 14 }}>✓</span> All roles covered
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Assign / Replace Modal ───────────────────────────────────────────────────

function AssignModal({
  item,
  replacingStaff,
  forSkill,
  weeklyHoursUsed,
  rules,
  onConfirm,
  onClose,
}) {
  const [selected, setSelected] = useState(replacingStaff?.id ?? null)
  const skill = forSkill ?? item.slot.req[0]?.skill ?? ''
  const currentIds = new Set(item.assigned.map((s) => s.id))
  const replacingId = replacingStaff?.id ?? null
  const meta = getType(item.slot.type)

  const candidates = useMemo(() => {
    const atd = new Set(item.assigned.filter((s) => s.id !== replacingId).map((s) => s.id))
    return STAFF.map((s) => {
      const { eligible, hardViolation, softPenalty, softViolations } = scoreCandidate(
        s,
        item.slot,
        item.dayIndex,
        weeklyHoursUsed,
        atd,
        new Map(
          STAFF.map((x) => [x.id, { lastEndHour: null, consecutiveDays: 0, weekendShifts: 0 }]),
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
        wgRank: s.workgroups.find((w) => w.id === skill)?.rank ?? null,
      }
    }).sort((a, b) =>
      a.eligible !== b.eligible ? (a.eligible ? -1 : 1) : a.softPenalty - b.softPenalty,
    )
  }, [item, replacingId, weeklyHoursUsed, rules, skill])

  const elig = candidates.filter((c) => c.eligible)
  const inelig = candidates.filter((c) => !c.eligible)
  const canConfirm = selected && selected !== replacingId

  // Trap scroll
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [])

  return (
    <div
      onClick={(e) => e.target === e.currentTarget && onClose()}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 300,
        background: 'rgba(10,15,30,0.65)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        style={{
          background: '#FFFFFF',
          borderRadius: 22,
          width: '100%',
          maxWidth: 540,
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 40px 100px rgba(0,0,0,0.28), 0 0 0 1px rgba(0,0,0,0.07)',
        }}
      >
        {/* Header */}
        <div style={{ padding: '22px 24px 0' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              marginBottom: 16,
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 17,
                  fontWeight: 800,
                  color: '#0D1624',
                  letterSpacing: '-0.025em',
                  marginBottom: 4,
                }}
              >
                {replacingStaff ? `Replace ${replacingStaff.name}` : `Assign — ${skill}`}
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 12,
                  color: '#64748B',
                }}
              >
                <span
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 600 }}
                >
                  <span
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: '50%',
                      background: meta.accentColor,
                      display: 'inline-block',
                    }}
                  />
                  {meta.label}
                </span>
                <span style={{ color: '#CBD5E1' }}>·</span>
                <span
                  style={{
                    fontFamily: 'monospace',
                    fontWeight: 700,
                    color: '#374151',
                    fontSize: 12,
                  }}
                >
                  {fmt2(item.slot.start)}:00 – {fmt2(item.slot.end)}:00
                </span>
                <span style={{ color: '#CBD5E1' }}>·</span>
                <span>{item.slot.end - item.slot.start}h shift</span>
              </div>
            </div>
            <button
              onClick={onClose}
              style={{
                width: 34,
                height: 34,
                borderRadius: 10,
                border: '1.5px solid #E2E8F0',
                background: '#F8FAFC',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#94A3B8',
                fontSize: 15,
                flexShrink: 0,
                transition: 'all 0.15s',
              }}
            >
              ✕
            </button>
          </div>

          {/* Roles — always first */}
          <RoleCoverageHeader slot={item.slot} assigned={item.assigned} unmet={item.unmet} />

          {/* Score legend */}
          <div style={{ display: 'flex', gap: 14, marginBottom: 14, flexWrap: 'wrap' }}>
            {[
              ['Perfect', '#16A34A'],
              ['Good fit', '#2563EB'],
              ['Acceptable', '#D97706'],
              ['Not ideal', '#DC2626'],
            ].map(([l, c]) => (
              <span
                key={l}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  fontSize: 10,
                  color: '#94A3B8',
                }}
              >
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: c }} />
                {l}
              </span>
            ))}
          </div>
        </div>

        {/* Candidate list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 24px' }}>
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
            Available staff ({elig.length})
          </div>

          {elig.length === 0 && (
            <div style={{ textAlign: 'center', padding: '28px 0', color: '#94A3B8', fontSize: 13 }}>
              No eligible staff. Try relaxing a rule or adjust availability.
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 18 }}>
            {elig.map(({ staff: s, softPenalty, softViolations, wgRank }, i) => {
              const isCurrent = s.id === replacingId
              const isSel = selected === s.id
              const sm = SCORE(softPenalty)
              const hu = weeklyHoursUsed.get(s.id) ?? 0
              const barPct = Math.min(100, (hu / s.maxHours) * 100)
              const barColor =
                hu / s.maxHours > 0.85 ? '#EF4444' : hu / s.maxHours > 0.6 ? '#F59E0B' : '#22C55E'

              return (
                <div
                  key={s.id}
                  onClick={() => setSelected(isSel ? null : s.id)}
                  style={{
                    border: `2px solid ${isSel ? '#2563EB' : '#F1F5F9'}`,
                    borderRadius: 14,
                    padding: '12px 14px',
                    cursor: 'pointer',
                    background: isSel ? '#EFF6FF' : '#FAFAFA',
                    transition: 'all 0.12s',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: '50%',
                        background: i === 0 ? '#FEF9C3' : '#F1F5F9',
                        border: `1.5px solid ${i === 0 ? '#FDE047' : '#E2E8F0'}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 10,
                        fontWeight: 800,
                        color: i === 0 ? '#854D0E' : '#64748B',
                        flexShrink: 0,
                      }}
                    >
                      {i + 1}
                    </div>
                    <Avatar
                      initials={s.initials}
                      size={36}
                      bg={isSel ? '#BFDBFE' : '#E2E8F0'}
                      color={isSel ? '#1E40AF' : '#475569'}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          flexWrap: 'wrap',
                          marginBottom: 4,
                        }}
                      >
                        <span style={{ fontSize: 13, fontWeight: 700, color: '#0D1624' }}>
                          {s.name}
                        </span>
                        {isCurrent && (
                          <Badge color="#1D4ED8" bg="#EFF6FF" border="#BFDBFE">
                            current
                          </Badge>
                        )}
                        {i === 0 && !isCurrent && (
                          <Badge color="#854D0E" bg="#FEF9C3" border="#FDE047">
                            best match
                          </Badge>
                        )}
                        {wgRank && (
                          <Badge color="#065F46" bg="#F0FDF4" border="#BBF7D0">
                            Rank {wgRank}
                          </Badge>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {s.workgroups.map((wg) => (
                          <Tag key={wg.id} active={wg.id === skill}>
                            {wg.rank === 1 ? '★ ' : ''}
                            {wg.id}
                          </Tag>
                        ))}
                      </div>
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'flex-end',
                        gap: 3,
                        flexShrink: 0,
                      }}
                    >
                      <span style={{ fontSize: 11, fontWeight: 700, color: sm.color }}>
                        {sm.label}
                      </span>
                      <span style={{ fontSize: 10, color: '#94A3B8' }}>
                        {hu}h / {s.maxHours}h
                      </span>
                    </div>
                  </div>
                  <div
                    style={{
                      marginTop: 9,
                      height: 3,
                      background: '#F1F5F9',
                      borderRadius: 99,
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        height: '100%',
                        width: `${barPct}%`,
                        background: barColor,
                        borderRadius: 99,
                        transition: 'width 0.3s',
                      }}
                    />
                  </div>
                  {softViolations.length > 0 && isSel && (
                    <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #F1F5F9' }}>
                      <div
                        style={{ fontSize: 10, fontWeight: 700, color: '#94A3B8', marginBottom: 5 }}
                      >
                        Soft rule factors
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {softViolations.map((v, j) => (
                          <span
                            key={j}
                            style={{
                              fontSize: 10,
                              padding: '2px 8px',
                              background: '#FFF7ED',
                              color: '#92400E',
                              border: '1px solid #FED7AA',
                              borderRadius: 6,
                            }}
                          >
                            {v.ruleName}: {v.detail}{' '}
                            <span style={{ opacity: 0.6 }}>+{v.penalty}pts</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {inelig.length > 0 && (
            <div style={{ marginBottom: 16 }}>
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
                Not available ({inelig.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {inelig.map(({ staff: s, ineligibleReason }) => (
                  <div
                    key={s.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '8px 12px',
                      borderRadius: 10,
                      background: '#F8FAFC',
                      border: '1px solid #F1F5F9',
                      opacity: 0.5,
                    }}
                  >
                    <Avatar initials={s.initials} size={28} bg="#E2E8F0" color="#94A3B8" />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#94A3B8' }}>
                        {s.name}
                      </div>
                      <div style={{ fontSize: 10, color: '#CBD5E1', marginTop: 1 }}>
                        {ineligibleReason}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '16px 24px 22px',
            borderTop: '1px solid #F1F5F9',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 8,
          }}
        >
          <button
            onClick={onClose}
            style={{
              height: 40,
              padding: '0 18px',
              borderRadius: 10,
              border: '1.5px solid #E2E8F0',
              background: 'white',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 600,
              color: '#475569',
            }}
          >
            Cancel
          </button>
          <button
            disabled={!canConfirm}
            onClick={() => {
              if (canConfirm) onConfirm(selected)
            }}
            style={{
              height: 40,
              padding: '0 22px',
              borderRadius: 10,
              border: 'none',
              background: canConfirm ? '#1D4ED8' : '#E2E8F0',
              cursor: canConfirm ? 'pointer' : 'not-allowed',
              fontSize: 13,
              fontWeight: 700,
              color: canConfirm ? 'white' : '#94A3B8',
              transition: 'background 0.15s',
            }}
          >
            {replacingStaff ? 'Confirm replacement' : 'Assign staff'} →
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Shift Card ───────────────────────────────────────────────────────────────

function ShiftCard({ item, weeklyHoursUsed, rules, onScheduleChange }) {
  const [modal, setModal] = useState(null)
  const [hoveredStaff, setHoveredStaff] = useState(null)
  const [hoveredUnmet, setHoveredUnmet] = useState(null)
  const meta = getType(item.slot.type)
  const hasUnmet = item.unmet.length > 0
  const hasWarn = item.warnings.length > 0

  const handleConfirm = useCallback(
    (newStaffId) => {
      const newStaff = STAFF.find((x) => x.id === newStaffId)
      if (!newStaff || !modal) return
      let ua = [...item.assigned]
      let uu = [...item.unmet]
      if ('replacingStaff' in modal) {
        ua = ua.map((p) => (p.id === modal.replacingStaff.id ? newStaff : p))
      } else {
        ua = [...ua, newStaff]
        uu = uu
          .map((u) => (u.skill === modal.forSkill ? { ...u, count: u.count - 1 } : u))
          .filter((u) => u.count > 0)
      }
      onScheduleChange(item.slot.id, ua, uu)
      setModal(null)
    },
    [modal, item, onScheduleChange],
  )

  const borderColor = hasUnmet ? '#FED7AA' : hasWarn ? '#FDE68A' : meta.borderColor

  return (
    <>
      <div
        style={{
          background: '#FFFFFF',
          border: `1.5px solid ${borderColor}`,
          borderRadius: 12,
          overflow: 'hidden',
          marginBottom: 8,
          boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
          transition: 'box-shadow 0.15s',
        }}
      >
        {/* Color accent bar */}
        <div style={{ height: 3, background: meta.accentColor, opacity: 0.9 }} />

        {/* Time header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 7,
            padding: '8px 11px 6px',
            background: meta.bgColor,
            borderBottom: `1px solid ${meta.borderColor}55`,
          }}
        >
          <span
            style={{
              fontFamily: 'monospace',
              fontSize: 11,
              fontWeight: 800,
              color: meta.accentColor,
              letterSpacing: '0.02em',
            }}
          >
            {fmt2(item.slot.start)}:00–{fmt2(item.slot.end)}:00
          </span>
          <span
            style={{
              fontSize: 9,
              fontWeight: 700,
              color: meta.accentColor,
              opacity: 0.6,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              marginLeft: 'auto',
            }}
          >
            {meta.label}
          </span>
          {hasUnmet && <span style={{ fontSize: 10, color: '#EA580C', fontWeight: 800 }}>⚠</span>}
          {hasWarn && !hasUnmet && (
            <span style={{ fontSize: 10, color: '#D97706', fontWeight: 800 }}>!</span>
          )}
        </div>

        {/* Staff */}
        <div style={{ padding: '7px 10px 8px' }}>
          {item.assigned.length === 0 && (
            <div style={{ fontSize: 10, color: '#EF4444', fontWeight: 600, padding: '3px 0' }}>
              No staff assigned
            </div>
          )}
          {item.assigned.map((p) => {
            const sw = item.warnings.filter((w) => w.staffId === p.id)
            const isHovered = hoveredStaff === p.id
            return (
              <div
                key={p.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 7,
                  padding: '4px 5px',
                  borderRadius: 8,
                  cursor: 'default',
                  transition: 'background 0.12s',
                  background: isHovered ? '#F0F7FF' : 'transparent',
                  position: 'relative',
                }}
                onMouseEnter={() => setHoveredStaff(p.id)}
                onMouseLeave={() => setHoveredStaff(null)}
              >
                <Avatar initials={p.initials} size={22} bg={meta.pillBg} color={meta.pillText} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: '#1E293B',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {p.name}
                  </div>
                  <div style={{ fontSize: 8, color: '#94A3B8' }}>
                    {p.workgroups.map((w) => `${w.rank === 1 ? '★' : ''}${w.id}`).join(' · ')}
                  </div>
                </div>
                {sw.length > 0 && (
                  <span
                    style={{ fontSize: 8, color: '#D97706' }}
                    title={sw.map((w) => w.detail).join('; ')}
                  >
                    ⚠
                  </span>
                )}
                {isHovered && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setModal({ replacingStaff: p })
                    }}
                    style={{
                      fontSize: 9,
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: 6,
                      border: '1px solid #BFDBFE',
                      background: '#EFF6FF',
                      color: '#1D4ED8',
                      cursor: 'pointer',
                      flexShrink: 0,
                      lineHeight: 1.5,
                      transition: 'all 0.1s',
                    }}
                  >
                    Replace
                  </button>
                )}
              </div>
            )
          })}

          {/* Unmet gaps */}
          {item.unmet.map((u) => {
            const isHov = hoveredUnmet === u.skill
            return (
              <div
                key={u.skill}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '4px 5px',
                  borderRadius: 8,
                  cursor: 'default',
                  transition: 'background 0.12s',
                  background: isHov ? '#FFF7ED' : 'transparent',
                }}
                onMouseEnter={() => setHoveredUnmet(u.skill)}
                onMouseLeave={() => setHoveredUnmet(null)}
              >
                <span style={{ fontSize: 10, color: '#EA580C', fontWeight: 700 }}>
                  ⚠ {u.count}× {u.skill}
                </span>
                {isHov && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setModal({ forSkill: u.skill })
                    }}
                    style={{
                      fontSize: 9,
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: 6,
                      border: '1px solid #FED7AA',
                      background: '#FFF7ED',
                      color: '#C2410C',
                      cursor: 'pointer',
                      lineHeight: 1.5,
                      marginLeft: 'auto',
                      transition: 'all 0.1s',
                    }}
                  >
                    + Fill
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {modal && (
        <AssignModal
          item={item}
          replacingStaff={'replacingStaff' in modal ? modal.replacingStaff : null}
          forSkill={'forSkill' in modal ? modal.forSkill : null}
          weeklyHoursUsed={weeklyHoursUsed}
          rules={rules}
          onConfirm={handleConfirm}
          onClose={() => setModal(null)}
        />
      )}
    </>
  )
}

// ─── Rules Panel ──────────────────────────────────────────────────────────────

function NumField({ label, value, fallback, unit, min, max, onChange }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ fontSize: 10, fontWeight: 600, color: '#64748B' }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <input
          type="number"
          value={value ?? fallback}
          min={min}
          max={max}
          onChange={(e) => {
            const v = parseFloat(e.target.value)
            if (!isNaN(v)) onChange(v)
          }}
          style={{
            width: 72,
            padding: '5px 10px',
            fontSize: 12,
            borderRadius: 8,
            border: '1.5px solid #E2E8F0',
            background: 'white',
            color: '#0F172A',
            outline: 'none',
            fontFamily: 'monospace',
          }}
        />
        {unit && <span style={{ fontSize: 10, color: '#94A3B8' }}>{unit}</span>}
      </div>
    </div>
  )
}

function RuleRow({ rule, isDirty, onChange }) {
  const isHard = rule.type === 'hard'
  return (
    <div
      style={{
        border: `1.5px solid ${isDirty ? '#BFDBFE' : rule.enabled ? '#E8EEF6' : '#F1F5F9'}`,
        borderRadius: 14,
        background: rule.enabled ? 'white' : '#F8FAFC',
        opacity: rule.enabled ? 1 : 0.6,
        transition: 'all 0.15s',
        overflow: 'hidden',
      }}
    >
      <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div
          onClick={() => onChange({ ...rule, enabled: !rule.enabled })}
          style={{
            width: 38,
            height: 22,
            borderRadius: 99,
            background: rule.enabled ? '#2563EB' : '#CBD5E1',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            padding: '0 2px',
            flexShrink: 0,
            marginTop: 2,
            transition: 'background 0.2s',
          }}
        >
          <div
            style={{
              width: 18,
              height: 18,
              borderRadius: '50%',
              background: 'white',
              transform: rule.enabled ? 'translateX(16px)' : 'translateX(0)',
              transition: 'transform 0.2s',
              boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
            }}
          />
        </div>
        <div style={{ flex: 1 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              flexWrap: 'wrap',
              marginBottom: 4,
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 700, color: '#0D1624' }}>{rule.name}</span>
            <span
              style={{
                fontSize: 9,
                fontWeight: 800,
                padding: '2px 7px',
                borderRadius: 5,
                background: isHard ? '#FEF2F2' : '#FFFBEB',
                color: isHard ? '#B91C1C' : '#92400E',
                border: `1px solid ${isHard ? '#FECACA' : '#FDE68A'}`,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              {rule.type}
            </span>
            {isDirty && (
              <span style={{ fontSize: 9, color: '#3B82F6', fontWeight: 700 }}>• unsaved</span>
            )}
          </div>
          <p style={{ fontSize: 11, color: '#64748B', lineHeight: 1.55, margin: 0 }}>
            {rule.description}
          </p>
          {rule.enabled && (
            <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 14 }}>
              {rule.id === 'hard-min-rest' && (
                <NumField
                  label="Minimum rest"
                  value={rule.params.minRestHours}
                  fallback={8}
                  unit="hrs"
                  min={2}
                  max={24}
                  onChange={(v) =>
                    onChange({ ...rule, params: { ...rule.params, minRestHours: v } })
                  }
                />
              )}
              {rule.id === 'hard-max-weekly-hours' && (
                <NumField
                  label="Max weekly hours"
                  value={rule.params.maxHours}
                  fallback={40}
                  unit="hrs"
                  min={10}
                  max={60}
                  onChange={(v) => onChange({ ...rule, params: { ...rule.params, maxHours: v } })}
                />
              )}
              {rule.id === 'soft-preferred-hours' && (
                <NumField
                  label="Penalty / outside hr"
                  value={rule.params.penaltyPerHour}
                  fallback={2}
                  unit="pts"
                  min={1}
                  max={20}
                  onChange={(v) =>
                    onChange({ ...rule, params: { ...rule.params, penaltyPerHour: v } })
                  }
                />
              )}
              {rule.id === 'soft-consecutive' && (
                <>
                  <NumField
                    label="Max consecutive"
                    value={rule.params.maxConsecutive}
                    fallback={3}
                    unit="shifts"
                    min={2}
                    max={7}
                    onChange={(v) =>
                      onChange({ ...rule, params: { ...rule.params, maxConsecutive: v } })
                    }
                  />
                  <NumField
                    label="Penalty / extra"
                    value={rule.params.penaltyPerExtra}
                    fallback={5}
                    unit="pts"
                    min={1}
                    max={20}
                    onChange={(v) =>
                      onChange({ ...rule, params: { ...rule.params, penaltyPerExtra: v } })
                    }
                  />
                </>
              )}
              {rule.id === 'soft-workgroup-rank' && (
                <NumField
                  label="Penalty / rank step"
                  value={rule.params.penaltyPerRankStep}
                  fallback={3}
                  unit="pts"
                  min={1}
                  max={15}
                  onChange={(v) =>
                    onChange({ ...rule, params: { ...rule.params, penaltyPerRankStep: v } })
                  }
                />
              )}
              {rule.id === 'soft-weekend-balance' && (
                <>
                  <NumField
                    label="Max weekend shifts"
                    value={rule.params.maxWeekendShifts}
                    fallback={2}
                    unit="shifts"
                    min={1}
                    max={5}
                    onChange={(v) =>
                      onChange({ ...rule, params: { ...rule.params, maxWeekendShifts: v } })
                    }
                  />
                  <NumField
                    label="Penalty / extra"
                    value={rule.params.penaltyPerExtra}
                    fallback={4}
                    unit="pts"
                    min={1}
                    max={20}
                    onChange={(v) =>
                      onChange({ ...rule, params: { ...rule.params, penaltyPerExtra: v } })
                    }
                  />
                </>
              )}
              {rule.type === 'soft' && (
                <NumField
                  label="Reject above"
                  value={rule.penaltyThreshold}
                  fallback={0}
                  unit="pts"
                  min={1}
                  max={100}
                  onChange={(v) => onChange({ ...rule, penaltyThreshold: v })}
                />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function RulesPanel({ rules, onSave, onClose }) {
  const [local, setLocal] = useState(() => JSON.parse(JSON.stringify(rules)))
  const [tab, setTab] = useState('hard')
  const [confirm, setConfirm] = useState(false)
  const dirty = new Set(
    local.filter((r, i) => JSON.stringify(r) !== JSON.stringify(rules[i])).map((r) => r.id),
  )
  const hasDirty = dirty.size > 0

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [])

  return (
    <div
      onClick={(e) => e.target === e.currentTarget && onClose()}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 400,
        background: 'rgba(10,15,30,0.55)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'flex-end',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 500,
          height: '100%',
          background: 'white',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '-30px 0 80px rgba(0,0,0,0.18)',
          position: 'relative',
        }}
      >
        <div
          style={{
            padding: '22px 22px 16px',
            borderBottom: '1px solid #F1F5F9',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div
              style={{ fontSize: 16, fontWeight: 800, color: '#0D1624', letterSpacing: '-0.025em' }}
            >
              Scheduling rules
            </div>
            <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>
              Admin only · changes apply on next run
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {hasDirty && (
              <button
                onClick={() => setLocal(JSON.parse(JSON.stringify(rules)))}
                style={{
                  fontSize: 11,
                  color: '#64748B',
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
                padding: '0 14px',
                borderRadius: 9,
                border: 'none',
                background: hasDirty ? '#1D4ED8' : '#E2E8F0',
                cursor: hasDirty ? 'pointer' : 'not-allowed',
                fontSize: 12,
                fontWeight: 700,
                color: hasDirty ? 'white' : '#94A3B8',
              }}
            >
              Save changes
            </button>
            <button
              onClick={onClose}
              style={{
                width: 32,
                height: 32,
                borderRadius: 9,
                border: '1.5px solid #E2E8F0',
                background: 'white',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#94A3B8',
                fontSize: 14,
              }}
            >
              ✕
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', borderBottom: '1px solid #F1F5F9' }}>
          {['hard', 'soft'].map((t) => {
            const cnt = local.filter((r) => r.type === t).length
            const act = local.filter((r) => r.type === t && r.enabled).length
            return (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  flex: 1,
                  padding: '12px 0',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  background: 'none',
                  border: 'none',
                  borderBottom: `3px solid ${tab === t ? '#2563EB' : 'transparent'}`,
                  color: tab === t ? '#2563EB' : '#64748B',
                  transition: 'color 0.15s',
                }}
              >
                {t.charAt(0).toUpperCase() + t.slice(1)} rules
                <span
                  style={{ marginLeft: 5, fontSize: 10, color: tab === t ? '#93C5FD' : '#CBD5E1' }}
                >
                  {act}/{cnt}
                </span>
              </button>
            )
          })}
        </div>

        <div
          style={{
            padding: '7px 16px 6px',
            fontSize: 10,
            color: '#94A3B8',
            background: '#F8FAFC',
            borderBottom: '1px solid #F1F5F9',
          }}
        >
          {tab === 'hard'
            ? 'Violations reject the assignment entirely.'
            : 'Violations add penalty. Schedules over threshold are rejected.'}
        </div>

        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '12px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          {local
            .filter((r) => r.type === tab)
            .map((rule) => (
              <RuleRow
                key={rule.id}
                rule={rule}
                isDirty={dirty.has(rule.id)}
                onChange={(u) => setLocal((p) => p.map((r) => (r.id === u.id ? u : r)))}
              />
            ))}
        </div>

        {confirm && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(10,15,30,0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 10,
              padding: 24,
            }}
          >
            <div
              style={{
                background: 'white',
                borderRadius: 18,
                padding: 24,
                width: '100%',
                maxWidth: 340,
                boxShadow: '0 24px 60px rgba(0,0,0,0.22)',
              }}
            >
              <div style={{ fontSize: 15, fontWeight: 800, color: '#0D1624', marginBottom: 6 }}>
                Save changes?
              </div>
              <div style={{ fontSize: 12, color: '#64748B', marginBottom: 14 }}>
                {dirty.size} rule{dirty.size !== 1 ? 's' : ''} modified. Applies on next schedule
                generation.
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 16 }}>
                {[...dirty].map((id) => {
                  const r = local.find((x) => x.id === id)
                  return r ? (
                    <div
                      key={id}
                      style={{
                        fontSize: 12,
                        color: '#374151',
                        display: 'flex',
                        gap: 7,
                        alignItems: 'center',
                      }}
                    >
                      <span
                        style={{
                          width: 5,
                          height: 5,
                          borderRadius: '50%',
                          background: '#3B82F6',
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
                    padding: '0 16px',
                    borderRadius: 9,
                    border: '1.5px solid #E2E8F0',
                    background: 'white',
                    cursor: 'pointer',
                    fontSize: 12,
                    fontWeight: 600,
                    color: '#475569',
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
                    background: '#1D4ED8',
                    cursor: 'pointer',
                    fontSize: 12,
                    fontWeight: 700,
                    color: 'white',
                  }}
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Timestamp Rail ───────────────────────────────────────────────────────────

const TIMELINE_HOURS = [6, 8, 10, 12, 14, 16, 18, 20, 22, 24]

function TimestampRail() {
  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', paddingTop: 0, width: 56, flexShrink: 0 }}
    >
      {TIMELINE_HOURS.map((h) => (
        <div
          key={h}
          style={{
            height: 52,
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'flex-end',
            paddingRight: 10,
            paddingTop: 4,
          }}
        >
          <span
            style={{
              fontFamily: '"SF Mono", "Fira Code", monospace',
              fontSize: 9,
              fontWeight: 600,
              color: '#C1C9D4',
              letterSpacing: '0.04em',
              whiteSpace: 'nowrap',
            }}
          >
            {fmt2(h)}:00
          </span>
        </div>
      ))}
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function ScheduleCalendar() {
  const [weekOffset, setWeekOffset] = useState(0)
  const [rules, setRules] = useState([...INITIAL_RULES])
  const [overrides, setOverrides] = useState({})
  const [showRules, setShowRules] = useState(false)

  const today = useMemo(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d
  }, [])

  const weekStart = useMemo(() => {
    const d = new Date(today)
    d.setDate(today.getDate() + weekOffset * 7)
    return d
  }, [weekOffset])

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
    schedule: base,
    weekTotalPenalty,
    hardFailures,
  } = useMemo(
    () => autoAssign(weekDays, rules),
    [weekDays.map((d) => d.toDateString()).join(), JSON.stringify(rules)],
  )

  const schedule = useMemo(() => {
    const s = new Map()
    for (const [day, items] of base.entries())
      s.set(
        day,
        items.map((item) =>
          overrides[item.slot.id] ? { ...item, ...overrides[item.slot.id] } : item,
        ),
      )
    return s
  }, [base, overrides])

  const weeklyHoursUsed = useMemo(() => {
    const h = new Map(STAFF.map((s) => [s.id, 0]))
    for (const items of schedule.values())
      for (const item of items) {
        const dur = item.slot.end - item.slot.start
        for (const p of item.assigned) h.set(p.id, (h.get(p.id) ?? 0) + dur)
      }
    return h
  }, [schedule])

  const handleChange = useCallback((slotId, assigned, unmet) => {
    setOverrides((p) => ({ ...p, [slotId]: { assigned, unmet, warnings: [] } }))
  }, [])

  const allItems = [...schedule.values()].flat()
  const totalGaps = allItems.filter((x) => x.unmet.length > 0).length
  const totalWarnings = allItems.filter((x) => x.warnings.length > 0).length
  const totalOverrides = Object.keys(overrides).length

  const weekLabel = `${weekDays[0].toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })} – ${weekDays[6].toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })}`

  return (
    <div
      style={{
        fontFamily: '"Inter var", "Inter", system-ui, sans-serif',
        background: '#EEF2F8',
        minHeight: '100vh',
      }}
    >
      {/* ── Top nav ── */}
      <div
        style={{
          background: '#0B1120',
          borderBottom: '1px solid #161E32',
          position: 'sticky',
          top: 0,
          zIndex: 100,
        }}
      >
        <div
          style={{
            maxWidth: 1180,
            margin: '0 auto',
            padding: '0 28px',
            height: 58,
            display: 'flex',
            alignItems: 'center',
            gap: 18,
          }}
        >
          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 9,
                background: 'linear-gradient(135deg, #2563EB, #1D4ED8)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 2px 8px rgba(37,99,235,0.35)',
              }}
            >
              <svg
                width="15"
                height="15"
                fill="none"
                stroke="white"
                strokeWidth="2.2"
                viewBox="0 0 24 24"
              >
                <rect x="3" y="4" width="18" height="18" rx="2.5" />
                <path d="M16 2v4M8 2v4M3 10h18" strokeLinecap="round" />
              </svg>
            </div>
            <span
              style={{ fontWeight: 800, fontSize: 14, color: 'white', letterSpacing: '-0.03em' }}
            >
              Scheduler
            </span>
          </div>

          <div style={{ width: 1, height: 20, background: '#1E2A40' }} />

          {/* Week nav */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button
              onClick={() => {
                setWeekOffset((w) => w - 1)
                setOverrides({})
              }}
              style={{
                width: 30,
                height: 30,
                borderRadius: 8,
                border: '1px solid #1E2A40',
                background: 'transparent',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#64748B',
                fontSize: 15,
                transition: 'color 0.1s',
              }}
            >
              ‹
            </button>
            <span
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: '#94A3B8',
                minWidth: 200,
                textAlign: 'center',
                letterSpacing: '0.01em',
              }}
            >
              {weekLabel}
            </span>
            <button
              onClick={() => {
                setWeekOffset((w) => w + 1)
                setOverrides({})
              }}
              style={{
                width: 30,
                height: 30,
                borderRadius: 8,
                border: '1px solid #1E2A40',
                background: 'transparent',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#64748B',
                fontSize: 15,
              }}
            >
              ›
            </button>
            <button
              onClick={() => {
                setWeekOffset(0)
                setOverrides({})
              }}
              style={{
                height: 28,
                padding: '0 11px',
                borderRadius: 7,
                border: '1px solid #1E2A40',
                background: 'transparent',
                cursor: 'pointer',
                fontSize: 11,
                fontWeight: 600,
                color: '#64748B',
              }}
            >
              Today
            </button>
          </div>

          {/* Status chips */}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 7, alignItems: 'center' }}>
            {totalGaps > 0 ? (
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: '#FB923C',
                  background: 'rgba(251,146,60,0.12)',
                  border: '1px solid rgba(251,146,60,0.25)',
                  borderRadius: 7,
                  padding: '3px 10px',
                }}
              >
                ⚠ {totalGaps} gap{totalGaps !== 1 ? 's' : ''}
              </span>
            ) : (
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: '#4ADE80',
                  background: 'rgba(74,222,128,0.1)',
                  border: '1px solid rgba(74,222,128,0.2)',
                  borderRadius: 7,
                  padding: '3px 10px',
                }}
              >
                ✓ Covered
              </span>
            )}
            {totalWarnings > 0 && (
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: '#FCD34D',
                  background: 'rgba(252,211,77,0.1)',
                  border: '1px solid rgba(252,211,77,0.2)',
                  borderRadius: 7,
                  padding: '3px 10px',
                }}
              >
                ! {totalWarnings} warn
              </span>
            )}
            {totalOverrides > 0 && (
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: '#60A5FA',
                  background: 'rgba(96,165,250,0.1)',
                  border: '1px solid rgba(96,165,250,0.2)',
                  borderRadius: 7,
                  padding: '3px 10px',
                }}
              >
                {totalOverrides} override{totalOverrides !== 1 ? 's' : ''}
              </span>
            )}
            <span style={{ fontSize: 10, color: '#334155', fontWeight: 500 }}>
              {weekTotalPenalty}pts
            </span>
            <button
              onClick={() => setShowRules(true)}
              style={{
                height: 30,
                padding: '0 13px',
                borderRadius: 8,
                border: '1px solid #1E2A40',
                background: 'transparent',
                cursor: 'pointer',
                fontSize: 11,
                fontWeight: 700,
                color: '#64748B',
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                transition: 'color 0.1s',
              }}
            >
              <svg
                width="12"
                height="12"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                viewBox="0 0 24 24"
              >
                <circle cx="12" cy="12" r="3" />
                <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" />
              </svg>
              Rules
            </button>
          </div>
        </div>
      </div>

      {/* ── Content ── */}
      <div style={{ maxWidth: 1180, margin: '0 auto', padding: '24px 28px' }}>
        {/* Hard failure banner */}
        {hardFailures.length > 0 && (
          <div
            style={{
              background: 'white',
              border: '1.5px solid #FECACA',
              borderRadius: 14,
              padding: '14px 18px',
              marginBottom: 20,
              display: 'flex',
              alignItems: 'flex-start',
              gap: 12,
              boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
            }}
          >
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: 9,
                background: '#FEF2F2',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <span style={{ fontSize: 15 }}>⚠</span>
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#B91C1C', marginBottom: 5 }}>
                {hardFailures.length} slot{hardFailures.length !== 1 ? 's' : ''} could not be filled
                — hard rule violations
              </div>
              {hardFailures.slice(0, 3).map((f, i) => (
                <div key={i} style={{ fontSize: 11, color: '#DC2626' }}>
                  · {f}
                </div>
              ))}
              {hardFailures.length > 3 && (
                <div style={{ fontSize: 11, color: '#94A3B8' }}>
                  …and {hardFailures.length - 3} more. Open a shift to fill manually.
                </div>
              )}
            </div>
          </div>
        )}

        {/* Month label above calendar */}
        {(() => {
          const startMonth = weekDays[0].toLocaleDateString('en-ZA', {
            month: 'long',
            year: 'numeric',
          })
          const endMonth = weekDays[6].toLocaleDateString('en-ZA', {
            month: 'long',
            year: 'numeric',
          })
          const monthLabel =
            startMonth === endMonth
              ? startMonth
              : `${weekDays[0].toLocaleDateString('en-ZA', { month: 'long' })} – ${endMonth}`
          return (
            <div style={{ marginBottom: 10, display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <span
                style={{
                  fontSize: 20,
                  fontWeight: 800,
                  color: '#0D1624',
                  letterSpacing: '-0.03em',
                }}
              >
                {monthLabel}
              </span>
              <span style={{ fontSize: 12, color: '#94A3B8', fontWeight: 500 }}>
                Week {weekOffset === 0 ? 'current' : weekOffset > 0 ? `+${weekOffset}` : weekOffset}
              </span>
            </div>
          )
        })()}

        {/* Calendar card — no overflow:hidden so last column is never clipped */}
        <div
          style={{
            background: 'white',
            borderRadius: 20,
            border: '1px solid #E2E8F2',
            boxShadow: '0 2px 12px rgba(0,0,0,0.07), 0 1px 3px rgba(0,0,0,0.04)',
            boxSizing: 'border-box',
            width: '100%',
          }}
        >
          {/* Day headers — fixed height so dates always align */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '60px repeat(7, minmax(0, 1fr))',
              borderBottom: '1px solid #F0F4FA',
              background: '#FAFBFD',
              borderRadius: '20px 20px 0 0',
              overflow: 'hidden',
            }}
          >
            {/* Gutter corner — same fixed height as day cells */}
            <div style={{ height: 76, borderRight: '1px solid #F0F4FA', flexShrink: 0 }} />
            {weekDays.map((date, i) => {
              const dn = DAY_NAMES[date.getDay()]
              const isToday = date.toDateString() === today.toDateString()
              const isWknd = date.getDay() === 0 || date.getDay() === 6
              const slots = schedule.get(dn) ?? []
              const gaps = slots.filter((s) => s.unmet.length > 0).length
              const warns = slots.filter((s) => s.warnings.length > 0).length
              return (
                <div
                  key={i}
                  style={{
                    height: 76,
                    padding: '12px 6px 10px',
                    textAlign: 'center',
                    borderRight: i < 6 ? '1px solid #F0F4FA' : 'none',
                    background: isToday ? '#0B1120' : undefined,
                    boxSizing: 'border-box',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <div
                    style={{
                      fontSize: 9,
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.12em',
                      color: isToday ? '#3B82F6' : isWknd ? '#94A3B8' : '#C1C9D4',
                      marginBottom: 3,
                    }}
                  >
                    {dn.slice(0, 3)}
                  </div>
                  <div
                    style={{
                      fontSize: 22,
                      fontWeight: 800,
                      lineHeight: 1,
                      color: isToday ? 'white' : isWknd ? '#94A3B8' : '#0D1624',
                      letterSpacing: '-0.04em',
                    }}
                  >
                    {date.getDate()}
                  </div>
                  <div
                    style={{
                      height: 14,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 3,
                      marginTop: 3,
                    }}
                  >
                    {gaps > 0 && (
                      <span style={{ fontSize: 9, color: '#FB923C', fontWeight: 700 }}>
                        ⚠{gaps}
                      </span>
                    )}
                    {warns > 0 && (
                      <span style={{ fontSize: 9, color: '#FCD34D', fontWeight: 700 }}>
                        !{warns}
                      </span>
                    )}
                    {gaps === 0 && warns === 0 && (
                      <span style={{ fontSize: 9, color: isToday ? '#1E2A40' : '#E8EEF8' }}>—</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Timestamp rail + day columns — timestamps aligned to top of columns, no extra padding offset */}
          <div style={{ display: 'grid', gridTemplateColumns: '60px repeat(7, minmax(0, 1fr))' }}>
            {/* Time gutter — NO paddingTop, rows start flush */}
            <div style={{ borderRight: '1px solid #F0F4FA' }}>
              {TIMELINE_HOURS.map((h) => (
                <div
                  key={h}
                  style={{
                    height: 56,
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'flex-end',
                    paddingRight: 10,
                    paddingTop: 6,
                    boxSizing: 'border-box',
                  }}
                >
                  <span
                    style={{
                      fontFamily: '"SF Mono","Fira Code",monospace',
                      fontSize: 9,
                      fontWeight: 600,
                      color: '#C1C9D4',
                      letterSpacing: '0.03em',
                    }}
                  >
                    {fmt2(h)}:00
                  </span>
                </div>
              ))}
            </div>

            {/* Day columns — NO top padding so first slot aligns with first timestamp */}
            {weekDays.map((date, i) => {
              const dn = DAY_NAMES[date.getDay()]
              const isToday = date.toDateString() === today.toDateString()
              const isWknd = date.getDay() === 0 || date.getDay() === 6
              const slots = schedule.get(dn) ?? []
              return (
                <div
                  key={i}
                  style={{
                    borderRight: i < 6 ? '1px solid #F0F4FA' : 'none',
                    background: isToday ? '#FBFCFF' : isWknd ? '#FAFAFA' : undefined,
                    padding: '6px 6px 8px',
                    minHeight: 520,
                    boxSizing: 'border-box',
                    borderRadius: i === 6 ? '0 0 20px 0' : i === 0 ? '0 0 0 0' : undefined,
                  }}
                >
                  {slots.length === 0 ? (
                    <div
                      style={{
                        height: 56,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#DDE4EF',
                        fontSize: 11,
                      }}
                    >
                      —
                    </div>
                  ) : (
                    slots.map((item) => (
                      <ShiftCard
                        key={item.slot.id}
                        item={item}
                        weeklyHoursUsed={weeklyHoursUsed}
                        rules={rules}
                        onScheduleChange={handleChange}
                      />
                    ))
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Legend */}
        <div
          style={{
            marginTop: 14,
            display: 'flex',
            gap: 16,
            justifyContent: 'center',
            flexWrap: 'wrap',
            alignItems: 'center',
          }}
        >
          {Object.entries(T).map(([type, m]) => (
            <span
              key={type}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                fontSize: 10,
                color: '#94A3B8',
              }}
            >
              <span
                style={{ width: 7, height: 7, borderRadius: '50%', background: m.accentColor }}
              />
              {m.label}
            </span>
          ))}
          <span style={{ color: '#D1D9E6', fontSize: 10 }}>·</span>
          <span style={{ fontSize: 10, color: '#94A3B8' }}>★ Primary skill</span>
          <span style={{ fontSize: 10, color: '#94A3B8' }}>Hover a row to replace or fill</span>
        </div>
      </div>

      {showRules && (
        <RulesPanel
          rules={rules}
          onSave={(r) => {
            setRules(r)
            setOverrides({})
          }}
          onClose={() => setShowRules(false)}
        />
      )}
    </div>
  )
}
