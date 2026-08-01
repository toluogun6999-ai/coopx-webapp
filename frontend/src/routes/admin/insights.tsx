import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { forecastContributions, fmt } from "@/lib/coop";
import { listAllLoans, listAllTransactions } from "@/lib/db";
import { api } from "@/integrations/django/client";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Sparkles, Brain, Activity, ShieldAlert, Loader2 } from "lucide-react";

export const Route = createFileRoute("/admin/insights")({
  head: () => ({ meta: [{ title: "ML Insights · CoopX" }] }),
  component: InsightsPage,
});

interface RiskRow {
  member_id: string;
  member_name: string;
  risk_level: "Low" | "Medium" | "High";
  shortfall_probability?: number;
  attrition_probability?: number;
  recommendation: string;
}
interface AnomalyRow {
  transaction_id: string;
  member_id: string;
  member_name: string;
  transaction_type: string;
  amount: number;
  date: string;
  anomaly_score: number;
}
interface ExtendedMetrics {
  shortfall: { accuracy: number; f1_score: number };
  attrition: { accuracy: number; f1_score: number };
}
interface LoanModelMetrics {
  trained: boolean;
  accuracy?: number;
  f1_score?: number;
}

async function fetchJson<T>(path: string): Promise<T> {
  const { data, error } = await api.request<T>(path);
  if (error) throw new Error(error.message);
  return data as T;
}

