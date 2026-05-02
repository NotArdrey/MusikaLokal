import { supabase } from "../../lib/supabase";
import { logLoadTime, summarizeEdgeFunctionBody } from "../utils/loadTimeLogger";

type InvokeOptions = {
  body?: Record<string, unknown>;
  headers?: Record<string, string>;
};

export type CursorPage<T> = {
  items: T[];
  nextCursor: string | null;
};

const getErrorStatus = (error: any): number | undefined => {
  const status = Number(error?.status || error?.context?.status || error?.code || 0);
  return Number.isFinite(status) && status > 0 ? status : undefined;
};

export const invokeEdgeFunction = async <T>(
  functionName: string,
  options?: InvokeOptions,
): Promise<T> => {
  const startedAt = Date.now();
  const bodySummary = summarizeEdgeFunctionBody(options?.body);
  const { data, error } = await supabase.functions.invoke(functionName, options);
  const durationMs = Date.now() - startedAt;

  if (error) {
    logLoadTime(`Edge:${functionName}`, "failed", {
      ...bodySummary,
      durationMs,
      message: error.message,
      status: getErrorStatus(error),
    });

    const normalized = new Error(error.message || `${functionName} failed`) as Error & {
      code?: string | number;
      details?: unknown;
      status?: number;
    };

    normalized.code = (error as any).code;
    normalized.details = (error as any).details || (error as any).responseBody;
    normalized.status = getErrorStatus(error);
    throw normalized;
  }

  logLoadTime(`Edge:${functionName}`, "complete", {
    ...bodySummary,
    durationMs,
  });

  return data as T;
};

export const getCurrentUserId = async () => {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user?.id || null;
};
