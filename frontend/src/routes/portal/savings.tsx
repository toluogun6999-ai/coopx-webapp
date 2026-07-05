import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { fmt } from "@/lib/coop";
import { addContribution, listMyTransactions, memberAggregate } from "@/lib/db";

export const Route = createFileRoute("/portal/savings")({
  head: () => ({ meta: [{ title: "My Savings · CoopX" }] }),
  component: SavingsPage,
});

function SavingsPage() {
  const { user } = useAuth();
  const userId = user!.id;
  const qc = useQueryClient();

  const txQ = useQuery({ queryKey: ["my-txns", userId], queryFn: () => listMyTransactions(userId) });
  const aggQ = useQuery({ queryKey: ["my-agg", userId], queryFn: () => memberAggregate(userId) });

  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(5000);
  const [note, setNote] = useState("");

  const add = useMutation({
    mutationFn: () => addContribution(userId, amount, note || undefined),
    onSuccess: () => {
      toast.success("Contribution recorded");
      qc.invalidateQueries({ queryKey: ["my-txns", userId] });
      qc.invalidateQueries({ queryKey: ["my-agg", userId] });
      setOpen(false);
      setNote("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const txns = txQ.data ?? [];
  const contributions = txns.filter((t) => t.type === "Contribution" || t.type === "Withdrawal");

  // 6-month bar series
  const series = (() => {
    const buckets: Record<string, number> = {};
    const labels: string[] = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = d.toLocaleString("en", { month: "short" });
      labels.push(key);
      buckets[key] = 0;
    }
    txns.forEach((t) => {
      if (t.type !== "Contribution") return;
      const d = new Date(t.occurred_at);
      const key = d.toLocaleString("en", { month: "short" });
      if (key in buckets) buckets[key] += Number(t.amount);
    });
    return labels.map((m) => ({ month: m, amount: buckets[m] }));
  })();

  const total6m = series.reduce((s, v) => s + v.amount, 0);
  const missed = series.filter((v) => v.amount === 0).length;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">My savings</h1>
          <p className="text-sm text-muted-foreground">Track your contributions and balance over time.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="mr-1 h-4 w-4" /> Add contribution</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add contribution</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="ca">Amount (₦)</Label>
                <Input id="ca" type="number" min={100} value={amount}
                  onChange={(e) => setAmount(Number(e.target.value))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cn">Note (optional)</Label>
                <Input id="cn" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => add.mutate()} disabled={add.isPending || amount <= 0}>
                {add.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Record
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card><CardContent className="pt-6">
          <p className="text-xs uppercase text-muted-foreground">Balance</p>
          <p className="mt-2 text-2xl font-semibold">{fmt(aggQ.data?.savings ?? 0)}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-6">
          <p className="text-xs uppercase text-muted-foreground">Last 6 months</p>
          <p className="mt-2 text-2xl font-semibold">{fmt(total6m)}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-6">
          <p className="text-xs uppercase text-muted-foreground">Missed months</p>
          <p className="mt-2 text-2xl font-semibold">{missed}</p>
        </CardContent></Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Monthly contributions</CardTitle>
          <CardDescription>Past 6 months</CardDescription>
        </CardHeader>
        <CardContent className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={series}>
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.92 0.015 155)" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 12 }} />
              <Tooltip formatter={(v: number) => fmt(v)} />
              <Bar dataKey="amount" fill="oklch(0.52 0.13 160)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Transaction history</CardTitle>
          <CardDescription>Most recent first</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Note</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {contributions.length === 0 && (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">
                  No contributions yet. Click "Add contribution" to record one.
                </TableCell></TableRow>
              )}
              {contributions.map((t) => (
                <TableRow key={t.id}>
                  <TableCell>{new Date(t.occurred_at).toLocaleDateString()}</TableCell>
                  <TableCell>{t.type}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{t.note ?? "—"}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">{fmt(Number(t.amount))}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
