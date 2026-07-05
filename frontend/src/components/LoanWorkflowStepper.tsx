import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

const STAGES = [
  { key: "Submitted", label: "Submitted" },
  { key: "ML Assessed", label: "ML risk" },
  { key: "Under Review", label: "Admin review" },
  { key: "Decided", label: "Decision" },
  { key: "Disbursed", label: "Disbursed" },
  { key: "Repaying", label: "Repaying" },
];

export function statusToStageIndex(status: string): number {
  switch (status) {
    case "Pending": return 2; // submitted + ML done (we score on submit) → awaiting review
    case "Approved": return 3;
    case "Rejected": return 3;
    case "Disbursed": return 4;
    case "Repaid": return 5;
    case "Overdue": return 5;
    default: return 0;
  }
}

export function LoanWorkflowStepper({ status }: { status: string }) {
  const current = statusToStageIndex(status);
  const rejected = status === "Rejected";
  return (
    <div className="flex items-center gap-2 overflow-x-auto py-2">
      {STAGES.map((s, i) => {
        const done = i < current || (i === current && status === "Repaid");
        const active = i === current && !rejected;
        const failed = rejected && i === current;
        return (
          <div key={s.key} className="flex items-center gap-2 shrink-0">
            <div className={cn(
              "grid h-7 w-7 place-items-center rounded-full border text-xs font-medium",
              done && "bg-primary text-primary-foreground border-primary",
              active && "border-primary text-primary bg-primary/10 ring-2 ring-primary/20",
              failed && "bg-destructive text-destructive-foreground border-destructive",
              !done && !active && !failed && "border-muted text-muted-foreground",
            )}>
              {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
            </div>
            <span className={cn(
              "text-xs whitespace-nowrap",
              (active || done) && "font-medium text-foreground",
              !active && !done && "text-muted-foreground",
              failed && "text-destructive font-medium",
            )}>
              {failed ? "Rejected" : s.label}
            </span>
            {i < STAGES.length - 1 && (
              <div className={cn("h-px w-6", done ? "bg-primary" : "bg-border")} />
            )}
          </div>
        );
      })}
    </div>
  );
}
