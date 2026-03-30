
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../context/AuthContext';

export function useProfileCompletion() {
    const { userId, isGuest } = useAuth();
    const [isProfileComplete, setIsProfileComplete] = useState<boolean>(true);
    const [checking, setChecking] = useState(true);

    const checkProfile = useCallback(async () => {
        if (isGuest) {
            setChecking(false);
            setIsProfileComplete(true);
            return;
        }

        if (!userId) {
            setChecking(false);
            setIsProfileComplete(false);
            return;
        }

        // Don't set checking to true here to avoid layout flicker if re-checking silently

        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('contact_number, address')
                .eq('id', userId)
                .single();

            if (data) {
                const complete = !!(data.contact_number && data.address);
                setIsProfileComplete(complete);
            } else if (error) {
                console.error('Error fetching profile:', error);
            }
        } catch (e) {
            console.error('Error checking profile:', e);
        } finally {
            setChecking(false);
        }
    }, [userId, isGuest]);

    useFocusEffect(
        useCallback(() => {
            checkProfile();
        }, [checkProfile])
    );

    return { isProfileComplete, checking, refetch: checkProfile };
}
