import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Sparkles, Loader2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { defaultRisk, fmt } from "@/lib/coop";
import {
  computeEmi, listMyLoans, listMyTransactions, memberAggregate,
  profileToMember, submitLoanApplication,
} from "@/lib/db";
import { LoanWorkflowStepper } from "@/components/LoanWorkflowStepper";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export const Route = createFileRoute("/portal/loans")({
  head: () => ({ meta: [{ title: "My Loans · CoopX" }] }),
  component: LoansPage,
});

const PURPOSES = ["School fees", "Business expansion", "Medical", "Home repair", "Agriculture", "Wedding"];

function LoansPage() {
  const { user, profile } = useAuth();
  const userId = user!.id;
  const qc = useQueryClient();

  const [amount, setAmount] = useState(100_000);
  const [tenure, setTenure] = useState(12);
  const [purpose, setPurpose] = useState(PURPOSES[0]);

  const loansQ = useQuery({ queryKey: ["my-loans", userId], queryFn: () => listMyLoans(userId) });
  const aggQ = useQuery({ queryKey: ["my-agg", userId], queryFn: () => memberAggregate(userId) });
  const txQ = useQuery({ queryKey: ["my-txns", userId], queryFn: () => listMyTransactions(userId) });

  const member = useMemo(() => {
    if (!profile || !aggQ.data || !txQ.data) return null;
    return profileToMember(profile as never, aggQ.data, txQ.data);
  }, [profile, aggQ.data, txQ.data]);

  const risk = useMemo(() => (member ? defaultRisk(member, amount) : null), [member, amount]);
  const emi = computeEmi(amount, tenure);

  const submit = useMutation({
    mutationFn: () =>
      submitLoanApplication({ userId, amount, tenureMonths: tenure, purpose, member: member! }),
    onSuccess: () => {
      toast.success("Loan application submitted for review");
      qc.invalidateQueries({ queryKey: ["my-loans", userId] });
      qc.invalidateQueries({ queryKey: ["notifications", userId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (amount < 5_000 || amount > 2_000_000) {
      toast.error("Loan amount must be between ₦5,000 and ₦2,000,000");
      return;
    }
    if (!member || !risk) {
      toast.error("Loading your member data, try again in a moment");
      return;
    }
    if (risk.level === "High") {
      toast.error("Application flagged High Risk — increase contributions first.");
      return;
    }
    submit.mutate();
  };

  const accountBlocked = profile && profile.status !== "Approved";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">My loans</h1>
        <p className="text-sm text-muted-foreground">Apply for a loan and track repayments.</p>
      </div>

      {accountBlocked && (
        <Alert variant={profile?.status === "Pending" ? "default" : "destructive"}>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Account {profile?.status}</AlertTitle>
          <AlertDescription>
            {profile?.status === "Pending"
              ? "Your membership is awaiting admin approval. You can browse but cannot apply for loans yet."
              : `Your account is ${profile?.status}. ${profile?.suspension_reason ?? "Contact the cooperative office."}`}
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>New loan application</CardTitle>
            <CardDescription>Get an instant ML-scored eligibility decision before submitting.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="amount">Amount (₦)</Label>
                <Input id="amount" type="number" min={5000} max={2_000_000} step={1000}
                  value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tenure">Tenure</Label>
                <Select value={String(tenure)} onValueChange={(v) => setTenure(Number(v))}>
                  <SelectTrigger id="tenure"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[6, 12, 18, 24, 36].map((t) => (
                      <SelectItem key={t} value={String(t)}>{t} months</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="purpose">Purpose</Label>
                <Select value={purpose} onValueChange={setPurpose}>
                  <SelectTrigger id="purpose"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PURPOSES.map((p) => (<SelectItem key={p} value={p}>{p}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div className="rounded-lg border bg-muted/40 p-3 text-sm sm:col-span-2">
                <p className="flex justify-between">
                  <span className="text-muted-foreground">Monthly EMI</span>
                  <span className="font-medium">{fmt(emi)}</span>
                </p>
                <p className="mt-1 flex justify-between">
                  <span className="text-muted-foreground">Annual rate</span>
                  <span className="font-medium">12%</span>
                </p>
              </div>
              <Button type="submit" className="sm:col-span-2" disabled={submit.isPending || !member || !!accountBlocked}>
                {submit.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Submit application
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" /> ML eligibility
            </CardTitle>
            <CardDescription>Live default-risk score for this application.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!risk ? (
              <p className="text-sm text-muted-foreground">Calculating…</p>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">Default probability</p>
                  <Badge variant={risk.level === "Low" ? "secondary" : risk.level === "High" ? "destructive" : "outline"}>
                    {risk.level} · {(risk.probability * 100).toFixed(0)}%
                  </Badge>
                </div>
                <Progress value={risk.probability * 100} />
                <div className="space-y-2">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Top factors</p>
                  {risk.factors.slice(0, 4).map((f) => (
                    <div key={f.name}>
                      <div className="flex justify-between text-xs">
                        <span>{f.name}</span>
                        <span className={f.weight < 0 ? "text-primary" : "text-destructive"}>
                          {f.weight > 0 ? "+" : ""}{f.weight.toFixed(2)}
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 rounded-full bg-muted overflow-hidden">
                        <div className={f.weight < 0 ? "h-full bg-primary" : "h-full bg-destructive"}
                          style={{ width: `${Math.min(100, f.impact * 30)}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Loan history</CardTitle>
          <CardDescription>Live workflow status for each application.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loansQ.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {loansQ.data?.length === 0 && (
            <p className="text-sm text-muted-foreground">No applications yet. Submit one above to get started.</p>
          )}
          {loansQ.data?.map((l) => (
            <div key={l.id} className="rounded-lg border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">{l.purpose} · {fmt(Number(l.amount))}</p>
                  <p className="text-xs text-muted-foreground">
                    Applied {new Date(l.applied_at).toLocaleDateString()} · EMI {fmt(Number(l.emi))} × {l.tenure_months}m
                  </p>
                </div>
                <Badge variant={
                  l.status === "Rejected" || l.status === "Overdue" ? "destructive"
                    : l.status === "Pending" ? "outline" : "secondary"
                }>{l.status}</Badge>
              </div>
              <div className="mt-3">
                <LoanWorkflowStepper status={l.status} />
              </div>
              {(l.status === "Disbursed" || l.status === "Repaid" || l.status === "Overdue") && (
                <div className="mt-3">
                  <div className="flex justify-between text-xs text-muted-foreground mb-1">
                    <span>Repayment progress</span>
                    <span>{fmt(Number(l.paid))} / {fmt(Number(l.amount))}</span>
                  </div>
                  <Progress value={(Number(l.paid) / Number(l.amount)) * 100} className="h-1.5" />
                </div>
              )}
              {l.admin_note && (
                <p className="mt-3 text-xs text-muted-foreground italic">Admin note: {l.admin_note}</p>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
