import { useEffect, useRef } from "react";

type LoadTimeValue = string | number | boolean | null | undefined;

type QueryTimingState = {
  dataUpdatedAt?: number;
  error?: unknown;
  fetchStatus?: string;
  isFetching?: boolean;
  isFetchingNextPage?: boolean;
  isLoading?: boolean;
  status?: string;
};

type UsePageLoadLoggerParams = {
  counts?: Record<string, LoadTimeValue>;
  details?: Record<string, LoadTimeValue>;
  enabled?: boolean;
  loading?: boolean;
  page: string;
  queries?: Record<string, QueryTimingState | null | undefined>;
  ready?: boolean;
  refreshing?: boolean;
};

const nowMs = () => {
  const maybePerformance = globalThis.performance;
  if (maybePerformance && typeof maybePerformance.now === "function") {
    return maybePerformance.now();
  }

  return Date.now();
};

const roundDuration = (value: number) => Math.round(value);

const summarizeError = (error: unknown) => {
  if (!error) return undefined;
  if (error instanceof Error) return error.message;
  return String(error);
};

export const logLoadTime = (
  page: string,
  event: string,
  payload: Record<string, unknown> = {},
) => {
  console.info(`[LoadTime][${page}] ${event}`, payload);
};

export const summarizeEdgeFunctionBody = (body?: Record<string, unknown>) => {
  if (!body) {
    return {};
  }

  return {
    action: typeof body.action === "string" ? body.action : undefined,
    cursor: body.cursor ? "present" : undefined,
    hasUserId: Boolean(body.userId || body.user_id),
    keys: Object.keys(body).sort(),
    limit: typeof body.limit === "number" ? body.limit : undefined,
  };
};

export const usePageLoadLogger = ({
  counts,
  details,
  enabled = true,
  loading = false,
  page,
  queries,
  ready,
  refreshing = false,
}: UsePageLoadLoggerParams) => {
  const mountStartedAtRef = useRef(nowMs());
  const loadCycleStartedAtRef = useRef<number | null>(loading ? mountStartedAtRef.current : null);
  const loadCycleTypeRef = useRef<"load" | "refresh">(refreshing ? "refresh" : "load");
  const firstReadyLoggedRef = useRef(false);
  const initialDetailsRef = useRef(details);
  const queryStartedAtRef = useRef<Record<string, number>>({});
  const renderCountRef = useRef(0);

  renderCountRef.current += 1;

  useEffect(() => {
    if (!enabled) return;

    logLoadTime(page, "mount", {
      details: initialDetailsRef.current,
      startedAt: new Date().toISOString(),
    });

    return () => {
      logLoadTime(page, "unmount", {
        lifetimeMs: roundDuration(nowMs() - mountStartedAtRef.current),
        renderCount: renderCountRef.current,
      });
    };
  }, [enabled, page]);

  useEffect(() => {
    if (!enabled) return;

    const active = Boolean(loading || refreshing);

    if (active && loadCycleStartedAtRef.current === null) {
      loadCycleStartedAtRef.current = nowMs();
      loadCycleTypeRef.current = refreshing ? "refresh" : "load";
      logLoadTime(page, `${loadCycleTypeRef.current}-start`, {
        counts,
        details,
      });
      return;
    }

    if (!active && loadCycleStartedAtRef.current !== null) {
      const durationMs = roundDuration(nowMs() - loadCycleStartedAtRef.current);
      const cycleType = loadCycleTypeRef.current;
      loadCycleStartedAtRef.current = null;
      logLoadTime(page, `${cycleType}-complete`, {
        counts,
        details,
        durationMs,
      });
    }
  }, [counts, details, enabled, loading, page, refreshing]);

  useEffect(() => {
    if (!enabled || !ready || firstReadyLoggedRef.current) return;

    firstReadyLoggedRef.current = true;
    logLoadTime(page, "first-ready", {
      counts,
      details,
      durationMs: roundDuration(nowMs() - mountStartedAtRef.current),
      renderCount: renderCountRef.current,
    });
  }, [counts, details, enabled, page, ready]);

  useEffect(() => {
    if (!enabled || !queries) return;

    Object.entries(queries).forEach(([queryName, query]) => {
      if (!query) return;

      const active = Boolean(
        query.isLoading ||
          query.isFetching ||
          query.isFetchingNextPage ||
          query.fetchStatus === "fetching",
      );
      const previousStart = queryStartedAtRef.current[queryName];

      if (active && previousStart === undefined) {
        queryStartedAtRef.current[queryName] = nowMs();
        logLoadTime(page, "query-start", {
          query: queryName,
          status: query.status,
        });
        return;
      }

      if (!active && previousStart !== undefined) {
        delete queryStartedAtRef.current[queryName];
        logLoadTime(page, "query-complete", {
          durationMs: roundDuration(nowMs() - previousStart),
          error: summarizeError(query.error),
          query: queryName,
          status: query.status,
          updatedAt: query.dataUpdatedAt
            ? new Date(query.dataUpdatedAt).toISOString()
            : undefined,
        });
      }
    });
  }, [enabled, page, queries]);
};
