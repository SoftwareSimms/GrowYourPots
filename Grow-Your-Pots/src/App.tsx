import { useEffect, useMemo, useState } from "react";

type PlantType = "flower" | "tree" | "hardy";
type PlantState = "thriving" | "warning" | "critical";
type SalaryMode = "drought" | "steady" | "growth";
type PotGroup = "Survival" | "Stability" | "Living" | "Growth";

type PotTemplate = {
  id: string;
  name: string;
  description: string;
  group: PotGroup;
  plantType: PlantType;
  baseAllocation: number;
  protectedThreshold?: number;
  overflowWeight?: number;
  cutRank: number;
  weeklyGuide?: boolean;
};

type Pot = PotTemplate & {
  allocated: number;
  spent: number;
};

type PotDraft = {
  name: string;
  description: string;
  group: PotGroup;
  baseAllocation: number;
  weeklyGuide: boolean;
};

type PersistedState = {
  salary: number;
  salaryDraft: number;
  spentByPot: Record<string, number>;
  templates: PotTemplate[];
  pendingTreeChanges: Record<string, PotDraft>;
};

const STORAGE_KEY = "grow-your-pots-greybeard-v2";
const BASELINE_SALARY = 3500;
const DEFAULT_SALARY = 4000;

const DEFAULT_TEMPLATES: PotTemplate[] = [
  {
    id: "bills",
    name: "Bills",
    description:
      "Your non-negotiables. Rent, utilities, subscriptions, and core monthly costs that keep life running.",
    group: "Survival",
    plantType: "hardy",
    baseAllocation: 1500,
    protectedThreshold: 1500,
    cutRank: 10,
  },
  {
    id: "debt-min",
    name: "Debt (Min)",
    description:
      "The minimum debt payments you must make to stay current and avoid slipping backwards.",
    group: "Survival",
    plantType: "hardy",
    baseAllocation: 500,
    protectedThreshold: 500,
    cutRank: 9,
  },
  {
    id: "emergency",
    name: "Emergency",
    description:
      "Your safety net. Money set aside for real surprises so one bad week does not wreck the whole system.",
    group: "Stability",
    plantType: "tree",
    baseAllocation: 150,
    overflowWeight: 0.05,
    cutRank: 7,
  },
  {
    id: "buffer",
    name: "Buffer",
    description:
      "Your shock absorber. A small flexible reserve for timing gaps, uneven months, and minor overspending.",
    group: "Stability",
    plantType: "hardy",
    baseAllocation: 150,
    protectedThreshold: 75,
    overflowWeight: 0.05,
    cutRank: 6,
  },
  {
    id: "groceries",
    name: "Groceries",
    description:
      "Your everyday food pot. The budget for feeding yourself properly without raiding long-term pots.",
    group: "Living",
    plantType: "hardy",
    baseAllocation: 250,
    protectedThreshold: 125,
    cutRank: 8,
    weeklyGuide: true,
  },
  {
    id: "eating-out",
    name: "Eating Out",
    description:
      "Meals, coffees, takeaways, and going out without pretending the money will magically appear later.",
    group: "Living",
    plantType: "flower",
    baseAllocation: 150,
    overflowWeight: 0.1,
    cutRank: 2,
    weeklyGuide: true,
  },
  {
    id: "fun",
    name: "Fun",
    description:
      "Your guilt-free enjoyment pot. Hobbies, drinks, events, treats, and the bits of life that stop it feeling like admin.",
    group: "Living",
    plantType: "flower",
    baseAllocation: 200,
    overflowWeight: 0.1,
    cutRank: 3,
    weeklyGuide: true,
  },
  {
    id: "extra-debt",
    name: "Extra Debt",
    description:
      "Money used to push debt down faster once essentials are covered and the foundations are stable.",
    group: "Growth",
    plantType: "tree",
    baseAllocation: 250,
    overflowWeight: 0.3,
    cutRank: 5,
  },
  {
    id: "savings",
    name: "Savings",
    description:
      "Your long-term growth pot. Money for future freedom, bigger goals, and building real financial stability.",
    group: "Growth",
    plantType: "tree",
    baseAllocation: 250,
    overflowWeight: 0.35,
    cutRank: 4,
  },
  {
    id: "clothing",
    name: "Clothing",
    description:
      "Your wardrobe pot. Clothes, shoes, replacements, and upgrades so these costs are planned instead of chaotic.",
    group: "Growth",
    plantType: "flower",
    baseAllocation: 100,
    overflowWeight: 0.05,
    cutRank: 1,
    weeklyGuide: true,
  },
];