function InsightsPage() {
  const loansQ = useQuery({ queryKey: ["admin-loans"], queryFn: listAllLoans });
  const txnsQ = useQuery({ queryKey: ["admin-txns"], queryFn: listAllTransactions });
  const shortfallQ = useQuery({ queryKey: ["ml-shortfall"], queryFn: () => fetchJson<RiskRow[]>("/ml/shortfall/") });
  const attritionQ = useQuery({ queryKey: ["ml-attrition"], queryFn: () => fetchJson<RiskRow[]>("/ml/attrition/") });
  const anomaliesQ = useQuery({ queryKey: ["ml-anomalies"], queryFn: () => fetchJson<AnomalyRow[]>("/ml/anomalies/") });
  const extMetricsQ = useQuery({ queryKey: ["ml-extended-metrics"], queryFn: () => fetchJson<ExtendedMetrics>("/ml/extended-metrics/") });
  const loanMetricsQ = useQuery({ queryKey: ["ml-loan-metrics"], queryFn: () => fetchJson<LoanModelMetrics>("/ml/metrics/") });

  const loans = loansQ.data ?? [];
  const txns = txnsQ.data ?? [];

  // ── Real loan-default risk distribution (from actual scored loans) ──
  const riskBuckets = { Low: 0, Medium: 0, High: 0 };
  loans.forEach((l) => {
    if (l.ml_risk_level && l.ml_risk_level in riskBuckets) {
      riskBuckets[l.ml_risk_level as keyof typeof riskBuckets]++;
    }
  });
  const riskData = Object.entries(riskBuckets).map(([name, value]) => ({ name, value }));
  const COLORS = ["oklch(0.65 0.16 155)", "oklch(0.75 0.15 80)", "oklch(0.58 0.22 27)"];

  // ── Real contribution forecast (built from real transaction history,
  //    fed into the same linear-regression forecaster) ──
  const now = new Date();
  const months: { month: string; amount: number }[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ month: d.toLocaleString("en", { month: "short" }), amount: 0 });
  }
  txns.filter((t) => t.type === "Contribution").forEach((t) => {
    const d = new Date(t.occurred_at);
    const idx = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
    if (idx >= 0 && idx < 12) months[11 - idx].amount += Number(t.amount);
  });
  const forecast = forecastContributions(months);
  const series = [
    ...months.map((m) => ({ month: m.month, actual: m.amount })),
    ...forecast.map((f) => ({ month: f.month, forecast: f.amount })),
  ];

  const topShortfall = (shortfallQ.data ?? []).slice(0, 6);
  const topAttrition = (attritionQ.data ?? []).slice(0, 6);
  const anomalies = (anomaliesQ.data ?? []).slice(0, 6);

  const models = [
    {
      name: "Loan default risk", algo: "Random Forest", icon: Brain,
      acc: loanMetricsQ.data?.trained ? `${loanMetricsQ.data.accuracy}%` : "…",
    },
    {
      name: "Contribution shortfall", algo: "Random Forest", icon: Sparkles,
      acc: extMetricsQ.data ? `${extMetricsQ.data.shortfall.accuracy}%` : "…",
    },
    {
      name: "Member attrition", algo: "Random Forest", icon: Activity,
      acc: extMetricsQ.data ? `${extMetricsQ.data.attrition.accuracy}%` : "…",
    },
    {
      name: "Anomaly detection", algo: "Isolation Forest", icon: ShieldAlert,
      acc: anomaliesQ.data ? `${anomaliesQ.data.length} flagged` : "…",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">ML insights</h1>
        <p className="text-sm text-muted-foreground">
          Four models scoring real member and transaction data — loan default risk, contribution
          shortfall, member attrition, and transaction anomalies.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {models.map((m) => (
          <Card key={m.name}>
            <CardContent className="pt-6">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs uppercase text-muted-foreground">{m.name}</p>
                  <p className="mt-2 text-lg font-semibold">{m.acc}</p>
                  <p className="text-xs text-muted-foreground mt-1">{m.algo}</p>
                </div>
                <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-primary">
                  <m.icon className="h-4 w-4" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Loan default risk distribution</CardTitle>
            <CardDescription>Across all scored loan applications</CardDescription>
          </CardHeader>
          <CardContent className="h-64">
            {loansQ.isLoading ? (
              <div className="grid h-full place-items-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={riskData} dataKey="value" nameKey="name" innerRadius={45} outerRadius={80}>
                    {riskData.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
                  </Pie>
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Contribution forecast — next 3 months</CardTitle>
            <CardDescription>Linear regression over 12 months of real contribution history.</CardDescription>
          </CardHeader>
          <CardContent className="h-64">
            {txnsQ.isLoading ? (
              <div className="grid h-full place-items-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={series}>
                  <defs>
                    <linearGradient id="ig" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="oklch(0.52 0.13 160)" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="oklch(0.52 0.13 160)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.92 0.015 155)" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(v: number) => fmt(v)} />
                  <Area dataKey="actual" stroke="oklch(0.52 0.13 160)" fill="url(#ig)" strokeWidth={2} />
                  <Area dataKey="forecast" stroke="oklch(0.65 0.16 155)" fill="none" strokeDasharray="5 5" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Contribution shortfall risk</CardTitle>
            <CardDescription>Members most likely to miss their next contribution</CardDescription>
          </CardHeader>
          <CardContent className="h-72">
            {shortfallQ.isLoading ? (
              <div className="grid h-full place-items-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={topShortfall.map((r) => ({ name: r.member_name.split(" ")[0], value: r.shortfall_probability }))}
                  layout="vertical"
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.92 0.015 155)" />
                  <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 12 }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} width={80} />
                  <Tooltip formatter={(v: number) => `${v}%`} />
                  <Bar dataKey="value" fill="oklch(0.75 0.15 80)" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Member attrition risk</CardTitle>
            <CardDescription>Members showing signs of disengagement</CardDescription>
          </CardHeader>
          <CardContent className="h-72">
            {attritionQ.isLoading ? (
              <div className="grid h-full place-items-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={topAttrition.map((r) => ({ name: r.member_name.split(" ")[0], value: r.attrition_probability }))}
                  layout="vertical"
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.92 0.015 155)" />
                  <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 12 }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} width={80} />
                  <Tooltip formatter={(v: number) => `${v}%`} />
                  <Bar dataKey="value" fill="oklch(0.58 0.22 27)" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Anomalous transactions</CardTitle>
          <CardDescription>Flagged via Isolation Forest, fit per-member on real transaction amounts</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {anomaliesQ.isLoading && (
            <div className="flex justify-center py-6 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
          )}
          {!anomaliesQ.isLoading && anomalies.length === 0 && (
            <p className="text-sm text-muted-foreground">No anomalies detected.</p>
          )}
          {anomalies.map((a) => (
            <div key={a.transaction_id} className="flex items-center gap-3 rounded-md border p-3">
              <ShieldAlert className="h-4 w-4 text-destructive shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{a.member_name} · {a.transaction_type}</p>
                <p className="text-xs text-muted-foreground">
                  {fmt(a.amount)} · {new Date(a.date).toLocaleDateString()}
                </p>
              </div>
              <Badge variant="destructive">score={a.anomaly_score}</Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
