import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Loader2, ShieldCheck, Clock, Mail, Phone } from "lucide-react";
import { useAuth, ROLE_LABELS } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/admin/profile")({
  head: () => ({ meta: [{ title: "Admin profile · CoopX" }] }),
  component: AdminProfilePage,
});

const profileSchema = z.object({
  full_name: z.string().trim().min(2, "Tell us your name").max(100),
  phone: z.string().trim().max(30).optional().or(z.literal("")),
});

const passwordSchema = z
  .object({
    next: z.string().min(8, "Use at least 8 characters").max(72),
    confirm: z.string(),
  })
  .refine((v) => v.next === v.confirm, {
    message: "Passwords do not match",
    path: ["confirm"],
  });

function AdminProfilePage() {
  const { user, profile, roles, role } = useAuth();
  const [fullName, setFullName] = useState(profile?.full_name ?? "");
  const [phone, setPhone] = useState(profile?.phone ?? "");
  const [savingProfile, setSavingProfile] = useState(false);

  const [currentPwd, setCurrentPwd] = useState("");
  const [nextPwd, setNextPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [savingPwd, setSavingPwd] = useState(false);

  const initials =
    (profile?.full_name ?? user?.email ?? "?")
      .split(/[\s@.]/)
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase())
      .join("") || "?";

  const lastSignIn = user?.last_sign_in_at
    ? new Date(user.last_sign_in_at).toLocaleString()
    : "—";

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const parsed = profileSchema.safeParse({ full_name: fullName, phone });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    setSavingProfile(true);
    const { error } = await supabase
      .from("profiles")
      .update({ full_name: parsed.data.full_name, phone: parsed.data.phone || null })
      .eq("id", user.id);
    setSavingProfile(false);
    if (error) toast.error(error.message);
    else toast.success("Profile updated");
  };

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.email) return;
    const parsed = passwordSchema.safeParse({ next: nextPwd, confirm: confirmPwd });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    setSavingPwd(true);
    // Re-authenticate to confirm the current password
    const { error: reauthError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: currentPwd,
    });
    if (reauthError) {
      setSavingPwd(false);
      toast.error("Current password is incorrect");
      return;
    }
    const { error } = await supabase.auth.updateUser({ password: parsed.data.next });
    setSavingPwd(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setCurrentPwd("");
    setNextPwd("");
    setConfirmPwd("");
    toast.success("Password updated");
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Admin profile</h1>
        <p className="text-sm text-muted-foreground">
          Manage your account, roles, and security settings.
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-start gap-4">
            <Avatar className="h-16 w-16">
              <AvatarFallback className="bg-primary/10 text-primary text-lg font-semibold">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 space-y-2">
              <div>
                <p className="text-lg font-semibold">{profile?.full_name ?? "—"}</p>
                <p className="text-xs text-muted-foreground">
                  Member code · {profile?.member_code ?? "—"}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {roles.length === 0 ? (
                  <Badge variant="outline">No role assigned</Badge>
                ) : (
                  roles.map((r) => (
                    <Badge key={r} variant={r === role ? "default" : "secondary"} className="gap-1">
                      <ShieldCheck className="h-3 w-3" />
                      {ROLE_LABELS[r]}
                    </Badge>
                  ))
                )}
              </div>
              <div className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                <p className="flex items-center gap-1.5">
                  <Mail className="h-3 w-3" /> {user?.email}
                </p>
                <p className="flex items-center gap-1.5">
                  <Phone className="h-3 w-3" /> {profile?.phone ?? "—"}
                </p>
                <p className="flex items-center gap-1.5">
                  <Clock className="h-3 w-3" /> Last sign-in: {lastSignIn}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Account details</CardTitle>
          <CardDescription>Update your display name and contact phone.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={saveProfile} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Full name</Label>
              <Input
                id="name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" value={phone ?? ""} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <Button type="submit" disabled={savingProfile}>
              {savingProfile && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save changes
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Change password</CardTitle>
          <CardDescription>
            For your security we verify your current password before updating.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={changePassword} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="current">Current password</Label>
              <Input
                id="current"
                type="password"
                autoComplete="current-password"
                value={currentPwd}
                onChange={(e) => setCurrentPwd(e.target.value)}
                required
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="next">New password</Label>
                <Input
                  id="next"
                  type="password"
                  autoComplete="new-password"
                  value={nextPwd}
                  onChange={(e) => setNextPwd(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm">Confirm new password</Label>
                <Input
                  id="confirm"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPwd}
                  onChange={(e) => setConfirmPwd(e.target.value)}
                  required
                />
              </div>
            </div>
            <Button type="submit" disabled={savingPwd}>
              {savingPwd && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Update password
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
