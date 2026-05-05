const extractEdgeErrorContext = async (context: unknown): Promise<string | null> => {
  const responseLike = context as {
    clone?: () => any;
    json?: () => Promise<any>;
    text?: () => Promise<string>;
  } | null;

  const readMessage = (value: any): string | null => {
    if (!value) return null;
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value !== 'object') return null;

    for (const key of ['error', 'message', 'details', 'hint']) {
      const message = value[key];
      if (typeof message === 'string' && message.trim()) {
        return message.trim();
      }
    }

    return null;
  };

  try {
    const parsed = typeof responseLike?.clone === 'function'
      ? await responseLike.clone().json()
      : await responseLike?.json?.();
    const message = readMessage(parsed);
    if (message) return message;
  } catch {
    // Some function errors expose plain text context instead of JSON.
  }

  try {
    const text = typeof responseLike?.clone === 'function'
      ? await responseLike.clone().text()
      : await responseLike?.text?.();
    return readMessage(text);
  } catch {
    return null;
  }
};

export const getEdgeFunctionErrorMessage = async (error: unknown, fallback: string) => {
  if (!error) return fallback;
  if (typeof error === 'string') return error;

  const err = error as {
    message?: string;
    details?: string;
    hint?: string;
    context?: unknown;
  };

  return (
    await extractEdgeErrorContext(err.context)
    || err.details
    || err.hint
    || err.message
    || fallback
  );
};