const GROUP_ORDER: PotGroup[] = ["Survival", "Stability", "Living", "Growth"];
const FLEXIBLE_GROUPS: PotGroup[] = ["Stability", "Living", "Growth"];

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(value);
}

function cloneTemplates(templates: PotTemplate[]) {
  return templates.map((template) => ({ ...template }));
}

function buildDraft(template: PotTemplate, pending?: PotDraft): PotDraft {
  return {
    name: pending?.name ?? template.name,
    description: pending?.description ?? template.description,
    group: pending?.group ?? template.group,
    baseAllocation: pending?.baseAllocation ?? template.baseAllocation,
    weeklyGuide: pending?.weeklyGuide ?? Boolean(template.weeklyGuide),
  };
}

function normaliseDraft(draft: PotDraft, fallback: PotTemplate): PotDraft {
  const trimmedName = draft.name.trim();
  const trimmedDescription = draft.description.trim();

  return {
    name: trimmedName || fallback.name,
    description: trimmedDescription || fallback.description,
    group: FLEXIBLE_GROUPS.includes(draft.group) ? draft.group : fallback.group,
    baseAllocation: Number.isFinite(draft.baseAllocation)
      ? Math.max(0, roundMoney(draft.baseAllocation))
      : fallback.baseAllocation,
    weeklyGuide: Boolean(draft.weeklyGuide),
  };
}

function mergeStoredTemplates(stored: unknown): PotTemplate[] {
  if (!Array.isArray(stored)) {
    return cloneTemplates(DEFAULT_TEMPLATES);
  }

  const storedMap = new Map<string, Partial<PotTemplate>>();

  for (const entry of stored) {
    if (
      entry &&
      typeof entry === "object" &&
      "id" in entry &&
      typeof (entry as { id: unknown }).id === "string"
    ) {
      storedMap.set((entry as { id: string }).id, entry as Partial<PotTemplate>);
    }
  }

  return DEFAULT_TEMPLATES.map((template) => {
    const candidate = storedMap.get(template.id);

    if (!candidate) {
      return { ...template };
    }

    return {
      ...template,
      ...candidate,
      id: template.id,
      plantType: template.plantType,
      protectedThreshold: template.protectedThreshold,
      overflowWeight: template.overflowWeight,
      cutRank: template.cutRank,
      group:
        candidate.group && GROUP_ORDER.includes(candidate.group)
          ? candidate.group
          : template.group,
      baseAllocation: Number.isFinite(candidate.baseAllocation)
        ? Math.max(0, roundMoney(candidate.baseAllocation))
        : template.baseAllocation,
      weeklyGuide:
        typeof candidate.weeklyGuide === "boolean"
          ? candidate.weeklyGuide
          : template.weeklyGuide,
      name:
        typeof candidate.name === "string" && candidate.name.trim()
          ? candidate.name.trim()
          : template.name,
      description:
        typeof candidate.description === "string" && candidate.description.trim()
          ? candidate.description.trim()
          : template.description,
    };
  });
}

function sanitisePendingTreeChanges(
  pending: unknown,
  templates: PotTemplate[]
): Record<string, PotDraft> {
  if (!pending || typeof pending !== "object") {
    return {};
  }

  const treeIds = new Set(
    templates.filter((template) => template.plantType === "tree").map((template) => template.id)
  );

  const result: Record<string, PotDraft> = {};

  for (const [id, value] of Object.entries(pending as Record<string, unknown>)) {
    if (!treeIds.has(id) || !value || typeof value !== "object") {
      continue;
    }

    const template = templates.find((item) => item.id === id);
    if (!template) continue;

    const candidate = value as Partial<PotDraft>;
    result[id] = normaliseDraft(
      {
        name: typeof candidate.name === "string" ? candidate.name : template.name,
        description:
          typeof candidate.description === "string"
            ? candidate.description
            : template.description,
        group:
          candidate.group && GROUP_ORDER.includes(candidate.group)
            ? candidate.group
            : template.group,
        baseAllocation:
          typeof candidate.baseAllocation === "number"
            ? candidate.baseAllocation
            : template.baseAllocation,
        weeklyGuide: Boolean(candidate.weeklyGuide),
      },
      template
    );
  }

  return result;
}

