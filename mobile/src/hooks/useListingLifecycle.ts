import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { ListingManagementStatus } from '../utils/listingHistory';

const listingTables: Record<string, string> = {
  group: 'groups', duo: 'groups', studio: 'studios', venue: 'studios',
  gig: 'gigs', production: 'production_teams', 'production team': 'production_teams',
};

export const useListingLifecycle = ({ type, id, enabled }: {
  type: string | null | undefined;
  id: string | null | undefined;
  enabled: boolean;
}) => {
  const { userId } = useAuth();
  const table = listingTables[String(type || '').trim().toLowerCase()];
  const query = useQuery({
    queryKey: ['details', 'lifecycle', table || 'profile', id || 'none', userId || 'guest'],
    enabled: Boolean(enabled && table && id),
    staleTime: 0,
    queryFn: async (): Promise<ListingManagementStatus> => {
      const { data, error } = await supabase.from(table).select('management_status').eq('id', id!).single();
      if (error) throw error;
      return data.management_status;
    },
  });

  return {
    status: query.data,
    // Profiles have no listing lifecycle. Managed listings must pass a fresh check.
    canAcceptNewRequests: !table || (!query.isFetching && !query.isError && query.data === 'active'),
  };
};
