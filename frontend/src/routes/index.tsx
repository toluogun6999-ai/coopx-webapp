import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Leaf,
  Sparkles,
  ShieldCheck,
  Wallet,
  Banknote,
  LineChart,
  ArrowRight,
} from "lucide-react";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "CoopX — Intelligent Cooperative Society Management" },
      {
        name: "description",
        content:
          "Run your cooperative on autopilot: members, savings, loans, repayments and ML-powered default risk — all in one secure platform.",
      },
    ],
  }),
  component: Landing,
});

function Landing() {
  const { user, role } = useAuth();
  const adminish = role && role !== "member";
  const dashboardHref = adminish ? "/admin" : "/portal";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link to="/" className="flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-primary-foreground">
              <Leaf className="h-4 w-4" />
            </div>
            <span className="font-semibold">CoopX</span>
          </Link>
          <nav className="flex items-center gap-2">
            {user ? (
              <Button asChild size="sm">
                <Link to={dashboardHref}>
                  Open {adminish ? "admin" : "portal"} <ArrowRight className="ml-1 h-4 w-4" />
                </Link>
              </Button>
            ) : (
              <>
                <Button asChild variant="ghost" size="sm">
                  <Link to="/login">Sign in</Link>
                </Button>
                <Button asChild size="sm">
                  <Link to="/signup">Get started</Link>
                </Button>
              </>
            )}
          </nav>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-4 py-16 md:py-24">
        <div className="mx-auto max-w-3xl text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs text-muted-foreground">
            <Sparkles className="h-3 w-3 text-primary" /> ML-powered default risk built in
          </div>
          <h1 className="text-balance text-4xl font-semibold tracking-tight md:text-6xl">
            The intelligent operating system for your cooperative society
          </h1>
          <p className="mt-5 text-balance text-base text-muted-foreground md:text-lg">
            CoopX brings members, savings, loans, contributions and analytics into one place — with
            machine learning that flags risky loans before they default.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button asChild size="lg">
              <Link to="/signup">Create free account</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/login">Sign in</Link>
            </Button>
          </div>
        </div>

        <div className="mt-16 grid gap-4 md:grid-cols-3">
          {[
            {
              icon: Wallet,
              title: "Savings & contributions",
              desc: "Track every contribution, calculate balances and generate statements automatically.",
            },
            {
              icon: Banknote,
              title: "Loans & repayments",
              desc: "Members apply, admins approve, the system handles EMIs, interest and overdue alerts.",
            },
            {
              icon: LineChart,
              title: "ML insights",
              desc: "Default-risk scoring, churn prediction, anomaly detection and contribution forecasts.",
            },
            {
              icon: ShieldCheck,
              title: "Bank-grade security",
              desc: "Role-based access, row-level security and encrypted sessions out of the box.",
            },
            {
              icon: Sparkles,
              title: "Beautiful dashboards",
              desc: "Modern, responsive UI with real-time charts and exportable reports.",
            },
            {
              icon: Leaf,
              title: "Built for cooperatives",
              desc: "Designed around AGM cycles, society policies and member-first workflows.",
            },
          ].map((f) => (
            <Card key={f.title}>
              <CardContent className="pt-6">
                <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary">
                  <f.icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 font-semibold">{f.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{f.desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <footer className="border-t">
        <div className="mx-auto max-w-6xl px-4 py-6 text-xs text-muted-foreground">
          © {new Date().getFullYear()} CoopX. Cooperative Society Management System.
        </div>
      </footer>
    </div>
  );
}
