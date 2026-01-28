
import { Session } from '@supabase/supabase-js';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

type AuthContextType = {
    session: Session | null;
    loading: boolean;
    isAdmin: boolean;
};

const AuthContext = createContext<AuthContextType>({
    session: null,
    loading: true,
    isAdmin: false,
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
    const [session, setSession] = useState<Session | null>(null);
    const [loading, setLoading] = useState(true);
    const [isAdmin, setIsAdmin] = useState(false);

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
            if (secureSession) checkAdmin(secureSession.user.id);
            setLoading(false);
        });

        // Listen for changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            const secureSession = filterSession(session);
            setSession(secureSession);
            if (secureSession) checkAdmin(secureSession.user.id);
            else setIsAdmin(false);
            setLoading(false);
        });

        return () => subscription.unsubscribe();
    }, []);

    const checkAdmin = async (userId: string) => {
        // Optional: If you have an 'admin' role in your profiles table or metadata
        setIsAdmin(false);
    };

    return (
        <AuthContext.Provider value={{ session, loading, isAdmin }}>
            {children}
        </AuthContext.Provider>
    );
};
