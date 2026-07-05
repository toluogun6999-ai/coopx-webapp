import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Megaphone, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { createAnnouncement, listAnnouncements } from "@/lib/db";

export const Route = createFileRoute("/admin/announcements")({
  head: () => ({ meta: [{ title: "Announcements · CoopX Admin" }] }),
  component: AnnouncementsPage,
});

function AnnouncementsPage() {
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [priority, setPriority] = useState<"normal" | "urgent" | "success">("normal");

  const listQ = useQuery({ queryKey: ["announcements"], queryFn: listAnnouncements });

  const create = useMutation({
    mutationFn: () => createAnnouncement({ title, body, priority }),
    onSuccess: () => {
      toast.success("Announcement broadcast to all approved members");
      setTitle(""); setBody(""); setPriority("normal");
      qc.invalidateQueries({ queryKey: ["announcements"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Announcements</h1>
        <p className="text-sm text-muted-foreground">
          Broadcast to every approved member — delivered to their notification center.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Megaphone className="h-4 w-4" /> New announcement</CardTitle>
          <CardDescription>Members receive an in-app notification automatically.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={(e) => { e.preventDefault(); if (!title || !body) return toast.error("Fill all fields"); create.mutate(); }}
            className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="t">Title</Label>
              <Input id="t" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} required />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="b">Message</Label>
              <Textarea id="b" rows={4} value={body} onChange={(e) => setBody(e.target.value)} maxLength={1000} required />
            </div>
            <div className="space-y-2">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as typeof priority)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                  <SelectItem value="success">Positive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button type="submit" disabled={create.isPending} className="w-full">
                {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Broadcast
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Recent announcements</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {listQ.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {listQ.data?.length === 0 && <p className="text-sm text-muted-foreground">No announcements yet.</p>}
          {listQ.data?.map((a) => (
            <div key={a.id} className="rounded-lg border p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium">{a.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{a.body}</p>
                </div>
                <Badge variant={a.priority === "urgent" ? "destructive" : a.priority === "success" ? "secondary" : "outline"}>
                  {a.priority}
                </Badge>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {new Date(a.created_at).toLocaleString()}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
