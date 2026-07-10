import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Loader2, Save, Plus, Trash2, Coins } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { api } from "@/integrations/django/client";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/admin/settings")({
  head: () => ({ meta: [{ title: "Settings · CoopX" }] }),
  component: SettingsPage,
});

type Settings = {
  coop_name: string;
  coop_reg_number: string;
  coop_address: string;
  coop_phone: string;
  coop_email: string;
  monthly_contribution_amount: number;
  max_loan_multiplier: number;
  default_interest_rate: number;
  late_payment_penalty_rate: number;
  min_savings_for_loan: number;
  min_months_for_loan: number;
};

const FIELDS: { key: keyof Settings; label: string; desc: string; type: "text" | "number"; step?: string }[] = [
  { key: "coop_name", label: "Society name", desc: "Displayed across the platform and on reports.", type: "text" },
  { key: "coop_reg_number", label: "Registration number", desc: "Official cooperative registration number.", type: "text" },
  { key: "coop_phone", label: "Contact phone", desc: "Displayed on member-facing pages.", type: "text" },
  { key: "coop_email", label: "Contact email", desc: "Displayed on member-facing pages.", type: "text" },
  { key: "default_interest_rate", label: "Default interest rate (%)", desc: "Annual rate applied to new loans.", type: "number", step: "0.01" },
  { key: "max_loan_multiplier", label: "Max loan multiplier", desc: "Maximum loan as multiple of member savings.", type: "number", step: "0.1" },
  { key: "min_months_for_loan", label: "Min membership (months)", desc: "How long a member must belong before borrowing.", type: "number" },
  { key: "min_savings_for_loan", label: "Min savings for loan", desc: "Minimum savings balance to qualify for a loan.", type: "number" },
  { key: "monthly_contribution_amount", label: "Monthly contribution amount", desc: "Standard recurring contribution expected.", type: "number" },
  { key: "late_payment_penalty_rate", label: "Late payment fee (%)", desc: "Penalty on overdue loan instalments.", type: "number", step: "0.01" },
];

interface ExchangeRate {
  id: number;
  currency_code: string;
  currency_name: string;
  rate_to_ngn: number;
  updated_at: string;
}

function ExchangeRatesCard({ canEdit }: { canEdit: boolean }) {
  const qc = useQueryClient();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [rate, setRate] = useState("");

  const ratesQ = useQuery({
    queryKey: ["exchange-rates"],
    queryFn: async () => {
      const { data, error } = await api.request<ExchangeRate[]>("/exchange-rates/");
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const upsert = useMutation({
    mutationFn: async () => {
      const { error } = await api.request("/exchange-rates/", {
        method: "POST",
        body: JSON.stringify({ currency_code: code, currency_name: name, rate_to_ngn: rate }),
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Exchange rate saved");
      qc.invalidateQueries({ queryKey: ["exchange-rates"] });
      setCode(""); setName(""); setRate("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (currencyCode: string) => {
      const { error } = await api.request(`/exchange-rates/${currencyCode}/`, { method: "DELETE" });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Currency removed");
      qc.invalidateQueries({ queryKey: ["exchange-rates"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rates = ratesQ.data ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Coins className="h-4 w-4" /> Currency & exchange rates</CardTitle>
        <CardDescription>
          Members can deposit in any currency listed here — it's converted to Naira at this rate before being charged.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Currency</TableHead>
              <TableHead>Rate (→ ₦)</TableHead>
              {canEdit && <TableHead className="w-10" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell className="font-medium">NGN</TableCell>
              <TableCell>Naira (base currency)</TableCell>
              <TableCell>1.00</TableCell>
              {canEdit && <TableCell />}
            </TableRow>
            {rates.map((r) => (
              <TableRow key={r.currency_code}>
                <TableCell className="font-medium">{r.currency_code}</TableCell>
                <TableCell>{r.currency_name}</TableCell>
                <TableCell>{Number(r.rate_to_ngn).toLocaleString()}</TableCell>
                {canEdit && (
                  <TableCell>
                    <Button
                      type="button" size="icon" variant="ghost"
                      onClick={() => remove.mutate(r.currency_code)}
                      disabled={remove.isPending}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
            {rates.length === 0 && !ratesQ.isLoading && (
              <TableRow>
                <TableCell colSpan={canEdit ? 4 : 3} className="text-center text-muted-foreground">
                  Only Naira deposits are supported. Add a currency below.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>

        {canEdit && (
          <form
            onSubmit={(e) => { e.preventDefault(); upsert.mutate(); }}
            className="grid gap-3 sm:grid-cols-4 items-end border-t pt-4"
          >
            <div className="space-y-1.5">
              <Label htmlFor="cc">Code</Label>
              <Input id="cc" placeholder="USD" maxLength={3} value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cn">Name</Label>
              <Input id="cn" placeholder="US Dollar" value={name}
                onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cr">Rate to ₦</Label>
              <Input id="cr" type="number" min={0} step="0.0001" placeholder="1600" value={rate}
                onChange={(e) => setRate(e.target.value)} required />
            </div>
            <Button type="submit" disabled={upsert.isPending} className="gap-2">
              {upsert.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Add / update
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

function SettingsPage() {
  const qc = useQueryClient();
  const { hasAnyRole } = useAuth();
  const canEdit = hasAnyRole(["admin", "super_admin", "treasurer"]);
  const [draft, setDraft] = useState<Settings | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["system-settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("system_settings").select("*").maybeSingle();
      if (error) throw error;
      return data as unknown as Settings;
    },
  });

  useEffect(() => { if (data && !draft) setDraft(data); }, [data, draft]);

  const save = useMutation({
    mutationFn: async (values: Settings) => {
      const { error } = await supabase.from("system_settings").update(values);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Settings saved");
      qc.invalidateQueries({ queryKey: ["system-settings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading || !draft) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">System settings</h1>
        <p className="text-sm text-muted-foreground">
          Cooperative-wide policies that control loans, dividends and contributions.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Policy parameters</CardTitle>
          <CardDescription>Changes apply immediately to new applications.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(e) => { e.preventDefault(); if (canEdit) save.mutate(draft); }}
            className="grid gap-5 sm:grid-cols-2"
          >
            {FIELDS.map((f) => (
              <div key={f.key} className="space-y-1.5">
                <Label htmlFor={f.key}>{f.label}</Label>
                <Input
                  id={f.key}
                  type={f.type}
                  step={f.step}
                  disabled={!canEdit}
                  value={draft[f.key] as string | number}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      [f.key]: f.type === "number" ? Number(e.target.value) : e.target.value,
                    })
                  }
                />
                <p className="text-xs text-muted-foreground">{f.desc}</p>
              </div>
            ))}

            <div className="sm:col-span-2 flex items-center justify-end gap-2 pt-2">
              {!canEdit && (
                <p className="text-xs text-muted-foreground mr-auto">
                  Only Admin, Super Admin or Treasurer can edit these settings.
                </p>
              )}
              <Button type="button" variant="outline" onClick={() => data && setDraft(data)}>Reset</Button>
              <Button type="submit" disabled={!canEdit || save.isPending} className="gap-2">
                {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save changes
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <ExchangeRatesCard canEdit={canEdit} />
    </div>
  );
}