function getInitialState(): PersistedState {
  const templates = cloneTemplates(DEFAULT_TEMPLATES);

  if (typeof window === "undefined") {
    return {
      salary: DEFAULT_SALARY,
      salaryDraft: DEFAULT_SALARY,
      spentByPot: {},
      templates,
      pendingTreeChanges: {},
    };
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);

    if (!raw) {
      return {
        salary: DEFAULT_SALARY,
        salaryDraft: DEFAULT_SALARY,
        spentByPot: {},
        templates,
        pendingTreeChanges: {},
      };
    }

    const parsed = JSON.parse(raw) as Partial<PersistedState>;
    const mergedTemplates = mergeStoredTemplates(parsed.templates);
    const salary = Number.isFinite(parsed.salary) ? Number(parsed.salary) : DEFAULT_SALARY;
    const salaryDraft = Number.isFinite(parsed.salaryDraft)
      ? Number(parsed.salaryDraft)
      : salary;

    return {
      salary,
      salaryDraft,
      spentByPot:
        parsed.spentByPot && typeof parsed.spentByPot === "object"
          ? (parsed.spentByPot as Record<string, number>)
          : {},
      templates: mergedTemplates,
      pendingTreeChanges: sanitisePendingTreeChanges(
        parsed.pendingTreeChanges,
        mergedTemplates
      ),
    };
  } catch {
    return {
      salary: DEFAULT_SALARY,
      salaryDraft: DEFAULT_SALARY,
      spentByPot: {},
      templates,
      pendingTreeChanges: {},
    };
  }
}

function getSalaryMode(salary: number): SalaryMode {
  if (salary < BASELINE_SALARY) return "drought";
  if (salary > BASELINE_SALARY) return "growth";
  return "steady";
}

function getStoredSpend(
  spentByPot: Record<string, number>,
  template: PotTemplate
): number {
  const byId = spentByPot[template.id];
  if (Number.isFinite(byId)) {
    return roundMoney(byId);
  }

  const legacyByName = spentByPot[template.name];
  if (Number.isFinite(legacyByName)) {
    return roundMoney(legacyByName);
  }

  return 0;
}

function allocateSalary(
  templates: PotTemplate[],
  salary: number,
  spentByPot: Record<string, number>
): Pot[] {
  const pots: Pot[] = templates.map((template) => ({
    ...template,
    allocated: template.baseAllocation,
    spent: getStoredSpend(spentByPot, template),
  }));

  if (salary > BASELINE_SALARY) {
    const extra = salary - BASELINE_SALARY;

    for (const pot of pots) {
      pot.allocated = roundMoney(
        pot.allocated + extra * (pot.overflowWeight ?? 0)
      );
    }
  }

  if (salary < BASELINE_SALARY) {
    let shortfall = BASELINE_SALARY - salary;
    const cutOrder = [...pots].sort((a, b) => a.cutRank - b.cutRank);

    for (const pot of cutOrder) {
      if (shortfall <= 0) break;
      const reduction = Math.min(pot.allocated, shortfall);
      pot.allocated = roundMoney(pot.allocated - reduction);
      shortfall = roundMoney(shortfall - reduction);
    }
  }

  const totalAllocated = pots.reduce((sum, pot) => sum + pot.allocated, 0);
  const diff = roundMoney(salary - totalAllocated);

  if (diff !== 0) {
    const savingsPot =
      pots.find((pot) => pot.id === "savings") ?? pots[pots.length - 1];
    savingsPot.allocated = roundMoney(savingsPot.allocated + diff);
  }

  return pots;
}

function getRemaining(pot: Pot) {
  return roundMoney(pot.allocated - pot.spent);
}

function getRemainingPercent(pot: Pot) {
  if (pot.allocated <= 0) return 0;
  return Math.max(0, Math.min((getRemaining(pot) / pot.allocated) * 100, 100));
}

function getWeeklyGuide(pot: Pot) {
  if (!pot.weeklyGuide) return null;
  return roundMoney(pot.allocated / 4);
}

function getPlantState(pot: Pot): PlantState {
  const remaining = getRemaining(pot);
  const remainingPercent = getRemainingPercent(pot);

  if (pot.plantType === "hardy" && pot.protectedThreshold !== undefined) {
    if (remaining >= pot.protectedThreshold) return "thriving";
    if (remaining >= pot.protectedThreshold * 0.65) return "warning";
    return "critical";
  }

  if (remainingPercent >= 66) return "thriving";
  if (remainingPercent >= 33) return "warning";
  return "critical";
}

function getPlantLabel(plantType: PlantType) {
  if (plantType === "flower") return "Flower pot";
  if (plantType === "tree") return "Tree pot";
  return "Hardy pot";
}

