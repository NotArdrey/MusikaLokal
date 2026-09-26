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
import { createRealtimeChannelTopic } from "../utils/realtimeChannel";

type UnpaidBooking = {
  id: string;
  remaining_balance: number;
  studio_name: string;
  booking_date: string;
};

type AccountBanRecord = {
  is_banned?: boolean | null;
  banned_until?: string | null;
  ban_reason?: string | null;
  ban_action?: string | null;
};

type ProfileAuthRecord = AccountBanRecord & {
  role?: string | null;
};

const isBanColumnError = (errorLike: unknown) => {
  const error = errorLike as { code?: string; message?: string; details?: string; hint?: string } | null;
  const text = `${error?.message || ""} ${error?.details || ""} ${error?.hint || ""}`.toLowerCase();
  return error?.code === "PGRST204" || error?.code === "42703" || text.includes("is_banned") || text.includes("schema cache");
};

const getActiveAccountBan = (record?: AccountBanRecord | null) => {
  const isBanned = record?.is_banned === true || String(record?.is_banned || "").toLowerCase() === "true";
  if (!isBanned) return null;

  const bannedUntil = typeof record?.banned_until === "string" ? record.banned_until : null;
  const reason =
    typeof record?.ban_reason === "string" && record.ban_reason.trim()
      ? record.ban_reason.trim()
      : typeof record?.ban_action === "string" && record.ban_action.trim()
        ? record.ban_action.trim().replace(/_/g, " ")
        : null;

  if (!bannedUntil) {
    return { permanent: true, bannedUntil: null as string | null, reason };
  }

  const expiry = new Date(bannedUntil);
  if (Number.isNaN(expiry.getTime())) {
    return { permanent: true, bannedUntil: null as string | null, reason };
  }

  if (expiry <= new Date()) return null;
  return { permanent: false, bannedUntil, reason };
};

