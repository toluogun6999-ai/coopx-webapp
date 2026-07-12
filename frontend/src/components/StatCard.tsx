import type { LucideIcon } from "lucide-react";
import { ArrowUpRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  sub?: string;
  tone?: "default" | "warn";
  loading?: boolean;
}

/**
 * The "icon chip + label + big number + sub-caption" card used on every
 * dashboard. Consolidating this into one component means the loading
 * skeleton, spacing, and tone styling stay consistent everywhere instead of
 * being re-implemented (slightly differently) on each page.
 */
export function StatCard({ label, value, icon: Icon, sub, tone = "default", loading }: StatCardProps) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
            {loading ? (
              <Skeleton className="mt-2 h-8 w-24" />
            ) : (
              <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
            )}
          </div>
          <div
            className={cn(
              "grid h-9 w-9 shrink-0 place-items-center rounded-lg",
              tone === "warn" ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary",
            )}
          >
            <Icon className="h-4 w-4" />
          </div>
        </div>
        {sub && !loading && (
          <p className="mt-3 inline-flex items-center gap-1 text-xs text-muted-foreground">
            <ArrowUpRight className="h-3 w-3" /> {sub}
          </p>
        )}
        {loading && <Skeleton className="mt-3 h-3 w-32" />}
      </CardContent>
    </Card>
  );
}
