import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Loader2 } from "lucide-react";
import { fmt } from "@/lib/coop";
import { listAllProfiles, listAllTransactions } from "@/lib/db";

export const Route = createFileRoute("/admin/savings")({
  head: () => ({ meta: [{ title: "Savings · CoopX" }] }),
  component: SavingsPage,
});

function SavingsPage() {
  const profilesQ = useQuery({ queryKey: ["admin-profiles"], queryFn: listAllProfiles });
  const txnsQ = useQuery({ queryKey: ["admin-txns"], queryFn: listAllTransactions });

  const nameMap = useMemo(() => {
    const m = new Map<string, string>();
    (profilesQ.data ?? []).forEach((p) => m.set(p.id, p.full_name));
    return m;
  }, [profilesQ.data]);

  const { total, thisMonth, monthly, recent } = useMemo(() => {
    const txns = txnsQ.data ?? [];
    const now = new Date();
    const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    let totalSavings = 0;
    let monthInflow = 0;

    const buckets: Record<string, number> = {};
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = d.toLocaleString("en", { month: "short", year: "2-digit" });
      buckets[key] = 0;
    }

    txns.forEach((t) => {
      const amt = Number(t.amount);
      if (t.type === "Contribution") {
        totalSavings += amt;
        const d = new Date(t.occurred_at);
        const mk = d.toLocaleString("en", { month: "short", year: "2-digit" });
        if (mk in buckets) buckets[mk] += amt;
        const cmk = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        if (cmk === currentMonthKey) monthInflow += amt;
      } else if (t.type === "Withdrawal") {
        totalSavings -= amt;
      }
    });

    const monthlySeries = Object.entries(buckets).map(([month, amount]) => ({ month, amount }));
    const recentTxns = txns.slice(0, 12);

    return { total: totalSavings, thisMonth: monthInflow, monthly: monthlySeries, recent: recentTxns };
  }, [txnsQ.data]);

  const memberCount = (profilesQ.data ?? []).length;
  const avgPerMember = memberCount > 0 ? Math.round(total / memberCount) : 0;

  const isLoading = profilesQ.isLoading || txnsQ.isLoading;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Savings & contributions</h1>
        <p className="text-sm text-muted-foreground">Pooled deposits, monthly inflows, recent activity.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs uppercase text-muted-foreground">Total pooled savings</p>
            <p className="mt-2 text-2xl font-semibold">{fmt(total)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs uppercase text-muted-foreground">This month inflow</p>
            <p className="mt-2 text-2xl font-semibold">{fmt(thisMonth)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs uppercase text-muted-foreground">Avg per member</p>
            <p className="mt-2 text-2xl font-semibold">{fmt(avgPerMember)}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Monthly contributions</CardTitle>
          <CardDescription>Last 12 months of aggregate inflows.</CardDescription>
        </CardHeader>
        <CardContent className="h-72">
          {isLoading ? (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthly}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.92 0.015 155)" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={(v) => `${(v / 1_000_000).toFixed(1)}M`} tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v: number) => fmt(v)} />
                <Bar dataKey="amount" fill="oklch(0.52 0.13 160)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent transactions</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Member</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Loading…</TableCell></TableRow>
              )}
              {recent.length === 0 && !isLoading && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No transactions yet.</TableCell></TableRow>
              )}
              {recent.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-mono text-xs">{String(t.id).slice(0, 8)}</TableCell>
                  <TableCell className="text-sm">{nameMap.get(t.member_id) ?? t.member_id.slice(0, 8)}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{t.type}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(t.occurred_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(Number(t.amount))}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
