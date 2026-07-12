import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Search, MoreHorizontal, Check, Ban, X, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { listAllProfiles, updateMemberStatus, updateMemberRole } from "@/lib/db";
import { useAuth, ROLE_LABELS, type AppRole } from "@/lib/auth";
import type { MemberStatus } from "@/lib/auth";

export const Route = createFileRoute("/admin/members")({
  head: () => ({ meta: [{ title: "Members · CoopX" }] }),
  component: MembersPage,
});

const STATUSES: ("All" | MemberStatus)[] = ["All", "Pending", "Approved", "Suspended", "Rejected", "Inactive"];

const ASSIGNABLE_ROLES: AppRole[] = ["member", "admin", "treasurer", "secretary", "auditor"];

const STATUS_COLORS: Record<MemberStatus, string> = {
  Pending: "bg-amber-100 text-amber-800 hover:bg-amber-100",
  Approved: "bg-emerald-100 text-emerald-800 hover:bg-emerald-100",
  Suspended: "bg-orange-100 text-orange-800 hover:bg-orange-100",
  Rejected: "bg-red-100 text-red-800 hover:bg-red-100",
  Inactive: "bg-muted text-muted-foreground hover:bg-muted",
};

function MembersPage() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"All" | MemberStatus>("All");
  const qc = useQueryClient();
  const { role: myRole } = useAuth();
  const canAssignRoles = myRole === "admin";

  const profilesQ = useQuery({ queryKey: ["admin-profiles"], queryFn: listAllProfiles });

  const setStatusMut = useMutation({
    mutationFn: (args: { id: string; status: MemberStatus; reason?: string }) =>
      updateMemberStatus(args.id, args.status, args.reason),
    onSuccess: (_d, args) => {
      toast.success(`Member ${args.status.toLowerCase()}`);
      qc.invalidateQueries({ queryKey: ["admin-profiles"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setRoleMut = useMutation({
    mutationFn: (args: { id: string; role: AppRole }) => updateMemberRole(args.id, args.role),
    onSuccess: (_d, args) => {
      toast.success(`Role set to ${ROLE_LABELS[args.role]}`);
      qc.invalidateQueries({ queryKey: ["admin-profiles"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = useMemo(() => {
    const data = profilesQ.data ?? [];
    return data.filter((p) =>
      (status === "All" || p.status === status) &&
      (p.full_name.toLowerCase().includes(q.toLowerCase()) ||
       (p.member_code ?? "").toLowerCase().includes(q.toLowerCase()))
    );
  }, [profilesQ.data, q, status]);

  const pendingCount = (profilesQ.data ?? []).filter((p) => p.status === "Pending").length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Members</h1>
        <p className="text-sm text-muted-foreground">
          {profilesQ.data?.length ?? 0} registered · {pendingCount} awaiting approval
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>Member register</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search name or code"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="pl-8 w-64"
              />
            </div>
            {STATUSES.map((s) => (
              <button
                key={s}
                onClick={() => setStatus(s)}
                className={
                  "rounded-md border px-3 py-1.5 text-xs transition-colors " +
                  (status === s ? "bg-primary text-primary-foreground border-primary" : "hover:bg-accent")
                }
              >
                {s}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Member</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Verified</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {profilesQ.isLoading && (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Loading…</TableCell></TableRow>
              )}
              {rows.length === 0 && !profilesQ.isLoading && (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">No members match.</TableCell></TableRow>
              )}
              {rows.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="grid h-8 w-8 place-items-center rounded-full bg-accent text-xs font-medium">
                        {p.full_name.split(" ").map((s) => s[0]).slice(0, 2).join("")}
                      </div>
                      <div>
                        <p className="text-sm font-medium">{p.full_name}</p>
                        <p className="text-xs text-muted-foreground">{p.phone ?? "—"}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-xs font-mono">{p.member_code ?? "—"}</TableCell>
                  <TableCell>
                    <Badge className={STATUS_COLORS[p.status]}>{p.status}</Badge>
                  </TableCell>
                  <TableCell>
                    {canAssignRoles ? (
                      <Select
                        value={p.role ?? "member"}
                        onValueChange={(role) => setRoleMut.mutate({ id: p.id, role: role as AppRole })}
                      >
                        <SelectTrigger className="h-7 w-32 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ASSIGNABLE_ROLES.map((r) => (
                            <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Badge variant="outline" className="gap-1">
                        <ShieldCheck className="h-3 w-3" /> {ROLE_LABELS[(p.role ?? "member") as AppRole]}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Badge variant={p.verified_email ? "secondary" : "outline"} className="text-[10px]">
                        {p.verified_email ? "✓ Email" : "Email"}
                      </Badge>
                      <Badge variant={p.verified_phone ? "secondary" : "outline"} className="text-[10px]">
                        {p.verified_phone ? "✓ Phone" : "Phone"}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell className="text-xs">{new Date(p.joined_at).toLocaleDateString()}</TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {p.status !== "Approved" && (
                          <DropdownMenuItem onClick={() => setStatusMut.mutate({ id: p.id, status: "Approved" })}>
                            <Check className="mr-2 h-4 w-4" /> Approve
                          </DropdownMenuItem>
                        )}
                        {p.status !== "Suspended" && p.status === "Approved" && (
                          <DropdownMenuItem onClick={() => {
                            const reason = window.prompt("Reason for suspension?") ?? undefined;
                            setStatusMut.mutate({ id: p.id, status: "Suspended", reason });
                          }}>
                            <Ban className="mr-2 h-4 w-4" /> Suspend
                          </DropdownMenuItem>
                        )}
                        {p.status === "Pending" && (
                          <DropdownMenuItem onClick={() => setStatusMut.mutate({ id: p.id, status: "Rejected" })}>
                            <X className="mr-2 h-4 w-4" /> Reject
                          </DropdownMenuItem>
                        )}
                        {p.status === "Suspended" && (
                          <DropdownMenuItem onClick={() => setStatusMut.mutate({ id: p.id, status: "Approved" })}>
                            <Check className="mr-2 h-4 w-4" /> Reactivate
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
