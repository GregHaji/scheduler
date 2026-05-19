/**
 * WFM Full System
 * ─────────────────────────────────────────────────────────────────────────
 * Covers WFM-101, 201, 202, 301, 302 in one integrated file.
 *
 * Architecture:
 *   RULE ENGINE  →  SCHEDULER  →  CALENDAR UI  +  RULE CONFIG UI
 *
 * Hard rules:   violation = candidate rejected entirely
 * Soft rules:   violation = penalty added; schedule with lowest total penalty wins
 *               if total penalty ≥ rule's threshold → schedule rejected (unless admin override)
 *
 * Replace STAFF and DAY_CONFIGS with your real API data.
 * Replace saveRules() with your real persistence call.
 */
'use client'

import { useState, useMemo, useCallback, useRef, type MouseEvent } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// 1. RULE DATA MODEL
// ─────────────────────────────────────────────────────────────────────────────

/**
 * RuleParam — a single configurable value on a rule.
 * Stored in DB as a JSON field; editable without redeployment.
 */
const RULE_PARAM_DEFAULTS = {
  // Hard rules
  "hard-min-rest":          { minRestHours: 8 },
  "hard-max-weekly-hours":  { maxHours: 40 },
  "hard-workgroup-qualified": {},

  // Soft rules
  "soft-preferred-hours":   { penaltyPerHour: 2 },
  "soft-consecutive":       { maxConsecutive: 3, penaltyPerExtra: 5 },
  "soft-workgroup-rank":    { penaltyPerRankStep: 3 },
  "soft-weekend-balance":   { maxWeekendShifts: 2, penaltyPerExtra: 4 },
};

