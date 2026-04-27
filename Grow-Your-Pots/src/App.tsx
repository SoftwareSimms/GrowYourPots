import { useMemo, useState } from "react";

type PlantType = "flower" | "tree" | "hardy";
type PlantState = "thriving" | "warning" | "critical";

type Pot = {
  name: string;
  monthly: number;
  spent: number;
  plantType: PlantType;
  group: string;
  threshold?: number;
};

const initialPots: Pot[] = [
  // Survival / essentials
  {
    name: "Bills",
    monthly: 1500,
    spent: 0,
    plantType: "hardy",
    group: "Survival",
    threshold: 1500,
  },
  {
    name: "Debt (Min)",
    monthly: 500,
    spent: 0,
    plantType: "hardy",
    group: "Survival",
    threshold: 500,
  },

  // Stability
  {
    name: "Emergency",
    monthly: 150,
    spent: 0,
    plantType: "tree",
    group: "Stability",
  },
  {
    name: "Buffer",
    monthly: 150,
    spent: 0,
    plantType: "hardy",
    group: "Stability",
    threshold: 75,
  },

  // Living
  {
    name: "Groceries",
    monthly: 250,
    spent: 0,
    plantType: "hardy",
    group: "Living",
    threshold: 125,
  },
  {
    name: "Eating Out",
    monthly: 200,
    spent: 0,
    plantType: "flower",
    group: "Living",
  },
  {
    name: "Fun",
    monthly: 250,
    spent: 0,
    plantType: "flower",
    group: "Living",
  },

  // Growth
  {
    name: "Extra Debt",
    monthly: 400,
    spent: 0,
    plantType: "tree",
    group: "Growth",
  },
  {
    name: "Savings",
    monthly: 450,
    spent: 0,
    plantType: "tree",
    group: "Growth",
  },
  {
    name: "Clothing",
    monthly: 150,
    spent: 0,
    plantType: "flower",
    group: "Growth",
  },
];

const groupOrder = ["Survival", "Stability", "Living", "Growth"];

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(value);

function getRemaining(pot: Pot) {
  return pot.monthly - pot.spent;
}

function getRemainingPercent(pot: Pot) {
  if (pot.monthly <= 0) return 0;
  return Math.max(0, Math.min((getRemaining(pot) / pot.monthly) * 100, 100));
}

function getPlantState(pot: Pot): PlantState {
  const remaining = getRemaining(pot);
  const remainingPercent = getRemainingPercent(pot);

  if (pot.plantType === "hardy" && pot.threshold !== undefined) {
    if (remaining >= pot.threshold) return "thriving";
    if (remaining >= pot.threshold * 0.65) return "warning";
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
  const [pots, setPots] = useState<Pot[]>(initialPots);
  const [selectedPot, setSelectedPot] = useState("");
  const [amount, setAmount] = useState("");

  const totalAllocated = useMemo(
    () => pots.reduce((sum, pot) => sum + pot.monthly, 0),
    [pots]
  );

  const totalSpent = useMemo(
    () => pots.reduce((sum, pot) => sum + pot.spent, 0),
    [pots]
  );

  const totalRemaining = totalAllocated - totalSpent;

  const groupedPots = groupOrder.map((group) => ({
    title: group,
    pots: pots.filter((pot) => pot.group === group),
  }));

  const handleSpend = () => {
    const parsedAmount = Number(amount);

    if (!selectedPot || !Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      return;
    }

    setPots((prev) =>
      prev.map((pot) =>
        pot.name === selectedPot
          ? { ...pot, spent: pot.spent + parsedAmount }
          : pot
      )
    );

    setAmount("");
  };

  return (
    <div className="app-shell">
      <div className="app">
        <header className="header">
          <div>
            <p className="eyebrow">Budget tracker</p>
            <h1>Grow Your Pots 🌱</h1>
            <p className="subtitle">
              Fun pots bloom as flowers, investment pots grow as trees, and bill
              pots become hardy plants that must be kept alive above their safe
              floor.
            </p>
          </div>

          <div className="summary-card">
            <div>
              <span>Allocated</span>
              <strong>{formatCurrency(totalAllocated)}</strong>
            </div>
            <div>
              <span>Spent</span>
              <strong>{formatCurrency(totalSpent)}</strong>
            </div>
            <div>
              <span>Remaining</span>
              <strong>{formatCurrency(totalRemaining)}</strong>
            </div>
          </div>
        </header>

        <section className="input-section">
          <h2>Log spending</h2>

          <div className="controls">
            <select
              value={selectedPot}
              onChange={(e) => setSelectedPot(e.target.value)}
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
              onChange={(e) => setAmount(e.target.value)}
            />

            <button type="button" onClick={handleSpend}>
              Log spend
            </button>
          </div>
        </section>

        <div className="groups">
          {groupedPots.map((group) => (
            <section key={group.title} className="group">
              <h2>{group.title}</h2>

              <div className="group-grid">
                {group.pots.map((pot) => {
                  const remaining = getRemaining(pot);
                  const state = getPlantState(pot);
                  const remainingPercent = getRemainingPercent(pot);
                  const weeklyGuide =
                    pot.plantType === "flower" || pot.name === "Groceries"
                      ? Math.round(pot.monthly / 4)
                      : null;

                  return (
                    <article key={pot.name} className="pot">
                      <div className="pot-top">
                        <div className="pot-title-block">
                          <strong>{pot.name}</strong>
                          <span className={`plant-badge ${pot.plantType}`}>
                            {getPlantLabel(pot.plantType)}
                          </span>
                        </div>
                        <span className="pot-amount">
                          {formatCurrency(pot.monthly)}
                        </span>
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

                          <div className="remaining-big">
                            {formatCurrency(remaining)}
                          </div>
                          <div className="remaining-label">left in pot</div>
                        </div>
                      </div>

                      <div className="pot-body">
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

                        {pot.threshold !== undefined && (
                          <div className="meta-row">
                            <span>Safe floor</span>
                            <span>{formatCurrency(pot.threshold)}</span>
                          </div>
                        )}

                        {pot.threshold !== undefined && remaining < pot.threshold && (
                          <p className="threshold-warning">
                            This pot is below its safe floor — top it back up soon.
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