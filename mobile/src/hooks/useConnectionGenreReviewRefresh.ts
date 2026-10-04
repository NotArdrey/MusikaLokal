import { useEffect, useRef } from "react";

export default function useConnectionGenreReviewRefresh(
  applications: readonly any[],
  active: boolean,
  refresh: () => Promise<void>,
) {
  const refreshRef = useRef(refresh);
  useEffect(() => { refreshRef.current = refresh; }, [refresh]);
  const pending = applications.some((application) =>
    ["queued", "processing"].includes(application?.ai_recommendation?.criteria_snapshot?.genre_review_status),
  );
  useEffect(() => {
    if (!active || !pending) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        await refreshRef.current();
      } catch {
        // Keep the current list visible while a temporary refresh failure retries.
      } finally {
        if (!cancelled) timer = setTimeout(poll, 5000);
      }
    };
    timer = setTimeout(poll, 5000);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [active, pending]);
}
