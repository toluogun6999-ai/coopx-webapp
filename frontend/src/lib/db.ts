// Real-data access helpers for the cooperative tables.
// All queries respect RLS (members see own data; admins see everything).
import { supabase } from "@/integrations/supabase/client";
import { api } from "@/integrations/django/client";
import { defaultRisk } from "@/lib/coop";
import type { Member } from "@/lib/coop";
import type { MemberStatus } from "@/lib/auth";

export type LoanRow = {
  id: string;
  member_id: string;
  amount: number;
  tenure_months: number;
  rate: number;
  emi: number;
  purpose: string;
  status: "Pending" | "Approved" | "Rejected" | "Disbursed" | "Repaid" | "Overdue";
  ml_risk_probability: number | null;
  ml_risk_level: string | null;
  ml_factors: { name: string; weight: number; impact: number }[] | null;
  admin_note: string | null;
  paid: number;
  applied_at: string;
  decided_at: string | null;
};

export type TxnRow = {
  id: string;
  member_id: string;
  type: "Contribution" | "Withdrawal" | "Loan Disbursement" | "Loan Repayment";
  amount: number;
  note: string | null;
  occurred_at: string;
};

export type NotificationRow = {
  id: string;
  user_id: string;
  title: string;
  body: string | null;
  type: "info" | "success" | "warning" | "error";
  read: boolean;
  created_at: string;
};

export type ProfileRow = {
  id: string;
  full_name: string;
  phone: string | null;
  member_code: string | null;
  joined_at: string;
  status: MemberStatus;
  verified_email: boolean;
  verified_phone: boolean;
  suspension_reason: string | null;
  role: "member" | "admin" | "treasurer" | "secretary" | "auditor";
  is_admin: boolean;
};

export type AnnouncementRow = {
  id: string;
  title: string;
  body: string;
  priority: "normal" | "urgent" | "success";
  created_by: string | null;
  created_at: string;
};

export type AuditRow = {
  id: string;
  actor_id: string | null;
  actor_name: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
};

// ---------- Loans ----------

