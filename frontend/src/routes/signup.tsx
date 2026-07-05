import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Leaf, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, isAdminRole } from "@/lib/auth";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";

export const Route = createFileRoute("/signup")({
  head: () => ({ meta: [{ title: "Create account · CoopX" }] }),
  component: SignupPage,
});

function SignupPage() {
  const navigate = useNavigate();
  const { user, role, loading, rolesLoaded } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (!loading && user && rolesLoaded) {
      navigate({ to: isAdminRole(role) ? "/admin" : "/portal", replace: true });
    }
  }, [user, role, loading, rolesLoaded, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 10) {
      toast.error("Password must be at least 10 characters");
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName, phone } },
    });
    if (error) {
      toast.error(error.message ?? "Sign-up failed");
      setSubmitting(false);
    } else {
      toast.success("Account created! Redirecting…");
      // navigation handled by the effect above
    }
  };

  return (
    <div className="min-h-screen grid place-items-center bg-muted/30 px-4 py-10">
      <div className="w-full max-w-md">
        <Link to="/" className="mb-6 flex items-center justify-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary text-primary-foreground">
            <Leaf className="h-5 w-5" />
          </div>
          <span className="text-lg font-semibold">CoopX</span>
        </Link>
        <Card>
          <CardHeader>
            <CardTitle>Join your cooperative</CardTitle>
            <CardDescription>Create your member account.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="fullName">Full name</Label>
                <Input id="fullName" value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Jane Doe" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input id="phone" value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="0801 234 5678" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••" required />
              </div>
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create account
              </Button>
              <p className="text-center text-sm text-muted-foreground">
                Already have an account?{" "}
                <Link to="/login" className="text-primary hover:underline">
                  Sign in
                </Link>
              </p>
              <GoogleSignInButton
                onSuccess={() => toast.success("Signed up with Google")}
                onError={(msg) => toast.error(msg)}
              />
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
