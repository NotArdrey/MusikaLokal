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
import CustomAlert, { AlertType } from "../components/CustomAlert";

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
  userId: string | null;
  // System lock for unpaid balances
  isSystemLocked: boolean;
  unpaidBalance: number;
  unpaidBookings: UnpaidBooking[];
  checkSystemLock: () => Promise<void>;
  showLockAlert: () => void;
  // Subscription status
  subscriptionStatus: string | null;
  subscriptionRequired: boolean;
  subscriptionChecked: boolean;
  checkSubscription: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  session: null,
  loading: true,
  isGuest: false,
  setGuestMode: async () => { },
  isAdmin: false,
  userRole: null,
  userId: null,
  isSystemLocked: false,
  unpaidBalance: 0,
  unpaidBookings: [],
  checkSystemLock: async () => { },
  showLockAlert: () => { },
  subscriptionStatus: null,
  subscriptionRequired: false,
  subscriptionChecked: false,
  checkSubscription: async () => { },
});

export const useAuth = () => useContext(AuthContext);

// Hook to require auth - redirects to login if not authenticated
export const useRequireAuth = () => {
  const { session, loading, isGuest } = useAuth();

  useEffect(() => {
    if (!loading && !session) {
      // Not logged in - guests stay in Home, others go to login
      router.replace(isGuest ? "/home" : "/");
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

  // System lock state
  const [isSystemLocked, setIsSystemLocked] = useState(false);
  const [unpaidBalance, setUnpaidBalance] = useState(0);
  const [unpaidBookings, setUnpaidBookings] = useState<UnpaidBooking[]>([]);

  // Subscription state
  const [subscriptionStatus, setSubscriptionStatus] = useState<string | null>(
    null,
  );
  const [subscriptionRequired, setSubscriptionRequired] = useState(false);
  const [subscriptionChecked, setSubscriptionChecked] = useState(false);
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertConfig, setAlertConfig] = useState<{
    type: AlertType;
    title: string;
    message: string;
    buttons?: any[];
  }>({
    type: "info",
    title: "",
    message: "",
  });
  const presenceChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const showAlert = useCallback(
    (
      type: AlertType,
      title: string,
      message: string,
      buttons?: any[],
    ) => {
      setAlertConfig({ type, title, message, buttons });
      setAlertVisible(true);
    },
    [],
  );

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

  // Check subscription status for owners
  const checkSubscription = useCallback(async () => {
    if (!session?.user?.id) {
      setSubscriptionStatus(null);
      setSubscriptionRequired(false);
      setSubscriptionChecked(true);
      return;
    }

    // Reset subscription required to false at start - only set true when confirmed
    setSubscriptionRequired(false);

    try {
      const { data: profile, error } = await supabase
        .from("profiles")
        .select("role, subscription_status, subscription_expires_at")
        .eq("id", session.user.id)
        .single();

      if (error) {
        console.log("Error checking subscription:", error);
        // Only check metadata if profile doesn't exist (PGRST116 = row not found)
        // For other errors (network, auth, etc), don't lock out the user
        if (error.code === "PGRST116") {
          // Profile not found - check auth metadata for role (first login scenario)
          const metadataRole = session.user?.user_metadata?.role;
          if (metadataRole === "studio-owner" || metadataRole === "venue-owner") {
            console.log("📋 Profile not found, metadata role requires subscription:", metadataRole);
            setSubscriptionStatus(null);
            setSubscriptionRequired(true);
          }
        } else {
          // Other errors (network, etc) - don't lock out user, keep subscriptionRequired false
          console.log("📋 Non-critical error, not locking user:", error.code);
        }
        setSubscriptionChecked(true);
        return;
      }

      // Only studio-owner and venue-owner need subscription
      const needsSubscription =
        profile?.role === "studio-owner" || profile?.role === "venue-owner";

      if (needsSubscription) {
        const status = profile?.subscription_status;
        const expiresAt = profile?.subscription_expires_at;

        // Check if subscription is active and not expired
        let isActive = status === "active";
        if (isActive && expiresAt) {
          const expiryDate = new Date(expiresAt);
          isActive = expiryDate > new Date();
        }

        setSubscriptionStatus(isActive ? "active" : status);
        setSubscriptionRequired(!isActive);

        console.log("📋 Subscription check:", {
          role: profile?.role,
          status,
          expiresAt,
          isActive,
          required: !isActive,
        });
        setSubscriptionChecked(true);
      } else {
        // Musicians don't need subscription
        setSubscriptionStatus(null);
        setSubscriptionRequired(false);
        setSubscriptionChecked(true);
      }
    } catch (e: any) {
      console.log("Error in checkSubscription:", e);
      // Only lock out for profile not found, not for general exceptions
      if (e?.code === "PGRST116") {
        const metadataRole = session.user?.user_metadata?.role;
        if (metadataRole === "studio-owner" || metadataRole === "venue-owner") {
          console.log("📋 Exception (profile not found), metadata role requires subscription:", metadataRole);
          setSubscriptionStatus(null);
          setSubscriptionRequired(true);
        }
      } else {
        // General error - don't lock out user
        console.log("📋 General exception, not locking user");
      }
      setSubscriptionChecked(true);
    }
  }, [session?.user?.id]);

  // Check for unpaid balances
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

      if (error) {
        console.log("Error checking system lock:", error);
        return;
      }

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
    } catch (e) {
      console.log("Error in checkSystemLock:", e);
    }
  }, [session?.user?.id]);

  // Show lock alert and redirect to wallet
  const showLockAlert = useCallback(() => {
    showAlert(
      "warning",
      "Action Blocked",
      `You have an outstanding balance of ₱${unpaidBalance.toLocaleString()}. Please settle your payment to continue using the app.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Pay Now", onPress: () => router.push("/wallet") },
      ],
    );
  }, [showAlert, unpaidBalance]);

  useEffect(() => {
    AsyncStorage.getItem("auth_guest_mode")
      .then((value) => {
        if (value === "1") {
          setIsGuest(true);
        }
      })
      .catch((e) => {
        console.log("Failed to load guest mode:", e);
      });

    // Helper to filter/block unverified sessions (prevents auto-login during signup)
    const filterSession = (currentSession: Session | null) => {
      // If user exists but has explicit is_verified: false, mimic logged out state
      if (currentSession?.user?.user_metadata?.is_verified === false) {
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
        console.log("Auth error detected, clearing local session:", message);
      }

      try {
        await clearSupabaseAuthStorage();
      } catch {
        // Ignore storage-clear errors
      }

      setSession(null);
      setIsAdmin(false);
      setUserRole(null);
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
          fetchUserRole(secureSession.user.id);
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
        setIsAdmin(false);
        setUserRole(null);
        setIsSystemLocked(false);
        setUnpaidBalance(0);
        setUnpaidBookings([]);
        setSubscriptionStatus(null);
        setSubscriptionRequired(false);
        setSubscriptionChecked(true);
        setLoading(false);
        return;
      }

      // Handle token refresh errors (session will be null if refresh failed)
      if (event === "TOKEN_REFRESHED" && !session) {
        console.log("Token refresh failed, clearing session");
        await handleAuthError(new Error("Token refresh failed"));
        return;
      }

      const secureSession = filterSession(session);
      setSession(secureSession);
      if (secureSession) {
        setGuestMode(false);
        fetchUserRole(secureSession.user.id);
      } else if (event !== "INITIAL_SESSION") {
        // Only reset state if this isn't the initial session load
        setIsAdmin(false);
        setUserRole(null);
        setIsSystemLocked(false);
        setUnpaidBalance(0);
        setUnpaidBookings([]);
        setSubscriptionStatus(null);
        setSubscriptionRequired(false);
        setSubscriptionChecked(true);
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

  // Check system lock when session changes
  useEffect(() => {
    if (session?.user?.id) {
      checkSystemLock();
    }
  }, [session?.user?.id, checkSystemLock]);

  // Check subscription when session changes (don't wait for userRole state, 
  // checkSubscription fetches role from DB directly)
  useEffect(() => {
    if (session?.user?.id) {
      setSubscriptionChecked(false); // Reset before checking
      checkSubscription();
    } else {
      setSubscriptionChecked(true); // No session, no check needed
    }
  }, [session?.user?.id, checkSubscription]);

  const fetchUserRole = async (userId: string) => {
    try {
      console.log("🔍 Fetching role for user ID:", userId);
      const { data, error } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", userId)
        .limit(1);

      if (error) {
        console.log("❌ Error fetching user role:", error.message, error);
        setUserRole(null);
        setIsAdmin(false);
        return;
      }

      if (data && data.length > 0) {
        const resolvedRole = data[0].role;
        console.log("✅ User role fetched:", resolvedRole);
        setUserRole(resolvedRole);
        setIsAdmin(resolvedRole === "admin");
      } else {
        console.log("⚠️ No profile data found for user");
        setUserRole(null);
        setIsAdmin(false);
      }
    } catch (error) {
      console.log("❌ Exception fetching user role:", error);
      setUserRole(null);
      setIsAdmin(false);
    }
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
      <CustomAlert
        visible={alertVisible}
        type={alertConfig.type}
        title={alertConfig.title}
        message={alertConfig.message}
        buttons={alertConfig.buttons}
        onClose={() => setAlertVisible(false)}
      />
    </AuthContext.Provider>
  );
};
