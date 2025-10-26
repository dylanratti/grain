'use client';

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip as ReTooltip,
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
} from "recharts";
import { Brain, Wallet, LineChart as IconLineChart, Target, Sparkles, MessageSquare, TrendingUp, HelpCircle } from "lucide-react";

/* ───────────────────────── constants & utils ───────────────────────── */

const COLORS = ["#0ea5e9", "#22c55e", "#f59e0b", "#ef4444", "#6366f1", "#14b8a6", "#8b5cf6"];
const STORAGE_KEY = "grain.seed.v1";

type Goal = {
  id: number;
  name: string;
  target: number;
  saved: number;
};

const DEMO_GOALS: Goal[] = [
  { id: 1, name: "Condo Down Payment", target: 25_000, saved: 8_200 },
  { id: 2, name: "Travel Fund", target: 3_000, saved: 1_200 },
];

const clampPct = (n: number) => {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(100, x));
};

const monthsToGoal = (target: number, saved: number, monthly: number) => {
  const remaining = Math.max(0, target - saved);
  return Math.ceil(remaining / Math.max(1, monthly));
};

function investBreakdown(total: number, cryptoPct: number) {
  const cap = Math.min(10, Math.max(0, cryptoPct)) / 100; // 0–10%
  const crypto = Math.round(total * cap);
  const remaining = Math.max(0, total - crypto);
  const etf = Math.round(remaining * 0.8);
  const bond = Math.max(0, remaining - etf);
  return { crypto, etf, bond };
}

/* ───────────────────────── small reusable UI ───────────────────────── */

function LabeledNumber({ label, val, setVal, step = 10, tooltip }: { label: string; val: number; setVal: (n: number) => void; step?: number; tooltip?: string }) {
  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const n = raw === '' ? 0 : Number(raw);
    setVal(Number.isFinite(n) ? n : 0);
  };
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="capitalize flex items-center gap-1">
          {label}
          {tooltip && (
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircle className="w-3.5 h-3.5 text-neutral-400" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs text-xs">{tooltip}</TooltipContent>
            </Tooltip>
          )}
        </span>
        <div className="flex gap-1">
          <Button size="sm" variant="secondary" className="rounded-xl" onClick={() => setVal(Math.max(0, Math.round(val - step)))}>-</Button>
          <Button size="sm" variant="secondary" className="rounded-xl" onClick={() => setVal(Math.max(0, Math.round(val + step)))}>+</Button>
        </div>
      </div>
      <Input type="number" inputMode="decimal" value={val} onChange={onChange} className="rounded-xl" />
    </div>
  );
}

function SplitBadge({ label, amt, muted = false }: { label: string; amt: number; muted?: boolean }) {
  return (
    <div className={`px-3 py-2 rounded-xl border text-sm ${muted ? 'opacity-60' : ''}`}>
      <span className="capitalize text-neutral-600">{label}</span>
      <span className="ml-2 font-medium">${amt.toLocaleString()}</span>
    </div>
  );
}

function GoalRow({
  name, target, saved, monthly, monthlyBoost,
}: { name: string; target: number; saved: number; monthly: number; monthlyBoost: number }) {
  const pctTrue = Math.round((saved / Math.max(1, target)) * 100);
  const mBase = monthsToGoal(target, saved, monthly);
  const mBoost = monthsToGoal(target, saved, monthly + monthlyBoost);
  const delta = Math.max(0, mBase - mBoost);
  const clamped = clampPct(pctTrue);
  return (
    <div className="p-3 rounded-xl border bg-white">
      <div className="flex items-center justify-between text-sm">
        <div className="font-medium">{name}</div>
        <div className="text-neutral-500">${saved.toLocaleString()} / ${target.toLocaleString()}</div>
      </div>
      <div className="mt-2">
        <Progress value={clamped} />
        <div className="mt-1 text-xs text-neutral-600">{pctTrue}% · ~{mBase} months (→ {mBoost} with +${monthlyBoost.toLocaleString()}/mo)</div>
        {delta > 0 && <div className="text-[11px] text-emerald-700 mt-0.5">Saves ~{delta} months with this boost.</div>}
      </div>
    </div>
  );
}

