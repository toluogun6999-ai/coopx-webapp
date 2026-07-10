import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2, Plus, Landmark, ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { fmt } from "@/lib/coop";
import { api } from "@/integrations/django/client";
import { memberAggregate } from "@/lib/db";

export const Route = createFileRoute("/portal/bank")({
  head: () => ({ meta: [{ title: "Bank & Payments · CoopX" }] }),
  component: BankPage,
});

interface Bank { name: string; code: string }
interface BankAccount {
  id: number; bank_code: string; bank_name: string; account_number: string;
  account_name: string; is_verified: boolean; is_default: boolean;
}
interface ExchangeRate { currency_code: string; currency_name: string; rate_to_ngn: number }

async function listBanks(): Promise<Bank[]> {
  const { data, error } = await api.request<Bank[]>("/banks/");
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function listExchangeRates(): Promise<ExchangeRate[]> {
  const { data, error } = await api.request<ExchangeRate[]>("/exchange-rates/");
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function listAccounts(): Promise<BankAccount[]> {
  const { data, error } = await api.request<BankAccount[]>("/bank-accounts/");
  if (error) throw new Error(error.message);
  return data ?? [];
}

function BankPage() {
  const { user } = useAuth();
  const userId = user!.id;
  const qc = useQueryClient();

  const banksQ = useQuery({ queryKey: ["banks"], queryFn: listBanks });
  const accountsQ = useQuery({ queryKey: ["bank-accounts"], queryFn: listAccounts });
  const aggQ = useQuery({ queryKey: ["my-agg", userId], queryFn: () => memberAggregate(userId) });
  const ratesQ = useQuery({ queryKey: ["exchange-rates"], queryFn: listExchangeRates });

  // ── Link bank account ──
  const [linkOpen, setLinkOpen] = useState(false);
  const [bankCode, setBankCode] = useState("");
  const [accountNumber, setAccountNumber] = useState("");

  const linkAccount = useMutation({
    mutationFn: async () => {
      const bank = banksQ.data?.find((b) => b.code === bankCode);
      const { data, error } = await api.request("/bank-accounts/", {
        method: "POST",
        body: JSON.stringify({ account_number: accountNumber, bank_code: bankCode, bank_name: bank?.name ?? "" }),
      });
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => {
      toast.success("Bank account linked");
      qc.invalidateQueries({ queryKey: ["bank-accounts"] });
      setLinkOpen(false);
      setAccountNumber("");
      setBankCode("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ── Deposit ──
  const [depositOpen, setDepositOpen] = useState(false);
  const [depositAmount, setDepositAmount] = useState(5000);
  const [depositCurrency, setDepositCurrency] = useState("NGN");

  const currencyRate = ratesQ.data?.find((r) => r.currency_code === depositCurrency)?.rate_to_ngn;
  const convertedNgn = depositCurrency === "NGN" ? depositAmount : depositAmount * (currencyRate ?? 0);

  const deposit = useMutation({
    mutationFn: async () => {
      const { data, error } = await api.request<any>("/deposits/initialize/", {
        method: "POST",
        body: JSON.stringify({ amount: depositAmount, currency: depositCurrency }),
      });
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: (data) => {
      if (data?.authorization_url) {
        window.location.href = data.authorization_url;
      } else {
        toast.success("Deposit initialized");
      }
      setDepositOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ── Withdraw ──
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState(5000);
  const [withdrawAccountId, setWithdrawAccountId] = useState<string>("");

  const withdraw = useMutation({
    mutationFn: async () => {
      const { data, error } = await api.request("/withdrawals/", {
        method: "POST",
        body: JSON.stringify({ amount: withdrawAmount, bank_account_id: Number(withdrawAccountId) }),
      });
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => {
      toast.success("Withdrawal initiated — funds are on their way to your bank");
      setWithdrawOpen(false);
      qc.invalidateQueries({ queryKey: ["my-agg", userId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const accounts = accountsQ.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Bank & payments</h1>
          <p className="text-sm text-muted-foreground">
            Link a real bank account, then deposit into or withdraw from your savings.
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs uppercase text-muted-foreground">Available balance</p>
            {aggQ.isLoading ? (
              <Skeleton className="mt-2 h-8 w-28" />
            ) : (
              <p className="mt-2 text-2xl font-semibold">{fmt(aggQ.data?.savings ?? 0)}</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-wrap gap-2 pt-6">
            <Dialog open={depositOpen} onOpenChange={setDepositOpen}>
              <DialogTrigger asChild>
                <Button size="sm"><ArrowDownToLine className="mr-1 h-4 w-4" /> Deposit</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Deposit funds</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-2 space-y-2">
                      <Label htmlFor="da">Amount</Label>
                      <Input id="da" type="number" min={1} value={depositAmount}
                        onChange={(e) => setDepositAmount(Number(e.target.value))} />
                    </div>
                    <div className="space-y-2">
                      <Label>Currency</Label>
                      <Select value={depositCurrency} onValueChange={setDepositCurrency}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="NGN">NGN</SelectItem>
                          {(ratesQ.data ?? []).map((r) => (
                            <SelectItem key={r.currency_code} value={r.currency_code}>{r.currency_code}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  {depositCurrency !== "NGN" && (
                    <p className="text-xs text-muted-foreground">
                      {currencyRate
                        ? `≈ ${fmt(convertedNgn)} at 1 ${depositCurrency} = ₦${currencyRate}`
                        : "This currency has no exchange rate configured — ask an admin to add one in Settings."}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    You'll be redirected to Paystack to complete this deposit securely.
                  </p>
                </div>
                <DialogFooter>
                  <Button
                    onClick={() => deposit.mutate()}
                    disabled={
                      deposit.isPending || depositAmount <= 0 ||
                      (depositCurrency !== "NGN" && !currencyRate)
                    }
                  >
                    {deposit.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Continue to Paystack
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Dialog open={withdrawOpen} onOpenChange={setWithdrawOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline" disabled={accounts.length === 0}>
                  <ArrowUpFromLine className="mr-1 h-4 w-4" /> Withdraw
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Withdraw to bank account</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label>Bank account</Label>
                    <Select value={withdrawAccountId} onValueChange={setWithdrawAccountId}>
                      <SelectTrigger><SelectValue placeholder="Select linked account" /></SelectTrigger>
                      <SelectContent>
                        {accounts.map((a) => (
                          <SelectItem key={a.id} value={String(a.id)}>
                            {a.bank_name} — {a.account_number} ({a.account_name})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="wa">Amount (₦)</Label>
                    <Input id="wa" type="number" min={100} value={withdrawAmount}
                      onChange={(e) => setWithdrawAmount(Number(e.target.value))} />
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    onClick={() => withdraw.mutate()}
                    disabled={withdraw.isPending || withdrawAmount <= 0 || !withdrawAccountId}
                  >
                    {withdraw.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Withdraw
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Linked bank accounts</CardTitle>
            <CardDescription>Verified via Paystack before you can withdraw to them.</CardDescription>
          </div>
          <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline"><Plus className="mr-1 h-4 w-4" /> Link account</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Link a bank account</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label>Bank</Label>
                  <Select value={bankCode} onValueChange={setBankCode}>
                    <SelectTrigger><SelectValue placeholder="Select your bank" /></SelectTrigger>
                    <SelectContent>
                      {(banksQ.data ?? []).map((b) => (
                        <SelectItem key={b.code} value={b.code}>{b.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="acc">Account number</Label>
                  <Input id="acc" value={accountNumber} maxLength={10}
                    onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, ""))} />
                </div>
              </div>
              <DialogFooter>
                <Button
                  onClick={() => linkAccount.mutate()}
                  disabled={linkAccount.isPending || !bankCode || accountNumber.length < 10}
                >
                  {linkAccount.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Verify & link
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Bank</TableHead>
                <TableHead>Account number</TableHead>
                <TableHead>Account name</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accounts.length === 0 && (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">
                  <Landmark className="mx-auto mb-2 h-8 w-8 opacity-40" />
                  No bank accounts linked yet.
                </TableCell></TableRow>
              )}
              {accounts.map((a) => (
                <TableRow key={a.id}>
                  <TableCell>{a.bank_name}</TableCell>
                  <TableCell>{a.account_number}</TableCell>
                  <TableCell>{a.account_name}</TableCell>
                  <TableCell>
                    <Badge variant={a.is_verified ? "default" : "secondary"}>
                      {a.is_verified ? "Verified" : "Pending"}
                    </Badge>
                    {a.is_default && <Badge variant="outline" className="ml-2">Default</Badge>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