type AuthContextType = {
  session: Session | null;
  loading: boolean;
  isGuest: boolean;
  setGuestMode: (enabled: boolean) => Promise<void>;
  isAdmin: boolean;
  userRole: string | null;
  availableRoles: string[];
  switchRole: (role: string) => Promise<void>;
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
  availableRoles: [],
  switchRole: async () => { },
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
        router.replace("/feed");
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
  const [availableRoles, setAvailableRoles] = useState<string[]>([]);
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
  const banLogoutUserIdRef = useRef<string | null>(null);
  const roleChangeLogoutUserIdRef = useRef<string | null>(null);

  const setGuestMode = useCallback(async (enabled: boolean) => {
    setIsGuest(enabled);
    try {
      if (enabled) {
        await AsyncStorage.setItem("auth_guest_mode", "1");
      } else {
        await AsyncStorage.removeItem("auth_guest_mode");
      }
    } catch (e) {
      console.log("Failed to persist guest mode:", e);
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
        console.log("Error checking identity status:", error);

        if (error.code === "PGRST116") {
          setIdentityStatus("UNVERIFIED");
          setIdentityRequired(true);
          setIdentityExpiresAt(null);
        } else {
          setIdentityStatus(null);
          setIdentityRequired(false);
          setIdentityExpiresAt(null);
        }

        setIdentityChecked(true);
        return;
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

      console.log("🪪 Identity check:", {
        verified,
        status: normalizedStatus,
        expiryIso,
        isExpired,
        required: needsVerification,
      });
    } catch (e) {
      console.log("Error in checkIdentityStatus:", e);
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

  const clearAuthenticatedStateForBan = useCallback(() => {
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
  }, []);

  const handleActiveAccountBan = useCallback(async (record?: AccountBanRecord | null) => {
    const activeBan = getActiveAccountBan(record);
    const activeUserId = session?.user?.id || null;
    if (!activeBan || !activeUserId) return false;

    if (banLogoutUserIdRef.current === activeUserId) return true;
    banLogoutUserIdRef.current = activeUserId;

    try {
      await supabase.auth.signOut({ scope: "local" });
    } catch {
      // Local storage clear below is the fallback that actually removes app access.
    }

    try {
      await clearSupabaseAuthStorage();
    } catch {
      // Ignore storage-clear errors.
    }

    clearAuthenticatedStateForBan();
    router.replace({
      pathname: "/",
      params: {
        banned: "true",
        banned_until: activeBan.bannedUntil || "",
        ban_reason: activeBan.reason || "",
        ban_permanent: activeBan.permanent ? "true" : "false",
      },
    } as any);
    return true;
  }, [clearAuthenticatedStateForBan, session?.user?.id]);

  const handleProfileRoleChange = useCallback(async (
    previousRecord?: ProfileAuthRecord | null,
    nextRecord?: ProfileAuthRecord | null,
  ) => {
    const previousRole = String(previousRecord?.role || userRole || "").trim().toLowerCase();
    const nextRole = String(nextRecord?.role || "").trim().toLowerCase();
    const activeUserId = session?.user?.id || null;
    if (!activeUserId || !previousRole || !nextRole || previousRole === nextRole) return false;
    if (roleChangeLogoutUserIdRef.current === activeUserId) return true;
    roleChangeLogoutUserIdRef.current = activeUserId;

    try {
      await supabase.auth.signOut({ scope: "local" });
    } catch {
      // The server may already have revoked this session.
    }

    try {
      await clearSupabaseAuthStorage();
    } catch {
      // Ignore storage-clear errors.
    }

    clearAuthenticatedStateForBan();
    router.replace({ pathname: "/", params: { role_changed: "true" } } as any);
    return true;
  }, [clearAuthenticatedStateForBan, session?.user?.id, userRole]);

  const checkAccountBanStatus = useCallback(async () => {
    const activeUserId = session?.user?.id;
    if (!activeUserId) return false;

    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("is_banned, banned_until, ban_reason, ban_action")
        .eq("id", activeUserId)
        .maybeSingle();

      if (error) {
        if (isBanColumnError(error)) return false;
        return false;
      }

      return await handleActiveAccountBan(data);
    } catch {
      return false;
    }
  }, [handleActiveAccountBan, session?.user?.id]);

  const checkProfileRoleStatus = useCallback(async () => {
    const activeUserId = session?.user?.id;
    if (!activeUserId || !userRole) return false;

    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", activeUserId)
        .maybeSingle();
      if (error || !data?.role) return false;

      return await handleProfileRoleChange(
        { role: userRole },
        { role: data.role },
      );
    } catch {
      return false;
    }
  }, [handleProfileRoleChange, session?.user?.id, userRole]);

  useEffect(() => {
    AsyncStorage.removeItem("auth_guest_mode")
      .then(() => {
        setIsGuest(false);
      })
      .catch((e) => {
        console.log("Failed to clear guest mode:", e);
      });

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
        console.log("Auth error detected, clearing local session:", message);
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
      banLogoutUserIdRef.current = null;
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
        let secureSession = session;

        if (secureSession) {
          const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
          if (!refreshError && refreshData.session) {
            secureSession = refreshData.session;
          } else if (refreshError) {
            // Refresh failed — session is truly expired, clear it
            await handleAuthError(refreshError);
            return;
          }
          // If refreshData.session is null but no error, keep existing session
        }

        setSession(secureSession);
        if (secureSession) {
          setIdentityChecked(false);
          setGuestMode(false);
          prepareRoleFetch(secureSession.user.id);
          void fetchUserRole(secureSession.user.id, secureSession);
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
      if (__DEV__ && event !== "INITIAL_SESSION" && !isNoisyStartupSignedOut) {
        console.log("Auth state change:", event);
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
        banLogoutUserIdRef.current = null;
        setLoading(false);
        return;
      }

      // Handle token refresh errors (session will be null if refresh failed)
      if (event === "TOKEN_REFRESHED" && !session) {
        console.log("Token refresh failed, clearing session");
        await handleAuthError(new Error("Token refresh failed"));
        return;
      }

      const secureSession = session;
      setSession(secureSession);
      if (secureSession) {
        setIdentityChecked(false);
        setGuestMode(false);
        prepareRoleFetch(secureSession.user.id);
        void fetchUserRole(secureSession.user.id, secureSession);
      } else {
        clearResolvedRole();

        if (event === "INITIAL_SESSION") {
          setLoading(false);
          return;
        }

        // Only reset state if this isn't the initial session load
        setIsAdmin(false);
        setUserRole(null);
        setIsSystemLocked(false);
        setUnpaidBalance(0);
        setUnpaidBookings([]);
        setIdentityStatus(null);
        setIdentityRequired(false);
        setIdentityChecked(true);
        setIdentityExpiresAt(null);
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
      void checkAccountBanStatus();
    }
  }, [session?.user?.id, checkSystemLock, checkAccountBanStatus]);

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
      .channel(createRealtimeChannelTopic(`auth-profile:${activeUserId}`))
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "profiles",
          filter: `id=eq.${activeUserId}`,
        },
        async (payload) => {
          if (await handleProfileRoleChange(
            payload.old as ProfileAuthRecord,
            payload.new as ProfileAuthRecord,
          )) {
            return;
          }
          if (await handleActiveAccountBan(payload.new as AccountBanRecord)) {
            return;
          }
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
  }, [session?.user?.id, checkIdentityStatus, checkSystemLock, handleActiveAccountBan, handleProfileRoleChange]);

  // Re-check on app foreground to catch expiry transitions after backgrounding.
  useEffect(() => {
    if (!session?.user?.id) return;

    const appStateSub = AppState.addEventListener("change", (nextState: AppStateStatus) => {
      if (nextState === "active") {
        void Promise.all([checkIdentityStatus(), checkSystemLock(), checkAccountBanStatus(), checkProfileRoleStatus()]);
      }
    });

    const roleCheckInterval = setInterval(() => {
      void checkProfileRoleStatus();
    }, 15_000);

    return () => {
      appStateSub.remove();
      clearInterval(roleCheckInterval);
    };
  }, [session?.user?.id, checkIdentityStatus, checkSystemLock, checkAccountBanStatus, checkProfileRoleStatus]);

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

  const normalizeRole = (rawRole: unknown): string | null => {
    if (typeof rawRole !== "string") return null;
    const normalized = rawRole.trim().toLowerCase();
    return normalized.length > 0 ? normalized : null;
  };

  const prepareRoleFetch = (nextUserId: string) => {
    if (roleUserIdRef.current !== nextUserId) {
      roleUserIdRef.current = nextUserId;
      setUserRole(null);
      setAvailableRoles([]);
      setIsAdmin(false);
    }
    setRoleResolved(false);
  };

  const clearResolvedRole = () => {
    roleUserIdRef.current = null;
    setUserRole(null);
    setAvailableRoles([]);
    setIsAdmin(false);
    setRoleResolved(true);
  };

  const applyResolvedRole = (resolvedRole: string | null, nextUserId: string) => {
    if (roleUserIdRef.current !== nextUserId) return;
    setUserRole(resolvedRole);
    setIsAdmin(resolvedRole === "admin");
    setRoleResolved(true);
  };

  const fetchUserRole = async (userId: string, _activeSession?: Session | null) => {
    try {
      const { data: roleMemberships, error: roleMembershipError } = await supabase.from("profile_roles")
        .select("role").eq("profile_id", userId).eq("status", "ACTIVE");
      if (!roleMembershipError) {
        setAvailableRoles(Array.from(new Set((roleMemberships || [])
          .map((membership: any) => normalizeRole(membership?.role))
          .filter((role): role is string => Boolean(role)))));
      }
      console.log("🔍 Fetching role for user ID:", userId);
      const { data, error } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", userId)
        .maybeSingle();

      if (error) {
        console.log("❌ Error fetching user role:", error.message, error);
      }

      const profileRole = normalizeRole(data?.role);
      if (profileRole) {
        setAvailableRoles((roles) => roles.includes(profileRole) ? roles : [...roles, profileRole]);
        console.log("✅ User role fetched from profiles:", profileRole);
        applyResolvedRole(profileRole, userId);
        return;
      }

      const { data: profileData, error: profileError } = await supabase.functions.invoke<any>(
        "manage-profile",
        {
          body: { action: "fetch", userId },
        },
      );

      if (!profileError) {
        const functionRole = normalizeRole(profileData?.role);
        if (functionRole) {
          console.log("✅ User role fetched from manage-profile:", functionRole);
          applyResolvedRole(functionRole, userId);
          return;
        }
      } else {
        console.log("❌ Error fetching role from manage-profile:", profileError.message, profileError);
      }

      console.log("⚠️ No role data found for user");
      applyResolvedRole(null, userId);
    } catch (error) {
      console.log("❌ Exception fetching user role:", error);
      applyResolvedRole(null, userId);
    }
  };

  const switchRole = useCallback(async (role: string) => {
    const normalizedRole = normalizeRole(role);
    if (!session?.user?.id || !normalizedRole) throw new Error("Sign in before switching roles.");
    const { data, error } = await supabase.functions.invoke("manage-profile", {
      body: { action: "switch_role", role: normalizedRole },
    });
    if (error) throw error;
    const nextRole = normalizeRole((data as any)?.role) || normalizedRole;
    setUserRole(nextRole);
    setIsAdmin(nextRole === "admin");
    setRoleResolved(true);
  }, [session?.user?.id]);

  return (
    <AuthContext.Provider
      value={{
        session,
        loading,
        isGuest,
        setGuestMode,
        isAdmin,
        userRole,
        availableRoles,
        switchRole,
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
