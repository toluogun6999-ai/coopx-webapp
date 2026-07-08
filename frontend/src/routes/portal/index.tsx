import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Wallet, Banknote, TrendingUp, ArrowRight } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { defaultRisk, fmt } from "@/lib/coop";
import { listMyLoans, listMyTransactions, memberAggregate, profileToMember } from "@/lib/db";

export const Route = createFileRoute("/portal/")({
  head: () => ({ meta: [{ title: "My CoopX" }] }),
  component: PortalHome,
});

function PortalHome() {
  const { user, profile } = useAuth();
  const userId = user!.id;

  const loansQ = useQuery({ queryKey: ["my-loans", userId], queryFn: () => listMyLoans(userId) });
  const aggQ = useQuery({ queryKey: ["my-agg", userId], queryFn: () => memberAggregate(userId) });
  const txQ = useQuery({ queryKey: ["my-txns", userId], queryFn: () => listMyTransactions(userId) });

  const member = useMemo(() => {
    if (!profile || !aggQ.data || !txQ.data) return null;
    return profileToMember(profile as never, aggQ.data, txQ.data);
  }, [profile, aggQ.data, txQ.data]);

  const activeLoan = loansQ.data?.find((l) => l.status === "Disbursed" || l.status === "Approved" || l.status === "Overdue");
  const risk = member ? defaultRisk(member, activeLoan ? Number(activeLoan.amount) : undefined) : null;

  const series = (() => {
    const buckets: Record<string, number> = {};
    const labels: string[] = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = d.toLocaleString("en", { month: "short" });
      labels.push(key); buckets[key] = 0;
    }
    (txQ.data ?? []).forEach((t) => {
      if (t.type !== "Contribution") return;
      const key = new Date(t.occurred_at).toLocaleString("en", { month: "short" });
      if (key in buckets) buckets[key] += Number(t.amount);
    });
    return labels.map((m) => ({ month: m, amount: buckets[m] }));
  })();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Welcome, {profile?.full_name?.split(" ")[0] ?? "Member"}
        </h1>
        <p className="text-sm text-muted-foreground">Your contributions, loans and eligibility at a glance.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card><CardContent className="pt-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Savings balance</p>
              {aggQ.isLoading ? (
                <Skeleton className="mt-2 h-8 w-28" />
              ) : (
                <p className="mt-2 text-2xl font-semibold">{fmt(aggQ.data?.savings ?? 0)}</p>
              )}
            </div>
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-primary">
              <Wallet className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Member since {profile ? new Date(profile.joined_at).getFullYear() : "—"}
          </p>
        </CardContent></Card>

        <Card><CardContent className="pt-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Active loan</p>
              {loansQ.isLoading ? (
                <Skeleton className="mt-2 h-8 w-28" />
              ) : (
                <p className="mt-2 text-2xl font-semibold">
                  {activeLoan ? fmt(Number(activeLoan.amount) - Number(activeLoan.paid)) : "—"}
                </p>
              )}
            </div>
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-primary">
              <Banknote className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            {activeLoan ? `EMI ${fmt(Number(activeLoan.emi))} · ${activeLoan.tenure_months} mo` : "No outstanding loan"}
          </p>
        </CardContent></Card>

        <Card><CardContent className="pt-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Loan eligibility</p>
              {!member ? (
                <Skeleton className="mt-2 h-8 w-24" />
              ) : (
                <p className="mt-2 text-2xl font-semibold capitalize">
                  {!risk ? "—" : risk.level === "Low" ? "Eligible" : risk.level === "Medium" ? "Review" : "Limited"}
                </p>
              )}
            </div>
            {risk && (
              <Badge variant={risk.level === "Low" ? "secondary" : risk.level === "High" ? "destructive" : "outline"} className="gap-1">
                <TrendingUp className="h-3 w-3" /> {risk.level} risk
              </Badge>
            )}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">ML-scored from your savings & repayment history</p>
        </CardContent></Card>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Your contributions</CardTitle>
            <CardDescription>Last 6 months</CardDescription>
          </div>
          <Button asChild size="sm" variant="outline">
            <Link to="/portal/savings">Details <ArrowRight className="ml-1 h-4 w-4" /></Link>
          </Button>
        </CardHeader>
        <CardContent className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={series}>
              <defs>
                <linearGradient id="pg" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="oklch(0.52 0.13 160)" stopOpacity={0.55} />
                  <stop offset="100%" stopColor="oklch(0.52 0.13 160)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.92 0.015 155)" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 12 }} />
              <Tooltip formatter={(v: number) => fmt(v)} />
              <Area type="monotone" dataKey="amount" stroke="oklch(0.52 0.13 160)" fill="url(#pg)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Apply for a loan</CardTitle>
            <CardDescription>Get a decision instantly with ML pre-screening.</CardDescription>
          </CardHeader>
          <CardContent><Button asChild><Link to="/portal/loans">Start application</Link></Button></CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Stay in the loop</CardTitle>
            <CardDescription>Reminders for contributions & repayments.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline"><Link to="/portal/notifications">View notifications</Link></Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