function InsightCard({
  title, detail, tag, onAsk,
}: { title: string; detail: string; tag?: string; onAsk?: () => void }) {
  return (
    <Card className="rounded-2xl border border-neutral-200/80 bg-neutral-50/70 transition-colors hover:border-emerald-200">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-neutral-800">{title}</div>
          {tag && <Badge variant="secondary" className="text-[10px]">{tag}</Badge>}
        </div>
        <div className="text-sm leading-relaxed text-neutral-600">{detail}</div>
        <div className="flex justify-end">
          <Button size="sm" variant="secondary" className="rounded-xl" onClick={onAsk}>
            <MessageSquare className="w-3.5 h-3.5 mr-1" /> Ask Grain
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

type AskGrainMessage = { role: "assistant" | "user"; text: string };

function AskGrainSheet({
  open,
  setOpen,
  presetMsg,
  context,
}: {
  open: boolean;
  setOpen: (b: boolean) => void;
  presetMsg?: string;
  context?: string;
}) {
  const defaultGreeting = "Hi — I’m your AI coach. Ask me anything and I’ll tailor it to your numbers.";
  const [chatInput, setChatInput] = useState("");
  const [chatHistory, setChatHistory] = useState<AskGrainMessage[]>(() => [
    { role: "assistant", text: defaultGreeting },
  ]);
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (presetMsg && !chatInput.trim()) {
      setChatInput(presetMsg);
    }
  }, [presetMsg, open, chatInput]);

  const handleSend = async () => {
    const trimmed = chatInput.trim();
    if (!trimmed || isSending) return;

    const userMessage: AskGrainMessage = { role: "user", text: trimmed };
    const nextHistory = [...chatHistory, userMessage];
    setChatHistory(nextHistory);
    setChatInput("");
    setIsSending(true);

    try {
      const historyForApi = nextHistory.filter(
        (message, index) =>
          !(
            index === 0 &&
            message.role === "assistant" &&
            message.text.toLowerCase() === defaultGreeting.toLowerCase()
          ),
      );

      const response = await fetch("/api/ask-grain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: historyForApi,
          context,
        }),
      });

      const data: { reply?: string; error?: string } = await response.json();
      if (!response.ok || !data.reply) {
        throw new Error(data.error || "Unable to reach Grain right now.");
      }

      setChatHistory((history) => [...history, { role: "assistant", text: data.reply as string }]);
    } catch (error) {
      console.error("AskGrain error", error);
      const errorMessage =
        error instanceof Error ? error.message : "I hit a snag reaching the AI right now.";
      setChatHistory((history) => [
        ...history,
        { role: "assistant", text: errorMessage || "Give it a few seconds and try again." },
      ]);
    } finally {
      setIsSending(false);
    }
  };

  const applyQuickPrompt = (prompt: string) => {
    if (isSending) return;
    setChatInput(prompt);
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side="right" className="w-[420px] p-0">
        <SheetHeader className="p-6 border-b">
          <SheetTitle>Ask Grain</SheetTitle>
        </SheetHeader>
        <div className="p-6 space-y-4 text-sm">
          <div className="space-y-2 max-h-[50vh] overflow-auto pr-1">
            {chatHistory.map((m, i) => (
              <div
                key={`${m.role}-${i}-${m.text.slice(0, 12)}`}
                className={`p-3 rounded-xl border ${m.role === "assistant" ? "bg-neutral-100" : "bg-emerald-50"}`}
              >
                {m.text}
              </div>
            ))}
          </div>
          {isSending && (
            <div className="text-xs text-neutral-500 italic">Grain is thinking…</div>
          )}
          <Textarea
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            placeholder="Ask anything… e.g., How should I split extra savings this month?"
            disabled={isSending}
          />
          <div className="flex items-center justify-between gap-2">
            <div className="flex gap-2 text-[11px] text-neutral-500">
              <Button
                size="sm"
                variant="secondary"
                className="rounded-xl"
                onClick={() => applyQuickPrompt("Why this recommendation?")}
                disabled={isSending}
              >
                Why this?
              </Button>
              <Button
                size="sm"
                variant="secondary"
                className="rounded-xl"
                onClick={() => applyQuickPrompt("FHSA vs TFSA vs RRSP")}
                disabled={isSending}
              >
                FHSA vs TFSA
              </Button>
            </div>
            <Button
              className="rounded-xl"
              onClick={handleSend}
              disabled={isSending || !chatInput.trim()}
            >
              {isSending ? "Sending…" : "Send"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function DashboardSection({
  id,
  eyebrow,
  title,
  description,
  action,
  children,
}: {
  id: string;
  eyebrow?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          {eyebrow && <div className="text-xs uppercase tracking-wide text-neutral-500">{eyebrow}</div>}
          <div className="text-lg font-semibold text-neutral-800">{title}</div>
          {description && <p className="text-sm text-neutral-500">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/* ───────────────────────── app shell (route entry) ───────────────────────── */

function GrainApp() {
  const [mode, setMode] = useState<"onboarding" | "dashboard">("onboarding");
  return (
    <TooltipProvider>
      {mode === "onboarding" ? (
        <OnboardingWizard onComplete={() => setMode("dashboard")} />
      ) : (
        <GrainDashboard onRestart={() => setMode("onboarding")} />
      )}
    </TooltipProvider>
  );
}

export default function Page() {
  return <GrainApp />;
}

/* ───────────────────────── onboarding ───────────────────────── */

function OnboardingWizard({ onComplete }: { onComplete: () => void }) {
  const [province, setProvince] = useState("Ontario");
  const [age, setAge] = useState(27);
  const [income, setIncome] = useState(4000);
  const [rent, setRent] = useState(2000);
  const [utilities, setUtilities] = useState(180);
  const [insurance, setInsurance] = useState(120);
  const [transport, setTransport] = useState(160);
  const [groceries, setGroceries] = useState(420);
  const [dining, setDining] = useState(220);
  const [subscriptions, setSubscriptions] = useState(45);
  const [other, setOther] = useState(120);
  const [ccDebt, setCcDebt] = useState(1200);
  const [ccApr, setCcApr] = useState(19.99);
  const [studentLoan, setStudentLoan] = useState(8000);
  const [studentApr, setStudentApr] = useState(5.2);
  const [primaryGoal, setPrimaryGoal] = useState("Condo Down Payment");
  const [risk, setRisk] = useState("balanced");
  const [cryptoPct, setCryptoPct] = useState(0);

  const fixedTotal = rent + utilities + insurance + subscriptions;
  const variableTotal = transport + groceries + dining + other;
  const spendTotal = fixedTotal + variableTotal;
  const leftover = Math.max(0, income - spendTotal);

  const saveSeed = () => {
    const seed = {
      province, age, income,
      rent, utilities, insurance, transport, groceries, dining, subscriptions, other,
      ccDebt, ccApr, studentLoan, studentApr,
      primaryGoal, risk, cryptoPct,
    };
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(seed)); } catch {}
  };

  const [step, setStep] = useState(0);
  const [chatOpen, setChatOpen] = useState(false);
  const steps = [
    {
      key: "welcome",
      title: "Your AI Coach for Money",
      subtitle: "We’re Canada-first. Your data stays private.",
      highlights: [
        "Takes under five minutes — tweak anything later",
        "Numbers stay on this device until you choose otherwise",
        "Ask Grain at any time for context or tips",
      ],
      body: (
        <div className="space-y-5">
          <div className="rounded-2xl border border-neutral-200 bg-neutral-50/70 p-6 space-y-4">
            <div className="text-sm font-semibold text-neutral-800">What you’ll unlock</div>
            <div className="grid gap-4 text-sm text-neutral-600 sm:grid-cols-2">
              <div className="flex items-start gap-3">
                <span className="mt-1 inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
                <span>Personalized monthly cashflow with goal routing.</span>
              </div>
              <div className="flex items-start gap-3">
                <span className="mt-1 inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
                <span>Goal timelines that adjust with “what-if” boosts.</span>
              </div>
              <div className="flex items-start gap-3">
                <span className="mt-1 inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
                <span>Actionable AI insights anchored to Canadian benchmarks.</span>
              </div>
              <div className="flex items-start gap-3">
                <span className="mt-1 inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
                <span>Invest preview with crypto guardrails (0–10%).</span>
              </div>
            </div>
          </div>
          <HeroCard income={income} spend={spendTotal} leftover={leftover} />
          <div className="flex flex-wrap items-center gap-3 text-xs text-neutral-500">
            <span className="rounded-full border border-neutral-200 bg-white px-3 py-1 font-medium text-neutral-700">No credit pulls</span>
            <span className="rounded-full border border-neutral-200 bg-white px-3 py-1 font-medium text-neutral-700">Local data storage</span>
            <span className="rounded-full border border-neutral-200 bg-white px-3 py-1 font-medium text-neutral-700">Canada-first insights</span>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button className="rounded-2xl px-6 py-2" onClick={() => setStep(s => s + 1)}>Get started</Button>
            <Button variant="secondary" className="rounded-2xl px-6 py-2" onClick={() => setChatOpen(true)}>How it works</Button>
          </div>
        </div>
      ),
    },
    {
      key: "region",
      title: "Where Are You?",
      subtitle: "We’ll localize accounts and rules for Canada.",
      highlights: [
        "We tailor accounts (FHSA, TFSA, RRSP) to your province",
        "Age helps us surface first-home incentives automatically",
      ],
      body: (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-neutral-200 bg-white/80 p-5 space-y-3">
            <div className="text-sm font-medium text-neutral-800">Province or territory</div>
            <Select value={province} onValueChange={setProvince}>
              <SelectTrigger className="rounded-xl bg-white"><SelectValue placeholder="Select province" /></SelectTrigger>
              <SelectContent>
                {["Ontario","Quebec","British Columbia","Alberta","Manitoba","Saskatchewan","Nova Scotia","New Brunswick","Newfoundland and Labrador","Prince Edward Island","Yukon","Northwest Territories","Nunavut"].map(p=> <SelectItem value={p} key={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-xs text-neutral-500">Used for contribution limits, benefits, and provincial guidance.</p>
          </div>
          <div className="rounded-2xl border border-neutral-200 bg-white/80 p-5 space-y-3">
            <div className="text-sm font-medium text-neutral-800">Currency & age</div>
            <div className="grid sm:grid-cols-2 gap-3">
              <Input value="CAD" readOnly className="rounded-xl bg-neutral-100 text-neutral-500" />
              <Input type="number" value={age} onChange={(e)=>setAge(Number(e.target.value)||0)} className="rounded-xl" placeholder="Age (optional)" />
            </div>
            <p className="text-xs text-neutral-500">We only surface age-related perks (e.g., FHSA eligibility) if it helps.</p>
          </div>
        </div>
      ),
    },
    {
      key: "income",
      title: "What’s Your Monthly Take-Home Income?",
      subtitle: "After tax, in CAD.",
      highlights: [
        "Use your average take-home pay after tax",
        "We’ll suggest allocations based on your leftover",
      ],
      body: (
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
          <div className="rounded-2xl border border-neutral-200 bg-white/80 p-5">
            <LabeledNumber label="Net Income" val={income} setVal={setIncome} tooltip="Amount you take home after taxes and deductions." />
          </div>
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-5 text-sm text-emerald-700">
            Tip: If pay varies, enter an average of the last 3 months so we smooth out lumpy income.
          </div>
        </div>
      ),
    },
    {
      key: "fixed",
      title: "Fixed Costs",
      subtitle: "Things that don’t change much month-to-month.",
      highlights: [
        "Enter the amounts you expect every month",
        "We use these to estimate your core spending baseline",
      ],
      body: (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-neutral-200 bg-white/80 p-5 space-y-4">
            <LabeledNumber label="Rent / Mortgage" val={rent} setVal={setRent} />
            <LabeledNumber label="Utilities" val={utilities} setVal={setUtilities} />
          </div>
          <div className="rounded-2xl border border-neutral-200 bg-white/80 p-5 space-y-4">
            <LabeledNumber label="Insurance" val={insurance} setVal={setInsurance} />
            <LabeledNumber label="Subscriptions" val={subscriptions} setVal={setSubscriptions} />
          </div>
        </div>
      ),
    },
    {
      key: "variable",
      title: "Variable Costs",
      subtitle: "We’ll suggest ranges later if you’re unsure.",
      highlights: [
        "If you don’t know, take your best guess — we’ll calibrate later",
        "These inform insights like dining trims or transport benchmarks",
      ],
      body: (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-neutral-200 bg-white/80 p-5 space-y-4">
            <LabeledNumber label="Transport" val={transport} setVal={setTransport} />
            <LabeledNumber label="Groceries" val={groceries} setVal={setGroceries} />
          </div>
          <div className="rounded-2xl border border-neutral-200 bg-white/80 p-5 space-y-4">
            <LabeledNumber label="Dining" val={dining} setVal={setDining} />
            <LabeledNumber label="Other" val={other} setVal={setOther} />
          </div>
        </div>
      ),
    },
    {
      key: "debts",
      title: "Any Debts?",
      subtitle: "Optional, but helps with smarter recommendations.",
      highlights: [
        "Share any balances so we can prioritize high-interest payoff",
        "We reduce investing if cards run hot (APR > 10%)",
      ],
      body: (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-neutral-200 bg-white/80 p-5">
              <LabeledNumber label="Credit Card Balance" val={ccDebt} setVal={setCcDebt} />
            </div>
            <div className="rounded-2xl border border-neutral-200 bg-white/80 p-5">
              <LabeledNumber label="Credit Card APR %" val={ccApr} setVal={setCcApr} step={0.5} tooltip="APR = Annual Percentage Rate — your yearly interest cost." />
            </div>
            <div className="rounded-2xl border border-neutral-200 bg-white/80 p-5">
              <LabeledNumber label="Student Loan Balance" val={studentLoan} setVal={setStudentLoan} />
            </div>
            <div className="rounded-2xl border border-neutral-200 bg-white/80 p-5">
              <LabeledNumber label="Student APR %" val={studentApr} setVal={setStudentApr} step={0.1} tooltip="Your student loan’s yearly interest rate." />
            </div>
          </div>
          <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-4 text-xs text-amber-800">
            Tip: Any debt above 8–10% APR should absorb extra cash before you dial up investing.
          </div>
        </div>
      ),
    },
    {
      key: "goals",
      title: "Pick a Primary Goal",
      subtitle: "We’ll anchor your plan to this.",
      highlights: [
        "We’ll bias savings toward this goal first",
        "You can switch later — nothing is locked in",
      ],
      body: (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3 text-sm">
            {["Condo Down Payment","Travel Fund","Emergency Fund","Wedding","Debt-Free","Retirement"].map(g => (
              <Button key={g} variant={g===primaryGoal?"default":"secondary"} className="rounded-2xl justify-center py-6 text-sm font-medium" onClick={()=>setPrimaryGoal(g)}>
                {g}
              </Button>
            ))}
          </div>
          {/Home|Condo|House/i.test(primaryGoal) && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4 text-xs text-emerald-700">
              Considering a first home? We’ll highlight FHSA vs TFSA strategies in your dashboard recap.
            </div>
          )}
        </div>
      ),
    },
    {
      key: "risk",
      title: "Choose a Risk Profile",
      subtitle: "This only affects the investment mix.",
      highlights: [
        "We blend cash, ETFs, bonds, and optional crypto based on this",
        "High-interest debt automatically lowers investing until it’s addressed",
      ],
      body: (
        <div className="space-y-5">
          <div className="grid gap-4 md:grid-cols-3">
            {[
              { id: "conservative", title: "Conservative", bullets: ["More cash on hand", "Bonds cushion market swings", "Great if you value stability"] },
              { id: "balanced", title: "Balanced", bullets: ["Default mix of ETFs + bonds", "Targets steady growth", "Blend of safety and upside"] },
              { id: "yolo", title: "YOLO / Risky", bullets: ["Maximizes growth potential", "Allows crypto (0–10%)", "Expect bigger swings"] },
            ].map(p => (
              <Card key={p.id} className={`rounded-2xl border ${risk===p.id? 'border-emerald-500 shadow-md shadow-emerald-100' : 'border-neutral-200'}`}>
                <CardContent className="p-5 space-y-3">
                  <div className="text-sm font-semibold text-neutral-800">{p.title}</div>
                  <ul className="space-y-1.5 text-sm text-neutral-600">
                    {p.bullets.map(b=> <li key={b} className="flex items-start gap-2"><span className="mt-1 h-1.5 w-1.5 rounded-full bg-emerald-500" /><span>{b}</span></li>)}
                  </ul>
                  <Button size="sm" className="rounded-xl" variant={risk===p.id? 'default':'secondary'} onClick={()=>setRisk(p.id)}>{risk===p.id? 'Selected' : 'Select'}</Button>
                </CardContent>
              </Card>
            ))}
          </div>
          {risk === 'yolo' && (
            <div className="rounded-2xl border border-neutral-200 bg-white/80 p-5 space-y-2">
              <div className="text-xs uppercase tracking-wide text-neutral-500">Crypto allocation (0–10% of investments)</div>
              <Slider value={[cryptoPct]} min={0} max={10} step={1} onValueChange={(v) => setCryptoPct(v[0])} />
              <div className="text-xs text-neutral-500">Currently {cryptoPct}% — we trim ETFs/Bonds so crypto never exceeds your cap.</div>
            </div>
          )}
        </div>
      ),
    },
    {
      key: "summary",
      title: "Your Starter Plan",
      subtitle: "You can edit anything later.",
      highlights: [
        "This is your baseline dashboard snapshot",
        "Adjust anything now or later from the app",
      ],
      body: (
        <div className="grid gap-4 sm:grid-cols-3">
          <Card className="rounded-2xl border border-emerald-200 bg-emerald-50/70">
            <CardContent className="p-5 space-y-2">
              <div className="flex items-center justify-between text-xs text-emerald-700 uppercase tracking-wide">
                <span>To goals</span>
                <Badge variant="secondary" className="bg-white/40 text-emerald-900">Output</Badge>
              </div>
              <div className="text-2xl font-semibold text-emerald-900">${Math.max(0, income - spendTotal).toLocaleString()}</div>
              <div className="text-xs text-emerald-700/80">Leftover after spend routed to goals.</div>
            </CardContent>
          </Card>
          <Card className="rounded-2xl border border-neutral-200 bg-white/80">
            <CardContent className="p-5 space-y-2">
              <div className="flex items-center justify-between text-xs text-neutral-500 uppercase tracking-wide">
                <span>Spend this month</span>
                <Badge variant="secondary" className="text-neutral-700">Output</Badge>
              </div>
              <div className="text-2xl font-semibold text-neutral-900">${spendTotal.toLocaleString()}</div>
              <div className="text-xs text-neutral-500">Income ${income.toLocaleString()}</div>
            </CardContent>
          </Card>
          <Card className="rounded-2xl border border-neutral-200 bg-white/80">
            <CardContent className="p-5 space-y-2">
              <div className="flex items-center justify-between text-xs text-neutral-500 uppercase tracking-wide">
                <span>Primary goal</span>
                <Badge variant="secondary" className="text-neutral-700">Anchor</Badge>
              </div>
              <div className="text-lg font-semibold text-neutral-900">{primaryGoal}</div>
              <div className="text-xs text-neutral-500">We’ll bias routing toward this goal first.</div>
            </CardContent>
          </Card>
        </div>
      ),
    },
    {
      key: "finish",
      title: "You’re Ready",
      subtitle: "We’ll take you to your dashboard.",
      highlights: [
        "You can always revisit onboarding later",
        "Connect accounts when you’re ready — optional for now",
      ],
      body: (
        <div className="rounded-2xl border border-neutral-200 bg-white/80 p-6 space-y-4">
          <div className="text-sm font-semibold text-neutral-800">All set to launch Grain</div>
          <p className="text-sm text-neutral-600">We’ll load your personalized dashboard with savings plan, goal timelines, and AI insights. Linking accounts is optional — your numbers stay local unless you choose to sync.</p>
          <div className="flex flex-wrap gap-3">
            <Button variant="secondary" className="rounded-2xl px-5 py-2" onClick={()=>{ saveSeed(); onComplete(); }}>Skip for now</Button>
            <Button className="rounded-2xl px-5 py-2" onClick={()=>{ saveSeed(); onComplete(); }}>Go to dashboard</Button>
          </div>
        </div>
      ),
    },
  ];

  const onboardingContext = useMemo(() => {
    const debtLines: string[] = [];
    debtLines.push(
      ccDebt > 0
        ? `Credit card balance: $${ccDebt.toLocaleString()} at ${ccApr}% APR.`
        : "Credit card balance: $0."
    );
    debtLines.push(
      studentLoan > 0
        ? `Student loan balance: $${studentLoan.toLocaleString()} at ${studentApr}% APR.`
        : "Student loan balance: $0."
    );

    return [
      `Province: ${province}`,
      age ? `Age: ${age}` : "Age not provided.",
      `Monthly income: $${income.toLocaleString()}`,
      `Fixed costs: $${fixedTotal.toLocaleString()}`,
      `Variable costs: $${variableTotal.toLocaleString()}`,
      `Planned spend total: $${spendTotal.toLocaleString()}`,
      `Leftover after spend: $${leftover.toLocaleString()}`,
      `Primary goal: ${primaryGoal}`,
      `Risk profile: ${risk}`,
      `Crypto cap preference: ${cryptoPct}%`,
      ...debtLines,
    ].join("\n");
  }, [
    province,
    age,
    income,
    fixedTotal,
    variableTotal,
    spendTotal,
    leftover,
    primaryGoal,
    risk,
    cryptoPct,
    ccDebt,
    ccApr,
    studentLoan,
    studentApr,
  ]);

  const progressPct = Math.round(((step + 1) / steps.length) * 100);
  const upcomingSteps = steps.slice(step + 1, step + 3);
  const onboardingContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: step === 0 ? "auto" : "smooth" });
    }
    if (onboardingContainerRef.current) {
      onboardingContainerRef.current.scrollIntoView({ behavior: step === 0 ? "auto" : "smooth", block: "start" });
    }
  }, [step]);

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="relative overflow-hidden bg-gradient-to-br from-emerald-600 via-emerald-500 to-sky-500 text-white shadow-sm">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.22),transparent_55%)]" />
        <div className="relative max-w-5xl mx-auto px-5 py-8 sm:py-10 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-white" />
              <span className="text-2xl font-semibold tracking-tight">grain</span>
              <Badge variant="secondary" className="ml-2 bg-white/30 text-white border-white/40">Canada-first</Badge>
            </div>
            <Button
              variant="secondary"
              className="rounded-2xl bg-white/90 px-4 py-2 text-emerald-700 hover:bg-white"
              onClick={() => setChatOpen(true)}
            >
              <MessageSquare className="w-4 h-4 mr-2" /> Ask Grain
            </Button>
          </div>
          <div className="space-y-2">
            <div className="text-xs uppercase tracking-[0.3em] text-emerald-100">Step {step + 1} of {steps.length}</div>
            <div className="text-3xl font-semibold tracking-tight">{steps[step].title}</div>
            <p className="text-sm text-emerald-50/90">{steps[step].subtitle}</p>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-white/25">
            <div className="h-full rounded-full bg-white" style={{ width: `${progressPct}%` }} />
          </div>
        </div>
      </header>

      <main ref={onboardingContainerRef} className="max-w-5xl mx-auto px-4 py-8 sm:px-5 sm:py-10 transition-[padding]">
        <Card className="rounded-3xl border-none shadow-xl shadow-emerald-100/30">
          <CardContent className="p-0">
            <div className="grid gap-0 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
              <aside className="space-y-6 border-b border-emerald-100/60 bg-emerald-50/90 p-6 sm:p-8 lg:border-b-0 lg:border-r lg:sticky lg:top-8">
                <div className="space-y-2">
                  <div className="text-xs uppercase tracking-[0.28em] text-emerald-600/80">Guided onboarding</div>
                  <div className="text-xl font-semibold text-emerald-900">{steps[step].title}</div>
                  <p className="text-sm text-emerald-700/80">{steps[step].subtitle}</p>
                </div>
                {steps[step].highlights && (
                  <div className="space-y-2">
                    {steps[step].highlights.map((tip, idx) => (
                      <div key={idx} className="flex items-start gap-3 rounded-2xl border border-emerald-100 bg-white/80 px-4 py-3 text-sm text-emerald-800">
                        <span className="mt-1 inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                        <span>{tip}</span>
                      </div>
                    ))}
                  </div>
                )}
                {upcomingSteps.length > 0 && (
                  <div className="rounded-2xl border border-emerald-100 bg-white/70 px-4 py-3 text-xs text-emerald-700 space-y-2">
                    <div className="font-semibold uppercase tracking-wide text-[11px] text-emerald-600">Next up</div>
                    <ul className="space-y-1.5">
                      {upcomingSteps.map((s) => (
                        <li key={s.key} className="flex items-start gap-2">
                          <span className="mt-1 h-1.5 w-1.5 rounded-full bg-emerald-400" />
                          <span>{s.title}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </aside>
              <div className="space-y-8 p-6 sm:p-8">
                {steps[step].body}
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <Button
                    variant="secondary"
                    className="rounded-2xl px-5 py-2 w-full sm:w-auto"
                    onClick={() => setStep((s) => Math.max(0, s - 1))}
                    disabled={step === 0}
                  >
                    Back
                  </Button>
                  <div className="flex flex-wrap gap-3">
                    <Button
                      variant="secondary"
                      className="rounded-2xl px-5 py-2 w-full sm:w-auto"
                      onClick={() => setChatOpen(true)}
                    >
                      <MessageSquare className="w-4 h-4 mr-2" /> Ask Grain
                    </Button>
                    <Button
                      className="rounded-2xl px-5 py-2 w-full sm:w-auto"
                      onClick={() => {
                        if (step >= steps.length - 1) {
                          saveSeed();
                          onComplete();
                        } else {
                          setStep((s) => Math.min(steps.length - 1, s + 1));
                        }
                      }}
                    >
                      {step < steps.length - 1 ? 'Continue' : 'Finish'}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>

      <footer className="max-w-5xl mx-auto px-5 pb-12 text-xs text-neutral-500">
        © {new Date().getFullYear()} Grain — onboarding preview.
      </footer>

      <AskGrainSheet open={chatOpen} setOpen={setChatOpen} context={onboardingContext} />
    </div>
  );
}

function HeroCard({ income, spend, leftover }: { income: number; spend: number; leftover: number }) {
  return (
    <Card className="rounded-3xl border border-neutral-200/70 bg-white/80 shadow-sm">
      <CardContent className="p-6 sm:p-7 space-y-4">
        <div className="text-xs uppercase tracking-[0.3em] text-neutral-500">Preview</div>
        <div className="grid gap-4 sm:grid-cols-3 text-sm">
          <div className="rounded-2xl border border-neutral-200 bg-neutral-50/80 px-4 py-4 space-y-1.5">
            <div className="text-neutral-500">Net income</div>
            <div className="text-xl font-semibold text-neutral-900">${income.toLocaleString()}</div>
          </div>
          <div className="rounded-2xl border border-neutral-200 bg-neutral-50/80 px-4 py-4 space-y-1.5">
            <div className="text-neutral-500">Planned spend</div>
            <div className="text-xl font-semibold text-neutral-900">${spend.toLocaleString()}</div>
          </div>
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 px-4 py-4 space-y-1.5">
            <div className="text-emerald-700">Leftover</div>
            <div className="text-xl font-semibold text-emerald-800">${leftover.toLocaleString()}</div>
            <div className="text-xs text-emerald-700/80">We’ll route this toward goals.</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* ───────────────────────── dashboard ───────────────────────── */

function GrainDashboard({ onRestart }: { onRestart: () => void }) {
  // Seed load
  const seeded = useRef(false);
  const [income, setIncome] = useState(4000);
  const [rent, setRent] = useState(2000);
  const [utilities, setUtilities] = useState(180);
  const [insurance, setInsurance] = useState(120);
  const [transport, setTransport] = useState(160);
  const [groceries, setGroceries] = useState(420);
  const [dining, setDining] = useState(220);
  const [subscriptions, setSubscriptions] = useState(45);
  const [other, setOther] = useState(120);
  const [ccDebt, setCcDebt] = useState(1200);
  const [ccApr, setCcApr] = useState(19.99);
  const [studentLoan, setStudentLoan] = useState(8000);
  const [studentApr, setStudentApr] = useState(5.2);
  const [risk, setRisk] = useState("balanced");
  const [cryptoPct, setCryptoPct] = useState(0);

  // What-if: extra $/mo routed to goals
  const [whatIf, setWhatIf] = useState(0);

  // For Ask Grain prefill
  const [askPreset, setAskPreset] = useState<string | undefined>();
  const [chatOpen, setChatOpen] = useState(false);

  useEffect(() => {
    if (seeded.current) return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (typeof s.income === 'number') setIncome(s.income);
        if (typeof s.rent === 'number') setRent(s.rent);
        if (typeof s.utilities === 'number') setUtilities(s.utilities);
        if (typeof s.insurance === 'number') setInsurance(s.insurance);
        if (typeof s.transport === 'number') setTransport(s.transport);
        if (typeof s.groceries === 'number') setGroceries(s.groceries);
        if (typeof s.dining === 'number') setDining(s.dining);
        if (typeof s.subscriptions === 'number') setSubscriptions(s.subscriptions);
        if (typeof s.other === 'number') setOther(s.other);
        if (typeof s.ccDebt === 'number') setCcDebt(s.ccDebt);
        if (typeof s.ccApr === 'number') setCcApr(s.ccApr);
        if (typeof s.studentLoan === 'number') setStudentLoan(s.studentLoan);
        if (typeof s.studentApr === 'number') setStudentApr(s.studentApr);
        if (typeof s.risk === 'string') setRisk(s.risk);
        if (typeof s.cryptoPct === 'number') setCryptoPct(s.cryptoPct);
      }
    } catch {}
    seeded.current = true;
  }, []);

  // Derived calcs
  const fixedTotal = rent + utilities + insurance + subscriptions;
  const variableTotal = transport + groceries + dining + other;
  const spendTotal = fixedTotal + variableTotal;
  const leftover = Math.max(0, income - spendTotal);

  const monthlyCoreSpend = rent + utilities + groceries + transport + insurance;
  const emergencyTarget = Math.round(monthlyCoreSpend * 4);

  const { recSaveCash, recInvest, investShare } = useMemo(() => {
    let share = risk === "conservative" ? 0.3 : risk === "balanced" ? 0.55 : 0.75;
    if (risk === "yolo") share = 0.8;
    if (ccDebt > 0 && ccApr > 10) share = Math.max(0.15, share - 0.25);
    const invest = Math.round(leftover * share);
    const save = Math.max(0, leftover - invest);
    const effectiveShare = leftover > 0 ? invest / Math.max(1, leftover) : share;
    return { recSaveCash: save, recInvest: invest, investShare: effectiveShare };
  }, [leftover, risk, ccDebt, ccApr]);

  const monthlyToGoals = recSaveCash + recInvest;              // base plan
  const monthlyToGoalsBoosted = monthlyToGoals + whatIf;       // what-if plan
  const investSharePct = Math.round(Math.min(1, Math.max(0, investShare)) * 100);
  const savingsRate = Math.round((monthlyToGoals / Math.max(1, income)) * 100);
  const monthlyAfterGoals = Math.max(0, leftover - monthlyToGoals);

  const { crypto: cryptoAmt, etf: etfAmt, bond: bondAmt } = investBreakdown(recInvest, cryptoPct);

  const allocationData = [
    { name: "housing", value: rent },
    { name: "utilities", value: utilities },
    { name: "insurance", value: insurance },
    { name: "transport", value: transport },
    { name: "groceries", value: groceries },
    { name: "dining", value: dining },
    { name: "subscriptions", value: subscriptions },
    { name: "other", value: other },
    { name: "savings", value: recSaveCash },
    { name: "investments", value: recInvest },
  ].filter(d => Number.isFinite(d.value) && d.value > 0);
  const totalWithRec = allocationData.reduce((a, b) => a + b.value, 0);
  const largestAllocation = allocationData.length ? allocationData.reduce((prev, cur) => (cur.value > prev.value ? cur : prev)) : null;

  const trend = [
    { m: "Apr", spend: 2980, save: 820 },
    { m: "May", spend: 3050, save: 760 },
    { m: "Jun", spend: 3120, save: 690 },
    { m: "Jul", spend: 2990, save: 810 },
    { m: "Aug", spend: 3150, save: 640 },
    { m: "Sep", spend: spendTotal, save: monthlyToGoals },
  ];
  const latestTrend = trend[trend.length - 1];
  const prevTrend = trend[Math.max(0, trend.length - 2)];
  const spendChange = latestTrend.spend - prevTrend.spend;
  const saveChange = latestTrend.save - prevTrend.save;
  const formatDelta = (delta: number) => {
    if (delta === 0) return "no change";
    const sign = delta > 0 ? "+" : "-";
    return `${sign}$${Math.abs(delta).toLocaleString()}/mo`;
  };
  const spendChangeLabel = formatDelta(spendChange);
  const saveChangeLabel = formatDelta(saveChange);

  const goals = useMemo(() => DEMO_GOALS, []);
  const primaryGoal = goals[0];
  const monthsToPrimary = monthsToGoal(primaryGoal.target, primaryGoal.saved, monthlyToGoals);
  const monthsToPrimaryBoost = monthsToGoal(primaryGoal.target, primaryGoal.saved, monthlyToGoalsBoosted);

  const insights = useMemo(() => {
    const out: { title: string; detail: string; tag?: string; cta?: string }[] = [];
    const housingPct = (rent / Math.max(1, income)) * 100;
    if (housingPct > 35) out.push({ title: "Housing Is High vs Benchmark", detail: `Rent is ${housingPct.toFixed(0)}% of income (benchmark ~30%). Consider trimming ~$${Math.round(((housingPct - 30) / 100) * income).toLocaleString()}.`, tag: "benchmark", cta: "What does this mean for me?" });
    if (ccDebt > 0 && ccApr >= 15) out.push({ title: "High-Interest Debt First", detail: `Credit card APR ${ccApr}% detected. Redirect $${Math.min(300, monthlyToGoals).toLocaleString()} this month to debt payoff — avoids ~$${Math.round((ccApr / 100 / 12) * ccDebt).toLocaleString()} interest next month.`, tag: "debt", cta: "Help me prioritize payments" });
    if (subscriptions > 40) out.push({ title: "Subscriptions Audit", detail: `Subscriptions total $${subscriptions}/mo. Cancel 1–2 rarely used to save $${(subscriptions * 12).toLocaleString()}/yr.`, tag: "quick win", cta: "Which ones should I cancel?" });
    if (dining > 200) out.push({ title: "Dining Out Creep", detail: `Dining is $${dining}/mo. Trim 20% → +$${Math.round(dining * 0.2).toLocaleString()}/mo ($${Math.round(dining * 0.2 * 12).toLocaleString()}/yr).`, tag: "behavior", cta: "Give me a 3-step plan" });
    if (monthlyToGoals < 500) out.push({ title: "Increase Savings Rate", detail: `Only $${monthlyToGoals.toLocaleString()}/mo to goals now. Target ~$${Math.round(income * 0.2).toLocaleString()} (≈20%) if possible.`, tag: "coach", cta: "How can I get there?" });
    if (monthlyCoreSpend > 0) out.push({ title: "Emergency Fund Target", detail: `Aim for ~$${emergencyTarget.toLocaleString()} (≈4 months core). You’re spending ~$${monthlyCoreSpend.toLocaleString()}/mo on essentials.`, tag: "safety", cta: "How did you calculate this?" });
    return out.slice(0, 5);
  }, [income, rent, ccDebt, ccApr, subscriptions, dining, monthlyToGoals, monthlyCoreSpend, emergencyTarget]);

  const focusInsights = insights.slice(0, 2);
  const debtInterestEstimate = Math.max(0, Math.round((ccApr / 100 / 12) * ccDebt));
  const hasDebt = ccDebt > 0 || studentLoan > 0;

  const aiContext = useMemo(() => {
    const goalDetails = goals
      .map(
        (g) =>
          `${g.name}: $${g.saved.toLocaleString()} saved of $${g.target.toLocaleString()} (${monthsToGoal(g.target, g.saved, monthlyToGoals)} months at current pace)`,
      )
      .join("; ");

    const debtSummary: string[] = [];
    if (ccDebt > 0) debtSummary.push(`Credit card $${ccDebt.toLocaleString()} at ${ccApr}% APR`);
    if (studentLoan > 0) debtSummary.push(`Student loan $${studentLoan.toLocaleString()} at ${studentApr}% APR`);

    return [
      `Monthly income: $${income.toLocaleString()}`,
      `Planned spend: $${spendTotal.toLocaleString()}`,
      `Leftover after spend: $${leftover.toLocaleString()} (cushion after goals: $${monthlyAfterGoals.toLocaleString()})`,
      `Monthly to goals: $${monthlyToGoals.toLocaleString()} (cash $${recSaveCash.toLocaleString()}, invest $${recInvest.toLocaleString()}).`,
      `Primary goal: ${primaryGoal.name} — $${primaryGoal.saved.toLocaleString()} of $${primaryGoal.target.toLocaleString()} saved.`,
      goalDetails ? `Goals overview: ${goalDetails}.` : undefined,
      `Risk profile: ${risk}; crypto cap ${cryptoPct}% of investments.`,
      debtSummary.length ? `Debt focus: ${debtSummary.join("; ")}.` : "Debt focus: no unsecured debt currently tracked.",
      whatIf > 0 ? `What-if boost in play: +$${whatIf.toLocaleString()} per month.` : "What-if boost currently $0.",
    ]
      .filter(Boolean)
      .join("\n");
  }, [
    income,
    spendTotal,
    leftover,
    monthlyAfterGoals,
    monthlyToGoals,
    recSaveCash,
    recInvest,
    primaryGoal.name,
    primaryGoal.saved,
    primaryGoal.target,
    goals,
    risk,
    cryptoPct,
    ccDebt,
    ccApr,
    studentLoan,
    studentApr,
    whatIf,
  ]);

  const sectionAnchors = [
    { id: "focus", label: "Monthly Focus" },
    { id: "goals", label: "Goal Journey" },
    { id: "momentum", label: "Momentum & Allocation" },
    { id: "plan", label: "Tune Your Plan" },
    { id: "ai-insights", label: "AI Coach" },
  ];

  /* ────────────── render ────────────── */

  return (
    <div className="min-h-screen bg-neutral-50">
      {/* Header */}
      <header className="sticky top-0 z-20 backdrop-blur bg-neutral-50/80 border-b">
        <div className="max-w-6xl mx-auto px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-emerald-600" />
            <span className="text-2xl font-semibold tracking-tight">grain</span>
            <Badge variant="secondary" className="ml-2">Beta</Badge>
          </div>
          <div className="hidden md:flex items-center gap-3 text-sm text-neutral-600">
            <Brain className="w-4 h-4" /> <span>AI Coach On</span>
            <TrendingUp className="w-4 h-4" /> <span>Live Insights</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" className="rounded-xl hidden md:inline" onClick={onRestart}>Restart Onboarding</Button>
            <Button variant="default" className="rounded-xl" onClick={()=>setChatOpen(true)}><MessageSquare className="w-4 h-4 mr-2"/>Ask Grain</Button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-5 py-6 space-y-8">
        <section className="space-y-4">
          <Card className="rounded-3xl border-none bg-gradient-to-br from-emerald-500 via-emerald-600 to-sky-500 text-white shadow-lg">
            <CardContent className="p-6 sm:p-8 space-y-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-2">
                  <div className="text-xs uppercase tracking-[0.28em] text-emerald-100">Monthly Gameplan</div>
                  <div className="text-3xl font-semibold">Route ${monthlyToGoals.toLocaleString()} to your goals</div>
                  <div className="text-sm text-emerald-50/80">You take home ${income.toLocaleString()} and have ${spendTotal.toLocaleString()} earmarked for spending.</div>
                </div>
                <Button variant="secondary" className="rounded-xl bg-white/90 text-emerald-700 hover:bg-white shadow" onClick={() => setChatOpen(true)}>
                  <MessageSquare className="w-4 h-4 mr-2" /> Ask Grain
                </Button>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-2xl border border-white/20 bg-white/10 p-4 space-y-2">
                  <div className="flex items-center justify-between text-xs uppercase tracking-wide text-emerald-100">
                    <span>To Goals</span>
                    <Badge variant="secondary" className="bg-white/20 text-white border-white/30 hover:bg-white/30">Output</Badge>
                  </div>
                  <div className="text-2xl font-semibold">${monthlyToGoals.toLocaleString()}</div>
                  <div className="text-xs text-emerald-50/80">Cash ${recSaveCash.toLocaleString()} · Invest ${recInvest.toLocaleString()} ({savingsRate}% of income)</div>
                </div>
                <div className="rounded-2xl border border-white/20 bg-white/10 p-4 space-y-2">
                  <div className="flex items-center justify-between text-xs uppercase tracking-wide text-emerald-100">
                    <span>Planned Spend</span>
                    <Badge variant="secondary" className="bg-white/20 text-white border-white/30 hover:bg-white/30">Output</Badge>
                  </div>
                  <div className="text-2xl font-semibold">${spendTotal.toLocaleString()}</div>
                  <div className="text-xs text-emerald-50/80">Left after spend: ${leftover.toLocaleString()} · After goals: ${monthlyAfterGoals.toLocaleString()}</div>
                </div>
                <div className="rounded-2xl border border-white/20 bg-white/10 p-4 space-y-2">
                  <div className="flex items-center justify-between text-xs uppercase tracking-wide text-emerald-100">
                    <span>Safety Net</span>
                    <Badge variant="secondary" className="bg-white/20 text-white border-white/30 hover:bg-white/30">Output</Badge>
                  </div>
                  <div className="text-2xl font-semibold">${emergencyTarget.toLocaleString()}</div>
                  <div className="text-xs text-emerald-50/80">4 mo core spend · Saving this pace builds {Math.min(100, Math.max(0, Math.round(((recSaveCash * 6) / Math.max(1, emergencyTarget)) * 100)))}% in 6 mo</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        <nav aria-label="Dashboard sections" className="overflow-x-auto pb-2">
          <div className="flex items-center gap-2">
            {sectionAnchors.map(({ id, label }) => (
              <a
                key={id}
                href={`#${id}`}
                className="rounded-full border border-neutral-200 bg-white px-4 py-2 text-xs font-semibold text-neutral-600 transition-colors hover:border-emerald-300 hover:text-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
              >
                {label}
              </a>
            ))}
          </div>
        </nav>

        <DashboardSection
          id="focus"
          eyebrow="Monthly Focus"
          title="See how this month’s money flows"
          description="These cards break down income, spend, and the quick wins Grain wants you to act on first."
          action={
            <Button size="sm" variant="secondary" className="rounded-xl" onClick={() => setChatOpen(true)}>
              <MessageSquare className="w-3.5 h-3.5 mr-2" /> Ask Grain
            </Button>
          }
        >
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Card className="rounded-2xl">
              <CardContent className="p-5 space-y-4">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <Wallet className="w-4 h-4 text-emerald-600" />
                    <span className="font-semibold text-neutral-800">Cash Flow</span>
                  </div>
                  <Badge variant="secondary">Output</Badge>
                </div>
                <div className="space-y-2 text-sm text-neutral-600">
                  <div className="flex justify-between"><span>Income</span><span>${income.toLocaleString()}</span></div>
                  <div className="flex justify-between"><span>Planned spend</span><span>${spendTotal.toLocaleString()}</span></div>
                  <div className="flex justify-between font-medium text-neutral-800"><span>Leftover</span><span>${leftover.toLocaleString()}</span></div>
                </div>
                <div className="rounded-xl bg-emerald-50 text-emerald-700 text-xs p-3">
                  Routing ${monthlyToGoals.toLocaleString()} leaves ${monthlyAfterGoals.toLocaleString()} cushion.
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-2xl">
              <CardContent className="p-5 space-y-4">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <Target className="w-4 h-4 text-emerald-600" />
                    <span className="font-semibold text-neutral-800">Goal Pulse</span>
                  </div>
                  <Badge variant="secondary">Output</Badge>
                </div>
                <div className="text-sm text-neutral-600 space-y-2">
                  <div className="flex justify-between"><span>Primary goal</span><span>{primaryGoal.name}</span></div>
                  <div className="flex justify-between"><span>Saved</span><span>${primaryGoal.saved.toLocaleString()}</span></div>
                  <div className="flex justify-between font-medium text-neutral-800"><span>Months at this pace</span><span>~{monthsToPrimary}</span></div>
                </div>
                <div className="rounded-xl bg-neutral-100 text-neutral-700 text-xs p-3">
                  +${whatIf.toLocaleString()}/mo trims timeline to ~{monthsToPrimaryBoost} months.
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-2xl">
              <CardContent className="p-5 space-y-4">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <IconLineChart className="w-4 h-4 text-emerald-600" />
                    <span className="font-semibold text-neutral-800">Debt Pulse</span>
                  </div>
                  <Badge variant="outline">Input</Badge>
                </div>
                {hasDebt ? (
                  <div className="space-y-2 text-sm text-neutral-600">
                    <div className="flex justify-between"><span>Credit card</span><span>${ccDebt.toLocaleString()} · {ccApr}% APR</span></div>
                    <div className="flex justify-between"><span>Student loan</span><span>${studentLoan.toLocaleString()} · {studentApr}% APR</span></div>
                    {debtInterestEstimate > 0 && (
                      <div className="rounded-xl bg-amber-50 text-amber-800 text-xs p-3">
                        High-interest alert: carrying this costs ~${debtInterestEstimate.toLocaleString()}/mo.
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-sm text-neutral-600">No debt tracked. Add balances to see payoff guidance.</div>
                )}
                <Button variant="secondary" className="rounded-xl w-full" onClick={() => setChatOpen(true)}>
                  <MessageSquare className="w-3.5 h-3.5 mr-2" /> Ask about payoff plan
                </Button>
              </CardContent>
            </Card>

            <Card className="rounded-2xl border border-emerald-100/70 bg-white shadow-sm">
              <CardContent className="p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs uppercase tracking-wide text-neutral-500">Coach View</div>
                    <div className="font-semibold text-neutral-800">Focus This Month</div>
                  </div>
                  <Badge variant="secondary">Coach</Badge>
                </div>
                {focusInsights.length > 0 ? (
                  <div className="space-y-3">
                    {focusInsights.map((item, idx) => (
                      <div key={idx} className="rounded-xl border bg-neutral-50 p-3">
                        <div className="text-sm font-medium text-neutral-800">{item.title}</div>
                        <div className="text-xs text-neutral-600 mt-1 leading-relaxed">{item.detail}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-neutral-600">Add income and spending to see where Grain recommends you focus first.</div>
                )}
                <Button variant="secondary" className="rounded-xl w-full" onClick={() => setChatOpen(true)}>Open Insights</Button>
              </CardContent>
            </Card>
          </div>
        </DashboardSection>

        <DashboardSection
          id="goals"
          eyebrow="Goal Journey"
          title="Adjust your timeline and explore what-if boosts"
          description="Move the slider when you have extra cash to see how each goal responds."
        >
          <Card className="rounded-3xl border border-emerald-100/70 bg-white shadow-sm">
            <CardContent className="p-6 space-y-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="text-xs uppercase tracking-wide text-emerald-600">Goal Timeline</div>
                  <div className="text-lg font-semibold text-neutral-800">Stay on track for {primaryGoal.name}</div>
                  <div className="text-xs text-neutral-500">Saved ${primaryGoal.saved.toLocaleString()} of ${primaryGoal.target.toLocaleString()} so far.</div>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 px-4 py-3 text-xs">
                    <div className="uppercase tracking-wide text-emerald-700/80">Current pace</div>
                    <div className="text-sm font-semibold text-emerald-800">~{monthsToPrimary} months</div>
                    <div className="text-neutral-600">Saving ${monthlyToGoals.toLocaleString()}/mo</div>
                  </div>
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 px-4 py-3 text-xs">
                    <div className="uppercase tracking-wide text-emerald-700/80">With boost</div>
                    <div className="text-sm font-semibold text-emerald-800">~{monthsToPrimaryBoost} months</div>
                    <div className="text-neutral-600">Add +${whatIf.toLocaleString()}/mo</div>
                  </div>
                </div>
              </div>
              <div className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-4 space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <div className="font-medium text-neutral-700">What-If: add to monthly goals</div>
                  <div className="rounded-full bg-white px-3 py-1 text-xs font-medium text-neutral-700 border border-neutral-200">+${whatIf.toLocaleString()}/mo</div>
                </div>
                <Slider value={[whatIf]} min={0} max={1000} step={25} onValueChange={(v) => setWhatIf(v[0])} />
                <div className="text-xs text-neutral-500">Use this slider when you get extra cash (bonus, tax refund) to see payoff speed.</div>
              </div>
              <div className="grid md:grid-cols-2 gap-3">
                {goals.map((g) => (
                  <GoalRow
                    key={g.id}
                    name={g.name}
                    target={g.target}
                    saved={g.saved}
                    monthly={monthlyToGoals}
                    monthlyBoost={whatIf}
                  />
                ))}
              </div>
            </CardContent>
          </Card>
        </DashboardSection>

        <DashboardSection
          id="momentum"
          eyebrow="Momentum"
          title="Track allocation and pace at a glance"
          description="Stay mindful of where each dollar is routed and whether your plan is speeding up or slowing down."
        >
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1.45fr)]">
            <Card className="rounded-3xl border border-emerald-100/70 bg-gradient-to-br from-emerald-50 via-white to-white shadow-sm">
              <CardContent className="p-6 space-y-5">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs uppercase tracking-wide text-emerald-600">Money Map</div>
                    <div className="font-semibold text-neutral-800">Where every dollar is earmarked</div>
                  </div>
                  <Badge variant="secondary">Output</Badge>
                </div>
                <div className="rounded-2xl border border-white/40 bg-white/80 px-4 py-3 text-xs text-neutral-600">
                  {largestAllocation
                    ? <>Largest slice: <span className="font-semibold text-neutral-800 capitalize">{largestAllocation.name}</span> at ${largestAllocation.value.toLocaleString()} ({Math.round((largestAllocation.value / Math.max(1, totalWithRec)) * 100)}%).</>
                    : "Add income and spend to see your allocation."}
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="rounded-full border border-emerald-200/80 bg-white/70 px-3 py-1 text-emerald-700">Savings rate {savingsRate}%</span>
                  <span className="rounded-full border border-emerald-200/80 bg-white/70 px-3 py-1 text-emerald-700">Invest share {investSharePct}%</span>
                  <span className="rounded-full border border-emerald-200/80 bg-white/70 px-3 py-1 text-emerald-700">Cushion ${monthlyAfterGoals.toLocaleString()}</span>
                </div>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={allocationData} dataKey="value" nameKey="name" innerRadius={58} outerRadius={100} paddingAngle={1}>
                        {allocationData.map((entry, index) => (
                          <Cell key={`c-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <ReTooltip formatter={(value: number | string, name: string) => [`$${Number(value).toLocaleString()}`, name]} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  {allocationData.map((d, i) => (
                    <div key={d.name} className="flex items-center gap-2 rounded-xl border border-emerald-100/70 bg-white/80 px-3 py-2">
                      <span className="inline-block w-3 h-3 rounded" style={{ background: COLORS[i % COLORS.length] }} />
                      <span className="capitalize text-neutral-700">{d.name}</span>
                      <span className="ml-auto font-medium text-neutral-800">{Math.round((d.value / Math.max(1, totalWithRec)) * 100)}%</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-3xl border border-neutral-200/80 bg-white shadow-sm">
              <CardContent className="p-6 space-y-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="text-xs uppercase tracking-wide text-neutral-500">Momentum Tracker</div>
                    <div className="font-semibold text-neutral-800">Spending vs saving trend</div>
                    <div className="text-xs text-neutral-500">Your plan routes ${latestTrend.save.toLocaleString()} to goals vs ${latestTrend.spend.toLocaleString()} spend this month.</div>
                  </div>
                  <div className="rounded-xl border bg-neutral-50 px-4 py-3 text-xs text-neutral-600">
                    Primary goal in ~{monthsToPrimary} months · boost trims to ~{monthsToPrimaryBoost}
                  </div>
                </div>
                <div className="grid gap-2 text-xs sm:grid-cols-3">
                  <div className="rounded-2xl border border-neutral-200 bg-neutral-50 px-3 py-3">
                    <div className="font-semibold text-neutral-800 text-sm">${monthlyToGoals.toLocaleString()}</div>
                    <div className="text-neutral-500">Goal routing now</div>
                  </div>
                  <div className="rounded-2xl border border-neutral-200 bg-neutral-50 px-3 py-3">
                    <div className="font-semibold text-neutral-800 text-sm">{saveChangeLabel}</div>
                    <div className="text-neutral-500">Savings vs last month</div>
                  </div>
                  <div className="rounded-2xl border border-neutral-200 bg-neutral-50 px-3 py-3">
                    <div className="font-semibold text-neutral-800 text-sm">{spendChangeLabel}</div>
                    <div className="text-neutral-500">Spend vs last month</div>
                  </div>
                </div>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={trend} margin={{ left: 0, right: 0, top: 10, bottom: 0 }}>
                      <defs>
                        <linearGradient id="gSpend" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#ef4444" stopOpacity={0.45} />
                          <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="gSave" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#22c55e" stopOpacity={0.45} />
                          <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="m" />
                      <YAxis />
                      <ReTooltip />
                      <Area type="monotone" dataKey="spend" stroke="#ef4444" fill="url(#gSpend)" />
                      <Area type="monotone" dataKey="save" stroke="#22c55e" fill="url(#gSave)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                <div className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-xs text-neutral-600">
                  Track this weekly. If spend creeps {spendChange > 0 ? "up" : "down"}, shift a little more into goals to stay on pace.
                </div>
              </CardContent>
            </Card>
          </div>
        </DashboardSection>

        <DashboardSection
          id="plan"
          eyebrow="Tunable Inputs"
          title="Update assumptions whenever life shifts"
          description="Your plan updates instantly as you edit income, spending, risk, or debt details."
        >
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1.2fr)]">
            <Card className="rounded-3xl border border-neutral-200/80 bg-white shadow-sm">
              <CardContent className="p-6 space-y-6">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-xs uppercase tracking-wide text-neutral-500">Cashflow inputs</div>
                    <div className="font-semibold text-neutral-800">Keep your monthly assumptions fresh</div>
                    <div className="text-xs text-neutral-500">We save updates locally so you can tweak whenever life changes.</div>
                  </div>
                  <Badge variant="outline">Input</Badge>
                </div>
                <div className="grid gap-5 lg:grid-cols-2">
                  <div className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-4 space-y-4">
                    <div className="text-xs uppercase tracking-wide text-neutral-500">Income & fixed</div>
                    <div className="space-y-4">
                      <LabeledNumber label="Net Income" val={income} setVal={setIncome} tooltip="What you take home after tax each month." />
                      <LabeledNumber label="Rent / Mortgage" val={rent} setVal={setRent} />
                      <LabeledNumber label="Utilities" val={utilities} setVal={setUtilities} />
                      <LabeledNumber label="Insurance" val={insurance} setVal={setInsurance} />
                      <LabeledNumber label="Subscriptions" val={subscriptions} setVal={setSubscriptions} />
                    </div>
                  </div>
                  <div className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-4 space-y-4">
                    <div className="text-xs uppercase tracking-wide text-neutral-500">Lifestyle</div>
                    <div className="space-y-4">
                      <LabeledNumber label="Transport" val={transport} setVal={setTransport} />
                      <LabeledNumber label="Groceries" val={groceries} setVal={setGroceries} />
                      <LabeledNumber label="Dining" val={dining} setVal={setDining} />
                      <LabeledNumber label="Other" val={other} setVal={setOther} />
                    </div>
                  </div>
                </div>
                <div className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-xs text-neutral-600">
                  Tip: Ask Grain for spending benchmarks or a quick plan to trim one category at a time.
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-3xl border border-neutral-200/80 bg-white shadow-sm">
              <CardContent className="p-6 space-y-6">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-xs uppercase tracking-wide text-neutral-500">Strategy & payoff</div>
                    <div className="font-semibold text-neutral-800">Dial risk and debt priorities</div>
                    <div className="text-xs text-neutral-500">We reduce investing when high-interest debt is present so you stay pragmatic.</div>
                  </div>
                  <Badge variant="outline">Input</Badge>
                </div>
                <div className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-4 space-y-3">
                  <div className="text-xs uppercase tracking-wide text-neutral-500">Risk profile</div>
                  <Select value={risk} onValueChange={setRisk}>
                    <SelectTrigger className="rounded-xl"><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="conservative">Conservative</SelectItem>
                      <SelectItem value="balanced">Balanced</SelectItem>
                      <SelectItem value="growth">Growth</SelectItem>
                      <SelectItem value="yolo">YOLO / Risky</SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="text-xs text-neutral-500">We’ll direct ~{investSharePct}% of leftovers toward investing based on this profile.</div>
                </div>
                <div className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-4 space-y-4">
                  <div className="text-xs uppercase tracking-wide text-neutral-500">Debt snapshot</div>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <LabeledNumber label="Credit Card Balance" val={ccDebt} setVal={setCcDebt} />
                    <LabeledNumber label="Credit Card APR %" val={ccApr} setVal={setCcApr} step={0.5} tooltip="APR = Annual Percentage Rate (your yearly interest rate)." />
                    <LabeledNumber label="Student Loan Balance" val={studentLoan} setVal={setStudentLoan} />
                    <LabeledNumber label="Student APR %" val={studentApr} setVal={setStudentApr} step={0.1} tooltip="Your student loan’s yearly interest rate." />
                  </div>
                  {hasDebt && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                      Focus extra cash on balances over 10% APR before increasing investments.
                    </div>
                  )}
                </div>
                <div className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-4 space-y-4">
                  <div className="text-xs uppercase tracking-wide text-neutral-500">Invest preview</div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <SplitBadge label="Cash (HISA)" amt={recSaveCash} />
                    <SplitBadge label="Diversified ETFs" amt={etfAmt} />
                    <SplitBadge label="Bonds" amt={bondAmt} />
                    <SplitBadge label="Crypto (cap)" amt={cryptoAmt} muted={cryptoPct === 0} />
                  </div>
                  <div className="space-y-2">
                    <div className="text-xs text-neutral-500">Crypto Allocation (0–10% of investments)</div>
                    <Slider value={[cryptoPct]} min={0} max={10} step={1} onValueChange={(v) => setCryptoPct(v[0])} />
                    <div className="text-xs text-neutral-500">Currently {cryptoPct}% → ${cryptoAmt.toLocaleString()}</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </DashboardSection>

        <DashboardSection
          id="ai-insights"
          eyebrow="AI Coach"
          title="Tap into Grain’s tailored insights"
          description="Each card is triggered by your numbers. Open one to ask a follow-up question in context."
          action={
            <Button
              size="sm"
              variant="secondary"
              className="rounded-xl"
              onClick={() => setChatOpen(true)}
            >
              <MessageSquare className="w-3.5 h-3.5 mr-1" /> Ask Grain
            </Button>
          }
        >
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
            {insights.map((it, idx) => (
              <InsightCard
                key={idx}
                title={it.title}
                detail={it.detail}
                tag={it.tag}
                onAsk={() => { setAskPreset(it.cta || it.title); setChatOpen(true); }}
              />
            ))}
          </div>
        </DashboardSection>
      </main>

      <Button
        variant="default"
        className="fixed bottom-20 right-4 z-30 rounded-full bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-lg hover:bg-emerald-500 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 sm:bottom-6 sm:right-6"
        onClick={() => setChatOpen(true)}
        aria-label="Ask Grain"
      >
        <MessageSquare className="w-4 h-4 mr-2" /> Ask Grain
      </Button>

      <footer className="max-w-6xl mx-auto px-5 py-10 text-xs text-neutral-500">
        © {new Date().getFullYear()} Grain. Interactive MVP prototype.
      </footer>

      <AskGrainSheet open={chatOpen} setOpen={setChatOpen} presetMsg={askPreset} context={aiContext} />
    </div>
  );
}
