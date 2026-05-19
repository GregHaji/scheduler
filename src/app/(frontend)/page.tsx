/**
 * WFM-302 — Schedule Review & Publish
 *
 * Features:
 * - "Generate schedule" triggers the auto-scheduler
 * - Draft state — not visible to staff until published
 * - Inline soft rule violation warnings per shift
 * - Manual reassignment modal
 * - Publish / Discard actions
 * - Hard-rule failure display
 *
 * Props / integration points:
 *   - Replace the mock data / API calls with your real endpoints
 *   - onPublish / onDiscard callbacks propagate up to your routing layer
 */
'use client'

import { useState, useCallback, useMemo } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export type Workgroup = {
  id: string;
  name: string;
};

export type StaffMember = {
  id: string;
  name: string;
  workgroups: { workgroupId: string; rank: number }[];
};

export type SoftWarning = {
  ruleId: string;
  ruleName: string;
  detail: string;
};

export type ShiftAssignment = {
  id: string;
  staffMemberId: string;
  staffMemberName: string;
  workgroupId: string;
  workgroupName: string;
  date: string;          // ISO date string "YYYY-MM-DD"
  startTime: string;     // "HH:MM"
  endTime: string;       // "HH:MM"
  softWarnings: SoftWarning[];
};

export type HardRuleFailure = {
  ruleId: string;
  ruleName: string;
  detail: string;
};

export type ScheduleResult =
  | { status: "success"; assignments: ShiftAssignment[]; totalPenalty: number }
  | { status: "failed"; hardFailures: HardRuleFailure[] };

export type ScheduleReviewProps = {
  /** Called after a successful publish */
  onPublish?: (assignments: ShiftAssignment[]) => void;
  /** Called after the draft is discarded */
  onDiscard?: () => void;
  /** Override to call your real API — receives date range, returns ScheduleResult */
  generateSchedule?: (from: string, to: string) => Promise<ScheduleResult>;
  /** Staff list for the reassignment modal */
  availableStaff?: StaffMember[];
};

// ─── Mock data helpers ────────────────────────────────────────────────────────

const MOCK_WORKGROUPS: Workgroup[] = [
  { id: "wg-1", name: "Customer Support" },
  { id: "wg-2", name: "Technical Ops" },
  { id: "wg-3", name: "Onboarding" }
];

const MOCK_STAFF: StaffMember[] = [
  { id: "s-1", name: "Alice Nkosi",    workgroups: [{ workgroupId: "wg-1", rank: 1 }, { workgroupId: "wg-3", rank: 2 }] },
  { id: "s-2", name: "Ben Okafor",     workgroups: [{ workgroupId: "wg-2", rank: 1 }] },
  { id: "s-3", name: "Clara Dlamini",  workgroups: [{ workgroupId: "wg-1", rank: 1 }, { workgroupId: "wg-2", rank: 2 }] },
  { id: "s-4", name: "David Molefe",   workgroups: [{ workgroupId: "wg-3", rank: 1 }] },
  { id: "s-5", name: "Susan Botha",    workgroups: [{ workgroupId: "wg-1", rank: 1 }] },
  { id: "s-6", name: "James Sithole",  workgroups: [{ workgroupId: "wg-2", rank: 1 }, { workgroupId: "wg-1", rank: 2 }] },
];

async function mockGenerate(from: string, _to: string): Promise<ScheduleResult> {
  await new Promise((r) => setTimeout(r, 1400)); // simulate latency

  const days = weekDateStrings(from);
  const assignments: ShiftAssignment[] = [];
  let id = 1;

  days.forEach((date) => {
    MOCK_WORKGROUPS.forEach((wg) => {
      const eligible = MOCK_STAFF.filter((s) =>
        s.workgroups.some((w) => w.workgroupId === wg.id)
      );
      const staff = eligible[id % eligible.length];
      const warnings: SoftWarning[] = [];

      if (staff.name === "Susan Botha" && id % 3 === 0) {
        warnings.push({
          ruleId: "soft-preferred-hours",
          ruleName: "Preferred hours",
          detail: "Assigned outside preferred hours (08:00–16:00)",
        });
      }
      if (staff.name === "James Sithole" && id % 4 === 0) {
        warnings.push({
          ruleId: "soft-consecutive",
          ruleName: "Consecutive shifts",
          detail: "3rd consecutive shift — rest recommended",
        });
      }

      assignments.push({
        id: `asgn-${id++}`,
        staffMemberId: staff.id,
        staffMemberName: staff.name,
        workgroupId: wg.id,
        workgroupName: wg.name,
        date,
        startTime: "09:00",
        endTime: "17:00",
        softWarnings: warnings,
      });
    });
  });

  return { status: "success", assignments, totalPenalty: 5 };
}

