import { Link, useRouterState } from "@tanstack/react-router";
import { Leaf, LogOut, type LucideIcon } from "lucide-react";
import { Toaster } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

interface Props {
  title: string;
  subtitle: string;
  nav: NavItem[];
  children: React.ReactNode;
}

export function AppShell({ title, subtitle, nav, children }: Props) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { profile, user, signOut } = useAuth();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r bg-card md:flex md:flex-col">
        <div className="flex items-center gap-2 px-6 py-5 border-b">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary text-primary-foreground">
            <Leaf className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold leading-tight">{title}</p>
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {nav.map((n) => {
            const base = nav[0].to;
            const active = n.to === base ? pathname === base : pathname.startsWith(n.to);
            const Icon = n.icon;
            return (
              <Link
                key={n.to}
                to={n.to}
                className={
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors " +
                  (active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground")
                }
              >
                <Icon className="h-4 w-4" />
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="m-3 rounded-lg border bg-accent/40 p-3 text-xs">
          <p className="font-medium text-foreground truncate">
            {profile?.full_name ?? user?.email ?? "Account"}
          </p>
          <p className="text-muted-foreground truncate">{user?.email}</p>
          <Button
            onClick={signOut}
            size="sm"
            variant="ghost"
            className="mt-2 h-7 w-full justify-start gap-2 px-2"
          >
            <LogOut className="h-3.5 w-3.5" /> Sign out
          </Button>
        </div>
      </aside>

      <div className="md:pl-64">
        <header className="sticky top-0 z-10 flex h-14 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur md:px-8">
          <div className="md:hidden flex items-center gap-2">
            <div className="grid h-7 w-7 place-items-center rounded-md bg-primary text-primary-foreground">
              <Leaf className="h-4 w-4" />
            </div>
            <span className="text-sm font-semibold">{title}</span>
          </div>
          <div className="ml-auto text-xs text-muted-foreground">
            Cycle: {new Date().toLocaleDateString("en", { month: "long", year: "numeric" })}
          </div>
        </header>
        <main className="px-4 py-6 md:px-8 md:py-8">{children}</main>
      </div>
      <Toaster />
    </div>
  );
}

export function ShellLoading() {
  return (
    <div className="grid min-h-screen place-items-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  );
}
