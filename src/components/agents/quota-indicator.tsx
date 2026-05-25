"use client";

import { useEffect, useRef, useState } from "react";
import { BarChart2 } from "lucide-react";

type AgentBudget = {
  slug: string;
  perIpUsed: number;
  perIpCap: number;
  perIpResetAt: number;
};

type BudgetData = {
  used: number;
  cap: number;
  resetAt: number;
  agent?: AgentBudget;
};

type Status = "loading" | "ok" | "error";

interface QuotaIndicatorProps {
  agent?: string;
}

function formatLocalTime(epochMs: number): string {
  return new Date(epochMs).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getPillStyle(used: number, cap: number): string {
  const ratio = cap > 0 ? used / cap : 0;
  if (ratio >= 0.9) {
    return "border-red-500/40 text-red-600 dark:text-red-400";
  }
  if (ratio >= 0.5) {
    return "border-amber-500/40 text-amber-600 dark:text-amber-400";
  }
  return "border-green-500/40 text-green-600 dark:text-green-400";
}

function getRingStyle(used: number, cap: number): string {
  const ratio = cap > 0 ? used / cap : 0;
  if (ratio >= 0.9) return "bg-red-500/10";
  if (ratio >= 0.5) return "bg-amber-500/10";
  return "bg-green-500/10";
}

export function QuotaIndicator({ agent }: QuotaIndicatorProps = {}) {
  const [status, setStatus] = useState<Status>("loading");
  const [data, setData] = useState<BudgetData | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function fetchBudget() {
    try {
      const url = agent
        ? `/api/budget?agent=${encodeURIComponent(agent)}`
        : "/api/budget";
      const res = await fetch(url);
      if (!res.ok) throw new Error("non-ok");
      const json = (await res.json()) as BudgetData;
      setData(json);
      setStatus("ok");
    } catch {
      if (status === "loading") setStatus("error");
      // silently swallow errors after first load
    }
  }

  useEffect(() => {
    // Defer the initial fetch out of the synchronous effect body so the
    // subsequent setState calls do not trigger cascading renders.
    // (See react-hooks/set-state-in-effect.)
    const initialTimer = setTimeout(() => {
      void fetchBudget();
    }, 0);

    function startPolling() {
      if (intervalRef.current) return;
      intervalRef.current = setInterval(() => {
        if (document.visibilityState === "visible") {
          void fetchBudget();
        }
      }, 30_000);
    }

    function handleVisibility() {
      if (document.visibilityState === "visible") {
        void fetchBudget();
        startPolling();
      } else {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      }
    }

    startPolling();
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      clearTimeout(initialTimer);
      document.removeEventListener("visibilitychange", handleVisibility);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agent]);

  if (status === "loading") {
    return (
      <div
        aria-label="Loading quota"
        className="h-7 w-28 animate-pulse rounded-full bg-muted"
      />
    );
  }

  if (status === "error" || !data) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground">
        <BarChart2 className="size-3.5" />
        <span aria-label="Quota unavailable">-</span>
      </span>
    );
  }

  const { used, cap, resetAt, agent: agentBlock } = data;
  const globalBorder = getPillStyle(used, cap);
  const globalBg = getRingStyle(used, cap);
  const resetLabel = formatLocalTime(resetAt);

  const globalPill = (
    <span
      data-quota-pill="global"
      title={`Resets at ${resetLabel}`}
      aria-label={`${used} of ${cap} requests used today. Resets at ${resetLabel}`}
      className={`inline-flex cursor-default items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${globalBorder} ${globalBg}`}
    >
      <BarChart2 className="size-3.5 shrink-0" />
      <span>
        {used} / {cap} today
      </span>
    </span>
  );

  if (!agentBlock) return globalPill;

  const agentBorder = getPillStyle(agentBlock.perIpUsed, agentBlock.perIpCap);
  const agentBg = getRingStyle(agentBlock.perIpUsed, agentBlock.perIpCap);
  const agentResetLabel = formatLocalTime(agentBlock.perIpResetAt * 1000);

  return (
    <div className="inline-flex items-center gap-2">
      {globalPill}
      <span
        data-quota-pill="agent"
        title={`Your ${agentBlock.slug} usage today. Resets at ${agentResetLabel}.`}
        aria-label={`${agentBlock.perIpUsed} of ${agentBlock.perIpCap} ${agentBlock.slug} requests used today by your IP. Resets at ${agentResetLabel}.`}
        className={`inline-flex cursor-default items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${agentBorder} ${agentBg}`}
      >
        <span>
          {agentBlock.perIpUsed} / {agentBlock.perIpCap} {agentBlock.slug}
        </span>
      </span>
    </div>
  );
}