// ─── Utility ──────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-ZA", {
    weekday: "short", day: "numeric", month: "short",
  });
}

function isoWeekStart() {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d.toISOString().split("T")[0];
}

function isoWeekEnd(start: string) {
  const d = new Date(start);
  d.setDate(d.getDate() + 6);
  return d.toISOString().split("T")[0];
}

/** Seven ISO date strings from week start (Mon), using noon local to avoid TZ drift */
function weekDateStrings(weekStartIso: string): string[] {
  const base = new Date(`${weekStartIso}T12:00:00`);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    return d.toISOString().split("T")[0]!;
  });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Badge({
  children,
  variant = "neutral",
}: {
  children: React.ReactNode;
  variant?: "neutral" | "warning" | "success" | "danger";
}) {
  const styles: Record<string, string> = {
    neutral: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
    warning: "bg-amber-50 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
    success: "bg-green-50 text-green-800 dark:bg-green-900/40 dark:text-green-300",
    danger:  "bg-red-50 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${styles[variant]}`}>
      {children}
    </span>
  );
}

function WarningIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="shrink-0 text-amber-500">
      <path d="M8 2L14 13H2L8 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
      <path d="M8 7v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <circle cx="8" cy="11.5" r="0.5" fill="currentColor"/>
    </svg>
  );
}

// ─── Reassign Modal ───────────────────────────────────────────────────────────

type ReassignModalProps = {
  assignment: ShiftAssignment;
  staff: StaffMember[];
  onConfirm: (assignmentId: string, newStaffId: string) => void;
  onClose: () => void;
};

