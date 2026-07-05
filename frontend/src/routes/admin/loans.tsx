import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { BarChart, Bar, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid, Cell } from "recharts";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { fmt } from "@/lib/coop";
import { decideLoan, listAllLoans, listAllProfiles } from "@/lib/db";

export const Route = createFileRoute("/admin/loans")({
  head: () => ({ meta: [{ title: "Loans · CoopX Admin" }] }),
  component: LoansPage,
});

function LoansPage() {
  const qc = useQueryClient();
  const loansQ = useQuery({ queryKey: ["admin-loans"], queryFn: listAllLoans });
  const profilesQ = useQuery({ queryKey: ["admin-profiles"], queryFn: listAllProfiles });

  const nameMap = useMemo(() => {
    const m = new Map<string, string>();
    (profilesQ.data ?? []).forEach((p) => m.set(p.id, p.full_name));
    return m;
  }, [profilesQ.data]);

  const decide = useMutation({
    mutationFn: (args: { id: string; status: "Approved" | "Rejected" | "Disbursed" }) =>
      decideLoan(args.id, args.status),
    onSuccess: (_d, args) => {
      toast.success(`Loan ${args.status.toLowerCase()}`);
      qc.invalidateQueries({ queryKey: ["admin-loans"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const loans = loansQ.data ?? [];
  const pending = loans.filter((l) => l.status === "Pending");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Loans</h1>
        <p className="text-sm text-muted-foreground">
          {pending.length} pending · {loans.length} total · ML default-risk assist
        </p>
      </div>

      {pending.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-3">
          {pending.slice(0, 3).map((l) => {
            const level = l.ml_risk_level ?? "Medium";
            const factors = (l.ml_factors ?? []).slice(0, 4);
            return (
              <Card key={l.id} className="overflow-hidden">
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <CardTitle className="text-base">{nameMap.get(l.member_id) ?? "Member"}</CardTitle>
                      <CardDescription>{l.purpose}</CardDescription>
                    </div>
                    <Badge className={
                      level === "Low" ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-100"
                        : level === "Medium" ? "bg-amber-100 text-amber-800 hover:bg-amber-100"
                          : "bg-red-100 text-red-800 hover:bg-red-100"
                    }>{level} risk</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div><p className="text-xs text-muted-foreground">Amount</p><p className="font-medium">{fmt(Number(l.amount))}</p></div>
                    <div><p className="text-xs text-muted-foreground">Tenure</p><p className="font-medium">{l.tenure_months} months</p></div>
                    <div><p className="text-xs text-muted-foreground">EMI</p><p className="font-medium">{fmt(Number(l.emi))}</p></div>
                    <div><p className="text-xs text-muted-foreground">Default probability</p>
                      <p className="font-medium">{l.ml_risk_probability != null ? (Number(l.ml_risk_probability) * 100).toFixed(1) + "%" : "—"}</p></div>
                  </div>

                  {factors.length > 0 && (
                    <div>
                      <p className="mb-1 text-xs text-muted-foreground">Top risk factors</p>
                      <ResponsiveContainer width="100%" height={120}>
                        <BarChart data={factors} layout="vertical" margin={{ left: 8 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.92 0.015 155)" />
                          <XAxis type="number" hide />
                          <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11 }} />
                          <Tooltip formatter={(v: number) => v.toFixed(2)} />
                          <Bar dataKey="impact" radius={[0, 4, 4, 0]}>
                            {factors.map((f, i) => (
                              <Cell key={i} fill={f.weight > 0 ? "oklch(0.58 0.22 27)" : "oklch(0.52 0.13 160)"} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <Button size="sm" className="flex-1"
                      disabled={decide.isPending}
                      onClick={() => decide.mutate({ id: l.id, status: "Approved" })}>
                      {decide.isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                      Approve
                    </Button>
                    <Button size="sm" variant="outline" className="flex-1"
                      disabled={decide.isPending}
                      onClick={() => decide.mutate({ id: l.id, status: "Rejected" })}>
                      Reject
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>All loan applications</CardTitle>
          <CardDescription>Sorted by date, with EMI and ML risk score.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Applied</TableHead>
                <TableHead>Member</TableHead>
                <TableHead>Purpose</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">EMI</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>ML risk</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loansQ.isLoading && (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">Loading…</TableCell></TableRow>
              )}
              {loans.length === 0 && !loansQ.isLoading && (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">No loan applications yet.</TableCell></TableRow>
              )}
              {loans.map((l) => {
                const level = l.ml_risk_level ?? "—";
                return (
                  <TableRow key={l.id}>
                    <TableCell className="text-xs">{new Date(l.applied_at).toLocaleDateString()}</TableCell>
                    <TableCell className="text-sm">{nameMap.get(l.member_id) ?? "—"}</TableCell>
                    <TableCell className="text-sm">{l.purpose}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(Number(l.amount))}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(Number(l.emi))}</TableCell>
                    <TableCell>
                      <Badge variant={
                        l.status === "Rejected" || l.status === "Overdue" ? "destructive"
                          : l.status === "Pending" ? "outline" : "secondary"
                      }>{l.status}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={
                        level === "Low" ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-100"
                          : level === "Medium" ? "bg-amber-100 text-amber-800 hover:bg-amber-100"
                            : level === "High" ? "bg-red-100 text-red-800 hover:bg-red-100"
                              : "bg-muted text-muted-foreground"
                      }>{level}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {l.status === "Pending" ? (
                        <div className="inline-flex gap-1">
                          <Button size="sm" variant="outline" onClick={() => decide.mutate({ id: l.id, status: "Approved" })}>Approve</Button>
                          <Button size="sm" variant="ghost" onClick={() => decide.mutate({ id: l.id, status: "Rejected" })}>Reject</Button>
                        </div>
                      ) : l.status === "Approved" ? (
                        <Button size="sm" variant="outline" onClick={() => decide.mutate({ id: l.id, status: "Disbursed" })}>Disburse</Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
