import { Session, User } from "@supabase/supabase-js";
import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useRef,
    useState,
} from "react";
import { useNavigate } from "react-router-dom";
import { clearSupabaseAuthStorage, supabase } from "../lib/supabase";

type UnpaidBooking = {
  id: string;
  remaining_balance: number;
  studio_name: string;
  booking_date: string;
};

type AuthContextType = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  isGuest: boolean;
  setGuestMode: (enabled: boolean) => void;
  isAdmin: boolean;
  userRole: string | null;
  roleResolved: boolean;
  userId: string | null;
  isSystemLocked: boolean;
  unpaidBalance: number;
  unpaidBookings: UnpaidBooking[];
  checkSystemLock: () => Promise<void>;
  showLockAlert: () => void;
  subscriptionStatus: string | null;
  subscriptionRequired: boolean;
  subscriptionChecked: boolean;
  checkSubscription: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  loading: true,
  isGuest: false,
  setGuestMode: () => {},
  isAdmin: false,
  userRole: null,
  roleResolved: false,
  userId: null,
  isSystemLocked: false,
  unpaidBalance: 0,
  unpaidBookings: [],
  checkSystemLock: async () => {},
  showLockAlert: () => {},
  subscriptionStatus: null,
  subscriptionRequired: false,
  subscriptionChecked: false,
  checkSubscription: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isGuest, setIsGuest] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [roleResolved, setRoleResolved] = useState(false);

  const [isSystemLocked, setIsSystemLocked] = useState(false);
  const [unpaidBalance, setUnpaidBalance] = useState(0);
  const [unpaidBookings, setUnpaidBookings] = useState<UnpaidBooking[]>([]);

  const [subscriptionStatus, setSubscriptionStatus] = useState<string | null>(
    null,
  );
  const [subscriptionRequired, setSubscriptionRequired] = useState(false);
  const [subscriptionChecked, setSubscriptionChecked] = useState(false);

  const presenceChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(
    null,
  );

  const setGuestMode = useCallback((enabled: boolean) => {
    setIsGuest(enabled);
    if (enabled) {
      localStorage.setItem("auth_guest_mode", "1");
    } else {
      localStorage.removeItem("auth_guest_mode");
    }
  }, []);

  const checkSubscription = useCallback(async () => {
    if (!session?.user?.id) {
      setSubscriptionStatus(null);
      setSubscriptionRequired(false);
      setSubscriptionChecked(true);
      return;
    }

    setSubscriptionRequired(false);

    try {
      const { data: profile, error } = await supabase
        .from("profiles")
        .select("role, subscription_status, subscription_expires_at")
        .eq("id", session.user.id)
        .single();

      if (error) {
        if (error.code === "PGRST116") {
          const metadataRole = session.user?.user_metadata?.role;
          if (
            metadataRole === "studio-owner" ||
            metadataRole === "venue-owner"
          ) {
            setSubscriptionStatus(null);
            setSubscriptionRequired(true);
          }
        }
        setSubscriptionChecked(true);
        return;
      }

      const needsSubscription =
        profile?.role === "studio-owner" || profile?.role === "venue-owner";

      if (needsSubscription) {
        const status = profile?.subscription_status;
        const expiresAt = profile?.subscription_expires_at;
        let isActive = status === "active";
        if (isActive && expiresAt) {
          isActive = new Date(expiresAt) > new Date();
        }
        setSubscriptionStatus(isActive ? "active" : status);
        setSubscriptionRequired(!isActive);
      } else {
        setSubscriptionStatus(null);
        setSubscriptionRequired(false);
      }
      setSubscriptionChecked(true);
    } catch {
      setSubscriptionChecked(true);
    }
  }, [session?.user?.id]);

  const checkSystemLock = useCallback(async () => {
    if (!session?.user?.id) {
      setIsSystemLocked(false);
      setUnpaidBalance(0);
      setUnpaidBookings([]);
      return;
    }

    try {
      const { data: bookings, error } = await supabase
        .from("studio_bookings")
        .select("id, remaining_balance, booking_date, studio:studios(name)")
        .eq("user_id", session.user.id)
        .gt("remaining_balance", 0)
        .in("status", ["pending", "confirmed"]);

      if (error) return;

      if (bookings && bookings.length > 0) {
        const totalBalance = bookings.reduce(
          (sum, b) => sum + (b.remaining_balance || 0),
          0,
        );
        setUnpaidBalance(totalBalance);
        setUnpaidBookings(
          bookings.map((b) => ({
            id: b.id,
            remaining_balance: b.remaining_balance,
            studio_name: (b.studio as any)?.name || "Unknown Studio",
            booking_date: b.booking_date,
          })),
        );
        setIsSystemLocked(true);
      } else {
        setIsSystemLocked(false);
        setUnpaidBalance(0);
        setUnpaidBookings([]);
      }
    } catch {
      // ignore
    }
  }, [session?.user?.id]);

  const showLockAlert = useCallback(() => {
    alert(
      `You have an outstanding balance of ₱${unpaidBalance.toLocaleString()}. Please settle your payment to continue.`,
    );
  }, [unpaidBalance]);

  useEffect(() => {
    if (localStorage.getItem("auth_guest_mode") === "1") {
      setIsGuest(true);
    }

    const filterSession = (s: Session | null) => {
      if (s?.user?.user_metadata?.is_verified === false) return null;
      return s;
    };

    const handleAuthError = () => {
      clearSupabaseAuthStorage();
      setSession(null);
      setIsAdmin(false);
      setUserRole(null);
      setRoleResolved(true);
      setIsSystemLocked(false);
      setUnpaidBalance(0);
      setUnpaidBookings([]);
      setSubscriptionStatus(null);
      setSubscriptionRequired(false);
      setSubscriptionChecked(true);
      setLoading(false);
    };

    const bootstrapAuth = async () => {
      try {
        const {
          data: { session },
          error,
        } = await supabase.auth.getSession();

        if (error) {
          handleAuthError();
          return;
        }

        let secureSession = filterSession(session);

        if (secureSession) {
          const { data: refreshData, error: refreshError } =
            await supabase.auth.refreshSession();
          if (!refreshError && refreshData.session) {
            secureSession = filterSession(refreshData.session);
          } else if (refreshError) {
            handleAuthError();
            return;
          }
        }

        setSession(secureSession);
        if (secureSession) {
          setGuestMode(false);
          setRoleResolved(false);
          void fetchUserRole(secureSession.user.id, secureSession);
        } else {
          setRoleResolved(true);
        }
        setLoading(false);
      } catch {
        handleAuthError();
      }
    };

    bootstrapAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "SIGNED_OUT") {
        setSession(null);
        setIsAdmin(false);
        setUserRole(null);
        setRoleResolved(true);
        setIsSystemLocked(false);
        setUnpaidBalance(0);
        setUnpaidBookings([]);
        setSubscriptionStatus(null);
        setSubscriptionRequired(false);
        setSubscriptionChecked(true);
        setLoading(false);
        return;
      }

      if (event === "TOKEN_REFRESHED" && !session) {
        handleAuthError();
        return;
      }

      const secureSession = filterSession(session);
      setSession(secureSession);
      if (secureSession) {
        setGuestMode(false);
        setRoleResolved(false);
        void fetchUserRole(secureSession.user.id, secureSession);
      } else {
        setRoleResolved(true);

        if (event === "INITIAL_SESSION") {
          setLoading(false);
          return;
        }

        setIsAdmin(false);
        setUserRole(null);
        setSubscriptionChecked(true);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Presence tracking
  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId) {
      if (presenceChannelRef.current) {
        void presenceChannelRef.current.untrack();
        supabase.removeChannel(presenceChannelRef.current);
        presenceChannelRef.current = null;
      }
      return;
    }

    const channel = supabase.channel(`presence:user:${userId}`);
    presenceChannelRef.current = channel;
    let disposed = false;

    channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED" && !disposed) {
        await channel.track({
          user_id: userId,
          online_at: new Date().toISOString(),
        });
      }
    });

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        channel.track({ user_id: userId, online_at: new Date().toISOString() });
      } else {
        channel.untrack();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", onVisibility);
      void channel.untrack();
      supabase.removeChannel(channel);
      if (presenceChannelRef.current === channel)
        presenceChannelRef.current = null;
    };
  }, [session?.user?.id]);

  useEffect(() => {
    if (session?.user?.id) checkSystemLock();
  }, [session?.user?.id, checkSystemLock]);

  useEffect(() => {
    if (session?.user?.id) {
      setSubscriptionChecked(false);
      checkSubscription();
    } else {
      setSubscriptionChecked(true);
    }
  }, [session?.user?.id, checkSubscription]);

  const normalizeRole = (rawRole: unknown): string | null => {
    if (typeof rawRole !== "string") return null;
    const normalized = rawRole.trim().toLowerCase();
    return normalized.length > 0 ? normalized : null;
  };

  const applyResolvedRole = (resolvedRole: string | null) => {
    setUserRole(resolvedRole);
    setIsAdmin(resolvedRole === "admin");
    setRoleResolved(true);
  };

  const fetchUserRole = async (userId: string, activeSession?: Session | null) => {
    const metadataRole = normalizeRole(
      activeSession?.user?.user_metadata?.role ??
        activeSession?.user?.app_metadata?.role ??
        session?.user?.user_metadata?.role ??
        session?.user?.app_metadata?.role,
    );

    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", userId)
        .maybeSingle();

      if (error) {
        console.log("Error fetching user role from profiles:", error.message);
      }

      const profileRole = normalizeRole(data?.role);
      if (profileRole) {
        applyResolvedRole(profileRole);
        return;
      }

      if (metadataRole) {
        applyResolvedRole(metadataRole);
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
          applyResolvedRole(functionRole);
          return;
        }
      }

      applyResolvedRole(null);
    } catch {
      if (metadataRole) {
        applyResolvedRole(metadataRole);
        return;
      }

      applyResolvedRole(null);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
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
        subscriptionStatus,
        subscriptionRequired,
        subscriptionChecked,
        checkSubscription,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

/** Hook that redirects unauthenticated users */
export function useRequireAuth() {
  const { session, loading, isGuest } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !session) {
      navigate(isGuest ? "/home" : "/", { replace: true });
    }
  }, [session, loading, isGuest, navigate]);

  return {
    isAuthenticated: !!session,
    loading,
    userId: session?.user?.id || null,
  };
}
