import { members, loans, transactions } from "./coop";
import type { Member, Loan, Transaction } from "./coop";

// Deterministically pick a "demo member" for the signed-in user so the
// portal feels populated until real per-user persistence ships in v2.
function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function memberForUser(userId: string): Member {
  return members[hash(userId) % members.length];
}

export function loansForUser(userId: string): Loan[] {
  const m = memberForUser(userId);
  const own = loans.filter((l) => l.memberId === m.id);
  if (own.length) return own;
  // Synthesize a sample loan so the page always has content
  return [
    {
      id: `L${9000 + (hash(userId) % 99)}`,
      memberId: m.id,
      amount: 120_000,
      tenureMonths: 12,
      rate: 12,
      purpose: "Business expansion",
      status: "Disbursed",
      appliedAt: new Date(Date.now() - 60 * 86400000).toISOString(),
      emi: 10_660,
      paid: 31_980,
    },
  ];
}

export function transactionsForUser(userId: string): Transaction[] {
  const m = memberForUser(userId);
  return transactions.filter((t) => t.memberId === m.id);
}