function getEditabilityLabel(plantType: PlantType) {
  if (plantType === "flower") return "Flexible now";
  if (plantType === "tree") return "Slow change";
  return "Protected";
}

function getModeCopy(mode: SalaryMode) {
  if (mode === "drought") {
    return {
      title: "Drought mode",
      description:
        "Salary is below the £3,500 brace line. The engine cuts flowers first, then growth, and protects roots as long as possible.",
    };
  }

  if (mode === "growth") {
    return {
      title: "Growth mode",
      description:
        "Salary is above the brace line. Surplus is routed automatically into trees first, with a smaller share for flowers and buffers.",
    };
  }

  return {
    title: "Steady mode",
    description:
      "Salary landed exactly on the £3,500 brace line. Every pot gets its base allocation and the system stays calm.",
  };
}

function PlantVisual({
  plantType,
  state,
}: {
  plantType: PlantType;
  state: PlantState;
}) {
  if (plantType === "flower") {
    return (
      <div className={`plant-visual flower ${state}`}>
        <div className="scene">
          <div className="soil" />
          <div className="flower-stem" />
          <div className="leaf leaf-left" />
          <div className="leaf leaf-right" />
          <div className="flower-head">
            <span className="petal petal-1" />
            <span className="petal petal-2" />
            <span className="petal petal-3" />
            <span className="petal petal-4" />
            <span className="petal petal-5" />
            <span className="petal petal-6" />
            <span className="flower-centre" />
          </div>
        </div>
      </div>
    );
  }

  if (plantType === "tree") {
    return (
      <div className={`plant-visual tree ${state}`}>
        <div className="scene">
          <div className="soil" />
          <div className="tree-trunk" />
          <div className="tree-canopy canopy-main" />
          <div className="tree-canopy canopy-left" />
          <div className="tree-canopy canopy-right" />
        </div>
      </div>
    );
  }

  return (
    <div className={`plant-visual hardy ${state}`}>
      <div className="scene">
        <div className="soil" />
        <div className="hardy-body hardy-main" />
        <div className="hardy-body hardy-left" />
        <div className="hardy-body hardy-right" />
      </div>
    </div>
  );
}

