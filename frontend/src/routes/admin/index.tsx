import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Area, AreaChart, CartesianGrid, Cell, Legend, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import {
  Users, Wallet, Banknote, AlertTriangle, TrendingUp, ArrowUpRight, Loader2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fmt } from "@/lib/coop";

export const Route = createFileRoute("/admin/")({
  head: () => ({ meta: [{ title: "Dashboard · CoopX" }] }),
  component: Dashboard,
});

type LoanRow = { id: string; member_id: string; amount: number; paid: number; status: string; ml_risk_probability: number | null; applied_at: string };
type TxnRow = { id: string; member_id: string; type: string; amount: number; occurred_at: string };
type ProfileRow = { id: string; full_name: string; status: string };

async function fetchDashboard() {
  const [{ data: loans }, { data: txns }, { data: profiles }] = await Promise.all([
    supabase.from("loans").select("id, member_id, amount, paid, status, ml_risk_probability, applied_at"),
    supabase.from("savings_transactions").select("id, member_id, type, amount, occurred_at").order("occurred_at", { ascending: false }),
    supabase.from("profiles").select("id, full_name, status"),
  ]);
  return {
    loans: (loans ?? []) as LoanRow[],
    txns: (txns ?? []) as TxnRow[],
    profiles: (profiles ?? []) as ProfileRow[],
  };
}

function monthKey(d: Date) {
  return d.toLocaleString(undefined, { month: "short", year: "2-digit" });
}

