import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ShieldCheck, Search } from "lucide-react";
import { listAuditLogs } from "@/lib/db";

export const Route = createFileRoute("/admin/audit")({
  head: () => ({ meta: [{ title: "Audit log · CoopX Admin" }] }),
  component: AuditPage,
});

function AuditPage() {
  const [q, setQ] = useState("");
  const logsQ = useQuery({ queryKey: ["audit-logs"], queryFn: () => listAuditLogs(200) });
  const rows = useMemo(() => {
    const data = logsQ.data ?? [];
    if (!q) return data;
    const lq = q.toLowerCase();
    return data.filter((r) =>
      r.action.toLowerCase().includes(lq) ||
      r.entity.toLowerCase().includes(lq) ||
      (r.actor_name ?? "").toLowerCase().includes(lq),
    );
  }, [logsQ.data, q]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <ShieldCheck className="h-6 w-6 text-primary" /> Audit log
        </h1>
        <p className="text-sm text-muted-foreground">
          Every loan decision and member status change is recorded for compliance.
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Activity trail</CardTitle>
            <CardDescription>{rows.length} of {logsQ.data?.length ?? 0} entries</CardDescription>
          </div>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search action, entity, actor" value={q} onChange={(e) => setQ(e.target.value)} className="pl-8 w-72" />
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Entity</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logsQ.isLoading && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Loading…</TableCell></TableRow>}
              {rows.length === 0 && !logsQ.isLoading && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No audit entries yet.</TableCell></TableRow>}
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-xs whitespace-nowrap">{new Date(r.created_at).toLocaleString()}</TableCell>
                  <TableCell><Badge variant="outline" className="font-mono text-xs">{r.action}</Badge></TableCell>
                  <TableCell className="text-xs">{r.entity}</TableCell>
                  <TableCell className="text-xs text-muted-foreground truncate max-w-[180px]">{r.actor_name ?? r.actor_id ?? "system"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground font-mono max-w-md truncate">
                    {r.details ? JSON.stringify(r.details) : "—"}
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