export default function App() {
  const initialState = useMemo(() => getInitialState(), []);
  const [templates, setTemplates] = useState<PotTemplate[]>(() =>
    cloneTemplates(initialState.templates)
  );
  const [pendingTreeChanges, setPendingTreeChanges] = useState<
    Record<string, PotDraft>
  >(() => ({ ...initialState.pendingTreeChanges }));
  const [salary, setSalary] = useState<number>(initialState.salary);
  const [salaryDraft, setSalaryDraft] = useState<number>(initialState.salaryDraft);
  const [pots, setPots] = useState<Pot[]>(() =>
    allocateSalary(initialState.templates, initialState.salary, initialState.spentByPot)
  );
  const [selectedPot, setSelectedPot] = useState<string>("");
  const [amount, setAmount] = useState<string>("");

  const editableTemplates = useMemo(
    () => templates.filter((template) => template.plantType !== "hardy"),
    [templates]
  );

  const [selectedEditorPotId, setSelectedEditorPotId] = useState<string>(
    initialState.templates.find((template) => template.plantType !== "hardy")?.id ?? ""
  );

  const selectedEditorPot = useMemo(
    () =>
      editableTemplates.find((template) => template.id === selectedEditorPotId) ??
      editableTemplates[0] ??
      null,
    [editableTemplates, selectedEditorPotId]
  );

  const [editDraft, setEditDraft] = useState<PotDraft>(() => {
    const firstEditable =
      initialState.templates.find((template) => template.plantType !== "hardy") ??
      DEFAULT_TEMPLATES.find((template) => template.plantType !== "hardy");

    return firstEditable
      ? buildDraft(firstEditable, initialState.pendingTreeChanges[firstEditable.id])
      : {
          name: "",
          description: "",
          group: "Living",
          baseAllocation: 0,
          weeklyGuide: false,
        };
  });

  useEffect(() => {
    setPots((previousPots) => {
      const spentByPot = Object.fromEntries(
        previousPots.map((pot) => [pot.id, pot.spent])
      );
      return allocateSalary(templates, salary, spentByPot);
    });
  }, [salary, templates]);

  useEffect(() => {
    if (!editableTemplates.length) {
      setSelectedEditorPotId("");
      return;
    }

    if (!editableTemplates.some((template) => template.id === selectedEditorPotId)) {
      setSelectedEditorPotId(editableTemplates[0].id);
    }
  }, [editableTemplates, selectedEditorPotId]);

  useEffect(() => {
    if (!selectedEditorPot) return;
    setEditDraft(
      buildDraft(selectedEditorPot, pendingTreeChanges[selectedEditorPot.id])
    );
  }, [selectedEditorPot, pendingTreeChanges]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const spentByPot = Object.fromEntries(
      pots.map((pot) => [pot.id, roundMoney(pot.spent)])
    );

    const snapshot: PersistedState = {
      salary,
      salaryDraft,
      spentByPot,
      templates,
      pendingTreeChanges,
    };

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  }, [salary, salaryDraft, pots, templates, pendingTreeChanges]);

  const salaryMode = getSalaryMode(salary);
  const modeCopy = getModeCopy(salaryMode);

  const totals = useMemo(() => {
    const allocated = pots.reduce((sum, pot) => sum + pot.allocated, 0);
    const spent = pots.reduce((sum, pot) => sum + pot.spent, 0);
    const remaining = pots.reduce((sum, pot) => sum + getRemaining(pot), 0);
    const protectedRoots = pots
      .filter((pot) => pot.protectedThreshold !== undefined)
      .reduce((sum, pot) => sum + (pot.protectedThreshold ?? 0), 0);

    return {
      allocated: roundMoney(allocated),
      spent: roundMoney(spent),
      remaining: roundMoney(remaining),
      protectedRoots: roundMoney(protectedRoots),
    };
  }, [pots]);

  const groupedPots = useMemo(
    () =>
      GROUP_ORDER.map((group) => ({
        title: group,
        pots: pots.filter((pot) => pot.group === group),
      })),
    [pots]
  );

  const salaryDelta = roundMoney(salary - BASELINE_SALARY);
  const queuedTreeCount = Object.keys(pendingTreeChanges).length;

  function handleSpend() {
    const parsedAmount = Number(amount);

    if (!selectedPot || !Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      return;
    }

    setPots((previousPots) =>
      previousPots.map((pot) =>
        pot.id === selectedPot
          ? { ...pot, spent: roundMoney(pot.spent + parsedAmount) }
          : pot
      )
    );

    setAmount("");
  }

  function handleResetSpends() {
    setPots((previousPots) =>
      previousPots.map((pot) => ({ ...pot, spent: 0 }))
    );
  }

  function handleRunPaydayCycle() {
    setTemplates((previousTemplates) =>
      previousTemplates.map((template) => {
        if (template.plantType !== "tree") return template;

        const pending = pendingTreeChanges[template.id];
        if (!pending) return template;

        const nextDraft = normaliseDraft(pending, template);
        return {
          ...template,
          ...nextDraft,
          weeklyGuide: nextDraft.weeklyGuide,
        };
      })
    );

    setPendingTreeChanges({});
    setSalary(Number.isFinite(salaryDraft) ? Math.max(0, roundMoney(salaryDraft)) : salary);
  }

  function handleApplyPotChange() {
    if (!selectedEditorPot) return;

    const nextDraft = normaliseDraft(editDraft, selectedEditorPot);

    if (selectedEditorPot.plantType === "flower") {
      setTemplates((previousTemplates) =>
        previousTemplates.map((template) =>
          template.id === selectedEditorPot.id
            ? {
                ...template,
                ...nextDraft,
                weeklyGuide: nextDraft.weeklyGuide,
              }
            : template
        )
      );
      return;
    }

    setPendingTreeChanges((previous) => ({
      ...previous,
      [selectedEditorPot.id]: nextDraft,
    }));
  }

  function handleResetEditorDraft() {
    if (!selectedEditorPot) return;
    setEditDraft(
      buildDraft(selectedEditorPot, pendingTreeChanges[selectedEditorPot.id])
    );
  }

  function handleRestoreSelectedPotDefault() {
    if (!selectedEditorPot) return;

    const defaultTemplate = DEFAULT_TEMPLATES.find(
      (template) => template.id === selectedEditorPot.id
    );

    if (!defaultTemplate) return;

    if (selectedEditorPot.plantType === "flower") {
      setTemplates((previousTemplates) =>
        previousTemplates.map((template) =>
          template.id === selectedEditorPot.id ? { ...defaultTemplate } : template
        )
      );
      return;
    }

    setPendingTreeChanges((previous) => ({
      ...previous,
      [selectedEditorPot.id]: buildDraft(defaultTemplate),
    }));
  }

  function handleDiscardQueuedTreeChange() {
    if (!selectedEditorPot || selectedEditorPot.plantType !== "tree") return;

    setPendingTreeChanges((previous) => {
      const next = { ...previous };
      delete next[selectedEditorPot.id];
      return next;
    });
  }

  return (
    <div className="app-shell">
      <div className="app">
        <header className="hero-card">
          <div>
            <p className="eyebrow">ADHD money scaffolding</p>
            <h1>Grow Your Pots 🌱</h1>
            <p className="subtitle">
              Salary is the trigger. Flowers are flexible, trees change on the
              next payday cycle, and hardy roots stay protected so your whole
              system does not blow over because you fancied a new plan on a Tuesday.
            </p>
          </div>

          <div className="hero-side">
            <div className={`mode-card ${salaryMode}`}>
              <span className="mode-label">System mode</span>
              <strong>{modeCopy.title}</strong>
              <p>{modeCopy.description}</p>
            </div>

            <div className="summary-grid">
              <div className="summary-card">
                <span>Active salary</span>
                <strong>{formatCurrency(salary)}</strong>
              </div>
              <div className="summary-card">
                <span>Allocated</span>
                <strong>{formatCurrency(totals.allocated)}</strong>
              </div>
              <div className="summary-card">
                <span>Spent</span>
                <strong>{formatCurrency(totals.spent)}</strong>
              </div>
              <div className="summary-card">
                <span>Remaining</span>
                <strong>{formatCurrency(totals.remaining)}</strong>
              </div>
            </div>
          </div>
        </header>

        <section className="control-panel">
          <div className="panel-block">
            <div className="panel-heading">
              <h2>Salary autopilot</h2>
              <p>
                Set the next salary, then run payday. Queued tree changes also
                take effect there, because roots and long-term plans should not
                be reshuffled every five minutes.
              </p>
            </div>

            <div className="salary-controls">
              <label className="field">
                <span>Next payday salary</span>
                <input
                  type="number"
                  min="0"
                  step="50"
                  value={salaryDraft}
                  onChange={(event) =>
                    setSalaryDraft(Number(event.target.value) || 0)
                  }
                />
              </label>

              <div className="preset-buttons">
                {[3500, 4000, 4500].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    className="ghost-button"
                    onClick={() => setSalaryDraft(preset)}
                  >
                    {formatCurrency(preset)}
                  </button>
                ))}
              </div>
            </div>

            <div className="salary-actions">
              <button type="button" onClick={handleRunPaydayCycle}>
                Run payday cycle
              </button>
            </div>

            <div className="stat-strip">
              <div className="mini-stat">
                <span>Brace line</span>
                <strong>{formatCurrency(BASELINE_SALARY)}</strong>
              </div>
              <div className="mini-stat">
                <span>Above / below line</span>
                <strong>
                  {salaryDelta >= 0 ? "+" : "-"}
                  {formatCurrency(Math.abs(salaryDelta))}
                </strong>
              </div>
              <div className="mini-stat">
                <span>Protected roots</span>
                <strong>{formatCurrency(totals.protectedRoots)}</strong>
              </div>
              <div className="mini-stat">
                <span>Queued tree changes</span>
                <strong>{queuedTreeCount}</strong>
              </div>
            </div>
          </div>

          <div className="panel-block">
            <div className="panel-heading">
              <h2>Log spending</h2>
              <p>
                Spend reduces the health of a single pot. The rest of the garden
                stays locked unless payday runs or you deliberately reshape a flower.
              </p>
            </div>

            <div className="spend-controls">
              <select
                value={selectedPot}
                onChange={(event) => setSelectedPot(event.target.value)}
              >
                <option value="">Select pot</option>
                {pots.map((pot) => (
                  <option key={pot.id} value={pot.id}>
                    {pot.name}
                  </option>
                ))}
              </select>

              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="Amount"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />

              <button type="button" onClick={handleSpend}>
                Log spend
              </button>
              <button
                type="button"
                className="ghost-button"
                onClick={handleResetSpends}
              >
                Reset cycle
              </button>
            </div>
          </div>
        </section>

        <section className="editor-panel">
          <div className="panel-block">
            <div className="panel-heading">
              <h2>Pot shaping rules</h2>
              <p>
                This is the part where the design finally behaves like a real
                nervous system instead of a cheerful spreadsheet.
              </p>
            </div>

            <div className="edit-rule-list">
              <div className="edit-rule-card flower">
                <strong>Flowers change now</strong>
                <p>
                  Rename them, resize them, repurpose them. They are for flexible
                  wants, experiments, and whatever is relevant this month.
                </p>
              </div>

              <div className="edit-rule-card tree">
                <strong>Trees change on payday</strong>
                <p>
                  You can queue edits today, but they only take effect on the
                  next payday cycle. Long-term plans should feel rooted.
                </p>
              </div>

              <div className="edit-rule-card hardy">
                <strong>Hardy pots stay protected</strong>
                <p>
                  These are the roots. Bills, groceries, and buffers do not get
                  casually reclassified because your mood invented a new category.
                </p>
              </div>
            </div>
          </div>

          <div className="panel-block">
            <div className="panel-heading">
              <h2>Pot shaping</h2>
              <p>
                Edit any non-hardy pot. Flowers apply immediately. Trees queue
                for the next payday cycle.
              </p>
            </div>

            {selectedEditorPot ? (
              <>
                <div className="pot-editor-grid">
                  <label className="field field-span-2">
                    <span>Editable pot</span>
                    <select
                      value={selectedEditorPot.id}
                      onChange={(event) => setSelectedEditorPotId(event.target.value)}
                    >
                      {editableTemplates.map((template) => {
                        const hasQueue =
                          template.plantType === "tree" &&
                          Boolean(pendingTreeChanges[template.id]);

                        return (
                          <option key={template.id} value={template.id}>
                            {template.name}
                            {hasQueue ? " (queued)" : ""}
                          </option>
                        );
                      })}
                    </select>
                  </label>

                  <label className="field">
                    <span>Name</span>
                    <input
                      type="text"
                      value={editDraft.name}
                      onChange={(event) =>
                        setEditDraft((previous) => ({
                          ...previous,
                          name: event.target.value,
                        }))
                      }
                    />
                  </label>

                  <label className="field">
                    <span>Base allocation</span>
                    <input
                      type="number"
                      min="0"
                      step="10"
                      value={editDraft.baseAllocation}
                      onChange={(event) =>
                        setEditDraft((previous) => ({
                          ...previous,
                          baseAllocation: Number(event.target.value) || 0,
                        }))
                      }
                    />
                  </label>

                  <label className="field field-span-2">
                    <span>Description</span>
                    <input
                      type="text"
                      value={editDraft.description}
                      onChange={(event) =>
                        setEditDraft((previous) => ({
                          ...previous,
                          description: event.target.value,
                        }))
                      }
                    />
                  </label>

                  <label className="field">
                    <span>Group</span>
                    <select
                      value={editDraft.group}
                      onChange={(event) =>
                        setEditDraft((previous) => ({
                          ...previous,
                          group: event.target.value as PotGroup,
                        }))
                      }
                    >
                      {FLEXIBLE_GROUPS.map((group) => (
                        <option key={group} value={group}>
                          {group}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="field checkbox-field">
                    <span>Weekly guide</span>
                    <label className="checkbox-row">
                      <input
                        type="checkbox"
                        checked={editDraft.weeklyGuide}
                        onChange={(event) =>
                          setEditDraft((previous) => ({
                            ...previous,
                            weeklyGuide: event.target.checked,
                          }))
                        }
                      />
                      <span>Show weekly pacing for this pot</span>
                    </label>
                  </label>
                </div>

                <div className="editor-status-row">
                  <span className={`plant-badge ${selectedEditorPot.plantType}`}>
                    {getPlantLabel(selectedEditorPot.plantType)}
                  </span>
                  <span className={`editability-badge ${selectedEditorPot.plantType}`}>
                    {getEditabilityLabel(selectedEditorPot.plantType)}
                  </span>
                  {selectedEditorPot.plantType === "tree" &&
                    pendingTreeChanges[selectedEditorPot.id] && (
                      <span className="queue-badge">Queued for payday</span>
                    )}
                </div>

                <div className="editor-actions">
                  <button type="button" onClick={handleApplyPotChange}>
                    {selectedEditorPot.plantType === "flower"
                      ? "Apply flower change now"
                      : "Queue tree change"}
                  </button>

                  <button
                    type="button"
                    className="ghost-button"
                    onClick={handleResetEditorDraft}
                  >
                    Reset draft
                  </button>

                  <button
                    type="button"
                    className="ghost-button"
                    onClick={handleRestoreSelectedPotDefault}
                  >
                    Restore default
                  </button>

                  {selectedEditorPot.plantType === "tree" &&
                    pendingTreeChanges[selectedEditorPot.id] && (
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={handleDiscardQueuedTreeChange}
                      >
                        Discard queued change
                      </button>
                    )}
                </div>

                <p className="editor-hint">
                  {selectedEditorPot.plantType === "flower"
                    ? "Flower edits take effect immediately. Flexible pots are allowed to flex."
                    : "Tree edits wait for the next payday cycle. That delay is the point, not a bug."}
                </p>
              </>
            ) : (
              <p className="editor-hint">No editable pots available.</p>
            )}
          </div>
        </section>

        <section className="routine-rails">
          <div className="rail-card">
            <strong>1. Payday autopilot</strong>
            <p>
              Salary lands. Essentials lock first. Trees get surplus. Flowers do
              not get to raid the roots.
            </p>
          </div>
          <div className="rail-card">
            <strong>2. Weekly glance</strong>
            <p>
              Check only the flowers and hardy plants. That is enough to steer
              behaviour without turning life into admin cosplay.
            </p>
          </div>
          <div className="rail-card">
            <strong>3. Gentle correction</strong>
            <p>
              Warning is not failure. It just means top up the roots, trim the
              flowers, and move on like a grown-up with better metaphors.
            </p>
          </div>
        </section>

        <div className="groups">
          {groupedPots.map((group) => (
            <section key={group.title} className="group-card">
              <div className="group-head">
                <h2>{group.title}</h2>
                <span>{group.pots.length} pots</span>
              </div>

              <div className="group-grid">
                {group.pots.map((pot) => {
                  const state = getPlantState(pot);
                  const remaining = getRemaining(pot);
                  const weeklyGuide = getWeeklyGuide(pot);
                  const remainingPercent = getRemainingPercent(pot);
                  const overdrawn = remaining < 0;
                  const hasQueuedTreeChange =
                    pot.plantType === "tree" && Boolean(pendingTreeChanges[pot.id]);

                  return (
                    <article key={pot.id} className="pot-card">
                      <div className="pot-top">
                        <div className="pot-title-block">
                          <strong>{pot.name}</strong>
                          <div className="pot-badge-row">
                            <span className={`plant-badge ${pot.plantType}`}>
                              {getPlantLabel(pot.plantType)}
                            </span>
                            <span className={`editability-badge ${pot.plantType}`}>
                              {getEditabilityLabel(pot.plantType)}
                            </span>
                          </div>
                        </div>
                        <span className="pot-amount">{formatCurrency(pot.allocated)}</span>
                      </div>

                      <p className="pot-description">{pot.description}</p>

                      {hasQueuedTreeChange && (
                        <p className="queued-note">
                          A tree edit is queued and will apply on the next payday cycle.
                        </p>
                      )}

                      <div className="pot-hero">
                        <PlantVisual plantType={pot.plantType} state={state} />

                        <div className="pot-status">
                          <div className={`status-pill ${state}`}>
                            {state === "thriving" && "Thriving"}
                            {state === "warning" && "Needs attention"}
                            {state === "critical" &&
                              (pot.plantType === "hardy"
                                ? "Below safe floor"
                                : "Wilting")}
                          </div>

                          <div className={`remaining-big ${overdrawn ? "overdrawn" : ""}`}>
                            {formatCurrency(remaining)}
                          </div>
                          <div className="remaining-label">left in pot</div>
                        </div>
                      </div>

                      <div className="pot-body">
                        <div className="meta-row">
                          <span>Allocated</span>
                          <span>{formatCurrency(pot.allocated)}</span>
                        </div>
                        <div className="meta-row">
                          <span>Spent</span>
                          <span>{formatCurrency(pot.spent)}</span>
                        </div>
                        <div className="meta-row">
                          <span>Remaining</span>
                          <span>{formatCurrency(remaining)}</span>
                        </div>
                        {weeklyGuide !== null && (
                          <div className="meta-row">
                            <span>Weekly guide</span>
                            <span>{formatCurrency(weeklyGuide)}</span>
                          </div>
                        )}
                        {pot.protectedThreshold !== undefined && (
                          <div className="meta-row">
                            <span>Safe floor</span>
                            <span>{formatCurrency(pot.protectedThreshold)}</span>
                          </div>
                        )}
                        {pot.protectedThreshold !== undefined &&
                          remaining < pot.protectedThreshold && (
                            <p className="threshold-warning">
                              This hardy pot is below its protected floor. Feed
                              this before you let the pretty flowers get cheeky.
                            </p>
                          )}
                      </div>

                      <div className="progress-section">
                        <div className="progress-label-row">
                          <span>Pot fullness</span>
                          <span>{Math.round(remainingPercent)}%</span>
                        </div>
                        <div className="progress-track">
                          <div
                            className={`bar ${state}`}
                            style={{ width: `${remainingPercent}%` }}
                          />
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
