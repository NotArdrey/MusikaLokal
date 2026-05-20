import AsyncStorage from "@react-native-async-storage/async-storage";
import { Session } from "@supabase/supabase-js";
import { router } from "expo-router";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { AppState, AppStateStatus } from "react-native";
import { clearSupabaseAuthStorage, supabase } from "../../lib/supabase";

type UnpaidBooking = {
  id: string;
  remaining_balance: number;
  studio_name: string;
  booking_date: string;
};

type AuthContextType = {
  session: Session | null;
  loading: boolean;
  isGuest: boolean;
  setGuestMode: (enabled: boolean) => Promise<void>;
  isAdmin: boolean;
  userRole: string | null;
  roleResolved: boolean;
  userId: string | null;
  // Backward-compatible fields; unpaid balances no longer lock app actions.
  isSystemLocked: boolean;
  unpaidBalance: number;
  unpaidBookings: UnpaidBooking[];
  checkSystemLock: () => Promise<void>;
  showLockAlert: (onBeforeNavigate?: () => void) => void;
  identityStatus: string | null;
  identityRequired: boolean;
  identityChecked: boolean;
  checkIdentityStatus: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  session: null,
  loading: true,
  isGuest: false,
  setGuestMode: async () => { },
  isAdmin: false,
  userRole: null,
  roleResolved: false,
  userId: null,
  isSystemLocked: false,
  unpaidBalance: 0,
  unpaidBookings: [],
  checkSystemLock: async () => { },
  showLockAlert: () => { },
  identityStatus: null,
  identityRequired: false,
  identityChecked: false,
  checkIdentityStatus: async () => { },
});

export const useAuth = () => useContext(AuthContext);

