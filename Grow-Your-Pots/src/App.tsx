import { useEffect, useMemo, useState } from "react";

type PlantType = "flower" | "tree" | "hardy";
type PlantState = "thriving" | "warning" | "critical";
type SalaryMode = "drought" | "steady" | "growth";

type PotTemplate = {
  name: string;
  group: string;
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

type PersistedState = {
  salary: number;
  spentByPot: Record<string, number>;
};

const STORAGE_KEY = "grow-your-pots-greybeard-v1";
const BASELINE_SALARY = 3500;
const DEFAULT_SALARY = 4000;

const POT_TEMPLATES: PotTemplate[] = [
  {
    name: "Bills",
    group: "Survival",
    plantType: "hardy",
    baseAllocation: 1500,
    protectedThreshold: 1500,
    cutRank: 10,
  },
  {
    name: "Debt (Min)",
    group: "Survival",
    plantType: "hardy",
    baseAllocation: 500,
    protectedThreshold: 500,
    cutRank: 9,
  },
  {
    name: "Emergency",
    group: "Stability",
    plantType: "tree",
    baseAllocation: 150,
    overflowWeight: 0.05,
    cutRank: 7,
  },
  {
    name: "Buffer",
    group: "Stability",
    plantType: "hardy",
    baseAllocation: 150,
    protectedThreshold: 75,
    overflowWeight: 0.05,
    cutRank: 6,
  },
  {
    name: "Groceries",
    group: "Living",
    plantType: "hardy",
    baseAllocation: 250,
    protectedThreshold: 125,
    cutRank: 8,
    weeklyGuide: true,
  },
  {
    name: "Eating Out",
    group: "Living",
    plantType: "flower",
    baseAllocation: 150,
    overflowWeight: 0.1,
    cutRank: 2,
    weeklyGuide: true,
  },
  {
    name: "Fun",
    group: "Living",
    plantType: "flower",
    baseAllocation: 200,
    overflowWeight: 0.1,
    cutRank: 3,
    weeklyGuide: true,
  },
  {
    name: "Extra Debt",
    group: "Growth",
    plantType: "tree",
    baseAllocation: 250,
    overflowWeight: 0.3,
    cutRank: 5,
  },
  {
    name: "Savings",
    group: "Growth",
    plantType: "tree",
    baseAllocation: 250,
    overflowWeight: 0.35,
    cutRank: 4,
  },
  {
    name: "Clothing",
    group: "Growth",
    plantType: "flower",
    baseAllocation: 100,
    overflowWeight: 0.05,
    cutRank: 1,
    weeklyGuide: true,
  },
];

const GROUP_ORDER = ["Survival", "Stability", "Living", "Growth"];

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

function getInitialState(): PersistedState {
  if (typeof window === "undefined") {
    return { salary: DEFAULT_SALARY, spentByPot: {} };
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { salary: DEFAULT_SALARY, spentByPot: {} };
    }

    const parsed = JSON.parse(raw) as PersistedState;
    return {
      salary: Number.isFinite(parsed.salary) ? parsed.salary : DEFAULT_SALARY,
      spentByPot: parsed.spentByPot ?? {},
    };
  } catch {
    return { salary: DEFAULT_SALARY, spentByPot: {} };
  }
}

function getSalaryMode(salary: number): SalaryMode {
  if (salary < BASELINE_SALARY) return "drought";
  if (salary > BASELINE_SALARY) return "growth";
  return "steady";
}

function allocateSalary(salary: number, spentByPot: Record<string, number>): Pot[] {
  const pots: Pot[] = POT_TEMPLATES.map((template) => ({
    ...template,
    allocated: template.baseAllocation,
    spent: roundMoney(spentByPot[template.name] ?? 0),
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
    const savingsPot = pots.find((pot) => pot.name === "Savings") ?? pots[pots.length - 1];
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
  const [salary, setSalary] = useState<number>(initialState.salary);
  const [pots, setPots] = useState<Pot[]>(() =>
    allocateSalary(initialState.salary, initialState.spentByPot)
  );
  const [selectedPot, setSelectedPot] = useState<string>("");
  const [amount, setAmount] = useState<string>("");

  useEffect(() => {
    setPots((previousPots) => {
      const spentByPot = Object.fromEntries(
        previousPots.map((pot) => [pot.name, pot.spent])
      );
      return allocateSalary(salary, spentByPot);
    });
  }, [salary]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const spentByPot = Object.fromEntries(
      pots.map((pot) => [pot.name, roundMoney(pot.spent)])
    );

    const snapshot: PersistedState = {
      salary,
      spentByPot,
    };

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  }, [salary, pots]);

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

  function handleSpend() {
    const parsedAmount = Number(amount);

    if (!selectedPot || !Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      return;
    }

    setPots((previousPots) =>
      previousPots.map((pot) =>
        pot.name === selectedPot
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

  return (
    <div className="app-shell">
      <div className="app">
        <header className="hero-card">
          <div>
            <p className="eyebrow">ADHD money scaffolding</p>
            <h1>Grow Your Pots 🌱</h1>
            <p className="subtitle">
              Salary is the trigger. The engine braces for a £3,500 month,
              routes surplus automatically, and cuts flowers first when the sky
              forgets to rain.
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
                <span>Salary landed</span>
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
                Change the salary to simulate an automatic payday event. In a
                real bank-connected version, this would run without your
                interaction.
              </p>
            </div>

            <div className="salary-controls">
              <label className="field">
                <span>Salary received</span>
                <input
                  type="number"
                  min="0"
                  step="50"
                  value={salary}
                  onChange={(event) => setSalary(Number(event.target.value) || 0)}
                />
              </label>

              <div className="preset-buttons">
                {[3500, 4000, 4500].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    className="ghost-button"
                    onClick={() => setSalary(preset)}
                  >
                    {formatCurrency(preset)}
                  </button>
                ))}
              </div>
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
            </div>
          </div>

          <div className="panel-block">
            <div className="panel-heading">
              <h2>Log spending</h2>
              <p>
                Spend reduces the health of a single pot. The rest of the garden
                stays locked unless salary changes.
              </p>
            </div>

            <div className="spend-controls">
              <select
                value={selectedPot}
                onChange={(event) => setSelectedPot(event.target.value)}
              >
                <option value="">Select pot</option>
                {pots.map((pot) => (
                  <option key={pot.name} value={pot.name}>
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
              <button type="button" className="ghost-button" onClick={handleResetSpends}>
                Reset cycle
              </button>
            </div>
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

                  return (
                    <article key={pot.name} className="pot-card">
                      <div className="pot-top">
                        <div className="pot-title-block">
                          <strong>{pot.name}</strong>
                          <span className={`plant-badge ${pot.plantType}`}>
                            {getPlantLabel(pot.plantType)}
                          </span>
                        </div>
                        <span className="pot-amount">{formatCurrency(pot.allocated)}</span>
                      </div>

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
