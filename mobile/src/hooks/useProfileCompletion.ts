
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
                .select('contact_number, address, location')
                .eq('id', userId)
                .maybeSingle();

            if (error) {
                console.error('Error fetching profile:', error);
                setIsProfileComplete(false);
                return;
            }

            if (data) {
                const hasContact = typeof data.contact_number === 'string' && data.contact_number.trim().length > 0;
                const hasAddress =
                    (typeof data.address === 'string' && data.address.trim().length > 0) ||
                    (typeof data.location === 'string' && data.location.trim().length > 0);
                const complete = hasContact && hasAddress;
                setIsProfileComplete(complete);
            } else {
                // No profile row yet (first-login race): force incomplete state.
                setIsProfileComplete(false);
            }
        } catch (e) {
            console.error('Error checking profile:', e);
            setIsProfileComplete(false);
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