export async function listMyLoans(_userId: string) {
  // The backend already scopes /api/loans/ to "my own loans" for non-admin
  // callers — a client-side .eq("member_id", userId) filter here would
  // compare the Member's string code (e.g. "CSC-0009") against the Django
  // User's numeric id, which never match and silently zeroed this out.
  const { data, error } = await supabase
    .from("loans").select("*")
    .order("applied_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as LoanRow[];
}

export async function listAllLoans() {
  const { data, error } = await supabase
    .from("loans").select("*").order("applied_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as LoanRow[];
}

export function computeEmi(amount: number, tenureMonths: number, annualRatePct = 12) {
  const r = annualRatePct / 100 / 12;
  return (amount * r * Math.pow(1 + r, tenureMonths)) / (Math.pow(1 + r, tenureMonths) - 1);
}

export async function submitLoanApplication(input: {
  userId: string;
  amount: number;
  tenureMonths: number;
  purpose: string;
  member: Member;
}) {
  const emi = computeEmi(input.amount, input.tenureMonths);
  const risk = defaultRisk(input.member, input.amount);
  const { data, error } = await supabase
    .from("loans")
    .insert({
      member_id: input.userId,
      amount: input.amount,
      tenure_months: input.tenureMonths,
      rate: 12,
      emi,
      purpose: input.purpose,
      ml_risk_probability: Number(risk.probability.toFixed(4)),
      ml_risk_level: risk.level,
      ml_factors: risk.factors,
    });
  if (error) throw error;
  return data as LoanRow;
}

export async function decideLoan(
  loanId: string,
  status: "Approved" | "Rejected" | "Disbursed",
  note?: string,
) {
  const { data: userRes } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("loans")
    .eq("id", loanId)
    .update({
      status,
      admin_note: note ?? null,
      decided_by: userRes.user?.id ?? null,
      decided_at: new Date().toISOString(),
    });
  if (error) throw error;
}

// ---------- Savings transactions ----------

export async function listMyTransactions(_userId: string) {
  // Same reasoning as listMyLoans: the backend already scopes /api/savings/
  // to the caller's own records for non-admins; a client-side member_id
  // filter here compared the wrong ID field and always returned empty.
  const { data, error } = await supabase
    .from("savings_transactions").select("*")
    .order("occurred_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as TxnRow[];
}

export async function addContribution(userId: string, amount: number, note?: string) {
  const { error } = await supabase.from("savings_transactions").insert({
    member_id: userId, type: "Contribution", amount, note: note ?? null,
  });
  if (error) throw error;
}

export async function listAllTransactions() {
  const { data, error } = await supabase
    .from("savings_transactions").select("*")
    .order("occurred_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as TxnRow[];
}

// ---------- Notifications ----------

export async function listMyNotifications(userId: string) {
  const { data, error } = await supabase
    .from("notifications").select("*").eq("user_id", userId)
    .order("created_at", { ascending: false }).limit(50);
  if (error) throw error;
  return (data ?? []) as NotificationRow[];
}

export async function markAllRead(userId: string) {
  // Backend scopes this to the authenticated user's own unread notifications.
  const { error } = await supabase.from("notifications").update({ read: true });
  if (error) throw error;
}

// ---------- Members / profiles ----------

export async function listAllProfiles() {
  const { data, error } = await supabase
    .from("profiles").select("*").order("joined_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as ProfileRow[];
}

export async function updateMemberStatus(
  memberId: string,
  status: MemberStatus,
  reason?: string,
) {
  const { error } = await supabase
    .from("profiles")
    .eq("id", memberId)
    .update({ status, suspension_reason: reason ?? null });
  if (error) throw error;
}

export async function updateMemberRole(memberId: string, role: string) {
  const { error } = await api.request(`/profiles/${memberId}/role/`, {
    method: "PATCH",
    body: JSON.stringify({ role }),
  });
  if (error) throw new Error(error.message);
}

export async function memberAggregate(_userId: string) {
  // Same reasoning as listMyLoans/listMyTransactions above — the backend
  // already scopes both endpoints to the caller's own records.
  const [{ data: txns }, { data: loans }] = await Promise.all([
    supabase.from("savings_transactions").select("type, amount"),
    supabase.from("loans").select("amount, paid, status"),
  ]);
  const savings = (txns ?? []).reduce((s, t: { type: string; amount: number }) => {
    if (t.type === "Contribution") return s + Number(t.amount);
    if (t.type === "Withdrawal") return s - Number(t.amount);
    return s;
  }, 0);
  const loanBalance = (loans ?? [])
    .filter((l: { status: string }) => l.status === "Disbursed" || l.status === "Overdue")
    .reduce((s, l: { amount: number; paid: number }) => s + (Number(l.amount) - Number(l.paid)), 0);
  return { savings, loanBalance };
}

export function profileToMember(
  p: ProfileRow, agg: { savings: number; loanBalance: number }, txns: TxnRow[],
): Member {
  const buckets: number[] = Array(6).fill(0);
  const now = new Date();
  txns.filter((t) => t.type === "Contribution").forEach((t) => {
    const d = new Date(t.occurred_at);
    const months = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
    if (months >= 0 && months < 6) buckets[5 - months] += Number(t.amount);
  });
  const missedPayments = buckets.filter((v) => v === 0).length;
  return {
    id: p.member_code ?? p.id.slice(0, 6),
    name: p.full_name, email: "", phone: p.phone ?? "",
    joinDate: p.joined_at, age: 35, income: 240_000,
    savings: agg.savings, loanBalance: agg.loanBalance,
    contributionsLast6m: buckets, missedPayments,
    pastLoans: 0, pastDefaults: 0, status: "Active",
  };
}

// ---------- Announcements ----------

export async function listAnnouncements() {
  const { data, error } = await supabase
    .from("announcements").select("*").order("created_at", { ascending: false }).limit(50);
  if (error) throw error;
  return (data ?? []) as AnnouncementRow[];
}

export async function createAnnouncement(input: {
  title: string; body: string; priority: "normal" | "urgent" | "success";
}) {
  const { data: u } = await supabase.auth.getUser();
  const { error } = await supabase.from("announcements").insert({
    title: input.title, body: input.body, priority: input.priority,
    created_by: u.user?.id ?? null,
  });
  if (error) throw error;
}

// ---------- Audit logs ----------

export async function listAuditLogs(limit = 100) {
  const { data, error } = await supabase
    .from("audit_logs").select("*").order("created_at", { ascending: false }).limit(limit);
  if (error) throw error;
  return (data ?? []) as AuditRow[];
}

export async function recordAudit(action: string, entity: string, entityId?: string, details?: Record<string, unknown>) {
  // Audit logging now happens automatically on the Django backend whenever a
  // loan/savings/repayment action is processed (see the Transaction model).
  // This client-side call is a no-op kept for backward compatibility.
  void action; void entity; void entityId; void details;
  return;
}
