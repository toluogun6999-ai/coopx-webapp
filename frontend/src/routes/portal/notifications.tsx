import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Bell, CheckCheck } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useAuth } from "@/lib/auth";
import { listMyNotifications, markAllRead } from "@/lib/db";

export const Route = createFileRoute("/portal/notifications")({
  head: () => ({ meta: [{ title: "Notifications · CoopX" }] }),
  component: NotificationsPage,
});

const TONE: Record<string, string> = {
  info: "bg-primary/10 text-primary",
  success: "bg-emerald-100 text-emerald-700",
  warning: "bg-amber-100 text-amber-700",
  error: "bg-red-100 text-red-700",
};

function NotificationsPage() {
  const { user } = useAuth();
  const userId = user!.id;
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["notifications", userId],
    queryFn: () => listMyNotifications(userId),
  });

  const markAll = useMutation({
    mutationFn: () => markAllRead(userId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications", userId] }),
  });

  const items = q.data ?? [];
  const unread = items.filter((n) => !n.read).length;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Notifications</h1>
          <p className="text-sm text-muted-foreground">
            {unread > 0 ? `${unread} unread` : "All caught up"} · loan updates, reminders, announcements.
          </p>
        </div>
        {unread > 0 && (
          <Button variant="outline" size="sm" onClick={() => markAll.mutate()}>
            <CheckCheck className="mr-1 h-4 w-4" /> Mark all read
          </Button>
        )}
      </div>

      {items.length === 0 && (
        <Card><CardContent className="pt-6 text-center text-muted-foreground">
          <Bell className="mx-auto mb-2 h-8 w-8 opacity-40" />
          No notifications yet.
        </CardContent></Card>
      )}

      <div className="space-y-3">
        {items.map((n) => (
          <Card key={n.id} className={n.read ? "opacity-70" : ""}>
            <CardContent className="flex items-start gap-3 pt-6">
              <div className={"grid h-10 w-10 shrink-0 place-items-center rounded-lg " + (TONE[n.type] ?? TONE.info)}>
                <Bell className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium">{n.title}</p>
                  <Badge variant="secondary">{formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}</Badge>
                </div>
                {n.body && <p className="mt-1 text-sm text-muted-foreground">{n.body}</p>}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
