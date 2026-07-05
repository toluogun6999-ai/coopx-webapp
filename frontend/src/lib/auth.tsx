import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import type { Session, User } from "@supabase/supabase-js";

export type AppRole =
  | "admin"
  | "super_admin"
  | "treasurer"
  | "secretary"
  | "loan_officer"
  | "auditor"
  | "member";

export const ROLE_LABELS: Record<AppRole, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  treasurer: "Treasurer",
  secretary: "Secretary",
  loan_officer: "Loan Officer",
  auditor: "Auditor",
  member: "Member",
};

const ADMIN_ROLES: AppRole[] = [
  "admin",
  "super_admin",
  "treasurer",
  "secretary",
  "loan_officer",
  "auditor",
];

export function isAdminRole(role: AppRole | null | undefined): boolean {
  return !!role && ADMIN_ROLES.includes(role);
}

export type MemberStatus = "Pending" | "Approved" | "Suspended" | "Rejected" | "Inactive";

export interface Profile {
  id: string;
  full_name: string;
  phone: string | null;
  member_code: string | null;
  joined_at: string;
  status: MemberStatus;
  verified_email?: boolean;
  verified_phone?: boolean;
  suspension_reason?: string | null;
}

interface AuthState {
  user: User | null;
  session: Session | null;
  /** Highest-priority single role (for backward compat) */
  role: AppRole | null;
  /** All roles granted to the user */
  roles: AppRole[];
  profile: Profile | null;
  loading: boolean;
  /** True once roles have been fetched for the current session (or no session). */
  rolesLoaded: boolean;
  isAdmin: boolean;
  hasRole: (r: AppRole) => boolean;
  hasAnyRole: (rs: AppRole[]) => boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

const ROLE_PRIORITY: AppRole[] = [
  "super_admin",
  "admin",
  "treasurer",
  "secretary",
  "loan_officer",
  "auditor",
  "member",
];

function pickPrimary(roles: AppRole[]): AppRole | null {
  for (const r of ROLE_PRIORITY) if (roles.includes(r)) return r;
  return null;
}

async function loadRolesAndProfile(_userId: string) {
  // The Django /auth/me/ endpoint returns roles + profile together.
  const { api } = await import("@/integrations/django/client");
  const { data } = await api.request<any>("/auth/me/");
  const roles = ((data?.roles ?? ["member"]) as AppRole[]);
  return {
    roles,
    role: pickPrimary(roles),
    profile: (data?.profile as Profile | null) ?? null,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [rolesLoaded, setRolesLoaded] = useState(false);
  const router = useRouter();
  const queryClient = useQueryClient();

  useEffect(() => {
    let active = true;

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (!active) return;
      setSession(newSession);
      setUser(newSession?.user ?? null);
      if (newSession?.user) {
        setRolesLoaded(false);
        setTimeout(() => {
          loadRolesAndProfile(newSession.user.id).then((res) => {
            if (!active) return;
            setRoles(res.roles);
            setRole(res.role);
            setProfile(res.profile);
            setRolesLoaded(true);
          });
        }, 0);
      } else {
        setRoles([]);
        setRole(null);
        setProfile(null);
        setRolesLoaded(true);
      }
      router.invalidate();
      queryClient.invalidateQueries();
    });

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setUser(data.session?.user ?? null);
      if (data.session?.user) {
        loadRolesAndProfile(data.session.user.id).then((res) => {
          if (!active) return;
          setRoles(res.roles);
          setRole(res.role);
          setProfile(res.profile);
          setRolesLoaded(true);
          setLoading(false);
        });
      } else {
        setRolesLoaded(true);
        setLoading(false);
      }
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Remember-me: if user opted out, sign out on tab close
  useEffect(() => {
    const onUnload = () => {
      if (localStorage.getItem("coopx.rememberMe") === "false") {
        supabase.auth.signOut();
      }
    };
    window.addEventListener("pagehide", onUnload);
    return () => window.removeEventListener("pagehide", onUnload);
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setRole(null);
    setRoles([]);
    setProfile(null);
  };

  const hasRole = (r: AppRole) => roles.includes(r);
  const hasAnyRole = (rs: AppRole[]) => rs.some((r) => roles.includes(r));

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        role,
        roles,
        profile,
        loading,
        rolesLoaded,
        isAdmin: isAdminRole(role),
        hasRole,
        hasAnyRole,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
