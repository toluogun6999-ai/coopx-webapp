// Synthetic data + lightweight ML utilities for the Cooperative Society MS.
// Predictions are deterministic, transparent functions so the UI looks real.

export type RiskLevel = "Low" | "Medium" | "High";

export interface Member {
  id: string;
  name: string;
  email: string;
  phone: string;
  joinDate: string; // ISO
  age: number;
  income: number;
  savings: number;
  loanBalance: number;
  contributionsLast6m: number[]; // monthly amounts
  missedPayments: number;
  pastLoans: number;
  pastDefaults: number;
  status: "Active" | "Inactive" | "Pending";
}

export interface Loan {
  id: string;
  memberId: string;
  amount: number;
  tenureMonths: number;
  rate: number; // annual %
  purpose: string;
  status: "Pending" | "Approved" | "Disbursed" | "Repaid" | "Overdue";
  appliedAt: string;
  emi: number;
  paid: number;
}

export interface Transaction {
  id: string;
  memberId: string;
  type: "Contribution" | "Withdrawal" | "Loan Disbursement" | "Loan Repayment";
  amount: number;
  date: string;
}

const FIRST = ["Adaeze", "Chinedu", "Ngozi", "Tunde", "Aisha", "Kwame", "Fatima", "Emeka", "Bola", "Yaw", "Zainab", "Ifeoma", "Sade", "Olumide", "Hauwa", "Kunle", "Amaka", "Femi", "Halima", "Ebuka", "Maryam", "Obi", "Funke", "Lola"];
const LAST = ["Okafor", "Adebayo", "Mensah", "Bello", "Okonkwo", "Diallo", "Eze", "Nwosu", "Afolabi", "Sanni", "Owusu", "Balogun", "Chukwu", "Onyeka", "Adeyemi", "Ibrahim"];
const PURPOSES = ["School fees", "Business expansion", "Medical", "Home repair", "Agriculture", "Wedding", "Equipment"];

function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

const rng = seeded(42);
const pick = <T,>(arr: T[]) => arr[Math.floor(rng() * arr.length)];
const rint = (a: number, b: number) => Math.floor(rng() * (b - a + 1)) + a;

export const members: Member[] = Array.from({ length: 48 }).map((_, i) => {
  const id = `M${String(1001 + i)}`;
  const base = rint(2000, 18000);
  const contributionsLast6m = Array.from({ length: 6 }).map(() =>
    rng() < 0.12 ? 0 : base + rint(-800, 1200)
  );
  const missed = contributionsLast6m.filter((v) => v === 0).length;
  const pastLoans = rint(0, 5);
  const pastDefaults = pastLoans > 0 && rng() < 0.18 ? rint(1, Math.max(1, Math.floor(pastLoans / 2))) : 0;
  const savings = base * rint(8, 40);
  const loanBalance = rng() < 0.55 ? rint(20000, 400000) : 0;
  const joinYears = rint(1, 8);
  return {
    id,
    name: `${pick(FIRST)} ${pick(LAST)}`,
    email: `member${1001 + i}@coopx.org`,
    phone: `+234 80${rint(10000000, 99999999)}`,
    joinDate: new Date(Date.now() - joinYears * 365 * 86400000).toISOString(),
    age: rint(22, 62),
    income: rint(60000, 480000),
    savings,
    loanBalance,
    contributionsLast6m,
    missedPayments: missed,
    pastLoans,
    pastDefaults,
    status: rng() < 0.06 ? "Inactive" : rng() < 0.06 ? "Pending" : "Active",
  };
});

export const loans: Loan[] = members
  .filter((m) => m.loanBalance > 0 || rng() < 0.15)
  .slice(0, 22)
  .map((m, i) => {
    const amount = m.loanBalance || rint(30000, 250000);
    const tenure = pick([6, 12, 18, 24, 36]);
    const rate = 12;
    const r = rate / 100 / 12;
    const emi = (amount * r * Math.pow(1 + r, tenure)) / (Math.pow(1 + r, tenure) - 1);
    const status: Loan["status"] = pick(["Pending", "Approved", "Disbursed", "Disbursed", "Overdue", "Repaid"]);
    return {
      id: `L${2001 + i}`,
      memberId: m.id,
      amount,
      tenureMonths: tenure,
      rate,
      purpose: pick(PURPOSES),
      status,
      appliedAt: new Date(Date.now() - rint(5, 240) * 86400000).toISOString(),
      emi: Math.round(emi * 100) / 100,
      paid: Math.round(emi * rint(0, tenure - 1) * 100) / 100,
    };
  });

// 12 months of aggregate contributions
export const monthlyContributions = Array.from({ length: 12 }).map((_, i) => {
  const month = new Date();
  month.setMonth(month.getMonth() - (11 - i));
  const base = 1_850_000 + i * 60_000;
  const noise = Math.sin(i / 2) * 120_000 + (rng() - 0.5) * 90_000;
  return {
    month: month.toLocaleString("en", { month: "short" }),
    amount: Math.round(base + noise),
  };
});

