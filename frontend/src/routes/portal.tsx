import { createFileRoute, Outlet, Navigate } from "@tanstack/react-router";
import { LayoutDashboard, Wallet, Banknote, Bell, UserCircle, Landmark } from "lucide-react";
import { AppShell, ShellLoading, type NavItem } from "@/components/AppShell";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/portal")({
  component: PortalLayout,
});

const nav: NavItem[] = [
  { to: "/portal", label: "Overview", icon: LayoutDashboard },
  { to: "/portal/savings", label: "My Savings", icon: Wallet },
  { to: "/portal/bank", label: "Bank & Payments", icon: Landmark },
  { to: "/portal/loans", label: "My Loans", icon: Banknote },
  { to: "/portal/notifications", label: "Notifications", icon: Bell },
  { to: "/portal/profile", label: "Profile", icon: UserCircle },
];

function PortalLayout() {
  const { user, loading } = useAuth();
  if (loading) return <ShellLoading />;
  if (!user) return <Navigate to="/login" replace />;
  return (
    <AppShell title="CoopX Member" subtitle="Member Portal" nav={nav}>
      <Outlet />
    </AppShell>
  );
}
