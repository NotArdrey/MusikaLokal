import { useEffect, useState } from "react";
import { AppState } from "react-native";
import { supabase } from "../../lib/supabase";

export function useGroupGigApplication(gigId: string | null, groupId: string | null, userId: string | null) {
  const key = gigId && groupId && userId ? `${gigId}:${groupId}:${userId}` : null;
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState<{
    key: string | null; checking: boolean; application: any; error: string | null;
  }>({ key: null, checking: false, application: null, error: null });

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    let request = 0;
    const load = async () => {
      const currentRequest = ++request;
      setResult((previous) => ({
        key, checking: true, error: null,
        application: previous.key === key ? previous.application : null,
      }));
      try {
        const { data, error } = await supabase.from("gig_applications")
          .select("id, applicant_id, status, profiles:applicant_id(full_name)")
          .eq("gig_id", gigId).eq("group_id", groupId)
          .in("status", ["pending", "accepted", "approved"])
          .order("created_at", { ascending: false }).limit(1).maybeSingle();
        if (error) throw error;
        if (!cancelled && currentRequest === request) {
          setResult({ key, checking: false, application: data, error: null });
        }
      } catch {
        if (!cancelled && currentRequest === request) {
          setResult({ key, checking: false, application: null, error: "Could not check this group's application. Please retry." });
        }
      }
    };
    void load();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void load();
    });
    return () => { cancelled = true; subscription.remove(); };
  }, [key, gigId, groupId, retry]);

  const current = key && result.key === key ? result : null;
  return {
    groupAlreadyApplied: Boolean(current?.application),
    groupApplicationBy: current?.application
      ? current.application.applicant_id === userId ? "you" : current.application.profiles?.full_name || "another member"
      : null,
    groupApplicationChecking: Boolean(key && (!current || current.checking)),
    groupApplicationCheckError: current?.error || null,
    retryGroupApplicationCheck: () => setRetry((value) => value + 1),
  };
}
