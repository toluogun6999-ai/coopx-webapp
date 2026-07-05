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

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Sign in · CoopX" }] }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const { user, role, loading, rolesLoaded } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [email, setEmail] = useState("admin@coopsys.ng");
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (!loading && user && rolesLoaded) {
      navigate({ to: isAdminRole(role) ? "/admin" : "/portal", replace: true });
    }
  }, [user, role, loading, rolesLoaded, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      toast.error(error.message ?? "Sign-in failed");
      setSubmitting(false);
    } else {
      toast.success("Signed in successfully");
      // navigation handled by the effect above
    }
  };

  return (
    <div className="min-h-screen grid place-items-center bg-muted/30 px-4">
      <div className="w-full max-w-md">
        <Link to="/" className="mb-6 flex items-center justify-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary text-primary-foreground">
            <Leaf className="h-5 w-5" />
          </div>
          <span className="text-lg font-semibold">CoopX</span>
        </Link>
        <Card>
          <CardHeader>
            <CardTitle>Welcome back</CardTitle>
            <CardDescription>Sign in to your cooperative account.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Sign in
              </Button>
              <div className="flex items-center justify-between text-sm">
                <Link to="/forgot-password" className="text-muted-foreground hover:underline">
                  Forgot password?
                </Link>
                <Link to="/signup" className="text-primary hover:underline">
                  Create an account
                </Link>
              </div>
              <GoogleSignInButton
                onSuccess={() => toast.success("Signed in with Google")}
                onError={(msg) => toast.error(msg)}
              />
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
