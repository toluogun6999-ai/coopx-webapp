import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/admin/settings")({
  head: () => ({ meta: [{ title: "Settings · CoopX" }] }),
  component: SettingsPage,
});

type Settings = {
  society_name: string;
  currency: string;
  default_interest_rate: number;
  max_loan_multiplier: number;
  min_membership_months: number;
  min_savings_for_loan: number;
  dividend_rate: number;
  monthly_contribution_min: number;
  late_fee_pct: number;
};

const FIELDS: { key: keyof Settings; label: string; desc: string; type: "text" | "number"; step?: string }[] = [
  { key: "society_name", label: "Society name", desc: "Displayed across the platform and on reports.", type: "text" },
  { key: "currency", label: "Currency code", desc: "ISO code, e.g. NGN, USD, KES.", type: "text" },
  { key: "default_interest_rate", label: "Default interest rate (%)", desc: "Annual rate applied to new loans.", type: "number", step: "0.01" },
  { key: "max_loan_multiplier", label: "Max loan multiplier", desc: "Maximum loan as multiple of member savings.", type: "number", step: "0.1" },
  { key: "min_membership_months", label: "Min membership (months)", desc: "How long a member must belong before borrowing.", type: "number" },
  { key: "min_savings_for_loan", label: "Min savings for loan", desc: "Minimum savings balance to qualify for a loan.", type: "number" },
  { key: "monthly_contribution_min", label: "Monthly contribution minimum", desc: "Smallest recurring contribution expected.", type: "number" },
  { key: "dividend_rate", label: "Dividend rate (%)", desc: "Annual dividend declared on member shares.", type: "number", step: "0.01" },
  { key: "late_fee_pct", label: "Late payment fee (%)", desc: "Penalty on overdue loan instalments.", type: "number", step: "0.01" },
];

function SettingsPage() {
  const qc = useQueryClient();
  const { hasAnyRole } = useAuth();
  const canEdit = hasAnyRole(["admin", "super_admin", "treasurer"]);
  const [draft, setDraft] = useState<Settings | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["system-settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("system_settings").select("*").eq("id", true).maybeSingle();
      if (error) throw error;
      return data as unknown as Settings;
    },
  });

  useEffect(() => { if (data && !draft) setDraft(data); }, [data, draft]);

  const save = useMutation({
    mutationFn: async (values: Settings) => {
      const { error } = await supabase.from("system_settings").update(values).eq("id", true);
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
    </div>
  );
}
