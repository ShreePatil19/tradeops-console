"use client";

import { useEffect, useRef, useState } from "react";
import { BarChart2 } from "lucide-react";

type BudgetData = {
  used: number;
  cap: number;
  resetAt: number;
};

type Status = "loading" | "ok" | "error";

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

export function QuotaIndicator() {
  const [status, setStatus] = useState<Status>("loading");
  const [data, setData] = useState<BudgetData | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function fetchBudget() {
    try {
      const res = await fetch("/api/budget");
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
    fetchBudget();

    function startPolling() {
      if (intervalRef.current) return;
      intervalRef.current = setInterval(() => {
        if (document.visibilityState === "visible") {
          fetchBudget();
        }
      }, 30_000);
    }

    function handleVisibility() {
      if (document.visibilityState === "visible") {
        fetchBudget();
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
      document.removeEventListener("visibilitychange", handleVisibility);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const { used, cap, resetAt } = data;
  const pillBorder = getPillStyle(used, cap);
  const pillBg = getRingStyle(used, cap);
  const resetLabel = formatLocalTime(resetAt);

  return (
    <span
      title={`Resets at ${resetLabel}`}
      aria-label={`${used} of ${cap} requests used today. Resets at ${resetLabel}`}
      className={`inline-flex cursor-default items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${pillBorder} ${pillBg}`}
    >
      <BarChart2 className="size-3.5 shrink-0" />
      <span>
        {used} / {cap} today
      </span>
    </span>
  );
}