// Hook to require auth - redirects to login if not authenticated
export const useRequireAuth = () => {
  const { session, loading, isGuest } = useAuth();

  useEffect(() => {
    if (!loading && !session) {
      // Before redirecting, verify with the Supabase client directly.
      // React context may not have propagated the session yet after a fresh login.
      if (!isGuest) {
        supabase.auth.getSession().then(({ data: { session: directSession } }) => {
          if (!directSession) {
            router.replace("/");
          }
          // If directSession exists, context will catch up — don't redirect.
        }).catch(() => {
          router.replace("/");
        });
      } else {
        router.replace("/home");
      }
    }
  }, [session, loading, isGuest]);

  return {
    isAuthenticated: !!session,
    loading,
    userId: session?.user?.id || null,
  };
};

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isGuest, setIsGuest] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [roleResolved, setRoleResolved] = useState(false);

  // Payment reminder state. Outstanding balances are surfaced in wallet/activity,
  // but they no longer lock app actions.
  const [isSystemLocked, setIsSystemLocked] = useState(false);
  const [unpaidBalance, setUnpaidBalance] = useState(0);
  const [unpaidBookings, setUnpaidBookings] = useState<UnpaidBooking[]>([]);

  const [identityStatus, setIdentityStatus] = useState<string | null>(null);
  const [identityRequired, setIdentityRequired] = useState(false);
  const [identityChecked, setIdentityChecked] = useState(false);
  const [identityExpiresAt, setIdentityExpiresAt] = useState<string | null>(null);
  const presenceChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const profileRealtimeChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const identityExpiryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const roleUserIdRef = useRef<string | null>(null);
  const roleFetchInFlightRef = useRef<Promise<void> | null>(null);
  const lastRoleFetchRef = useRef<{ userId: string | null; fetchedAt: number }>({
    userId: null,
    fetchedAt: 0,
  });

  const ROLE_FETCH_COOLDOWN_MS = 5000;
  const AUTH_DEBUG_LOGS = false;

  const setGuestMode = useCallback(async (enabled: boolean) => {
    setIsGuest(enabled);
    try {
      if (enabled) {
        await AsyncStorage.setItem("auth_guest_mode", "1");
      } else {
        await AsyncStorage.removeItem("auth_guest_mode");
      }
    } catch (e) {
    }
  }, []);

  const checkIdentityStatus = useCallback(async () => {
    if (!session?.user?.id) {
      setIdentityStatus(null);
      setIdentityRequired(false);
      setIdentityExpiresAt(null);
      setIdentityChecked(true);
      return;
    }

    setIdentityRequired(false);

    try {
      let { data: profile, error } = await supabase
        .from("profiles")
        .select("is_verified, verification_status, id_document_expiry")
        .eq("id", session.user.id)
        .maybeSingle();

      if (error) {

        if (error.code === "PGRST116") {
          const metadataVerified = session.user?.user_metadata?.is_verified;
          const needsVerification = metadataVerified !== true;
          setIdentityStatus(needsVerification ? "UNVERIFIED" : null);
          setIdentityRequired(needsVerification);
          setIdentityExpiresAt(null);
        } else {
          setIdentityStatus(null);
          setIdentityRequired(false);
          setIdentityExpiresAt(null);
        }

        setIdentityChecked(true);
        return;
      }

      if ((!profile || profile.is_verified !== true) && session.user?.user_metadata?.is_verified === true) {
        const { error: promoteError } = await supabase
          .from("profiles")
          .upsert({
            id: session.user.id,
            email: session.user.email,
            full_name: session.user.user_metadata?.full_name || session.user.user_metadata?.name || "",
            role: session.user.user_metadata?.role || "musician",
            is_verified: true,
            verification_status: "APPROVED",
            didit_session_id: session.user.user_metadata?.didit_session_id || null,
          });

        if (!promoteError) {
          const { data: promotedProfile } = await supabase
            .from("profiles")
            .select("is_verified, verification_status, id_document_expiry")
            .eq("id", session.user.id)
            .maybeSingle();
          profile = promotedProfile;
        }
      }

      const normalizedStatus =
        typeof profile?.verification_status === "string"
          ? profile.verification_status.toUpperCase()
          : null;

      const expiryIso = profile?.id_document_expiry || null;
      let isExpired = false;
      if (expiryIso) {
        const parsed = new Date(expiryIso);
        if (!Number.isNaN(parsed.getTime())) {
          isExpired = parsed <= new Date();
        }
      }

      const verified = profile?.is_verified === true;
      const needsVerification = !verified || isExpired;

      setIdentityStatus(
        isExpired ? "EXPIRED" : normalizedStatus || (verified ? "APPROVED" : "UNVERIFIED"),
      );
      setIdentityRequired(needsVerification);
      setIdentityExpiresAt(expiryIso);
      setIdentityChecked(true);

    } catch (e) {
      setIdentityStatus(null);
      setIdentityRequired(false);
      setIdentityExpiresAt(null);
      setIdentityChecked(true);
    }
  }, [session?.user?.id]);

  // Outstanding balances should not block product actions.
  const checkSystemLock = useCallback(async () => {
    setIsSystemLocked(false);
    setUnpaidBalance(0);
    setUnpaidBookings((current) => (current.length > 0 ? [] : current));
  }, []);

  // Compatibility no-op for callers that still reference the old payment gate.
  const showLockAlert = useCallback((onBeforeNavigate?: () => void) => {
    onBeforeNavigate?.();
  }, []);

  useEffect(() => {
    AsyncStorage.removeItem("auth_guest_mode")
      .then(() => {
        setIsGuest(false);
      })
      .catch((e) => {
      });

    // Helper to filter/block unverified sessions (prevents auto-login during signup)
    const filterSession = (currentSession: Session | null) => {
      const metadata = currentSession?.user?.user_metadata;
      const metadataStatus =
        typeof metadata?.verification_status === "string"
          ? metadata.verification_status.toUpperCase()
          : "";

      // If user exists but identity is still pending, mimic logged out state.
      if (metadata?.is_verified === false && metadataStatus !== "APPROVED") {
        return null;
      }
      return currentSession;
    };

    // Helper to handle auth errors gracefully (e.g., invalid refresh tokens)
    const handleAuthError = async (error: unknown) => {
      const message =
        error instanceof Error
          ? error.message
          : typeof error === "string"
            ? error
            : "Unknown auth error";

      const isInvalidRefreshToken = /invalid refresh token|refresh token not found/i.test(
        message,
      );

      if (!isInvalidRefreshToken) {
      }

      try {
        await clearSupabaseAuthStorage();
      } catch {
        // Ignore storage-clear errors
      }

      setSession(null);
      roleUserIdRef.current = null;
      setIsAdmin(false);
      setUserRole(null);
      setRoleResolved(true);
      setIsSystemLocked(false);
      setUnpaidBalance(0);
      setUnpaidBookings([]);
      setIdentityStatus(null);
      setIdentityRequired(false);
      setIdentityChecked(true);
      setIdentityExpiresAt(null);
      setLoading(false);
    };

    const bootstrapAuth = async () => {
      try {
        const {
          data: { session },
          error,
        } = await supabase.auth.getSession();

        // Handle refresh token errors by clearing the session
        if (error) {
          await handleAuthError(error);
          return;
        }

        // Always refresh the session on bootstrap to guarantee a gateway-valid
        // token is in memory. Avoids stale/cached tokens being used.
        let secureSession = filterSession(session);

        if (secureSession) {
          const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
          if (!refreshError && refreshData.session) {
            secureSession = filterSession(refreshData.session);
          } else if (refreshError) {
            // Refresh failed — session is truly expired, clear it
            await handleAuthError(refreshError);
            return;
          }
          // If refreshData.session is null but no error, keep existing session
        }

        setSession(secureSession);
        if (secureSession) {
          setGuestMode(false);
          prepareRoleFetch(secureSession.user.id);
          checkAdmin(secureSession.user.id);
          fetchUserRole(secureSession.user.id);
        } else {
          clearResolvedRole();
        }
        setLoading(false);
      } catch (error) {
        // Catch any unexpected errors during session retrieval
        await handleAuthError(error);
      }
    };

    bootstrapAuth();

    // Listen for changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      const isNoisyStartupSignedOut = event === "SIGNED_OUT" && !session;
      if (__DEV__ && AUTH_DEBUG_LOGS && event !== "INITIAL_SESSION" && !isNoisyStartupSignedOut) {
      }

      // Handle sign out event
      if (event === "SIGNED_OUT") {
        setSession(null);
        roleUserIdRef.current = null;
        setIsAdmin(false);
        setUserRole(null);
        setRoleResolved(true);
        setIsSystemLocked(false);
        setUnpaidBalance(0);
        setUnpaidBookings([]);
        setIdentityStatus(null);
        setIdentityRequired(false);
        setIdentityChecked(true);
        setIdentityExpiresAt(null);
        roleFetchInFlightRef.current = null;
        lastRoleFetchRef.current = { userId: null, fetchedAt: 0 };
        setLoading(false);
        return;
      }

      // Handle token refresh errors (session will be null if refresh failed)
      if (event === "TOKEN_REFRESHED" && !session) {
        await handleAuthError(new Error("Token refresh failed"));
        return;
      }

      const secureSession = filterSession(session);
      setSession(secureSession);
      if (secureSession) {
        setGuestMode(false);
        prepareRoleFetch(secureSession.user.id);
        checkAdmin(secureSession.user.id);
        fetchUserRole(secureSession.user.id);
      } else if (event !== "INITIAL_SESSION") {
        // Only reset state if this isn't the initial session load
        roleUserIdRef.current = null;
        setIsAdmin(false);
        setUserRole(null);
        setRoleResolved(true);
        setIsSystemLocked(false);
        setUnpaidBalance(0);
        setUnpaidBookings([]);
        setIdentityStatus(null);
        setIdentityRequired(false);
        setIdentityChecked(true);
        setIdentityExpiresAt(null);
      } else {
        clearResolvedRole();
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const activeUserId = session?.user?.id;

    if (!activeUserId) {
      if (presenceChannelRef.current) {
        void presenceChannelRef.current.untrack();
        supabase.removeChannel(presenceChannelRef.current);
        presenceChannelRef.current = null;
      }
      return;
    }

    const channel = supabase.channel(`presence:user:${activeUserId}`);
    presenceChannelRef.current = channel;
    let isDisposed = false;

    const trackOnline = async () => {
      if (isDisposed) return;
      await channel.track({ user_id: activeUserId, online_at: new Date().toISOString() });
    };

    const trackOffline = async () => {
      if (isDisposed) return;
      await channel.untrack();
    };

    channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await trackOnline();
      }
    });

    const appStateSub = AppState.addEventListener("change", async (nextState: AppStateStatus) => {
      if (nextState === "active") {
        await trackOnline();
      } else {
        await trackOffline();
      }
    });

    return () => {
      isDisposed = true;
      appStateSub.remove();
      void channel.untrack();
      supabase.removeChannel(channel);
      if (presenceChannelRef.current === channel) {
        presenceChannelRef.current = null;
      }
    };
  }, [session?.user?.id]);

  // Reset legacy payment gate state when session changes.
  useEffect(() => {
    if (session?.user?.id) {
      checkSystemLock();
    }
  }, [session?.user?.id, checkSystemLock]);

  // Check identity verification and expiry when session changes
  useEffect(() => {
    if (session?.user?.id) {
      setIdentityChecked(false);
      checkIdentityStatus();
    } else {
      setIdentityChecked(true);
      setIdentityStatus(null);
      setIdentityRequired(false);
      setIdentityExpiresAt(null);
    }
  }, [session?.user?.id, checkIdentityStatus]);

  // Re-check identity and lock state whenever the profile row changes.
  useEffect(() => {
    const activeUserId = session?.user?.id;

    if (!activeUserId) {
      if (profileRealtimeChannelRef.current) {
        supabase.removeChannel(profileRealtimeChannelRef.current);
        profileRealtimeChannelRef.current = null;
      }
      return;
    }

    const channel = supabase
      .channel(`auth-profile:${activeUserId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "profiles",
          filter: `id=eq.${activeUserId}`,
        },
        async () => {
          await Promise.all([checkIdentityStatus(), checkSystemLock()]);
        },
      )
      .subscribe();

    profileRealtimeChannelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      if (profileRealtimeChannelRef.current === channel) {
        profileRealtimeChannelRef.current = null;
      }
    };
  }, [session?.user?.id, checkIdentityStatus, checkSystemLock]);

  // Re-check on app foreground to catch expiry transitions after backgrounding.
  useEffect(() => {
    if (!session?.user?.id) return;

    const appStateSub = AppState.addEventListener("change", (nextState: AppStateStatus) => {
      if (nextState === "active") {
        void Promise.all([checkIdentityStatus(), checkSystemLock()]);
      }
    });

    return () => {
      appStateSub.remove();
    };
  }, [session?.user?.id, checkIdentityStatus, checkSystemLock]);

  // Trigger re-check exactly when identity document expiry timestamp is reached.
  useEffect(() => {
    if (identityExpiryTimerRef.current) {
      clearTimeout(identityExpiryTimerRef.current);
      identityExpiryTimerRef.current = null;
    }

    if (!identityExpiresAt || !session?.user?.id) {
      return;
    }

    const expiryDate = new Date(identityExpiresAt);
    if (Number.isNaN(expiryDate.getTime())) {
      return;
    }

    const schedule = () => {
      const remainingMs = expiryDate.getTime() - Date.now() + 1000;
      if (remainingMs <= 0) {
        void checkIdentityStatus();
        return;
      }

      const nextDelay = Math.min(remainingMs, 2_147_483_647);
      identityExpiryTimerRef.current = setTimeout(() => {
        schedule();
      }, nextDelay);
    };

    schedule();

    return () => {
      if (identityExpiryTimerRef.current) {
        clearTimeout(identityExpiryTimerRef.current);
        identityExpiryTimerRef.current = null;
      }
    };
  }, [identityExpiresAt, session?.user?.id, checkIdentityStatus]);

  const checkAdmin = async (userId: string) => {
    // Optional: If you have an 'admin' role in your profiles table or metadata
    setIsAdmin(false);
  };

  const prepareRoleFetch = (nextUserId: string) => {
    if (roleUserIdRef.current !== nextUserId) {
      roleUserIdRef.current = nextUserId;
      setUserRole(null);
      setIsAdmin(false);
      roleFetchInFlightRef.current = null;
      lastRoleFetchRef.current = { userId: null, fetchedAt: 0 };
    }
    setRoleResolved(false);
  };

  const clearResolvedRole = () => {
    roleUserIdRef.current = null;
    roleFetchInFlightRef.current = null;
    lastRoleFetchRef.current = { userId: null, fetchedAt: 0 };
    setUserRole(null);
    setIsAdmin(false);
    setRoleResolved(true);
  };

  const fetchUserRole = async (nextUserId: string) => {
    const now = Date.now();
    const last = lastRoleFetchRef.current;

    if (roleFetchInFlightRef.current && last.userId === nextUserId) {
      await roleFetchInFlightRef.current;
      return;
    }

    if (
      last.userId === nextUserId &&
      userRole &&
      now - last.fetchedAt < ROLE_FETCH_COOLDOWN_MS
    ) {
      setRoleResolved(true);
      return;
    }

    const run = (async () => {
      try {
        if (__DEV__ && AUTH_DEBUG_LOGS) {
        }

        const { data, error } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", nextUserId)
          .limit(1);

        if (error) {
          console.warn("Error fetching user role:", error.message);
          if (roleUserIdRef.current !== nextUserId) return;
          setUserRole(null);
          setRoleResolved(true);
          return;
        }

        if (data && data.length > 0) {
          if (__DEV__ && AUTH_DEBUG_LOGS) {
          }

          if (roleUserIdRef.current !== nextUserId) return;
          setUserRole(data[0].role);
          lastRoleFetchRef.current = { userId: nextUserId, fetchedAt: Date.now() };
          setRoleResolved(true);
          return;
        }

        if (__DEV__ && AUTH_DEBUG_LOGS) {
        }

        if (roleUserIdRef.current !== nextUserId) return;
        setUserRole(null);
        setRoleResolved(true);
      } catch (error) {
        console.warn("Exception fetching user role:", error);
        if (roleUserIdRef.current !== nextUserId) return;
        setUserRole(null);
        setRoleResolved(true);
      } finally {
        if (roleUserIdRef.current === nextUserId) {
          roleFetchInFlightRef.current = null;
        }
      }
    })();

    lastRoleFetchRef.current = { userId: nextUserId, fetchedAt: now };
    roleFetchInFlightRef.current = run;
    await run;
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        loading,
        isGuest,
        setGuestMode,
        isAdmin,
        userRole,
        roleResolved,
        userId: session?.user?.id || null,
        isSystemLocked,
        unpaidBalance,
        unpaidBookings,
        checkSystemLock,
        showLockAlert,
        identityStatus,
        identityRequired,
        identityChecked,
        checkIdentityStatus,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
