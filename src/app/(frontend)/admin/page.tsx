/**
 * WFM-202 — Rule Configuration UI (Admin only)
 *
 * Features:
 * - All rules grouped by type (Hard / Soft)
 * - Name, description, editable parameters per rule
 * - Enable/disable toggle per rule
 * - Confirmation step before saving changes
 * - Unsaved changes prompt on navigate-away (beforeunload)
 * - Role-gated: pass isAdmin={false} to hide the screen
 *
 * Integration:
 * - Replace mockRules / mockSave with your real API calls
 * - The component is self-contained and framework-agnostic beyond React
 */
'use client'

import { useState, useEffect, useCallback, useRef } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export type RuleParamType = "number" | "boolean" | "duration_minutes";

export type RuleParam = {
  key: string;
  label: string;
  type: RuleParamType;
  unit?: string;           // e.g. "hrs", "shifts"
  min?: number;
  max?: number;
  value: number | boolean;
};

export type SchedulingRule = {
  id: string;
  type: "hard" | "soft";
  name: string;
  description: string;
  enabled: boolean;
  /** For soft rules: penalty above this score causes schedule rejection (overridable) */
  penaltyThreshold?: number;
  params: RuleParam[];
};

export type RuleConfigProps = {
  /** If false, renders an access-denied message */
  isAdmin?: boolean;
  /** Override to fetch from your API */
  loadRules?: () => Promise<SchedulingRule[]>;
  /** Override to persist changes to your API */
  saveRules?: (rules: SchedulingRule[]) => Promise<void>;
};

// ─── Mock data ────────────────────────────────────────────────────────────────

const MOCK_RULES: SchedulingRule[] = [
  {
    id: "hard-rest",
    type: "hard",
    name: "Minimum rest between shifts",
    description: "Staff must have a minimum rest period between consecutive shifts. Violations cause the assignment to be rejected.",
    enabled: true,
    params: [
      { key: "min_rest_hours", label: "Minimum rest", type: "number", unit: "hrs", min: 4, max: 24, value: 8 },
    ],
  },
  {
    id: "hard-weekly-hours",
    type: "hard",
    name: "Maximum weekly hours",
    description: "Staff cannot be assigned shifts that exceed the maximum contracted weekly hours.",
    enabled: true,
    params: [
      { key: "max_hours", label: "Maximum hours", type: "number", unit: "hrs", min: 20, max: 60, value: 40 },
    ],
  },
  {
    id: "hard-workgroup-qualified",
    type: "hard",
    name: "Workgroup qualification required",
    description: "Staff may only be assigned to a shift in a workgroup they are qualified for (i.e. listed in their skills profile).",
    enabled: true,
    params: [],
  },
  {
    id: "soft-preferred-hours",
    type: "soft",
    name: "Preferred working hours",
    description: "Staff have preferred shift windows. Assignments outside these windows are penalised.",
    enabled: true,
    penaltyThreshold: 10,
    params: [
      { key: "penalty_per_occurrence", label: "Penalty per occurrence", type: "number", unit: "pts", min: 1, max: 20, value: 3 },
    ],
  },
  {
    id: "soft-consecutive",
    type: "soft",
    name: "Consecutive shifts",
    description: "Discourages assigning a staff member to more than a configured number of consecutive shifts.",
    enabled: true,
    penaltyThreshold: 15,
    params: [
      { key: "max_consecutive", label: "Max consecutive shifts", type: "number", unit: "shifts", min: 2, max: 7, value: 3 },
      { key: "penalty_per_extra", label: "Penalty per extra shift", type: "number", unit: "pts", min: 1, max: 20, value: 5 },
    ],
  },
  {
    id: "soft-primary-workgroup",
    type: "soft",
    name: "Primary workgroup preference",
    description: "Prefer assigning staff to their highest-ranked workgroup. Lower-ranked assignments carry a small penalty.",
    enabled: true,
    penaltyThreshold: 20,
    params: [
      { key: "penalty_per_rank", label: "Penalty per rank step", type: "number", unit: "pts", min: 1, max: 10, value: 2 },
    ],
  },
  {
    id: "soft-weekend",
    type: "soft",
    name: "Weekend shift balance",
    description: "Distribute weekend shifts evenly. Staff assigned more than the threshold of weekend shifts receive a penalty.",
    enabled: false,
    penaltyThreshold: 8,
    params: [
      { key: "max_weekend_shifts", label: "Max weekend shifts / month", type: "number", unit: "shifts", min: 1, max: 8, value: 2 },
      { key: "penalty_per_extra", label: "Penalty per extra", type: "number", unit: "pts", min: 1, max: 20, value: 4 },
    ],
  },
];

async function mockLoad(): Promise<SchedulingRule[]> {
  await new Promise((r) => setTimeout(r, 600));
  return JSON.parse(JSON.stringify(MOCK_RULES));
}

async function mockSave(_rules: SchedulingRule[]): Promise<void> {
  await new Promise((r) => setTimeout(r, 800));
}

// ─── Utility ──────────────────────────────────────────────────────────────────

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

