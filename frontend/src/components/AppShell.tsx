import { Link, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Leaf, LogOut, type LucideIcon } from "lucide-react";
import { Toaster } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/auth";
import { listMyNotifications } from "@/lib/db";

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

function initials(name?: string | null, email?: string | null) {
  const source = name?.trim() || email || "";
  if (!source) return "?";
  const parts = source.split(" ").filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

export function AppShell({ title, subtitle, nav, children }: Props) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { profile, user, signOut } = useAuth();

  const notifQ = useQuery({
    queryKey: ["shell-notifications", user?.id],
    queryFn: () => listMyNotifications(user!.id),
    enabled: !!user,
    refetchInterval: 60_000,
  });
  const unreadCount = (notifQ.data ?? []).filter((n) => !n.read).length;

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
            const showBadge = n.to.endsWith("/notifications") && unreadCount > 0;
            return (
              <Link
                key={n.to}
                to={n.to}
                className={
                  "group relative flex items-center gap-3 rounded-lg border-l-2 px-3 py-2 text-sm transition-colors " +
                  (active
                    ? "border-l-primary bg-primary text-primary-foreground"
                    : "border-l-transparent text-muted-foreground hover:bg-accent hover:text-accent-foreground")
                }
              >
                <Icon className="h-4 w-4" />
                <span className="flex-1">{n.label}</span>
                {showBadge && (
                  <span className="grid h-5 min-w-5 place-items-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
        <div className="m-3 flex items-center gap-2 rounded-lg border bg-accent/40 p-3 text-xs">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground text-[11px] font-semibold">
            {initials(profile?.full_name, user?.email)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-medium text-foreground truncate">
              {profile?.full_name ?? user?.email ?? "Account"}
            </p>
            <p className="text-muted-foreground truncate">{user?.email}</p>
          </div>
          <Button
            onClick={signOut}
            size="icon"
            variant="ghost"
            className="h-7 w-7 shrink-0"
            aria-label="Sign out"
          >
            <LogOut className="h-3.5 w-3.5" />
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
    <div className="min-h-screen bg-background">
      <div className="fixed inset-y-0 left-0 hidden w-64 border-r bg-card p-3 md:block">
        <Skeleton className="h-11 w-full mb-4" />
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="mb-2 h-9 w-full" />
        ))}
      </div>
      <div className="md:pl-64 px-4 py-6 md:px-8 md:py-8 space-y-4">
        <Skeleton className="h-8 w-56" />
        <div className="grid gap-4 sm:grid-cols-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    </div>
  );
}
