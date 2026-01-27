import { Session } from '@supabase/supabase-js';
import { router } from 'expo-router';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

type AuthContextType = {
    session: Session | null;
    loading: boolean;
    isAdmin: boolean;
    userRole: string | null;
    userId: string | null;
};

const AuthContext = createContext<AuthContextType>({
    session: null,
    loading: true,
    isAdmin: false,
    userRole: null,
    userId: null,
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

    useEffect(() => {
        // Check active session
        supabase.auth.getSession().then(({ data: { session } }) => {
            console.log('🔐 Auth Session:', session ? `User ID: ${session.user.id}, Email: ${session.user.email}` : 'No session');
            setSession(session);
            if (session) {
                checkAdmin(session.user.id);
                fetchUserRole(session.user.id);
            }
            setLoading(false);
        });

        // Listen for changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session);
            if (session) {
                checkAdmin(session.user.id);
                fetchUserRole(session.user.id);
            } else {
                setIsAdmin(false);
                setUserRole(null);
            }
            setLoading(false);
        });

        return () => subscription.unsubscribe();
    }, []);

    const checkAdmin = async (userId: string) => {
        // Optional: If you have an 'admin' role in your profiles table or metadata
        // For now, we'll just leave it false or fetch from profile if needed
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
        <AuthContext.Provider value={{ session, loading, isAdmin, userRole, userId: session?.user?.id || null }}>
            {children}
        </AuthContext.Provider>
    );
};