export const transactions: Transaction[] = Array.from({ length: 60 }).map((_, i) => {
  const m = pick(members);
  const type = pick(["Contribution", "Contribution", "Contribution", "Loan Repayment", "Withdrawal", "Loan Disbursement"]) as Transaction["type"];
  return {
    id: `T${5000 + i}`,
    memberId: m.id,
    type,
    amount: type === "Loan Disbursement" ? rint(40000, 250000) : rint(2000, 30000),
    date: new Date(Date.now() - rint(0, 90) * 86400000).toISOString(),
  };
});

// ---------- ML-style utilities ----------

/** Logistic-style default risk score (0-1) + level + top contributing factors. */
export function defaultRisk(m: Member, loanAmount?: number) {
  const amount = loanAmount ?? m.loanBalance ?? 50_000;
  const dti = amount / Math.max(1, m.income * 12);
  const missedRate = m.missedPayments / 6;
  const defaultRate = m.pastLoans ? m.pastDefaults / m.pastLoans : 0;
  const savingsRatio = m.savings / Math.max(1, amount);
  const tenureYears =
    (Date.now() - new Date(m.joinDate).getTime()) / (365 * 86400000);

  // Weighted log-odds — mimics trained logistic regression coefficients.
  const z =
    -2.4 +
    2.1 * dti +
    2.8 * missedRate +
    3.2 * defaultRate -
    0.8 * Math.min(savingsRatio, 3) -
    0.15 * tenureYears;
  const p = 1 / (1 + Math.exp(-z));
  const level: RiskLevel = p < 0.25 ? "Low" : p < 0.55 ? "Medium" : "High";

  const factors = [
    { name: "Debt / income", weight: 2.1 * dti },
    { name: "Missed contributions", weight: 2.8 * missedRate },
    { name: "Past default rate", weight: 3.2 * defaultRate },
    { name: "Savings cushion", weight: -0.8 * Math.min(savingsRatio, 3) },
    { name: "Tenure in society", weight: -0.15 * tenureYears },
  ]
    .map((f) => ({ ...f, impact: Math.abs(f.weight) }))
    .sort((a, b) => b.impact - a.impact);

  return { probability: p, level, factors };
}

/** Churn probability from inactivity + missed contributions + savings trend. */
export function churnRisk(m: Member) {
  const missedRate = m.missedPayments / 6;
  const last = m.contributionsLast6m.slice(-3).reduce((a, b) => a + b, 0);
  const first = m.contributionsLast6m.slice(0, 3).reduce((a, b) => a + b, 0);
  const trend = (first - last) / Math.max(1, first); // positive => declining
  const inactive = m.status === "Inactive" ? 1 : 0;
  const z = -2.0 + 3.0 * missedRate + 2.2 * Math.max(0, trend) + 2.5 * inactive;
  const p = 1 / (1 + Math.exp(-z));
  return p;
}

/** 3-month contribution forecast using linear regression on history. */
export function forecastContributions(history: { month: string; amount: number }[], horizon = 3) {
  const n = history.length;
  const xs = history.map((_, i) => i);
  const ys = history.map((h) => h.amount);
  const xMean = xs.reduce((a, b) => a + b, 0) / n;
  const yMean = ys.reduce((a, b) => a + b, 0) / n;
  const slope =
    xs.reduce((s, x, i) => s + (x - xMean) * (ys[i] - yMean), 0) /
    xs.reduce((s, x) => s + (x - xMean) ** 2, 0);
  const intercept = yMean - slope * xMean;
  const last = new Date();
  return Array.from({ length: horizon }).map((_, i) => {
    const idx = n + i;
    const d = new Date(last);
    d.setMonth(d.getMonth() + i + 1);
    return {
      month: d.toLocaleString("en", { month: "short" }),
      amount: Math.round(intercept + slope * idx),
      forecast: true as const,
    };
  });
}

/** Isolation-style anomaly: flag amounts far from member's historical mean. */
export function anomalies(txs: Transaction[]) {
  const byMember = new Map<string, number[]>();
  txs.forEach((t) => {
    if (!byMember.has(t.memberId)) byMember.set(t.memberId, []);
    byMember.get(t.memberId)!.push(t.amount);
  });
  const stats = new Map<string, { mean: number; sd: number }>();
  byMember.forEach((arr, id) => {
    const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
    const sd = Math.sqrt(arr.reduce((s, v) => s + (v - mean) ** 2, 0) / arr.length) || 1;
    stats.set(id, { mean, sd });
  });
  return txs
    .map((t) => {
      const s = stats.get(t.memberId)!;
      const z = (t.amount - s.mean) / s.sd;
      return { tx: t, z };
    })
    .filter((r) => Math.abs(r.z) > 1.8)
    .sort((a, b) => Math.abs(b.z) - Math.abs(a.z));
}

export const fmt = (n: number) =>
  "₦" + n.toLocaleString("en-NG", { maximumFractionDigits: 0 });
