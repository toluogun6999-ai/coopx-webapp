import { createFileRoute, Outlet, Navigate } from "@tanstack/react-router";
import {
  LayoutDashboard, Users, Wallet, Banknote, Sparkles,
  FileBarChart, Megaphone, ShieldCheck, UserCog, Settings,
} from "lucide-react";
import { AppShell, ShellLoading, type NavItem } from "@/components/AppShell";
import { useAuth, isAdminRole } from "@/lib/auth";

export const Route = createFileRoute("/admin")({
  component: AdminLayout,
});

const nav: NavItem[] = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { to: "/admin/members", label: "Members", icon: Users },
  { to: "/admin/savings", label: "Savings", icon: Wallet },
  { to: "/admin/loans", label: "Loans", icon: Banknote },
  { to: "/admin/announcements", label: "Announcements", icon: Megaphone },
  { to: "/admin/insights", label: "ML Insights", icon: Sparkles },
  { to: "/admin/audit", label: "Audit log", icon: ShieldCheck },
  { to: "/admin/settings", label: "Settings", icon: Settings },
  { to: "/admin/reports", label: "Reports", icon: FileBarChart },
  { to: "/admin/profile", label: "Profile", icon: UserCog },
];

function AdminLayout() {
  const { user, role, loading, rolesLoaded } = useAuth();
  if (loading || (user && !rolesLoaded)) return <ShellLoading />;
  if (!user) return <Navigate to="/login" replace />;
  if (!isAdminRole(role)) return <Navigate to="/portal" replace />;

  return (
    <AppShell title="CoopX Admin" subtitle="Society Management" nav={nav}>
      <Outlet />
    </AppShell>
  );
}
