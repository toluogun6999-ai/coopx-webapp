import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, FileText, FileSpreadsheet } from "lucide-react";
import { fmt } from "@/lib/coop";
import { toast } from "sonner";
import { listAllProfiles, listAllLoans, listAllTransactions } from "@/lib/db";
import { api } from "@/integrations/django/client";

export const Route = createFileRoute("/admin/reports")({
  head: () => ({ meta: [{ title: "Reports · CoopX" }] }),
  component: ReportsPage,
});

function downloadCsv(filename: string, rows: (string | number)[][]) {
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  toast.success(`Exported ${filename}`);
}

async function downloadFromApi(path: string, fallbackFilename: string) {
  const token = api.getToken();
  const res = await fetch(`${api.API_BASE}${path}`, {
    headers: token ? { Authorization: `Token ${token}` } : {},
  });
  if (!res.ok) {
    toast.error("Export failed");
    return;
  }
  const disposition = res.headers.get("Content-Disposition") ?? "";
  const match = disposition.match(/filename="?([^"]+)"?/);
  const filename = match?.[1] ?? fallbackFilename;
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  toast.success(`Exported ${filename}`);
}

function ReportsPage() {
  const profilesQ = useQuery({ queryKey: ["admin-profiles"], queryFn: listAllProfiles });
  const loansQ = useQuery({ queryKey: ["admin-loans"], queryFn: listAllLoans });
  const txnsQ = useQuery({ queryKey: ["admin-txns"], queryFn: listAllTransactions });

  const profiles = profilesQ.data ?? [];
  const loans = loansQ.data ?? [];
  const txns = txnsQ.data ?? [];

  const nameMap = useMemo(() => {
    const m = new Map<string, string>();
    profiles.forEach((p) => m.set(p.id, p.full_name));
    return m;
  }, [profiles]);

  const savingsMap = useMemo(() => {
    const m = new Map<string, number>();
    txns.forEach((t) => {
      const prev = m.get(t.member_id) ?? 0;
      if (t.type === "Contribution") m.set(t.member_id, prev + Number(t.amount));
      else if (t.type === "Withdrawal") m.set(t.member_id, prev - Number(t.amount));
    });
    return m;
  }, [txns]);

  const loanBalanceMap = useMemo(() => {
    const m = new Map<string, number>();
    loans.forEach((l) => {
      if (l.status === "Disbursed" || l.status === "Overdue") {
        const prev = m.get(l.member_id) ?? 0;
        m.set(l.member_id, prev + (Number(l.amount) - Number(l.paid)));
      }
    });
    return m;
  }, [loans]);

  const totalSavings = Array.from(savingsMap.values()).reduce((a, b) => a + b, 0);
  const disbursedTotal = loans
    .filter((l) => l.status === "Disbursed" || l.status === "Overdue" || l.status === "Repaid")
    .reduce((s, l) => s + Number(l.amount), 0);

  const reports = [
    {
      title: "Member register",
      description: "All registered members with savings and loan balances.",
      icon: FileText,
      onDownload: () =>
        downloadCsv("members.csv", [
          ["Member code", "Name", "Phone", "Status", "Savings", "Loan balance"],
          ...profiles.map((p) => [
            p.member_code ?? p.id.slice(0, 8),
            p.full_name,
            p.phone ?? "",
            p.status,
            savingsMap.get(p.id) ?? 0,
            loanBalanceMap.get(p.id) ?? 0,
          ]),
        ]),
    },
    {
      title: "Loan ledger",
      description: "All loans with amount, tenure, EMI and status.",
      icon: FileSpreadsheet,
      onDownload: () =>
        downloadCsv("loans.csv", [
          ["ID", "Member", "Amount", "Tenure", "EMI", "Status", "Purpose"],
          ...loans.map((l) => [
            l.id,
            nameMap.get(l.member_id) ?? l.member_id,
            l.amount,
            l.tenure_months,
            l.emi,
            l.status,
            l.purpose,
          ]),
        ]),
    },
    {
      title: "Transaction history",
      description: "All contributions, withdrawals and repayments.",
      icon: FileSpreadsheet,
      onDownload: () =>
        downloadCsv("transactions.csv", [
          ["ID", "Member", "Type", "Date", "Amount"],
          ...txns.map((t) => [
            t.id,
            nameMap.get(t.member_id) ?? t.member_id,
            t.type,
            new Date(t.occurred_at).toLocaleDateString(),
            t.amount,
          ]),
        ]),
    },
    {
      title: "Financial report (Excel)",
      description: "Summary, transactions and loan ledger in one formatted workbook.",
      icon: FileSpreadsheet,
      onDownload: () => downloadFromApi("/exports/financial-report/", "financial-report.xlsx"),
    },
    {
      title: "Member register (Excel)",
      description: "Every member's identity, contact, status, role, and savings balance.",
      icon: FileSpreadsheet,
      onDownload: () => downloadFromApi("/exports/member-register/", "member-register.xlsx"),
    },
    {
      title: "Savings ledger (Excel)",
      description: "Every deposit, withdrawal and dividend across all members.",
      icon: FileSpreadsheet,
      onDownload: () => downloadFromApi("/exports/savings-ledger/", "savings-ledger.xlsx"),
    },
    {
      title: "Loan ledger (Excel)",
      description: "Every loan application with status, risk score, and outstanding balance.",
      icon: FileSpreadsheet,
      onDownload: () => downloadFromApi("/exports/loan-ledger/", "loan-ledger.xlsx"),
    },
  ];

  const isLoading = profilesQ.isLoading || loansQ.isLoading || txnsQ.isLoading;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
        <p className="text-sm text-muted-foreground">
          Export operational data for audit and AGM reporting.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {reports.map((r) => (
          <Card key={r.title}>
            <CardHeader>
              <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary">
                <r.icon className="h-5 w-5" />
              </div>
              <CardTitle className="mt-2 text-base">{r.title}</CardTitle>
              <CardDescription>{r.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={r.onDownload} size="sm" className="gap-2" disabled={isLoading}>
                <Download className="h-4 w-4" /> Download
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Society snapshot</CardTitle>
          <CardDescription>Generated {new Date().toLocaleDateString()}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Members</p>
            <p className="text-lg font-semibold">{profiles.length}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Total savings</p>
            <p className="text-lg font-semibold">{fmt(totalSavings)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Loans disbursed</p>
            <p className="text-lg font-semibold">{fmt(disbursedTotal)}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
