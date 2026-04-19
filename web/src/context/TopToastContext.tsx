/**
 * Minimal TopToastContext for web – uses window.alert as a simple fallback.
 * Replace with a proper toast UI when ready.
 */

export type TopToastPayload = {
  title?: string;
  message: string;
  type?: "success" | "error" | "info";
};

export const showTopToast = (payload: TopToastPayload) => {
  // On web we can use a simple console log + optional alert.
  // eslint-disable-next-line no-console
  console.log(`[Toast] ${payload.type ?? "info"}: ${payload.message}`);
};