function Dashboard() {
  const { data, isLoading } = useQuery({ queryKey: ["admin-dashboard"], queryFn: fetchDashboard });

  if (isLoading || !data) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  const { loans, txns, profiles } = data;
  const activeMembers = profiles.filter((p) => p.status === "Approved").length;
  const pendingMembers = profiles.filter((p) => p.status === "Pending").length;

  const totalSavings = txns.reduce(
    (s, t) => s + (t.type === "Contribution" ? Number(t.amount) : t.type === "Withdrawal" ? -Number(t.amount) : 0),
    0,
  );
  const outstandingLoans = loans
    .filter((l) => l.status === "Disbursed" || l.status === "Overdue")
    .reduce((s, l) => s + (Number(l.amount) - Number(l.paid)), 0);
  const overdueCount = loans.filter((l) => l.status === "Overdue").length;
  const disbursedTotal = loans.filter((l) => l.status === "Disbursed" || l.status === "Repaid" || l.status === "Overdue")
    .reduce((s, l) => s + Number(l.amount), 0);
  const recoveredTotal = loans.reduce((s, l) => s + Number(l.paid), 0);
  const recoveryRate = disbursedTotal > 0 ? (recoveredTotal / disbursedTotal) * 100 : 0;

  // Build 12-month contribution series from transactions
  const now = new Date();
  const months: { month: string; amount: number }[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ month: monthKey(d), amount: 0 });
  }
  txns.filter((t) => t.type === "Contribution").forEach((t) => {
    const d = new Date(t.occurred_at);
    const idx = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
    if (idx >= 0 && idx < 12) months[11 - idx].amount += Number(t.amount);
  });

  // Simple 3-month linear forecast
  const xs = months.map((_, i) => i);
  const ys = months.map((m) => m.amount);
  const meanX = xs.reduce((a, b) => a + b, 0) / xs.length;
  const meanY = ys.reduce((a, b) => a + b, 0) / ys.length;
  const num = xs.reduce((s, x, i) => s + (x - meanX) * (ys[i] - meanY), 0);
  const den = xs.reduce((s, x) => s + (x - meanX) ** 2, 0) || 1;
  const slope = num / den;
  const intercept = meanY - slope * meanX;
  const series = [
    ...months.map((m) => ({ month: m.month, actual: m.amount, forecast: null as number | null })),
    ...Array.from({ length: 3 }, (_, k) => {
      const d = new Date(now.getFullYear(), now.getMonth() + k + 1, 1);
      return { month: monthKey(d), actual: null as number | null, forecast: Math.max(0, intercept + slope * (12 + k)) };
    }),
  ];

  const loanStatus = ["Pending", "Approved", "Disbursed", "Overdue", "Repaid"].map((s) => ({
    name: s, value: loans.filter((l) => l.status === s).length,
  }));
  const PIE = ["oklch(0.7 0.15 80)", "oklch(0.65 0.16 155)", "oklch(0.52 0.13 160)", "oklch(0.58 0.22 27)", "oklch(0.45 0.05 160)"];

  const profileById = new Map(profiles.map((p) => [p.id, p]));
  const atRisk = loans
    .filter((l) => (l.status === "Disbursed" || l.status === "Pending") && l.ml_risk_probability != null)
    .sort((a, b) => (b.ml_risk_probability ?? 0) - (a.ml_risk_probability ?? 0))
    .slice(0, 5);

  const stats = [
    { label: "Active members", value: activeMembers, icon: Users, sub: `${pendingMembers} pending` },
    { label: "Total savings", value: fmt(totalSavings), icon: Wallet, sub: `${txns.length} transactions` },
    { label: "Outstanding loans", value: fmt(outstandingLoans), icon: Banknote, sub: `${loans.length} on record` },
    { label: "Overdue loans", value: overdueCount, icon: AlertTriangle, sub: `${recoveryRate.toFixed(1)}% recovered`, tone: "warn" as const },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Society overview</h1>
          <p className="text-sm text-muted-foreground">Live data from members, savings and the loan portfolio.</p>
        </div>
        <Badge variant="secondary" className="gap-1">
          <TrendingUp className="h-3 w-3" /> Real-time
        </Badge>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardContent className="pt-6">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">{s.label}</p>
                  <p className="mt-2 text-2xl font-semibold">{s.value}</p>
                </div>
                <div className={"grid h-9 w-9 place-items-center rounded-lg " + (s.tone === "warn" ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary")}>
                  <s.icon className="h-4 w-4" />
                </div>
              </div>
              <p className="mt-3 inline-flex items-center gap-1 text-xs text-muted-foreground">
                <ArrowUpRight className="h-3 w-3" /> {s.sub}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Contribution trend</CardTitle>
            <CardDescription>12 months of contributions plus a 3-month linear projection.</CardDescription>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series}>
                <defs>
                  <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="oklch(0.52 0.13 160)" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="oklch(0.52 0.13 160)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.92 0.015 155)" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v: number) => fmt(v)} />
                <Area type="monotone" dataKey="actual" stroke="oklch(0.52 0.13 160)" fill="url(#g1)" strokeWidth={2} />
                <Area type="monotone" dataKey="forecast" stroke="oklch(0.65 0.16 155)" fill="none" strokeDasharray="5 5" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Loan portfolio</CardTitle>
            <CardDescription>Distribution by status.</CardDescription>
          </CardHeader>
          <CardContent className="h-72">
            {loans.length === 0 ? (
              <p className="text-sm text-muted-foreground">No loan activity yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={loanStatus} dataKey="value" nameKey="name" innerRadius={50} outerRadius={85} paddingAngle={3}>
                    {loanStatus.map((_, i) => <Cell key={i} fill={PIE[i]} />)}
                  </Pie>
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>High-risk loans</CardTitle>
          <CardDescription>Top open loans ranked by ML default probability.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {atRisk.length === 0 && <p className="text-sm text-muted-foreground">No risk signals yet.</p>}
          {atRisk.map((l) => {
            const p = profileById.get(l.member_id);
            const prob = (l.ml_risk_probability ?? 0) * 100;
            return (
              <div key={l.id} className="flex items-center gap-3">
                <div className="grid h-9 w-9 place-items-center rounded-full bg-accent text-sm font-medium">
                  {(p?.full_name ?? "?").split(" ").map((s) => s[0]).join("").slice(0, 2)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{p?.full_name ?? "Unknown member"}</p>
                  <p className="text-xs text-muted-foreground">{fmt(Number(l.amount))} · {l.status}</p>
                </div>
                <div className="w-40">
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div className="h-full bg-destructive" style={{ width: `${prob}%` }} />
                  </div>
                  <p className="mt-1 text-right text-xs text-muted-foreground">{prob.toFixed(0)}%</p>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
