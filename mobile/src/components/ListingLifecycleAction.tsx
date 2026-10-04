import { Ionicons } from '@expo/vector-icons';
import React, { useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { getActionErrorMessage } from '../utils/actionError';
import { invalidateListingCaches } from '../utils/listingCacheInvalidation';
import { ListingManagementStatus, ManagedListingType } from '../utils/listingHistory';
import { typography } from '../theme/tokens';
import CustomAlert from './CustomAlert';
import Modal from './modal';

export default function ListingLifecycleAction({ type, id, name, status = 'active', onChanged }: {
  type: ManagedListingType;
  id: string;
  name: string;
  status?: ListingManagementStatus;
  onChanged: (status: ListingManagementStatus) => void;
}) {
  const { colors } = useTheme();
  const { userId } = useAuth();
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const nextStatus = type === 'gig' ? 'done' : status === 'inactive' ? 'active' : 'inactive';
  const label = type === 'gig' ? 'Mark done' : status === 'inactive' ? 'Activate' : 'Deactivate';
  const message = type === 'gig'
    ? `Mark "${name}" as done? It will stay in My History. Existing applications and reviews are kept. Create a new gig for another event.`
    : nextStatus === 'inactive'
      ? `Deactivate "${name}"? It will move to My History and stop accepting new requests. Existing bookings and members are kept.`
      : `Activate "${name}"? It will return to your listing tab. Existing permit approval requirements still apply.`;

  const save = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setSaving(true);
    try {
      const result = await supabase.rpc('set_listing_lifecycle', {
        p_type: type, p_id: id, p_status: nextStatus, p_expected_status: status,
      });
      if (result.error) throw result.error;
      if (result.data?.management_status !== nextStatus) throw new Error('The listing status was not saved. Refresh and try again.');
      invalidateListingCaches(userId, ['details', 'feed', 'home', 'search']);
      onChanged(nextStatus);
      setConfirmVisible(false);
    } catch (saveError) {
      setError(getActionErrorMessage(saveError, 'Could not change the listing status.'));
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  };

  return (
    <>
      <TouchableOpacity
        testID={`listing-${label.toLowerCase().replace(' ', '-')}-${id}`}
        accessibilityLabel={`${label} ${name}`}
        accessibilityRole="button"
        disabled={saving}
        onPress={() => setConfirmVisible(true)}
        style={[styles.action, { borderColor: colors.border }]}
      >
        <Ionicons name={nextStatus === 'active' ? 'refresh-outline' : type === 'gig' ? 'checkmark-circle-outline' : 'archive-outline'} size={16} color={colors.primary} />
        <Text style={[styles.label, { color: colors.primary }]}>{label}</Text>
      </TouchableOpacity>
      <Modal
        visible={confirmVisible}
        title={`${label} listing`}
        message={message}
        buttonText={saving ? 'Saving...' : label}
        onClose={() => { if (!inFlight.current) setConfirmVisible(false); }}
        onConfirm={save}
        confirmDisabled={saving}
        loading={saving}
      />
      <CustomAlert visible={Boolean(error)} type="error" title="Status not changed" message={error || ''} onClose={() => setError(null)} forceModal />
    </>
  );
}

const styles = StyleSheet.create({
  action: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6, marginTop: 10, paddingHorizontal: 12, minHeight: 40, borderWidth: 1, borderRadius: 10 },
  label: { fontSize: 12, fontFamily: typography.semibold },
});
