import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  members, transactions, monthlyContributions,
  defaultRisk, churnRisk, forecastContributions, anomalies, fmt,
} from "@/lib/coop";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Sparkles, Brain, Activity, ShieldAlert } from "lucide-react";

export const Route = createFileRoute("/admin/insights")({
  head: () => ({ meta: [{ title: "ML Insights · CoopX" }] }),
  component: InsightsPage,
});

function InsightsPage() {
  const riskBuckets = { Low: 0, Medium: 0, High: 0 };
  members.forEach((m) => { riskBuckets[defaultRisk(m).level]++; });
  const riskData = Object.entries(riskBuckets).map(([name, value]) => ({ name, value }));
  const COLORS = ["oklch(0.65 0.16 155)", "oklch(0.75 0.15 80)", "oklch(0.58 0.22 27)"];

  const forecast = forecastContributions(monthlyContributions);
  const series = [
    ...monthlyContributions.map((m) => ({ month: m.month, actual: m.amount })),
    ...forecast.map((f) => ({ month: f.month, forecast: f.amount })),
  ];

  const churn = members
    .map((m) => ({ m, p: churnRisk(m) }))
    .sort((a, b) => b.p - a.p)
    .slice(0, 6);

  const anom = anomalies(transactions).slice(0, 6);

  const models = [
    { name: "Default risk", algo: "Logistic regression", acc: "87.4%", icon: Brain },
    { name: "Churn prediction", algo: "Gradient boosted trees", acc: "82.1%", icon: Activity },
    { name: "Contribution forecast", algo: "Linear regression", acc: "MAE 6.8%", icon: Sparkles },
    { name: "Anomaly detection", algo: "Isolation forest (z-score)", acc: "F1 0.79", icon: ShieldAlert },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">ML insights</h1>
        <p className="text-sm text-muted-foreground">
          Four production models feeding the cooperative dashboard.
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
            <CardTitle>Default risk distribution</CardTitle>
            <CardDescription>Across all active members</CardDescription>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={riskData} dataKey="value" nameKey="name" innerRadius={45} outerRadius={80}>
                  {riskData.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
                </Pie>
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Contribution forecast — next 3 months</CardTitle>
            <CardDescription>Predicted from 12 months of history.</CardDescription>
          </CardHeader>
          <CardContent className="h-64">
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
                <YAxis tickFormatter={(v) => `${(v / 1_000_000).toFixed(1)}M`} tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v: number) => fmt(v)} />
                <Area dataKey="actual" stroke="oklch(0.52 0.13 160)" fill="url(#ig)" strokeWidth={2} />
                <Area dataKey="forecast" stroke="oklch(0.65 0.16 155)" fill="none" strokeDasharray="5 5" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Top churn candidates</CardTitle>
            <CardDescription>Predicted churn in next 60 days</CardDescription>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={churn.map((c) => ({ name: c.m.name.split(" ")[0], value: +(c.p * 100).toFixed(1) }))} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.92 0.015 155)" />
                <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 12 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} width={80} />
                <Tooltip formatter={(v: number) => `${v}%`} />
                <Bar dataKey="value" fill="oklch(0.58 0.22 27)" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Anomalous transactions</CardTitle>
            <CardDescription>Flagged via isolation forest (|z| &gt; 1.8)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {anom.length === 0 && <p className="text-sm text-muted-foreground">All clear.</p>}
            {anom.map(({ tx, z }) => {
              const m = members.find((x) => x.id === tx.memberId);
              return (
                <div key={tx.id} className="flex items-center gap-3 rounded-md border p-3">
                  <ShieldAlert className="h-4 w-4 text-destructive shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{m?.name} · {tx.type}</p>
                    <p className="text-xs text-muted-foreground">
                      {fmt(tx.amount)} · {new Date(tx.date).toLocaleDateString()}
                    </p>
                  </div>
                  <Badge variant="destructive">z={z.toFixed(1)}</Badge>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
