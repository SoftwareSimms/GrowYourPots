import { useState, useEffect } from "react";

type PotType = "tree" | "flower" | "crop" | "debt";

type Pot = {
  id: string;
  name: string;
  type: PotType;
  balance: number;
  weekly: number;
  goal: number;
};

const initialPots: Pot[] = [
  { id: "bills", name: "Bills 🧱", type: "tree", balance: 1500, weekly: 1500, goal: 1500 },
  { id: "debt", name: "Debt Attack 💣", type: "debt", balance: 700, weekly: 700, goal: 2000 },
  { id: "emergency", name: "Emergency 🛟", type: "tree", balance: 250, weekly: 250, goal: 3000 },
  { id: "food", name: "Food System 🥕", type: "crop", balance: 240, weekly: 60, goal: 300 },
  { id: "clothing", name: "Clothing 👕", type: "flower", balance: 100, weekly: 100, goal: 300 },
  { id: "upgrades", name: "Upgrades ⚙️", type: "flower", balance: 100, weekly: 100, goal: 500 },
  { id: "wealth", name: "Wealth 🌳", type: "tree", balance: 150, weekly: 150, goal: 10000 },
  { id: "fun", name: "Fun 🌸", type: "flower", balance: 200, weekly: 200, goal: 300 },
  { id: "fancy", name: "Fancy Cooking 🍝", type: "flower", balance: 150, weekly: 150, goal: 300 },
];

// 🌱 growth logic
function getGrowthStage(pot: Pot): string {
  const ratio = pot.balance / pot.goal;

  if (pot.balance === 0) return "🥀";
  if (ratio < 0.25) return "🌱";
  if (ratio < 0.6) return "🌿";
  if (ratio < 1) return "🌳";
  return "🌲";
}

function getHealthText(pot: Pot): string {
  const ratio = pot.balance / pot.goal;

  if (pot.balance === 0) return "Dead";
  if (ratio < 0.25) return "Struggling";
  if (ratio < 0.6) return "Growing";
  if (ratio < 1) return "Healthy";
  return "Thriving";
}

function App() {
  const [pots, setPots] = useState<Pot[]>(() => {
    const saved = localStorage.getItem("pots");
    return saved ? JSON.parse(saved) : initialPots;
  });

  const [selectedPotId, setSelectedPotId] = useState<string | null>(null);
  const [inputAmount, setInputAmount] = useState<number>(0);

  const selectedPot = pots.find((p) => p.id === selectedPotId) || null;

  // 💾 persist
  useEffect(() => {
    localStorage.setItem("pots", JSON.stringify(pots));
  }, [pots]);

  const spend = (id: string, amount: number) => {
    if (amount <= 0) return;

    setPots((prev) =>
      prev.map((p) =>
        p.id === id
          ? { ...p, balance: Math.max(0, p.balance - amount) }
          : p
      )
    );
  };

  const addMoney = (id: string, amount: number) => {
    if (amount <= 0) return;

    setPots((prev) =>
      prev.map((p) =>
        p.id === id
          ? { ...p, balance: p.balance + amount }
          : p
      )
    );
  };

  return (
    <div style={{ padding: 20 }}>
      <h1>Grow Your Pots 🌱</h1>

      {!selectedPot ? (
        // 🌿 GARDEN VIEW (GRID)
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 15,
          }}
        >
          {pots.map((p) => (
            <div
              key={p.id}
              onClick={() => setSelectedPotId(p.id)}
              style={{
                border: "1px solid #ccc",
                padding: 10,
                cursor: "pointer",
                textAlign: "center",
              }}
            >
              <h2>
                {getGrowthStage(p)} {p.name}
              </h2>
              <p>£{p.balance} / £{p.goal}</p>
              <p>{getHealthText(p)}</p>
            </div>
          ))}
        </div>
      ) : (
        // 🌱 DETAIL VIEW
        <div>
          <button onClick={() => setSelectedPotId(null)}>← Back</button>

          <h2>
            {getGrowthStage(selectedPot)} {selectedPot.name}
          </h2>

          <p>Balance: £{selectedPot.balance}</p>
          <p>Goal: £{selectedPot.goal}</p>
          <p>Status: {getHealthText(selectedPot)}</p>

          <div style={{ marginTop: 20 }}>
            <input
              type="number"
              placeholder="Amount"
              value={inputAmount}
              onChange={(e) => setInputAmount(Number(e.target.value))}
              style={{ marginRight: 10 }}
            />

            <button onClick={() => addMoney(selectedPot.id, inputAmount)}>
              + Add
            </button>

            <button
              onClick={() => spend(selectedPot.id, inputAmount)}
              style={{ marginLeft: 10 }}
            >
              - Spend
            </button>
          </div>

          <div style={{ marginTop: 20 }}>
            <button onClick={() => addMoney(selectedPot.id, 100)}>
              +£100 Income
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;