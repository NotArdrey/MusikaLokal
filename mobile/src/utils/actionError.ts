type ErrorLike = {
  code?: string | number;
  context?: unknown;
  details?: unknown;
  error?: unknown;
  hint?: unknown;
  message?: unknown;
  responseBody?: unknown;
  status?: string | number;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

const readText = (...values: unknown[]) => {
  for (const value of values) {
    if (typeof value !== "string" && typeof value !== "number") {
      continue;
    }

    const trimmed = String(value).trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
  }

  return null;
};

const readResponseBodyMessage = (responseBody: unknown) => {
  if (isRecord(responseBody)) {
    return readText(responseBody.message, responseBody.error, responseBody.code);
  }

  return readText(responseBody);
};

const summarizeContext = (context: unknown) => {
  if (!isRecord(context)) {
    return context;
  }

  const summary: Record<string, unknown> = {};
  for (const key of ["status", "statusText", "url", "type"]) {
    if (context[key] !== undefined) {
      summary[key] = context[key];
    }
  }

  return Object.keys(summary).length > 0 ? summary : undefined;
};

export const getActionErrorMessage = (error: unknown, fallback: string) => {
  const errorRecord = isRecord(error) ? (error as ErrorLike) : {};
  return (
    readResponseBodyMessage(errorRecord.responseBody) ||
    readText(errorRecord.message, errorRecord.error, errorRecord.details, errorRecord.hint) ||
    fallback
  );
};

export const getResultErrorMessage = (result: unknown, fallback: string) => {
  if (!isRecord(result)) {
    return fallback;
  }

  return readText(result.message, result.error, result.code) || fallback;
};

export const logActionError = (
  scope: string,
  action: string,
  error: unknown,
  context?: Record<string, unknown>,
) => {
  const errorRecord = isRecord(error) ? (error as ErrorLike) : {};
  console.error(`[${scope}] ${action} failed`, {
    ...(context || {}),
    error: {
      message: getActionErrorMessage(error, "Unknown error"),
      code: errorRecord.code,
      details: errorRecord.details,
      hint: errorRecord.hint,
      status: errorRecord.status || (isRecord(errorRecord.context) ? errorRecord.context.status : undefined),
      responseBody: errorRecord.responseBody,
      context: summarizeContext(errorRecord.context),
    },
  });
};
