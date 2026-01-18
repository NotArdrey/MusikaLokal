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
        // Check active session
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session);
            if (session) checkAdmin(session.user.id);
            setLoading(false);
        });

        // Listen for changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session);
            if (session) checkAdmin(session.user.id);
            else setIsAdmin(false);
            setLoading(false);
        });

        return () => subscription.unsubscribe();
    }, []);

    const checkAdmin = async (userId: string) => {
        // Optional: If you have an 'admin' role in your profiles table or metadata
        // For now, we'll just leave it false or fetch from profile if needed
        setIsAdmin(false);
    };

    return (
        <AuthContext.Provider value={{ session, loading, isAdmin }}>
            {children}
        </AuthContext.Provider>
    );
};