function ReassignModal({ assignment, staff, onConfirm, onClose }: ReassignModalProps) {
  const [selected, setSelected] = useState(assignment.staffMemberId);

  const eligible = staff.filter((s) =>
    s.workgroups.some((w) => w.workgroupId === assignment.workgroupId)
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-100 dark:border-gray-800">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
            Reassign shift
          </h2>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
            {formatDate(assignment.date)} · {assignment.startTime}–{assignment.endTime} · {assignment.workgroupName}
          </p>
        </div>

        <div className="px-6 py-4 space-y-2 max-h-72 overflow-y-auto">
          {eligible.map((s) => {
            const rank = s.workgroups.find((w) => w.workgroupId === assignment.workgroupId)?.rank;
            const isSelected = s.id === selected;
            const isCurrent = s.id === assignment.staffMemberId;
            return (
              <label
                key={s.id}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg border cursor-pointer transition-colors
                  ${isSelected
                    ? "border-blue-500 bg-blue-50 dark:bg-blue-900/30 dark:border-blue-400"
                    : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
                  }`}
              >
                <input
                  type="radio"
                  name="staff-select"
                  value={s.id}
                  checked={isSelected}
                  onChange={() => setSelected(s.id)}
                  className="accent-blue-600"
                />
                <span className="flex-1 text-sm font-medium text-gray-800 dark:text-gray-200">
                  {s.name}
                </span>
                <span className="text-xs text-gray-400 dark:text-gray-500">
                  Rank {rank ?? "—"}
                </span>
                {isCurrent && (
                  <Badge variant="neutral">current</Badge>
                )}
              </label>
            );
          })}
          {eligible.length === 0 && (
            <p className="text-sm text-gray-500 py-4 text-center">
              No eligible staff for this workgroup.
            </p>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-800 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => { onConfirm(assignment.id, selected); onClose(); }}
            disabled={selected === assignment.staffMemberId}
            className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Confirm reassignment
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Hard failure banner ──────────────────────────────────────────────────────

function HardFailureBanner({ failures }: { failures: HardRuleFailure[] }) {
  return (
    <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-5">
      <div className="flex items-start gap-3">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="shrink-0 text-red-600 dark:text-red-400 mt-0.5">
          <circle cx="10" cy="10" r="9" stroke="currentColor" strokeWidth="1.5"/>
          <path d="M10 6v5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          <circle cx="10" cy="14" r="0.75" fill="currentColor"/>
        </svg>
        <div>
          <p className="text-sm font-semibold text-red-800 dark:text-red-300">
            Schedule could not be generated — {failures.length} hard rule{failures.length !== 1 ? "s" : ""} violated
          </p>
          <ul className="mt-2 space-y-1.5">
            {failures.map((f) => (
              <li key={f.ruleId} className="text-sm text-red-700 dark:text-red-400">
                <span className="font-medium">{f.ruleName}:</span> {f.detail}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-red-600 dark:text-red-500">
            Review the rule configuration or adjust shift demand requirements and try again.
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Calendar shift block (compact, fits day column) ───────────────────────────

function CalendarShiftBlock({
  assignment,
  onReassign,
  isManuallyChanged,
}: {
  assignment: ShiftAssignment;
  onReassign: (a: ShiftAssignment) => void;
  isManuallyChanged: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasWarnings = assignment.softWarnings.length > 0;

  return (
    <div
      className={`group rounded-md border text-left transition-colors
        ${hasWarnings
          ? "border-amber-200 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-950/30"
          : "border-gray-200/80 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-800/50"
        }`}
    >
      <div className="p-2 space-y-1">
        <div className="font-mono text-[10px] tabular-nums text-gray-500 dark:text-gray-400">
          {assignment.startTime}–{assignment.endTime}
        </div>
        <div className="text-xs font-medium text-gray-900 dark:text-gray-100 leading-snug break-words">
          {assignment.staffMemberName}
          {isManuallyChanged && (
            <span className="ml-1 text-[10px] text-blue-600 dark:text-blue-400 font-semibold">· edited</span>
          )}
        </div>
        <p className="text-[10px] text-gray-500 dark:text-gray-400 leading-tight line-clamp-2">
          {assignment.workgroupName}
        </p>
        <div className="flex flex-wrap items-center gap-1 pt-0.5">
          {hasWarnings && (
            <button
              type="button"
              onClick={() => setExpanded((x) => !x)}
              className="inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] font-medium text-amber-800 dark:text-amber-300 bg-amber-100/80 dark:bg-amber-900/40 hover:bg-amber-200/80 dark:hover:bg-amber-900/60"
            >
              <WarningIcon />
              {assignment.softWarnings.length}
            </button>
          )}
          <button
            type="button"
            onClick={() => onReassign(assignment)}
            className="ml-auto text-[10px] text-blue-600 dark:text-blue-400 opacity-70 group-hover:opacity-100 hover:underline"
          >
            Reassign
          </button>
        </div>
      </div>
      {hasWarnings && expanded && (
        <div className="border-t border-amber-100 dark:border-amber-900/50 px-2 py-1.5 space-y-1 bg-amber-50/50 dark:bg-amber-950/20">
          {assignment.softWarnings.map((w) => (
            <div key={w.ruleId} className="text-[10px] text-amber-900 dark:text-amber-200 leading-snug">
              <span className="font-medium">{w.ruleName}:</span> {w.detail}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ScheduleReview({
  onPublish,
  onDiscard,
  generateSchedule = mockGenerate,
  availableStaff = MOCK_STAFF,
}: ScheduleReviewProps) {
  const [weekStart] = useState(isoWeekStart);
  const weekEnd = isoWeekEnd(weekStart);

  const [status, setStatus] = useState<"idle" | "generating" | "draft" | "failed">("idle");
  const [assignments, setAssignments] = useState<ShiftAssignment[]>([]);
  const [hardFailures, setHardFailures] = useState<HardRuleFailure[]>([]);
  const [totalPenalty, setTotalPenalty] = useState(0);
  const [manualChanges, setManualChanges] = useState<Set<string>>(new Set());
  const [reassigning, setReassigning] = useState<ShiftAssignment | null>(null);
  const [showPublishConfirm, setShowPublishConfirm] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);

  const weekDays = useMemo(() => weekDateStrings(weekStart), [weekStart]);

  // Group by date
  const byDate = assignments.reduce<Record<string, ShiftAssignment[]>>((acc, a) => {
    (acc[a.date] ??= []).push(a);
    return acc;
  }, {});

  const totalWarnings = assignments.reduce((n, a) => n + a.softWarnings.length, 0);

  const handleGenerate = useCallback(async () => {
    setStatus("generating");
    setManualChanges(new Set());
    try {
      const result = await generateSchedule(weekStart, weekEnd);
      if (result.status === "success") {
        setAssignments(result.assignments);
        setTotalPenalty(result.totalPenalty);
        setStatus("draft");
      } else {
        setHardFailures(result.hardFailures);
        setStatus("failed");
      }
    } catch {
      setStatus("idle");
    }
  }, [generateSchedule, weekStart, weekEnd]);

  const handleReassignConfirm = useCallback((assignmentId: string, newStaffId: string) => {
    const newStaff = availableStaff.find((s) => s.id === newStaffId);
    if (!newStaff) return;
    setAssignments((prev) =>
      prev.map((a) =>
        a.id === assignmentId
          ? { ...a, staffMemberId: newStaffId, staffMemberName: newStaff.name, softWarnings: [] }
          : a
      )
    );
    setManualChanges((prev) => new Set([...prev, assignmentId]));
  }, [availableStaff]);

  const handlePublish = useCallback(() => {
    onPublish?.(assignments);
    setStatus("idle");
    setAssignments([]);
    setShowPublishConfirm(false);
  }, [assignments, onPublish]);

  const handleDiscard = useCallback(() => {
    onDiscard?.();
    setStatus("idle");
    setAssignments([]);
    setManualChanges(new Set());
    setShowDiscardConfirm(false);
  }, [onDiscard]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 font-sans">
      {/* ── Header ── */}
      <div className="bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Schedule</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              Week of {new Date(weekStart).toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" })}
            </p>
          </div>

          <div className="flex items-center gap-3">
            {status === "draft" && (
              <>
                <Badge variant="warning">Draft — not visible to staff</Badge>
                <button
                  onClick={() => setShowDiscardConfirm(true)}
                  className="px-4 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  Discard
                </button>
                <button
                  onClick={() => setShowPublishConfirm(true)}
                  className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors"
                >
                  Publish schedule
                </button>
              </>
            )}

            {(status === "idle" || status === "failed") && (
              <button
                onClick={handleGenerate}
                className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors"
              >
                Generate schedule
              </button>
            )}

            {status === "generating" && (
              <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" opacity="0.25"/>
                  <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
                Generating…
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">

        {/* Hard failure */}
        {status === "failed" && hardFailures.length > 0 && (
          <HardFailureBanner failures={hardFailures} />
        )}

        {/* Summary bar */}
        {status === "draft" && (
          <div className="flex flex-wrap items-center gap-4 px-4 py-3 rounded-xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 text-sm">
            <span className="text-gray-600 dark:text-gray-400">
              <strong className="text-gray-900 dark:text-gray-100">{assignments.length}</strong> shifts assigned
            </span>
            {totalWarnings > 0 ? (
              <span className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
                <WarningIcon />
                <strong>{totalWarnings}</strong> soft rule warning{totalWarnings !== 1 ? "s" : ""}
              </span>
            ) : (
              <span className="text-green-700 dark:text-green-400 font-medium">✓ No rule warnings</span>
            )}
            {manualChanges.size > 0 && (
              <span className="text-blue-600 dark:text-blue-400">
                {manualChanges.size} manual override{manualChanges.size !== 1 ? "s" : ""}
              </span>
            )}
            <span className="ml-auto text-gray-400 dark:text-gray-600 text-xs">
              Penalty score: {totalPenalty}
            </span>
          </div>
        )}

        {/* Week calendar grid */}
        {status === "draft" && assignments.length > 0 && (
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 overflow-hidden shadow-sm overflow-x-auto">
            <div className="min-w-[720px]">
            {/* Weekday header row */}
            <div className="grid grid-cols-7 border-b border-gray-100 dark:border-gray-800 bg-gray-50/80 dark:bg-gray-900/80">
              {weekDays.map((date) => {
                const d = new Date(`${date}T12:00:00`);
                const dayWarnings = (byDate[date] ?? []).reduce(
                  (n, a) => n + a.softWarnings.length,
                  0,
                );
                const isToday = date === new Date().toISOString().split("T")[0];
                return (
                  <div
                    key={date}
                    className={`px-2 py-3 text-center border-r border-gray-100 dark:border-gray-800 last:border-r-0
                      ${isToday ? "bg-blue-50/80 dark:bg-blue-950/30" : ""}`}
                  >
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                      {d.toLocaleDateString("en-ZA", { weekday: "short" })}
                    </div>
                    <div
                      className={`mt-0.5 text-lg font-semibold tabular-nums
                        ${isToday ? "text-blue-600 dark:text-blue-400" : "text-gray-900 dark:text-gray-100"}`}
                    >
                      {d.getDate()}
                    </div>
                    {dayWarnings > 0 && (
                      <span className="mt-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/40 px-1 text-[10px] font-bold text-amber-700 dark:text-amber-300">
                        {dayWarnings}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Day columns with shifts */}
            <div className="grid grid-cols-7 divide-x divide-gray-100 dark:divide-gray-800 min-h-[420px]">
              {weekDays.map((date) => {
                const dayShifts = byDate[date] ?? [];
                const isToday = date === new Date().toISOString().split("T")[0];
                return (
                  <div
                    key={date}
                    className={`flex flex-col min-h-[420px] min-w-0
                      ${isToday ? "bg-blue-50/20 dark:bg-blue-950/10" : "bg-white dark:bg-gray-900"}`}
                  >
                    <div className="flex-1 overflow-y-auto p-1.5 space-y-1.5">
                      {dayShifts.length === 0 ? (
                        <div className="flex h-full min-h-[120px] items-center justify-center px-1">
                          <span className="text-[10px] text-gray-300 dark:text-gray-600">—</span>
                        </div>
                      ) : (
                        dayShifts.map((a) => (
                          <CalendarShiftBlock
                            key={a.id}
                            assignment={a}
                            onReassign={setReassigning}
                            isManuallyChanged={manualChanges.has(a.id)}
                          />
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          </div>
        )}

        {/* Idle state */}
        {status === "idle" && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-12 h-12 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4">
              <svg width="22" height="22" viewBox="0 0 22 22" fill="none" className="text-gray-400 dark:text-gray-500">
                <rect x="2" y="4" width="18" height="16" rx="3" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M6 2v4M16 2v4M2 9h18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                <path d="M7 14h8M7 17h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </div>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">No draft schedule</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 max-w-xs">
              Click "Generate schedule" to auto-assign staff for the week based on workgroups and rules.
            </p>
          </div>
        )}
      </div>

      {/* ── Reassign modal ── */}
      {reassigning && (
        <ReassignModal
          assignment={reassigning}
          staff={availableStaff}
          onConfirm={handleReassignConfirm}
          onClose={() => setReassigning(null)}
        />
      )}

      {/* ── Publish confirm ── */}
      {showPublishConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-sm mx-4 p-6">
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Publish schedule?</h2>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              This will make the schedule visible to all staff for the week of {new Date(weekStart).toLocaleDateString("en-ZA", { day: "numeric", month: "long" })}.
              {totalWarnings > 0 && ` There are ${totalWarnings} soft rule warning${totalWarnings !== 1 ? "s" : ""} — the schedule will proceed.`}
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <button
                onClick={() => setShowPublishConfirm(false)}
                className="px-4 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handlePublish}
                className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors"
              >
                Publish
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Discard confirm ── */}
      {showDiscardConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-sm mx-4 p-6">
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Discard draft?</h2>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              The generated schedule and any manual changes will be permanently removed.
              {manualChanges.size > 0 && ` You have ${manualChanges.size} manual override${manualChanges.size !== 1 ? "s" : ""} that will be lost.`}
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <button
                onClick={() => setShowDiscardConfirm(false)}
                className="px-4 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                Keep draft
              </button>
              <button
                onClick={handleDiscard}
                className="px-4 py-2 text-sm rounded-lg bg-red-600 text-white font-medium hover:bg-red-700 transition-colors"
              >
                Discard
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}