// ─── Param editor ─────────────────────────────────────────────────────────────

function ParamEditor({
  param,
  onChange,
}: {
  param: RuleParam;
  onChange: (key: string, value: number | boolean) => void;
}) {
  if (param.type === "boolean") {
    return (
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={param.value as boolean}
          onChange={(e) => onChange(param.key, e.target.checked)}
          className="w-4 h-4 rounded accent-blue-600"
        />
        <span className="text-sm text-gray-700 dark:text-gray-300">{param.label}</span>
      </label>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-gray-500 dark:text-gray-400">{param.label}</label>
      <div className="flex items-center gap-2">
        <input
          type="number"
          value={param.value as number}
          min={param.min}
          max={param.max}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            if (!isNaN(v)) onChange(param.key, v);
          }}
          className="w-20 px-2.5 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        {param.unit && (
          <span className="text-xs text-gray-400 dark:text-gray-500">{param.unit}</span>
        )}
        {param.min !== undefined && param.max !== undefined && (
          <span className="text-xs text-gray-300 dark:text-gray-600">
            ({param.min}–{param.max})
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Rule card ────────────────────────────────────────────────────────────────

function RuleCard({
  rule,
  onToggle,
  onParamChange,
  onThresholdChange,
  hasLocalChanges,
}: {
  rule: SchedulingRule;
  onToggle: (id: string) => void;
  onParamChange: (ruleId: string, key: string, value: number | boolean) => void;
  onThresholdChange: (ruleId: string, value: number) => void;
  hasLocalChanges: boolean;
}) {
  const isHard = rule.type === "hard";

  return (
    <div
      className={`rounded-xl border transition-colors
        ${rule.enabled
          ? "border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900"
          : "border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50 opacity-70"
        }`}
    >
      <div className="px-5 py-4 flex items-start gap-4">
        {/* Toggle */}
        <div className="pt-0.5">
          <button
            role="switch"
            aria-checked={rule.enabled}
            onClick={() => onToggle(rule.id)}
            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500
              ${rule.enabled ? "bg-blue-600" : "bg-gray-200 dark:bg-gray-700"}`}
          >
            <span
              className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform
                ${rule.enabled ? "translate-x-4" : "translate-x-0"}`}
            />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{rule.name}</span>
            <span
              className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wide
                ${isHard
                  ? "bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400"
                  : "bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400"
                }`}
            >
              {isHard ? "Hard" : "Soft"}
            </span>
            {hasLocalChanges && (
              <span className="text-[11px] text-blue-600 dark:text-blue-400 font-medium">unsaved</span>
            )}
          </div>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 leading-relaxed">{rule.description}</p>

          {/* Params (only if enabled) */}
          {rule.enabled && (rule.params.length > 0 || rule.penaltyThreshold !== undefined) && (
            <div className="mt-4 flex flex-wrap gap-5 items-start">
              {rule.params.map((p) => (
                <ParamEditor
                  key={p.key}
                  param={p}
                  onChange={(key, val) => onParamChange(rule.id, key, val)}
                />
              ))}
              {rule.penaltyThreshold !== undefined && (
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-gray-500 dark:text-gray-400">
                    Rejection threshold
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={rule.penaltyThreshold}
                      min={1}
                      max={100}
                      onChange={(e) => {
                        const v = parseInt(e.target.value, 10);
                        if (!isNaN(v)) onThresholdChange(rule.id, v);
                      }}
                      className="w-20 px-2.5 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    <span className="text-xs text-gray-400 dark:text-gray-500">pts</span>
                    <span className="text-xs text-gray-400 dark:text-gray-500">(overridable by admin)</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function RuleConfig({
  isAdmin = true,
  loadRules = mockLoad,
  saveRules = mockSave,
}: RuleConfigProps) {
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [savedRules, setSavedRules] = useState<SchedulingRule[]>([]);
  const [rules, setRules] = useState<SchedulingRule[]>([]);
  const [saveState, setSaveState] = useState<"idle" | "confirming" | "saving" | "saved">("idle");
  const [activeTab, setActiveTab] = useState<"hard" | "soft">("hard");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hasChanges = !deepEqual(rules, savedRules);

  // Load rules on mount
  useEffect(() => {
    if (!isAdmin) return;
    loadRules()
      .then((r) => {
        setSavedRules(r);
        setRules(JSON.parse(JSON.stringify(r)));
        setLoadState("ready");
      })
      .catch(() => setLoadState("error"));
  }, [isAdmin, loadRules]);

  // Warn on navigate-away when there are unsaved changes
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (hasChanges) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasChanges]);

  // Auto-clear "saved" state
  useEffect(() => {
    if (saveState === "saved") {
      saveTimer.current = setTimeout(() => setSaveState("idle"), 3000);
    }
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [saveState]);

  const handleToggle = useCallback((id: string) => {
    setRules((prev) => prev.map((r) => r.id === id ? { ...r, enabled: !r.enabled } : r));
  }, []);

  const handleParamChange = useCallback((ruleId: string, key: string, value: number | boolean) => {
    setRules((prev) => prev.map((r) =>
      r.id === ruleId
        ? { ...r, params: r.params.map((p) => p.key === key ? { ...p, value } : p) }
        : r
    ));
  }, []);

  const handleThresholdChange = useCallback((ruleId: string, value: number) => {
    setRules((prev) => prev.map((r) =>
      r.id === ruleId ? { ...r, penaltyThreshold: value } : r
    ));
  }, []);

  const handleSaveConfirm = useCallback(async () => {
    setSaveState("saving");
    try {
      await saveRules(rules);
      setSavedRules(JSON.parse(JSON.stringify(rules)));
      setSaveState("saved");
    } catch {
      setSaveState("idle");
    }
  }, [rules, saveRules]);

  const handleReset = useCallback(() => {
    setRules(JSON.parse(JSON.stringify(savedRules)));
    setSaveState("idle");
  }, [savedRules]);

  // Per-rule change tracking
  const changedIds = new Set(
    rules
      .filter((r) => !deepEqual(r, savedRules.find((s) => s.id === r.id)))
      .map((r) => r.id)
  );

  const displayRules = rules.filter((r) => r.type === activeTab);

  // ── Access denied ──────────────────────────────────────────────────────────
  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Access restricted</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Rule configuration is available to system admins only.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* ── Header ── */}
      <div className="bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 px-6 py-4 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Scheduling rules</h1>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">System admin · Configure hard and soft scheduling constraints</p>
          </div>

          <div className="flex items-center gap-3">
            {hasChanges && (
              <button
                onClick={handleReset}
                className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
              >
                Reset
              </button>
            )}

            {saveState === "saved" && !hasChanges && (
              <span className="text-sm text-green-600 dark:text-green-400 font-medium">
                ✓ Saved
              </span>
            )}

            <button
              onClick={() => hasChanges && setSaveState("confirming")}
              disabled={!hasChanges || saveState === "saving"}
              className={`px-4 py-2 text-sm rounded-lg font-medium transition-colors
                ${hasChanges && saveState !== "saving"
                  ? "bg-blue-600 text-white hover:bg-blue-700"
                  : "bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-600 cursor-not-allowed"
                }`}
            >
              {saveState === "saving" ? "Saving…" : "Save changes"}
            </button>
          </div>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 px-6">
        <div className="max-w-3xl mx-auto flex gap-0">
          {(["hard", "soft"] as const).map((tab) => {
            const count = rules.filter((r) => r.type === tab).length;
            const enabledCount = rules.filter((r) => r.type === tab && r.enabled).length;
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-3 text-sm border-b-2 transition-colors flex items-center gap-2 capitalize
                  ${activeTab === tab
                    ? "border-blue-600 text-blue-600 dark:text-blue-400 font-medium"
                    : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                  }`}
              >
                {tab} rules
                <span className="text-xs font-normal text-gray-400">
                  {enabledCount}/{count} active
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Body ── */}
      <div className="max-w-3xl mx-auto px-6 py-6">
        {loadState === "loading" && (
          <div className="flex items-center gap-2 text-sm text-gray-400 dark:text-gray-500 py-10 justify-center">
            <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" opacity="0.25"/>
              <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            Loading rules…
          </div>
        )}

        {loadState === "error" && (
          <div className="text-sm text-red-600 dark:text-red-400 py-10 text-center">
            Failed to load rules. Please refresh and try again.
          </div>
        )}

        {loadState === "ready" && (
          <>
            {/* Type description */}
            <div className="mb-4 text-xs text-gray-400 dark:text-gray-500">
              {activeTab === "hard"
                ? "Hard rule violations cause the scheduler to reject an assignment entirely."
                : "Soft rule violations add a penalty score. Schedules exceeding the threshold are rejected unless overridden."
              }
            </div>

            {/* Rule cards */}
            <div className="space-y-3">
              {displayRules.map((rule) => (
                <RuleCard
                  key={rule.id}
                  rule={rule}
                  onToggle={handleToggle}
                  onParamChange={handleParamChange}
                  onThresholdChange={handleThresholdChange}
                  hasLocalChanges={changedIds.has(rule.id)}
                />
              ))}
              {displayRules.length === 0 && (
                <p className="text-sm text-gray-400 dark:text-gray-500 py-8 text-center">
                  No {activeTab} rules configured.
                </p>
              )}
            </div>
          </>
        )}
      </div>

      {/* ── Save confirmation modal ── */}
      {saveState === "confirming" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-sm mx-4 p-6">
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Save rule changes?</h2>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              {changedIds.size} rule{changedIds.size !== 1 ? "s" : ""} modified. Changes will apply to the next schedule generation run.
            </p>
            <ul className="mt-3 space-y-1">
              {[...changedIds].map((id) => {
                const r = rules.find((x) => x.id === id);
                return r ? (
                  <li key={id} className="text-sm text-gray-700 dark:text-gray-300 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0"/>
                    {r.name}
                  </li>
                ) : null;
              })}
            </ul>
            <div className="mt-5 flex justify-end gap-3">
              <button
                onClick={() => setSaveState("idle")}
                className="px-4 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveConfirm}
                className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}