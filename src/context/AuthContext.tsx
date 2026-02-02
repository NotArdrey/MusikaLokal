
import { Session } from '@supabase/supabase-js';
import { router } from 'expo-router';
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { supabase } from '../../lib/supabase';

type UnpaidBooking = {
    id: string;
    remaining_balance: number;
    studio_name: string;
    booking_date: string;
};

type AuthContextType = {
    session: Session | null;
    loading: boolean;
    isAdmin: boolean;
    userRole: string | null;
    userId: string | null;
    // System lock for unpaid balances
    isSystemLocked: boolean;
    unpaidBalance: number;
    unpaidBookings: UnpaidBooking[];
    checkSystemLock: () => Promise<void>;
    showLockAlert: () => void;
};

const AuthContext = createContext<AuthContextType>({
    session: null,
    loading: true,
    isAdmin: false,
    userRole: null,
    userId: null,
    isSystemLocked: false,
    unpaidBalance: 0,
    unpaidBookings: [],
    checkSystemLock: async () => {},
    showLockAlert: () => {},
});

export const useAuth = () => useContext(AuthContext);

// Hook to require auth - redirects to login if not authenticated
export const useRequireAuth = () => {
    const { session, loading } = useAuth();

    useEffect(() => {
        if (!loading && !session) {
            // Not logged in - redirect to login
            router.replace('/');
        }
    }, [session, loading]);

    return { isAuthenticated: !!session, loading, userId: session?.user?.id || null };
};

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
    const [session, setSession] = useState<Session | null>(null);
    const [loading, setLoading] = useState(true);
    const [isAdmin, setIsAdmin] = useState(false);
    const [userRole, setUserRole] = useState<string | null>(null);
    
    // System lock state
    const [isSystemLocked, setIsSystemLocked] = useState(false);
    const [unpaidBalance, setUnpaidBalance] = useState(0);
    const [unpaidBookings, setUnpaidBookings] = useState<UnpaidBooking[]>([]);

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
                .from('studio_bookings')
                .select('id, remaining_balance, booking_date, studio:studios(name)')
                .eq('user_id', session.user.id)
                .gt('remaining_balance', 0)
                .in('status', ['pending', 'confirmed']);

            if (error) {
                console.log('Error checking system lock:', error);
                return;
            }

            if (bookings && bookings.length > 0) {
                const totalBalance = bookings.reduce((sum, b) => sum + (b.remaining_balance || 0), 0);
                setUnpaidBalance(totalBalance);
                setUnpaidBookings(bookings.map(b => ({
                    id: b.id,
                    remaining_balance: b.remaining_balance,
                    studio_name: (b.studio as any)?.name || 'Unknown Studio',
                    booking_date: b.booking_date
                })));
                setIsSystemLocked(true);
            } else {
                setIsSystemLocked(false);
                setUnpaidBalance(0);
                setUnpaidBookings([]);
            }
        } catch (e) {
            console.log('Error in checkSystemLock:', e);
        }
    }, [session?.user?.id]);

    // Show lock alert and redirect to wallet
    const showLockAlert = useCallback(() => {
        Alert.alert(
            'Action Blocked',
            `You have an outstanding balance of ₱${unpaidBalance.toLocaleString()}. Please settle your payment to continue using the app.`,
            [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Pay Now', onPress: () => router.push('/wallet') }
            ]
        );
    }, [unpaidBalance]);

    useEffect(() => {
        // Helper to filter/block unverified sessions (prevents auto-login during signup)
        const filterSession = (currentSession: Session | null) => {
            // If user exists but has explicit is_verified: false, mimic logged out state
            if (currentSession?.user?.user_metadata?.is_verified === false) {
                return null;
            }
            return currentSession;
        };

        // Check active session
        supabase.auth.getSession().then(({ data: { session } }) => {
            const secureSession = filterSession(session);
            setSession(secureSession);
            if (secureSession) {
                checkAdmin(secureSession.user.id);
                fetchUserRole(secureSession.user.id);
            }
            setLoading(false);
        });

        // Listen for changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            const secureSession = filterSession(session);
            setSession(secureSession);
            if (secureSession) {
                checkAdmin(secureSession.user.id);
                fetchUserRole(secureSession.user.id);
            } else {
                setIsAdmin(false);
                setUserRole(null);
                setIsSystemLocked(false);
                setUnpaidBalance(0);
                setUnpaidBookings([]);
            }
            setLoading(false);
        });

        return () => subscription.unsubscribe();
    }, []);

    // Check system lock when session changes
    useEffect(() => {
        if (session?.user?.id) {
            checkSystemLock();
        }
    }, [session?.user?.id, checkSystemLock]);

    const checkAdmin = async (userId: string) => {
        // Optional: If you have an 'admin' role in your profiles table or metadata
        setIsAdmin(false);
    };

    const fetchUserRole = async (userId: string) => {
        try {
            console.log('🔍 Fetching role for user ID:', userId);
            const { data, error } = await supabase
                .from('profiles')
                .select('role')
                .eq('id', userId)
                .limit(1);

            if (error) {
                console.log('❌ Error fetching user role:', error.message, error);
                setUserRole(null);
                return;
            }

            if (data && data.length > 0) {
                console.log('✅ User role fetched:', data[0].role);
                setUserRole(data[0].role);
            } else {
                console.log('⚠️ No profile data found for user');
                setUserRole(null);
            }
        } catch (error) {
            console.log('❌ Exception fetching user role:', error);
            setUserRole(null);
        }
    };

    return (
        <AuthContext.Provider value={{ 
            session, 
            loading, 
            isAdmin, 
            userRole, 
            userId: session?.user?.id || null,
            isSystemLocked,
            unpaidBalance,
            unpaidBookings,
            checkSystemLock,
            showLockAlert
        }}>
            {children}
        </AuthContext.Provider>
    );
};