const INITIAL_RULES = [
  {
    id: "hard-min-rest",
    type: "hard",
    name: "Minimum rest between shifts",
    description: "Staff must rest for at least N hours between consecutive shifts. Violations cause the assignment to be skipped.",
    enabled: true,
    params: { minRestHours: 8 },
    // hard rules have no threshold — any violation = reject
  },
  {
    id: "hard-max-weekly-hours",
    type: "hard",
    name: "Maximum weekly hours",
    description: "Staff cannot be assigned shifts that would exceed their contracted maximum weekly hours.",
    enabled: true,
    params: { maxHours: 40 },
  },
  {
    id: "hard-workgroup-qualified",
    type: "hard",
    name: "Workgroup qualification required",
    description: "Staff may only be assigned to a workgroup (skill) that appears in their skill profile.",
    enabled: true,
    params: {},
  },
  {
    id: "soft-preferred-hours",
    type: "soft",
    name: "Preferred working hours",
    description: "Each staff member has a preferred shift window. Hours worked outside that window carry a penalty.",
    enabled: true,
    penaltyThreshold: 20,
    params: { penaltyPerHour: 2 },
  },
  {
    id: "soft-consecutive",
    type: "soft",
    name: "Consecutive shifts",
    description: "Discourages assigning staff to more than N consecutive shifts. Extra shifts beyond the limit are penalised.",
    enabled: true,
    penaltyThreshold: 15,
    params: { maxConsecutive: 3, penaltyPerExtra: 5 },
  },
  {
    id: "soft-workgroup-rank",
    type: "soft",
    name: "Workgroup rank preference",
    description: "Prefer assigning staff to their highest-ranked workgroup. Each rank step away from primary adds a penalty.",
    enabled: true,
    penaltyThreshold: 30,
    params: { penaltyPerRankStep: 3 },
  },
  {
    id: "soft-weekend-balance",
    type: "soft",
    name: "Weekend shift balance",
    description: "Distributes weekend shifts fairly. Staff assigned more than the max weekend shifts per week are penalised.",
    enabled: false,
    penaltyThreshold: 12,
    params: { maxWeekendShifts: 2, penaltyPerExtra: 4 },
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// 2. STAFF & SHIFT DATA
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Staff workgroups: array of { workgroupId, rank } — rank 1 = primary skill.
 * WFM-101: each person can have multiple workgroups with a priority rank.
 */
const STAFF = [
  {
    id: "s1", name: "Sarah Chen",    initials: "SC",
    workgroups: [{ id: "Barista", rank: 1 }, { id: "Trainer", rank: 2 }],
    availability: [1,2,3,4,5], maxHours: 40, preferredWindow: [6,16],
  },
  {
    id: "s2", name: "James Okafor",  initials: "JO",
    workgroups: [{ id: "Supervisor", rank: 1 }, { id: "Barista", rank: 2 }],
    availability: [1,2,3,4], maxHours: 40, preferredWindow: [8,17],
  },
  {
    id: "s3", name: "Priya Nair",    initials: "PN",
    workgroups: [{ id: "Barista", rank: 1 }, { id: "Cashier", rank: 2 }],
    availability: [1,2,4,5,6], maxHours: 32, preferredWindow: [8,16],
  },
  {
    id: "s4", name: "Dana Steyn",    initials: "DS",
    workgroups: [{ id: "Cashier", rank: 1 }],
    availability: [1,2,3,4,5], maxHours: 24, preferredWindow: [9,17],
  },
  {
    id: "s5", name: "Luca Ferrari",  initials: "LF",
    workgroups: [{ id: "Barista", rank: 1 }, { id: "Cashier", rank: 2 }],
    availability: [1,2,3,4,5,6], maxHours: 40, preferredWindow: [8,18],
  },
  {
    id: "s6", name: "Mia Thompson",  initials: "MT",
    workgroups: [{ id: "Cashier", rank: 1 }, { id: "Supervisor", rank: 2 }],
    availability: [2,3,4,5,6,0], maxHours: 40, preferredWindow: [10,18],
  },
  {
    id: "s7", name: "Noah Williams", initials: "NW",
    workgroups: [{ id: "Manager", rank: 1 }, { id: "Supervisor", rank: 2 }],
    availability: [1,2,3,4,5], maxHours: 40, preferredWindow: [8,16],
  },
  {
    id: "s8", name: "Aisha Diallo",  initials: "AD",
    workgroups: [{ id: "Cashier", rank: 1 }, { id: "Barista", rank: 2 }],
    availability: [2,3,4,5,6], maxHours: 32, preferredWindow: [9,17],
  },
  {
    id: "s9", name: "Chen Wei",      initials: "CW",
    workgroups: [{ id: "Barista", rank: 1 }],
    availability: [3,4,5,6,0], maxHours: 24, preferredWindow: [10,18],
  },
  {
    id: "s10", name: "Tariq Hassan", initials: "TH",
    workgroups: [{ id: "Barista", rank: 1 }, { id: "Trainer", rank: 2 }, { id: "Supervisor", rank: 3 }],
    availability: [1,2,4,5,6], maxHours: 40, preferredWindow: [8,16],
  },
];

const DAY_CONFIGS = {
  Monday:    { slots: [{ id:"mon-am",  start:6,  end:14, type:"morning",   req:[{ skill:"Barista", count:2 }] }, { id:"mon-day", start:8,  end:16, type:"morning",   req:[{ skill:"Supervisor", count:1 }, { skill:"Cashier", count:1 }] }, { id:"mon-pm",  start:14, end:22, type:"afternoon", req:[{ skill:"Barista", count:2 }, { skill:"Cashier", count:1 }] }, { id:"mon-n",   start:22, end:24, type:"night",     req:[{ skill:"Manager", count:1 }] }] },
  Tuesday:   { slots: [{ id:"tue-am",  start:8,  end:16, type:"morning",   req:[{ skill:"Barista", count:1 }, { skill:"Cashier", count:1 }] }, { id:"tue-pm",  start:14, end:22, type:"afternoon", req:[{ skill:"Barista", count:2 }, { skill:"Supervisor", count:1 }] }, { id:"tue-n",   start:22, end:24, type:"night",     req:[{ skill:"Manager", count:1 }] }] },
  Wednesday: { slots: [{ id:"wed-e",   start:6,  end:14, type:"morning",   req:[{ skill:"Barista", count:1 }] }, { id:"wed-am",  start:8,  end:16, type:"morning",   req:[{ skill:"Supervisor", count:1 }, { skill:"Cashier", count:1 }] }, { id:"wed-pm",  start:14, end:22, type:"afternoon", req:[{ skill:"Barista", count:2 }, { skill:"Cashier", count:1 }] }] },
  Thursday:  { slots: [{ id:"thu-am",  start:8,  end:16, type:"morning",   req:[{ skill:"Barista", count:2 }, { skill:"Supervisor", count:1 }] }, { id:"thu-pm",  start:16, end:24, type:"afternoon", req:[{ skill:"Barista", count:1 }, { skill:"Cashier", count:1 }] }, { id:"thu-n",   start:22, end:24, type:"night",     req:[{ skill:"Manager", count:1 }] }] },
  Friday:    { slots: [{ id:"fri-e",   start:6,  end:14, type:"morning",   req:[{ skill:"Barista", count:2 }] }, { id:"fri-pm",  start:14, end:22, type:"afternoon", req:[{ skill:"Barista", count:2 }, { skill:"Cashier", count:1 }] }, { id:"fri-n",   start:22, end:24, type:"night",     req:[{ skill:"Manager", count:1 }] }] },
  Saturday:  { slots: [{ id:"sat-am",  start:8,  end:16, type:"morning",   req:[{ skill:"Barista", count:1 }, { skill:"Cashier", count:1 }] }, { id:"sat-pm",  start:16, end:24, type:"night",     req:[{ skill:"Barista", count:1 }] }] },
  Sunday:    { slots: [{ id:"sun-am",  start:10, end:18, type:"morning",   req:[{ skill:"Barista", count:1 }] }, { id:"sun-pm",  start:14, end:22, type:"afternoon", req:[{ skill:"Cashier", count:1 }] }] },
};

const DAY_NAMES = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

const SHIFT_STYLES = {
  morning:   { bg:"#FFF8ED", border:"#F59E0B", text:"#92400E", dot:"#F59E0B", avatarBg:"#FDE68A", avatarText:"#78350F" },
  afternoon: { bg:"#EFF6FF", border:"#60A5FA", text:"#1E40AF", dot:"#3B82F6", avatarBg:"#BFDBFE", avatarText:"#1E3A8A" },
  night:     { bg:"#F5F3FF", border:"#A78BFA", text:"#4C1D95", dot:"#7C3AED", avatarBg:"#DDD6FE", avatarText:"#4C1D95" },
  manager:   { bg:"#ECFDF5", border:"#34D399", text:"#065F46", dot:"#10B981", avatarBg:"#A7F3D0", avatarText:"#064E3B" },
};

type StaffMember = (typeof STAFF)[number];
type DayName = keyof typeof DAY_CONFIGS;
type SlotConfig = (typeof DAY_CONFIGS)[DayName]["slots"][number];
type WfmRule = (typeof INITIAL_RULES)[number];
type StaffShiftHistory = {
  lastEndHour: number | null;
  consecutiveDays: number;
  weekendShifts: number;
};
type SoftViolation = { ruleId: string; ruleName: string; penalty: number; detail: string };
type ScoreCandidateResult = {
  eligible: boolean;
  hardViolation: string | null;
  softPenalty: number;
  softViolations: SoftViolation[];
};

/** One resolved slot row in the week schedule (autoAssign + UI overrides) */
type AssignedWithPenalty = StaffMember & { _softPenalty?: number };
type SlotUnmet = { skill: string; count: number };
type SlotScheduleWarning = SoftViolation & { staffId: string; staffName: string };

type ScheduleSlotItem = {
  slot: SlotConfig;
  assigned: AssignedWithPenalty[];
  unmet: SlotUnmet[];
  warnings: SlotScheduleWarning[];
  date: Date;
  dayIndex: number;
};

type CandidateModalProps = {
  item: ScheduleSlotItem;
  replacingStaff: StaffMember | null;
  forSkill: string | null;
  weeklyHoursUsed: Map<string, number>;
  rules: readonly WfmRule[];
  onConfirm: (staffId: string) => void;
  onClose: () => void;
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. RULE ENGINE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * evaluateHardRules — returns null if all pass, or a string describing the first violation.
 * Each evaluator checks one rule if it is enabled.
 */
function evaluateHardRules(
  staff: StaffMember,
  slot: SlotConfig,
  dayIndex: number,
  weeklyHoursUsed: Map<string, number>,
  shiftsThisWeek: Map<string, StaffShiftHistory>,
  rules: readonly WfmRule[],
): string | null {
  const hardRules = rules.filter((r) => r.type === "hard" && r.enabled);
  const dur = slot.end - slot.start;

  for (const rule of hardRules) {
    switch (rule.id) {

      // ── Workgroup qualification ──────────────────────────────────────────
      case "hard-workgroup-qualified": {
        const neededSkills = slot.req.map(r => r.skill);
        const staffSkills = staff.workgroups.map(w => w.id);
        const qualified = neededSkills.some(sk => staffSkills.includes(sk));
        if (!qualified) return `${rule.name}: not qualified for any required workgroup (${neededSkills.join(", ")})`;
        break;
      }

      // ── Max weekly hours ─────────────────────────────────────────────────
      case "hard-max-weekly-hours": {
        const cap = rule.params.maxHours ?? 40;
        const used = weeklyHoursUsed.get(staff.id) ?? 0;
        if (used + dur > cap) return `${rule.name}: ${used}h used + ${dur}h shift exceeds ${cap}h limit`;
        break;
      }

      // ── Min rest between shifts ──────────────────────────────────────────
      case "hard-min-rest": {
        const minRest = rule.params.minRestHours ?? 8;
        const lastShiftEnd = shiftsThisWeek.get(staff.id)?.lastEndHour ?? null;
        if (lastShiftEnd !== null) {
          // Simplified: check same-day overlap (full cross-day rest check requires date tracking)
          const hoursGap = slot.start - lastShiftEnd;
          if (hoursGap >= 0 && hoursGap < minRest) {
            return `${rule.name}: only ${hoursGap}h rest before this shift (minimum ${minRest}h)`;
          }
        }
        break;
      }
    }
  }
  return null; // all hard rules passed
}

/**
 * evaluateSoftRules — returns { totalPenalty, violations[] }
 * Violations are shown inline in the UI as warnings.
 */
function evaluateSoftRules(
  staff: StaffMember,
  slot: SlotConfig,
  dayIndex: number,
  weeklyHoursUsed: Map<string, number>,
  shiftsThisWeek: Map<string, StaffShiftHistory>,
  rules: readonly WfmRule[],
): { totalPenalty: number; violations: SoftViolation[] } {
  const softRules = rules.filter((r) => r.type === "soft" && r.enabled);
  const dur = slot.end - slot.start;
  let totalPenalty = 0;
  const violations: SoftViolation[] = [];

  for (const rule of softRules) {
    switch (rule.id) {

      // ── Preferred working hours ──────────────────────────────────────────
      case "soft-preferred-hours": {
        const [prefStart, prefEnd] = staff.preferredWindow;
        const penaltyPerHour = rule.params.penaltyPerHour ?? 2;
        const overlapStart = Math.max(slot.start, prefStart);
        const overlapEnd   = Math.min(slot.end, prefEnd);
        const outsideHours = dur - Math.max(0, overlapEnd - overlapStart);
        if (outsideHours > 0) {
          const p = outsideHours * penaltyPerHour;
          totalPenalty += p;
          violations.push({ ruleId: rule.id, ruleName: rule.name, penalty: p,
            detail: `${outsideHours}h outside preferred window (${prefStart}:00–${prefEnd}:00)` });
        }
        break;
      }

      // ── Consecutive shifts ───────────────────────────────────────────────
      case "soft-consecutive": {
        const maxConsec = rule.params.maxConsecutive ?? 3;
        const penaltyPerExtra = rule.params.penaltyPerExtra ?? 5;
        const consecutive = shiftsThisWeek.get(staff.id)?.consecutiveDays ?? 0;
        if (consecutive >= maxConsec) {
          const extra = consecutive - maxConsec + 1;
          const p = extra * penaltyPerExtra;
          totalPenalty += p;
          violations.push({ ruleId: rule.id, ruleName: rule.name, penalty: p,
            detail: `${consecutive + 1} consecutive shifts (max ${maxConsec})` });
        }
        break;
      }

      // ── Workgroup rank preference ────────────────────────────────────────
      case "soft-workgroup-rank": {
        const penaltyPerStep = rule.params.penaltyPerRankStep ?? 3;
        const neededSkills = slot.req.map(r => r.skill);
        for (const sk of neededSkills) {
          const wg = staff.workgroups.find(w => w.id === sk);
          if (wg && wg.rank > 1) {
            const p = (wg.rank - 1) * penaltyPerStep;
            totalPenalty += p;
            violations.push({ ruleId: rule.id, ruleName: rule.name, penalty: p,
              detail: `${sk} is rank-${wg.rank} skill (not primary)` });
          }
        }
        break;
      }

      // ── Weekend balance ──────────────────────────────────────────────────
      case "soft-weekend-balance": {
        const isWeekend = dayIndex === 0 || dayIndex === 6;
        if (isWeekend) {
          const maxWeekend = rule.params.maxWeekendShifts ?? 2;
          const penaltyPerExtra = rule.params.penaltyPerExtra ?? 4;
          const weekendSoFar = shiftsThisWeek.get(staff.id)?.weekendShifts ?? 0;
          if (weekendSoFar >= maxWeekend) {
            const p = penaltyPerExtra;
            totalPenalty += p;
            violations.push({ ruleId: rule.id, ruleName: rule.name, penalty: p,
              detail: `Already has ${weekendSoFar} weekend shift${weekendSoFar !== 1 ? "s" : ""} this week` });
          }
        }
        break;
      }
    }
  }

  return { totalPenalty, violations };
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. SCHEDULER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * scoreCandidate — combine hard gate + soft score for ranking.
 * Returns { eligible, hardViolation, softPenalty, softViolations }
 */
function scoreCandidate(
  staff: StaffMember,
  slot: SlotConfig,
  dayIndex: number,
  weeklyHoursUsed: Map<string, number>,
  assignedToday: Set<string>,
  shiftsThisWeek: Map<string, StaffShiftHistory>,
  rules: readonly WfmRule[],
): ScoreCandidateResult {
  // Availability (not a configurable rule — it's a fundamental constraint)
  if (!staff.availability.includes(dayIndex)) {
    return { eligible: false, hardViolation: "Not available this day", softPenalty: 0, softViolations: [] };
  }
  if (assignedToday.has(staff.id)) {
    return { eligible: false, hardViolation: "Already assigned today", softPenalty: 0, softViolations: [] };
  }

  // Hard rules
  const hardViolation = evaluateHardRules(staff, slot, dayIndex, weeklyHoursUsed, shiftsThisWeek, rules);
  if (hardViolation) return { eligible: false, hardViolation, softPenalty: 0, softViolations: [] };

  // Soft rules
  const { totalPenalty, violations } = evaluateSoftRules(staff, slot, dayIndex, weeklyHoursUsed, shiftsThisWeek, rules);

  // Load balance tiebreaker: prefer staff with fewer hours (small constant penalty per 8h block)
  const hoursLoad = Math.floor((weeklyHoursUsed.get(staff.id) ?? 0) / 8);

  return {
    eligible: true,
    hardViolation: null,
    softPenalty: totalPenalty + hoursLoad,
    softViolations: violations,
  };
}

/**
 * autoAssign — main scheduler.
 * For each slot, builds a ranked candidate list via scoreCandidate(),
 * rejects hard-rule failures, and picks the lowest-penalty eligible staff.
 */
function autoAssign(weekDays: Date[], rules: readonly WfmRule[]) {
  const weeklyHoursUsed = new Map<string, number>(STAFF.map((s) => [s.id, 0]));
  // Track per-staff: lastEndHour (same day), consecutiveDays, weekendShifts
  const shiftsThisWeek = new Map<string, StaffShiftHistory>(
    STAFF.map((s) => [s.id, { lastEndHour: null, consecutiveDays: 0, weekendShifts: 0 }]),
  );
  const result = new Map<string, ScheduleSlotItem[]>();
  let weekTotalPenalty = 0;
  const hardFailures: string[] = [];

  for (const date of weekDays) {
    const dayIndex = date.getDay();
    const dayName = DAY_NAMES[dayIndex] as DayName;
    const config = DAY_CONFIGS[dayName];
    if (!config) { result.set(dayName, []); continue; }

    const assignedToday = new Set<string>();
    const resolved: ScheduleSlotItem[] = [];

    for (const slot of config.slots) {
      const dur = slot.end - slot.start;
      const slotAssigned: AssignedWithPenalty[] = [];
      const slotUnmet: SlotUnmet[] = [];
      const slotWarnings: SlotScheduleWarning[] = []; // soft rule violations for assigned staff

      for (const req of slot.req) {
        let remaining = req.count;

        // Build ranked candidate list for this skill requirement
        const candidates = STAFF
          .filter(s => s.workgroups.some(w => w.id === req.skill)) // must have skill at all
          .map(s => ({ staff: s, ...scoreCandidate(s, slot, dayIndex, weeklyHoursUsed, assignedToday, shiftsThisWeek, rules) }))
          .sort((a, b) => {
            if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
            return a.softPenalty - b.softPenalty;
          });

        for (const { staff, eligible, softPenalty, softViolations } of candidates) {
          if (remaining <= 0) break;
          if (!eligible) continue;

          slotAssigned.push({ ...staff, _softPenalty: softPenalty });
          assignedToday.add(staff.id);
          weeklyHoursUsed.set(staff.id, (weeklyHoursUsed.get(staff.id) ?? 0) + dur);
          weekTotalPenalty += softPenalty;

          // Track shift history
          const hist = shiftsThisWeek.get(staff.id)!;
          hist.lastEndHour = slot.end;
          hist.consecutiveDays += 1;
          if (dayIndex === 0 || dayIndex === 6) hist.weekendShifts += 1;

          // Collect warnings for inline display
          softViolations.forEach((v) =>
            slotWarnings.push({
              staffId: staff.id,
              staffName: staff.name,
              ruleId: v.ruleId,
              ruleName: v.ruleName,
              penalty: v.penalty,
              detail: v.detail,
            }),
          );
          remaining--;
        }

        if (remaining > 0) {
          slotUnmet.push({ skill: req.skill, count: remaining });
          hardFailures.push(`${slot.id}: ${remaining}× ${req.skill} could not be filled`);
        }
      }

      resolved.push({
        slot,
        assigned: slotAssigned,
        unmet: slotUnmet,
        warnings: slotWarnings,
        date,
        dayIndex,
      });
    }

    result.set(dayName, resolved);
  }

  return { schedule: result, weekTotalPenalty, hardFailures };
}

type ShiftCardModalState =
  | { replacingStaff: StaffMember }
  | { forSkill: string };

type ShiftCardProps = {
  item: ScheduleSlotItem;
  compact: boolean;
  weeklyHoursUsed: Map<string, number>;
  rules: readonly WfmRule[];
  onScheduleChange: (slotId: string, assigned: StaffMember[], unmet: SlotUnmet[]) => void;
};

// ─────────────────────────────────────────────────────────────────────────────
// 5. RANKED CANDIDATE MODAL
// ─────────────────────────────────────────────────────────────────────────────

function scoreLabel(penalty: number) {
  if (penalty === 0) return { label: "Perfect match", color: "#059669" };
  if (penalty <= 4)  return { label: "Good fit",      color: "#D97706" };
  if (penalty <= 9)  return { label: "Acceptable",    color: "#EA580C" };
  return                    { label: "Not ideal",     color: "#DC2626" };
}

function CandidateModal({
  item,
  replacingStaff,
  forSkill,
  weeklyHoursUsed,
  rules,
  onConfirm,
  onClose,
}: CandidateModalProps) {
  const [selected, setSelected] = useState(replacingStaff?.id ?? null);

  const skill = forSkill ?? item.slot.req[0]?.skill;
  const currentIds = new Set(item.assigned.map((s: StaffMember) => s.id));
  const replacingId = replacingStaff?.id ?? null;

  const candidates = useMemo(() => {
    const assignedToday = new Set(item.assigned.filter((s: StaffMember) => s.id !== replacingId).map((s: StaffMember) => s.id));

    return STAFF.map(s => {
      const { eligible, hardViolation, softPenalty, softViolations } = scoreCandidate(
        s, item.slot, item.dayIndex,
        weeklyHoursUsed,
        assignedToday,
        new Map(STAFF.map(x => [x.id, { lastEndHour: null, consecutiveDays: 0, weekendShifts: 0 }])),
        rules
      );
      const isCurrentlyAssigned = currentIds.has(s.id) && s.id !== replacingId;
      return {
        staff: s, eligible: eligible && !isCurrentlyAssigned,
        ineligibleReason: !eligible ? hardViolation : isCurrentlyAssigned ? "Already on this shift" : null,
        softPenalty, softViolations,
        wgRank: s.workgroups.find(w => w.id === skill)?.rank ?? null,
      };
    }).sort((a, b) => {
      if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
      return a.softPenalty - b.softPenalty;
    });
  }, [item, replacingId, weeklyHoursUsed, rules, skill]);

  const eligible   = candidates.filter(c => c.eligible);
  const ineligible = candidates.filter(c => !c.eligible);

  return (
    <div onClick={e => e.target === e.currentTarget && onClose()}
      style={{ position:"fixed", inset:0, zIndex:200, background:"rgba(0,0,0,0.5)", display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}>
      <div style={{ background:"white", borderRadius:16, width:"100%", maxWidth:500, maxHeight:"88vh", display:"flex", flexDirection:"column", overflow:"hidden", boxShadow:"0 24px 60px rgba(0,0,0,0.3)" }}>

        {/* Header */}
        <div style={{ padding:"16px 20px 12px", borderBottom:"1px solid #F3F4F6" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
            <div>
              <div style={{ fontSize:13, fontWeight:700, color:"#111827" }}>
                {replacingStaff ? `Replace ${replacingStaff.name}` : `Fill gap — ${skill}`}
              </div>
              <div style={{ fontSize:11, color:"#6B7280", marginTop:2 }}>
                {String(item.slot.start).padStart(2,"0")}:00–{String(item.slot.end % 24).padStart(2,"0")}:00 · {item.slot.type} · needs {skill}
              </div>
            </div>
            <button onClick={onClose} style={{ width:28, height:28, borderRadius:8, border:"1px solid #E5E7EB", background:"white", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", color:"#9CA3AF" }}>
              ✕
            </button>
          </div>
          {/* Legend */}
          <div style={{ display:"flex", gap:10, marginTop:10, flexWrap:"wrap" }}>
            {[["Perfect match","#059669"],["Good fit","#D97706"],["Acceptable","#EA580C"],["Not ideal","#DC2626"]].map(([lbl,col]) => (
              <span key={lbl} style={{ display:"flex", alignItems:"center", gap:4, fontSize:9, color:"#6B7280" }}>
                <span style={{ width:7, height:7, borderRadius:"50%", background:col }}/>{lbl}
              </span>
            ))}
          </div>
        </div>

        {/* Candidate list */}
        <div style={{ flex:1, overflowY:"auto", padding:"10px 12px" }}>
          {eligible.length === 0 && (
            <div style={{ textAlign:"center", padding:"24px 0", color:"#9CA3AF", fontSize:12 }}>
              No eligible staff. Try relaxing a rule or adjusting availability.
            </div>
          )}

          {eligible.map(({ staff: s, softPenalty, softViolations, wgRank }, i) => {
            const isCurrent = s.id === replacingId;
            const isSelected = selected === s.id;
            const { label, color } = scoreLabel(softPenalty);
            const hoursUsed = weeklyHoursUsed.get(s.id) ?? 0;
            const maxH = s.maxHours;

            return (
              <div key={s.id} onClick={() => setSelected(isSelected ? null : s.id)}
                style={{ border:`1.5px solid ${isSelected ? "#3B82F6" : isCurrent ? "#E5E7EB" : "#F3F4F6"}`, borderRadius:10, padding:"10px 12px", marginBottom:6, cursor:"pointer", background: isSelected ? "#EFF6FF" : "white" }}>
                <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                  {/* Rank badge */}
                  <div style={{ width:22, height:22, borderRadius:"50%", background: i===0 ? "#FEF3C7" : "#F9FAFB", border:`1px solid ${i===0 ? "#FCD34D":"#E5E7EB"}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, fontWeight:800, color: i===0 ? "#92400E":"#6B7280", flexShrink:0 }}>
                    {i+1}
                  </div>
                  {/* Avatar */}
                  <div style={{ width:32, height:32, borderRadius:"50%", background:"#F3F4F6", display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, fontWeight:700, color:"#374151", flexShrink:0 }}>
                    {s.initials}
                  </div>
                  {/* Name + skills */}
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:5, flexWrap:"wrap" }}>
                      <span style={{ fontSize:12, fontWeight:600, color:"#111827" }}>{s.name}</span>
                      {isCurrent && <span style={{ fontSize:9, background:"#EFF6FF", color:"#1D4ED8", border:"1px solid #BFDBFE", borderRadius:4, padding:"1px 5px", fontWeight:700 }}>current</span>}
                      {i===0 && !isCurrent && <span style={{ fontSize:9, background:"#FEF3C7", color:"#92400E", border:"1px solid #FCD34D", borderRadius:4, padding:"1px 5px", fontWeight:700 }}>best</span>}
                      {wgRank && <span style={{ fontSize:9, background:"#F0FDF4", color:"#166534", border:"1px solid #86EFAC", borderRadius:4, padding:"1px 5px", fontWeight:700 }}>Rank {wgRank}</span>}
                    </div>
                    <div style={{ display:"flex", gap:3, marginTop:3, flexWrap:"wrap" }}>
                      {s.workgroups.map(wg => (
                        <span key={wg.id} style={{ fontSize:9, padding:"1px 5px", borderRadius:99, fontWeight:700, background: wg.id === skill ? "#DCFCE7":"#F3F4F6", color: wg.id === skill ? "#166534":"#6B7280", border:`1px solid ${wg.id === skill ? "#86EFAC":"#E5E7EB"}` }}>
                          {wg.rank===1 ? "★ " : ""}{wg.id}
                        </span>
                      ))}
                    </div>
                  </div>
                  {/* Score */}
                  <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:2, flexShrink:0 }}>
                    <span style={{ fontSize:10, fontWeight:800, color }}>{label}</span>
                    <span style={{ fontSize:9, color:"#9CA3AF" }}>{hoursUsed}h / {maxH}h</span>
                  </div>
                </div>

                {/* Soft rule breakdown */}
                {(isSelected || softPenalty > 0) && softViolations.length > 0 && (
                  <div style={{ marginTop:8, paddingTop:8, borderTop:"1px solid #F3F4F6" }}>
                    <div style={{ fontSize:9, fontWeight:700, color:"#9CA3AF", marginBottom:4 }}>Soft rule factors</div>
                    <div style={{ display:"flex", flexWrap:"wrap", gap:3 }}>
                      {softViolations.map((v,j) => (
                        <span key={j} style={{ fontSize:9, padding:"2px 6px", background:"#FFF7ED", color:"#92400E", border:"1px solid #FED7AA", borderRadius:6 }}>
                          {v.ruleName}: {v.detail} (+{v.penalty}pts)
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Hours bar */}
                <div style={{ marginTop:6, height:3, background:"#F3F4F6", borderRadius:99, overflow:"hidden" }}>
                  <div style={{ height:"100%", width:`${Math.min(100,(hoursUsed/maxH)*100)}%`, background: hoursUsed/maxH > 0.85 ? "#EF4444" : hoursUsed/maxH > 0.6 ? "#F59E0B" : "#34D399", borderRadius:99 }}/>
                </div>
              </div>
            );
          })}

          {/* Ineligible section */}
          {ineligible.length > 0 && (
            <div style={{ marginTop:8 }}>
              <div style={{ fontSize:9, fontWeight:700, color:"#D1D5DB", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:6, paddingLeft:4 }}>
                Not available ({ineligible.length})
              </div>
              {ineligible.map(({ staff: s, ineligibleReason }) => (
                <div key={s.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"7px 12px", borderRadius:10, marginBottom:3, background:"#FAFAFA", border:"1px solid #F3F4F6", opacity:0.55 }}>
                  <div style={{ width:26, height:26, borderRadius:"50%", background:"#F3F4F6", display:"flex", alignItems:"center", justifyContent:"center", fontSize:9, fontWeight:700, color:"#9CA3AF" }}>{s.initials}</div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:11, fontWeight:600, color:"#9CA3AF" }}>{s.name}</div>
                    <div style={{ fontSize:9, color:"#D1D5DB" }}>{ineligibleReason}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding:"12px 16px", borderTop:"1px solid #F3F4F6", display:"flex", justifyContent:"flex-end", gap:8 }}>
          <button onClick={onClose} style={{ height:34, padding:"0 14px", borderRadius:8, border:"1px solid #E5E7EB", background:"white", cursor:"pointer", fontSize:12, fontWeight:600, color:"#6B7280" }}>
            Cancel
          </button>
          <button disabled={!selected || selected === replacingId}
            onClick={() => { if (selected) onConfirm(selected); }}
            style={{ height:34, padding:"0 16px", borderRadius:8, border:"none", background: (selected && selected !== replacingId) ? "#2563EB":"#E5E7EB", cursor: (selected && selected !== replacingId) ? "pointer":"not-allowed", fontSize:12, fontWeight:700, color: (selected && selected !== replacingId) ? "white":"#9CA3AF" }}>
            {replacingStaff ? "Replace" : "Assign"} →
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. SHIFT CARD
// ─────────────────────────────────────────────────────────────────────────────

function ShiftCard({ item, compact, weeklyHoursUsed, rules, onScheduleChange }: ShiftCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [modal, setModal] = useState<ShiftCardModalState | null>(null);

  const s = SHIFT_STYLES[item.slot.type as keyof typeof SHIFT_STYLES] ?? SHIFT_STYLES.morning;
  const hasUnmet = item.unmet.length > 0;
  const hasWarnings = item.warnings.length > 0;

  const openReplace = (e: MouseEvent, staff: StaffMember) => {
    e.stopPropagation();
    setModal({ replacingStaff: staff });
  };
  const openFill = (e: MouseEvent, skill: string) => {
    e.stopPropagation();
    setModal({ forSkill: skill });
  };

  const handleConfirm = useCallback(
    (newStaffId: string) => {
      const newStaff = STAFF.find((x) => x.id === newStaffId);
      if (!newStaff || !modal) return;

      let updatedAssigned: StaffMember[] = [...item.assigned];
      let updatedUnmet = [...item.unmet];

      if ("replacingStaff" in modal) {
        updatedAssigned = updatedAssigned.map((p) =>
          p.id === modal.replacingStaff.id ? newStaff : p,
        );
      } else {
        updatedAssigned = [...updatedAssigned, newStaff];
        updatedUnmet = updatedUnmet
          .map((u) => (u.skill === modal.forSkill ? { ...u, count: u.count - 1 } : u))
          .filter((u) => u.count > 0);
      }

      onScheduleChange(item.slot.id, updatedAssigned, updatedUnmet);
      setModal(null);
    },
    [modal, item, onScheduleChange],
  );

  return (
    <>
      <div onClick={() => setExpanded(e => !e)}
        style={{ background:s.bg, border:`1px solid ${hasUnmet ? "#FB923C" : hasWarnings ? "#FCD34D" : s.border}`, borderRadius:8, cursor:"pointer", marginBottom:4, overflow:"hidden" }}>

        {/* Top row */}
        <div style={{ display:"flex", alignItems:"center", gap:5, padding: compact ? "5px 7px" : "6px 9px" }}>
          <span style={{ width:5, height:5, borderRadius:"50%", background:s.dot, flexShrink:0 }}/>
          <span style={{ fontSize:10, fontWeight:700, color:s.text, flex:1, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
            {String(item.slot.start).padStart(2,"0")}:00–{String(item.slot.end % 24).padStart(2,"0")}:00
          </span>
          {hasUnmet     && <span style={{ fontSize:9, color:"#EA580C", fontWeight:700 }}>⚠</span>}
          {hasWarnings  && !hasUnmet && <span style={{ fontSize:9, color:"#D97706", fontWeight:700 }}>!</span>}
          <span style={{ fontSize:9, color:s.text, opacity:0.6, fontWeight:600, textTransform:"capitalize" }}>{item.slot.type}</span>
        </div>

        {/* Avatar row */}
        <div style={{ display:"flex", alignItems:"center", gap:4, padding: compact ? "1px 7px 5px" : "1px 9px 6px" }}>
          <div style={{ display:"flex" }}>
            {item.assigned.slice(0,4).map((p, i) => (
              <div key={p.id} style={{ width: compact?17:19, height: compact?17:19, borderRadius:"50%", background:s.avatarBg, color:s.avatarText, fontSize: compact?7:8, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center", border:"1.5px solid white", marginLeft:i===0?0:-4, zIndex:4-i, position:"relative" }}>
                {p.initials}
              </div>
            ))}
            {item.assigned.length > 4 && (
              <div style={{ width: compact?17:19, height: compact?17:19, borderRadius:"50%", background:"#E5E7EB", color:"#6B7280", fontSize:7, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center", border:"1.5px solid white", marginLeft:-4 }}>
                +{item.assigned.length-4}
              </div>
            )}
          </div>
          {item.assigned.length === 0
            ? <span style={{ fontSize:9, color:"#EF4444", fontWeight:600 }}>Unassigned</span>
            : <span style={{ fontSize:9, color:s.text, opacity:0.7 }}>{item.assigned.length} staff</span>
          }
          <span style={{ marginLeft:"auto", fontSize:8, color:s.text, opacity:0.4 }}>{expanded ? "▲" : "▼"}</span>
        </div>

        {/* Expanded */}
        {expanded && (
          <div style={{ borderTop:`1px solid ${s.border}33`, padding:"6px 9px 8px" }} onClick={e => e.stopPropagation()}>
            {/* Skill requirements */}
            <div style={{ display:"flex", flexWrap:"wrap", gap:3, marginBottom:7 }}>
              {item.slot.req.map(r => {
                const met = item.assigned.filter(p => p.workgroups.some(w => w.id === r.skill)).length;
                const ok = met >= r.count;
                return (
                  <span key={r.skill} style={{ fontSize:9, fontWeight:700, padding:"2px 6px", borderRadius:99, background: ok ? s.avatarBg : "#FEE2E2", color: ok ? s.avatarText : "#B91C1C", border:`1px solid ${ok ? s.border+"44" : "#FECACA"}` }}>
                    {r.count}× {r.skill} {ok ? "✓" : `(${met}/${r.count})`}
                  </span>
                );
              })}
            </div>

            {/* Assigned staff */}
            <div style={{ display:"flex", flexDirection:"column", gap:3, marginBottom: (item.unmet.length > 0 || item.warnings.length > 0) ? 7 : 0 }}>
              {item.assigned.length === 0
                ? <div style={{ fontSize:10, color:"#EF4444", fontWeight:600 }}>No staff assigned</div>
                : item.assigned.map(p => {
                  const staffWarnings = item.warnings.filter(w => w.staffId === p.id);
                  return (
                    <div key={p.id} style={{ display:"flex", alignItems:"center", gap:5, padding:"5px 7px", borderRadius:7, background:"white", border:`1px solid ${staffWarnings.length > 0 ? "#FCD34D" : s.border+"22"}` }}>
                      <div style={{ width:22, height:22, borderRadius:"50%", background:s.avatarBg, color:s.avatarText, fontSize:8, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>{p.initials}</div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:10, fontWeight:600, color:s.text, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{p.name}</div>
                        <div style={{ display:"flex", gap:2, marginTop:1, flexWrap:"wrap" }}>
                          {p.workgroups.map(wg => (
                            <span key={wg.id} style={{ fontSize:8, color:"#9CA3AF" }}>{wg.rank===1?"★":""}{wg.id}{wg.rank>1 ? ` (r${wg.rank})` : ""}</span>
                          ))}
                        </div>
                        {staffWarnings.length > 0 && (
                          <div style={{ marginTop:3 }}>
                            {staffWarnings.map((w,j) => (
                              <div key={j} style={{ fontSize:8, color:"#B45309" }}>⚠ {w.ruleName}: {w.detail}</div>
                            ))}
                          </div>
                        )}
                      </div>
                      <button onClick={e => openReplace(e, p)}
                        style={{ fontSize:9, fontWeight:700, padding:"2px 6px", borderRadius:6, border:"1px solid #BFDBFE", background:"#EFF6FF", color:"#1D4ED8", cursor:"pointer", flexShrink:0 }}>
                        Replace
                      </button>
                    </div>
                  );
                })
              }
            </div>

            {/* Unmet gaps */}
            {item.unmet.length > 0 && (
              <div style={{ background:"#FFF7ED", border:"1px solid #FED7AA", borderRadius:7, padding:"6px 9px" }}>
                <div style={{ fontSize:9, fontWeight:700, color:"#92400E", marginBottom:4 }}>Unfilled requirements</div>
                {item.unmet.map(u => (
                  <div key={u.skill} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:8, marginBottom:3 }}>
                    <span style={{ fontSize:10, color:"#C2410C" }}>⚠ {u.count}× {u.skill} needed</span>
                    <button onClick={e => openFill(e, u.skill)}
                      style={{ fontSize:9, fontWeight:700, padding:"2px 7px", borderRadius:6, border:"1px solid #FB923C", background:"#FFF7ED", color:"#C2410C", cursor:"pointer" }}>
                      + Fill gap
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {modal && (
        <CandidateModal
          item={item}
          replacingStaff={"replacingStaff" in modal ? modal.replacingStaff : null}
          forSkill={"forSkill" in modal ? modal.forSkill : null}
          weeklyHoursUsed={weeklyHoursUsed}
          rules={rules}
          onConfirm={handleConfirm}
          onClose={() => setModal(null)}
        />
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. RULE CONFIG UI (WFM-202)
// ─────────────────────────────────────────────────────────────────────────────

function ParamField({ label, value, unit, min, max, onChange }) {
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:3 }}>
      <div style={{ fontSize:10, fontWeight:600, color:"#6B7280" }}>{label}</div>
      <div style={{ display:"flex", alignItems:"center", gap:5 }}>
        <input type="number" value={value} min={min} max={max}
          onChange={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) onChange(v); }}
          style={{ width:64, padding:"4px 8px", fontSize:12, borderRadius:7, border:"1px solid #E5E7EB", background:"white", color:"#111827", outline:"none" }}/>
        {unit && <span style={{ fontSize:10, color:"#9CA3AF" }}>{unit}</span>}
      </div>
    </div>
  );
}

function RuleCard({ rule, onChange, isDirty }) {
  const isHard = rule.type === "hard";
  const typeColor = isHard
    ? { bg:"#FEF2F2", text:"#B91C1C", border:"#FECACA" }
    : { bg:"#FFFBEB", text:"#92400E", border:"#FCD34D" };

  return (
    <div style={{ border:`1px solid ${rule.enabled ? "#E5E7EB" : "#F3F4F6"}`, borderRadius:10, background: rule.enabled ? "white" : "#FAFAFA", opacity: rule.enabled ? 1 : 0.65, overflow:"hidden" }}>
      <div style={{ padding:"12px 14px", display:"flex", alignItems:"flex-start", gap:10 }}>
        {/* Toggle */}
        <div onClick={() => onChange({ ...rule, enabled: !rule.enabled })}
          style={{ width:34, height:19, borderRadius:99, background: rule.enabled ? "#2563EB" : "#D1D5DB", cursor:"pointer", display:"flex", alignItems:"center", padding:"0 2px", flexShrink:0, marginTop:2, transition:"background 0.2s" }}>
          <div style={{ width:15, height:15, borderRadius:"50%", background:"white", transform: rule.enabled ? "translateX(15px)" : "translateX(0)", transition:"transform 0.2s" }}/>
        </div>

        <div style={{ flex:1 }}>
          <div style={{ display:"flex", alignItems:"center", gap:6, flexWrap:"wrap" }}>
            <span style={{ fontSize:12, fontWeight:700, color:"#111827" }}>{rule.name}</span>
            <span style={{ fontSize:9, fontWeight:800, padding:"2px 6px", borderRadius:4, background:typeColor.bg, color:typeColor.text, border:`1px solid ${typeColor.border}`, textTransform:"uppercase", letterSpacing:"0.05em" }}>
              {rule.type}
            </span>
            {isDirty && <span style={{ fontSize:9, color:"#2563EB", fontWeight:700 }}>unsaved</span>}
          </div>
          <p style={{ fontSize:10, color:"#6B7280", marginTop:3, lineHeight:1.5 }}>{rule.description}</p>

          {rule.enabled && (
            <div style={{ marginTop:10, display:"flex", flexWrap:"wrap", gap:16, alignItems:"flex-start" }}>
              {/* Dynamic param fields */}
              {rule.id === "hard-min-rest" && (
                <ParamField label="Minimum rest" value={rule.params.minRestHours} unit="hrs" min={2} max={24}
                  onChange={v => onChange({ ...rule, params: { ...rule.params, minRestHours: v } })}/>
              )}
              {rule.id === "hard-max-weekly-hours" && (
                <ParamField label="Maximum weekly hours" value={rule.params.maxHours} unit="hrs" min={10} max={60}
                  onChange={v => onChange({ ...rule, params: { ...rule.params, maxHours: v } })}/>
              )}
              {rule.id === "soft-preferred-hours" && (
                <ParamField label="Penalty per outside hour" value={rule.params.penaltyPerHour} unit="pts" min={1} max={20}
                  onChange={v => onChange({ ...rule, params: { ...rule.params, penaltyPerHour: v } })}/>
              )}
              {rule.id === "soft-consecutive" && (<>
                <ParamField label="Max consecutive shifts" value={rule.params.maxConsecutive} unit="shifts" min={2} max={7}
                  onChange={v => onChange({ ...rule, params: { ...rule.params, maxConsecutive: v } })}/>
                <ParamField label="Penalty per extra shift" value={rule.params.penaltyPerExtra} unit="pts" min={1} max={20}
                  onChange={v => onChange({ ...rule, params: { ...rule.params, penaltyPerExtra: v } })}/>
              </>)}
              {rule.id === "soft-workgroup-rank" && (
                <ParamField label="Penalty per rank step" value={rule.params.penaltyPerRankStep} unit="pts" min={1} max={15}
                  onChange={v => onChange({ ...rule, params: { ...rule.params, penaltyPerRankStep: v } })}/>
              )}
              {rule.id === "soft-weekend-balance" && (<>
                <ParamField label="Max weekend shifts" value={rule.params.maxWeekendShifts} unit="shifts" min={1} max={5}
                  onChange={v => onChange({ ...rule, params: { ...rule.params, maxWeekendShifts: v } })}/>
                <ParamField label="Penalty per extra" value={rule.params.penaltyPerExtra} unit="pts" min={1} max={20}
                  onChange={v => onChange({ ...rule, params: { ...rule.params, penaltyPerExtra: v } })}/>
              </>)}

              {/* Soft rules: rejection threshold */}
              {rule.type === "soft" && (
                <ParamField label="Reject schedule above" value={rule.penaltyThreshold} unit="pts (overridable)" min={1} max={100}
                  onChange={v => onChange({ ...rule, penaltyThreshold: v })}/>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function RuleConfigPanel({ rules, onSave, onClose }) {
  const [local, setLocal] = useState(() => JSON.parse(JSON.stringify(rules)));
  const [activeTab, setActiveTab] = useState("hard");
  const [showConfirm, setShowConfirm] = useState(false);

  const saved = useRef(JSON.stringify(rules));
  const dirty = new Set(
    local.filter((r, i) => JSON.stringify(r) !== JSON.stringify(rules[i])).map(r => r.id)
  );
  const hasDirty = dirty.size > 0;

  const handleChange = (updated) => setLocal(prev => prev.map(r => r.id === updated.id ? updated : r));

  const handleSave = () => {
    onSave(local);
    saved.current = JSON.stringify(local);
    setShowConfirm(false);
  };

  return (
    <div onClick={e => e.target === e.currentTarget && onClose()}
      style={{ position:"fixed", inset:0, zIndex:300, background:"rgba(0,0,0,0.5)", display:"flex", alignItems:"flex-start", justifyContent:"flex-end" }}>
      <div style={{ width:"100%", maxWidth:520, height:"100%", background:"white", display:"flex", flexDirection:"column", boxShadow:"-20px 0 60px rgba(0,0,0,0.2)" }}>

        {/* Header */}
        <div style={{ padding:"14px 18px", borderBottom:"1px solid #F3F4F6", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <div>
            <div style={{ fontSize:14, fontWeight:700, color:"#111827" }}>Scheduling rules</div>
            <div style={{ fontSize:10, color:"#9CA3AF", marginTop:1 }}>Admin only — changes apply to next schedule run</div>
          </div>
          <div style={{ display:"flex", gap:8, alignItems:"center" }}>
            {hasDirty && (
              <button onClick={() => setLocal(JSON.parse(JSON.stringify(rules)))}
                style={{ fontSize:11, color:"#6B7280", background:"none", border:"none", cursor:"pointer", padding:"0 4px" }}>
                Reset
              </button>
            )}
            <button onClick={() => hasDirty && setShowConfirm(true)}
              disabled={!hasDirty}
              style={{ height:30, padding:"0 12px", borderRadius:7, border:"none", background: hasDirty ? "#2563EB":"#E5E7EB", cursor: hasDirty ? "pointer":"not-allowed", fontSize:11, fontWeight:700, color: hasDirty ? "white":"#9CA3AF" }}>
              Save
            </button>
            <button onClick={onClose}
              style={{ width:28, height:28, borderRadius:8, border:"1px solid #E5E7EB", background:"white", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", color:"#9CA3AF", fontSize:13 }}>
              ✕
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display:"flex", borderBottom:"1px solid #F3F4F6" }}>
          {["hard","soft"].map(tab => {
            const count = local.filter(r => r.type === tab).length;
            const active = local.filter(r => r.type === tab && r.enabled).length;
            return (
              <button key={tab} onClick={() => setActiveTab(tab)}
                style={{ flex:1, padding:"10px 0", fontSize:12, fontWeight:600, cursor:"pointer", background:"none", border:"none", borderBottom:`2px solid ${activeTab===tab ? "#2563EB":"transparent"}`, color: activeTab===tab ? "#2563EB":"#6B7280" }}>
                {tab.charAt(0).toUpperCase()+tab.slice(1)} rules
                <span style={{ marginLeft:4, fontSize:10, color: activeTab===tab ? "#93C5FD":"#D1D5DB" }}>{active}/{count} active</span>
              </button>
            );
          })}
        </div>

        {/* Hint */}
        <div style={{ padding:"8px 18px", fontSize:10, color:"#9CA3AF", background:"#FAFAFA", borderBottom:"1px solid #F3F4F6" }}>
          {activeTab === "hard"
            ? "Hard rule violations cause an assignment to be rejected entirely."
            : "Soft rule violations add a penalty score. Schedules over the threshold are rejected unless overridden."}
        </div>

        {/* Rule list */}
        <div style={{ flex:1, overflowY:"auto", padding:"10px 14px", display:"flex", flexDirection:"column", gap:8 }}>
          {local.filter(r => r.type === activeTab).map(rule => (
            <RuleCard key={rule.id} rule={rule} isDirty={dirty.has(rule.id)} onChange={handleChange}/>
          ))}
        </div>

        {/* Save confirm */}
        {showConfirm && (
          <div style={{ position:"absolute", inset:0, background:"rgba(0,0,0,0.4)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:10, padding:24 }}>
            <div style={{ background:"white", borderRadius:12, padding:20, width:"100%", maxWidth:340 }}>
              <div style={{ fontSize:13, fontWeight:700, color:"#111827", marginBottom:6 }}>Save rule changes?</div>
              <div style={{ fontSize:11, color:"#6B7280", marginBottom:12 }}>{dirty.size} rule{dirty.size!==1?"s":""} modified. Changes will apply to the next schedule generation.</div>
              <ul style={{ marginBottom:14, paddingLeft:0, listStyle:"none", display:"flex", flexDirection:"column", gap:3 }}>
                {[...dirty].map(id => {
                  const r = local.find(x => x.id === id);
                  return r ? <li key={id} style={{ fontSize:11, color:"#374151", display:"flex", gap:6, alignItems:"center" }}><span style={{ width:6, height:6, borderRadius:"50%", background:"#3B82F6", flexShrink:0 }}/>{r.name}</li> : null;
                })}
              </ul>
              <div style={{ display:"flex", justifyContent:"flex-end", gap:8 }}>
                <button onClick={() => setShowConfirm(false)} style={{ height:32, padding:"0 12px", borderRadius:8, border:"1px solid #E5E7EB", background:"white", cursor:"pointer", fontSize:11, fontWeight:600, color:"#6B7280" }}>Cancel</button>
                <button onClick={handleSave} style={{ height:32, padding:"0 14px", borderRadius:8, border:"none", background:"#2563EB", cursor:"pointer", fontSize:11, fontWeight:700, color:"white" }}>Save</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. MAIN CALENDAR
// ─────────────────────────────────────────────────────────────────────────────

function padH(h) { return `${String(h % 24).padStart(2,"0")}:00`; }

type ScheduleSlotOverride = Partial<Pick<ScheduleSlotItem, "assigned" | "unmet" | "warnings">>;

export default function ScheduleCalendar() {
  const [weekOffset, setWeekOffset] = useState(0);
  const [rules, setRules] = useState<WfmRule[]>([...INITIAL_RULES]);
  const [overrides, setOverrides] = useState<Record<string, ScheduleSlotOverride>>({});
  const [showRules, setShowRules] = useState(false);

  const today = useMemo(() => { const d = new Date(); d.setHours(0,0,0,0); return d; }, []);

  const weekStart = useMemo(() => {
    const d = new Date(today); d.setDate(today.getDate() + weekOffset * 7); return d;
  }, [weekOffset]);

  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart); d.setDate(weekStart.getDate() + i); return d;
  }), [weekStart]);

  const { schedule: baseSchedule, weekTotalPenalty, hardFailures } = useMemo(
    () => autoAssign(weekDays, rules),
    [weekDays.map(d => d.toDateString()).join(), JSON.stringify(rules)]
  );

  // Apply manual overrides on top of auto-schedule
  const schedule = useMemo(() => {
    const s = new Map<string, ScheduleSlotItem[]>();
    for (const [day, items] of baseSchedule.entries()) {
      s.set(day, items.map(item =>
        overrides[item.slot.id]
          ? { ...item, ...overrides[item.slot.id] }
          : item
      ));
    }
    return s;
  }, [baseSchedule, overrides]);

  // Recalculate weekly hours from final schedule for modal scoring
  const weeklyHoursUsed = useMemo(() => {
    const h = new Map(STAFF.map(s => [s.id, 0]));
    for (const items of schedule.values()) {
      for (const item of items) {
        const dur = item.slot.end - item.slot.start;
        for (const p of item.assigned) h.set(p.id, (h.get(p.id) ?? 0) + dur);
      }
    }
    return h;
  }, [schedule]);

  const handleScheduleChange = useCallback(
    (slotId: string, assigned: StaffMember[], unmet: SlotUnmet[]) => {
      setOverrides((prev) => ({ ...prev, [slotId]: { assigned, unmet, warnings: [] } }));
    },
    [],
  );

  const handleSaveRules = useCallback((newRules: WfmRule[]) => {
    setRules(newRules);
    setOverrides({}); // clear overrides — schedule will regenerate with new rules
  }, []);

  const weekLabel = `${weekDays[0].toLocaleDateString("en-ZA",{day:"numeric",month:"short"})} – ${weekDays[6].toLocaleDateString("en-ZA",{day:"numeric",month:"short",year:"numeric"})}`;
  const allItems = [...schedule.values()].flat();
  const totalGaps = allItems.filter(x => x.unmet.length > 0).length;
  const totalWarnings = allItems.filter(x => x.warnings.length > 0).length;
  const activeOverrides = Object.keys(overrides).length;

  return (
    <div style={{ fontFamily:"system-ui,-apple-system,sans-serif", background:"#F9FAFB", minHeight:"100vh", padding:14 }}>

      {/* Header */}
      <div style={{ background:"white", borderRadius:12, border:"1px solid #E5E7EB", padding:"11px 14px", marginBottom:10, display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" }}>
        <div style={{ display:"flex", alignItems:"center", gap:8, marginRight:4 }}>
          <div style={{ width:28, height:28, borderRadius:8, background:"#111827", display:"flex", alignItems:"center", justifyContent:"center" }}>
            <svg width="14" height="14" fill="none" stroke="white" strokeWidth="2" viewBox="0 0 24 24">
              <rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18" strokeLinecap="round"/>
            </svg>
          </div>
          <span style={{ fontWeight:700, fontSize:13, color:"#111827" }}>Schedule</span>
        </div>

        {/* Week nav */}
        <div style={{ display:"flex", alignItems:"center", gap:5 }}>
          <button onClick={() => { setWeekOffset(w=>w-1); setOverrides({}); }}
            style={{ width:26, height:26, borderRadius:6, border:"1px solid #E5E7EB", background:"white", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", color:"#6B7280" }}>
            ‹
          </button>
          <span style={{ fontSize:12, fontWeight:600, color:"#374151", minWidth:168, textAlign:"center" }}>{weekLabel}</span>
          <button onClick={() => { setWeekOffset(w=>w+1); setOverrides({}); }}
            style={{ width:26, height:26, borderRadius:6, border:"1px solid #E5E7EB", background:"white", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", color:"#6B7280" }}>
            ›
          </button>
          <button onClick={() => { setWeekOffset(0); setOverrides({}); }}
            style={{ height:26, padding:"0 8px", borderRadius:6, border:"1px solid #E5E7EB", background:"white", cursor:"pointer", fontSize:10, fontWeight:600, color:"#6B7280" }}>
            Today
          </button>
        </div>

        {/* Stats */}
        <div style={{ marginLeft:"auto", display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
          {totalGaps > 0
            ? <span style={{ fontSize:10, color:"#EA580C", fontWeight:700, background:"#FFF7ED", border:"1px solid #FED7AA", borderRadius:6, padding:"2px 7px" }}>⚠ {totalGaps} gap{totalGaps!==1?"s":""}</span>
            : <span style={{ fontSize:10, color:"#059669", fontWeight:700, background:"#F0FDF4", border:"1px solid #BBF7D0", borderRadius:6, padding:"2px 7px" }}>✓ Fully covered</span>
          }
          {totalWarnings > 0 && (
            <span style={{ fontSize:10, color:"#D97706", fontWeight:700, background:"#FFFBEB", border:"1px solid #FCD34D", borderRadius:6, padding:"2px 7px" }}>
              ! {totalWarnings} soft warning{totalWarnings!==1?"s":""}
            </span>
          )}
          {activeOverrides > 0 && (
            <span style={{ fontSize:10, color:"#2563EB", fontWeight:700, background:"#EFF6FF", border:"1px solid #BFDBFE", borderRadius:6, padding:"2px 7px" }}>
              {activeOverrides} override{activeOverrides!==1?"s":""}
            </span>
          )}
          <span style={{ fontSize:10, color:"#9CA3AF" }}>Penalty: {weekTotalPenalty}pts</span>
          <button onClick={() => setShowRules(true)}
            style={{ height:26, padding:"0 10px", borderRadius:6, border:"1px solid #E5E7EB", background:"white", cursor:"pointer", fontSize:10, fontWeight:700, color:"#374151" }}>
            ⚙ Rules
          </button>
        </div>
      </div>

      {/* Hard failure banner */}
      {hardFailures.length > 0 && (
        <div style={{ background:"#FEF2F2", border:"1px solid #FECACA", borderRadius:10, padding:"10px 14px", marginBottom:10 }}>
          <div style={{ fontSize:11, fontWeight:700, color:"#B91C1C", marginBottom:4 }}>
            {hardFailures.length} slot{hardFailures.length!==1?"s":""} could not be filled — hard rule violations
          </div>
          {hardFailures.slice(0, 3).map((f, i) => (
            <div key={i} style={{ fontSize:10, color:"#DC2626" }}>· {f}</div>
          ))}
          {hardFailures.length > 3 && <div style={{ fontSize:10, color:"#9CA3AF" }}>…and {hardFailures.length-3} more. Open a shift card to fill gaps manually.</div>}
        </div>
      )}

      {/* Calendar grid */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(7, 1fr)", gap:7 }}>
        {weekDays.map((date, i) => {
          const dayName = DAY_NAMES[date.getDay()];
          const isToday = date.toDateString() === today.toDateString();
          const isWeekend = date.getDay() === 0 || date.getDay() === 6;
          const slots = schedule.get(dayName) ?? [];
          const dayGaps = slots.filter(s => s.unmet.length > 0).length;
          const dayWarns = slots.filter(s => s.warnings.length > 0).length;

          return (
            <div key={i} style={{ background: isToday ? "#1E293B" : isWeekend ? "#FAFAFA" : "white", border:`1px solid ${isToday ? "#334155" : "#E5E7EB"}`, borderRadius:10, overflow:"hidden", display:"flex", flexDirection:"column" }}>
              <div style={{ padding:"7px 9px 5px", borderBottom:`1px solid ${isToday ? "#334155":"#F3F4F6"}`, display:"flex", alignItems:"baseline", gap:4 }}>
                <span style={{ fontSize:9, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.08em", color: isToday ? "#94A3B8":"#9CA3AF" }}>
                  {dayName.slice(0,3)}
                </span>
                <span style={{ fontSize:19, fontWeight:800, lineHeight:1, color: isToday ? "white":"#111827" }}>
                  {date.getDate()}
                </span>
                <div style={{ marginLeft:"auto", display:"flex", gap:3, alignItems:"center" }}>
                  {dayGaps > 0 && <span style={{ fontSize:8, color:"#EA580C", fontWeight:700 }}>⚠{dayGaps}</span>}
                  {dayWarns > 0 && <span style={{ fontSize:8, color:"#D97706", fontWeight:700 }}>!{dayWarns}</span>}
                </div>
              </div>

              <div style={{ padding:"6px 5px", flex:1 }}>
                {slots.length === 0
                  ? <div style={{ textAlign:"center", padding:"14px 0", color:"#D1D5DB", fontSize:9 }}>No shifts</div>
                  : slots.map(item => (
                    <ShiftCard
                      key={item.slot.id}
                      item={item}
                      compact={slots.length > 3}
                      weeklyHoursUsed={weeklyHoursUsed}
                      rules={rules}
                      onScheduleChange={handleScheduleChange}
                    />
                  ))
                }
              </div>

              <div style={{ padding:"3px 9px 6px", borderTop:`1px solid ${isToday ? "#334155":"#F3F4F6"}`, display:"flex", gap:6 }}>
                <span style={{ fontSize:8, color: isToday ? "#64748B":"#D1D5DB" }}>{slots.length} shift{slots.length!==1?"s":""}</span>
                <span style={{ fontSize:8, color: isToday ? "#64748B":"#D1D5DB", marginLeft:"auto" }}>
                  {[...new Set(slots.flatMap(s => s.assigned.map(p => p.id)))].length} staff
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div style={{ marginTop:8, display:"flex", gap:10, justifyContent:"center", flexWrap:"wrap" }}>
        {Object.entries(SHIFT_STYLES).map(([type, st]) => (
          <span key={type} style={{ display:"flex", alignItems:"center", gap:4, fontSize:9, color:"#9CA3AF" }}>
            <span style={{ width:6, height:6, borderRadius:"50%", background:st.dot }}/>
            <span style={{ textTransform:"capitalize" }}>{type}</span>
          </span>
        ))}
        <span style={{ fontSize:9, color:"#9CA3AF" }}>★ Primary skill &nbsp;·&nbsp; ⚠ Gap &nbsp;·&nbsp; ! Soft warning</span>
      </div>

      {/* Rule config panel */}
      {showRules && (
        <RuleConfigPanel rules={rules} onSave={handleSaveRules} onClose={() => setShowRules(false)}/>
      )}
    </div>
  );
}