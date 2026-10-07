import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";

type Scope = "self" | "group";
type ConsentState = {
  key: string;
  application: any;
  loading: boolean;
  saving: Scope | null;
  errorMessage: string;
  successMessage: string;
};
type ConsentRequest = {
  key: string;
  refresh: () => Promise<void>;
  save: (scope: Scope, profile: boolean, gigPage: boolean) => Promise<void>;
};

export function useGigFeatureConsent(applicationId: string | undefined) {
  const key = applicationId || "";
  const [state, setState] = useState<ConsentState>({
    key: "", application: null, loading: true, saving: null, errorMessage: "", successMessage: "",
  });
  const requestRef = useRef<ConsentRequest | null>(null);

  useEffect(() => {
    let active = true;
    let userId: string | null = null;
    let revision = 0;
    let authRevision = 0;
    let authInitialized = false;
    let saving = false;
    const publish = (update: Partial<ConsentState>) => {
      if (active) setState(previous => ({ ...previous, key, ...update }));
    };
    const invoke = async (body: Record<string, unknown>, expectedUser: string | null) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session || session.user.id !== expectedUser) throw new Error("Please sign in to manage featuring permission.");
      const { data, error } = await supabase.functions.invoke("gig-applications", {
        body, headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (error) {
        const response = error.context;
        const detail = response instanceof Response ? await response.clone().json().catch(() => null) : null;
        throw new Error(detail?.error || error.message || "The featuring request could not be completed.");
      }
      if (data?.error) throw new Error(data.error);
      return data;
    };
    const refresh = async () => {
      const requestRevision = ++revision;
      const expectedUser = userId;
      saving = false;
      publish({ application: null, loading: true, saving: null, errorMessage: "", successMessage: "" });
      try {
        if (!applicationId) throw new Error("This featuring request is missing its application reference.");
        const data = await invoke({ action: "fetch_feature_consent", applicationId }, expectedUser);
        if (active && revision === requestRevision) publish({ application: data, loading: false });
      } catch (error: any) {
        if (active && revision === requestRevision) publish({ loading: false, errorMessage: error.message || "Unable to load the featuring request." });
      }
    };
    const save = async (scope: Scope, profile: boolean, gigPage: boolean) => {
      if (saving || !applicationId || !userId) return;
      saving = true;
      const requestRevision = ++revision;
      const expectedUser = userId;
      publish({ saving: scope, errorMessage: "", successMessage: "" });
      try {
        const data = await invoke({ action: "respond_feature_consent", applicationId, scope,
          showOnProfile: profile, showOnGigPage: gigPage }, expectedUser);
        if (active && revision === requestRevision) publish({ application: data, saving: null,
          successMessage: scope === "self" ? "Your profile choice was saved." : "The band's featuring choices were saved." });
      } catch (error: any) {
        if (active && revision === requestRevision) publish({ saving: null, errorMessage: error.message || "Unable to save your featuring choices." });
      } finally {
        if (revision === requestRevision) saving = false;
      }
    };
    const request = { key, refresh, save };
    requestRef.current = request;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      ++authRevision;
      const nextUser = session?.user.id || null;
      if (nextUser !== userId || !authInitialized) {
        authInitialized = true;
        userId = nextUser;
        void refresh();
      }
    });
    const initialAuthRevision = authRevision;
    void supabase.auth.getSession().then(({ data: { session } }) => {
      if (!active || authRevision !== initialAuthRevision) return;
      userId = session?.user.id || null;
      void refresh();
    });
    return () => {
      active = false;
      subscription.unsubscribe();
      if (requestRef.current === request) requestRef.current = null;
    };
  }, [applicationId, key]);

  const loadApplication = useCallback(async () => {
    if (requestRef.current?.key === key) await requestRef.current.refresh();
  }, [key]);
  const saveConsent = useCallback(async (scope: Scope, profile: boolean, gigPage = false) => {
    if (requestRef.current?.key === key) await requestRef.current.save(scope, profile, gigPage);
  }, [key]);
  const current = state.key === key ? state : {
    key, application: null, loading: true, saving: null, errorMessage: "", successMessage: "",
  };
  return { ...current, loadApplication, saveConsent };
}
