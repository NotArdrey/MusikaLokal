export type CrudCoverageStatus = 'ui' | 'api-only' | 'unsupported-ui';

export type CrudManifestEntry = {
  app: 'admin-web' | 'mobile' | 'cross-app';
  domain: string;
  operation: 'create' | 'read' | 'update' | 'delete' | 'moderate' | 'status' | 'cancel' | 'search';
  status: CrudCoverageStatus;
  table?: string;
  notes?: string;
};

export const crudManifest: CrudManifestEntry[] = [
  { app: 'admin-web', domain: 'users', operation: 'create', status: 'ui', table: 'profiles' },
  { app: 'admin-web', domain: 'users', operation: 'read', status: 'ui', table: 'profiles' },
  { app: 'admin-web', domain: 'users', operation: 'update', status: 'ui', table: 'profiles' },
  { app: 'admin-web', domain: 'users', operation: 'delete', status: 'ui', table: 'profiles' },
  { app: 'admin-web', domain: 'identity reviews', operation: 'read', status: 'ui', table: 'manual_identity_reviews' },
  { app: 'admin-web', domain: 'identity reviews', operation: 'moderate', status: 'ui', table: 'manual_identity_reviews' },
  { app: 'admin-web', domain: 'reports', operation: 'read', status: 'ui', table: 'reports' },
  { app: 'admin-web', domain: 'reports', operation: 'moderate', status: 'ui', table: 'reports' },
  { app: 'admin-web', domain: 'booking incidents', operation: 'read', status: 'ui', table: 'booking_incidents' },
  { app: 'admin-web', domain: 'booking incidents', operation: 'moderate', status: 'ui', table: 'booking_incidents' },
  { app: 'admin-web', domain: 'stations', operation: 'create', status: 'ui', table: 'stations' },
  { app: 'admin-web', domain: 'stations', operation: 'read', status: 'ui', table: 'stations' },
  { app: 'admin-web', domain: 'stations', operation: 'update', status: 'ui', table: 'stations' },
  { app: 'admin-web', domain: 'stations', operation: 'delete', status: 'ui', table: 'stations' },
  { app: 'admin-web', domain: 'posts', operation: 'moderate', status: 'ui', table: 'feed_posts' },
  { app: 'admin-web', domain: 'products', operation: 'moderate', status: 'ui', table: 'products' },
  { app: 'admin-web', domain: 'platform withdrawals', operation: 'create', status: 'unsupported-ui', table: 'platform_withdrawals', notes: 'The current live schema does not expose platform_withdrawals, so the UI test skips until that table/migration is present.' },
  { app: 'admin-web', domain: 'platform withdrawals', operation: 'read', status: 'unsupported-ui', table: 'platform_withdrawals', notes: 'The current live schema does not expose platform_withdrawals, so the UI test skips until that table/migration is present.' },
  { app: 'mobile', domain: 'profile', operation: 'read', status: 'ui', table: 'profiles' },
  { app: 'mobile', domain: 'profile', operation: 'update', status: 'ui', table: 'profiles' },
  { app: 'mobile', domain: 'studios', operation: 'create', status: 'ui', table: 'studios' },
  { app: 'mobile', domain: 'studios', operation: 'read', status: 'ui', table: 'studios' },
  { app: 'mobile', domain: 'studios', operation: 'update', status: 'api-only', table: 'studios', notes: 'Edit studio UI is exposed, but the form has multi-step address, schedule, and upload dependencies; this harness currently covers create/read/delete visibly.' },
  { app: 'mobile', domain: 'studios', operation: 'delete', status: 'ui', table: 'studios' },
  { app: 'mobile', domain: 'gigs', operation: 'create', status: 'ui', table: 'gigs' },
  { app: 'mobile', domain: 'gigs', operation: 'read', status: 'ui', table: 'gigs' },
  { app: 'mobile', domain: 'gigs', operation: 'update', status: 'api-only', table: 'gigs', notes: 'Edit gig UI is exposed, but the form has multi-step schedule/application dependencies; this harness currently covers create/read/delete visibly.' },
  { app: 'mobile', domain: 'gigs', operation: 'delete', status: 'ui', table: 'gigs' },
  { app: 'mobile', domain: 'groups', operation: 'create', status: 'ui', table: 'groups' },
  { app: 'mobile', domain: 'groups', operation: 'read', status: 'ui', table: 'groups' },
  { app: 'mobile', domain: 'groups', operation: 'update', status: 'api-only', table: 'groups', notes: 'Edit group UI is exposed, but invite/member-transfer dependencies make it a later harness target; create/read/delete are covered visibly.' },
  { app: 'mobile', domain: 'groups', operation: 'delete', status: 'ui', table: 'groups' },
  { app: 'mobile', domain: 'production teams', operation: 'create', status: 'ui', table: 'production_teams' },
  { app: 'mobile', domain: 'production teams', operation: 'read', status: 'ui', table: 'production_teams' },
  { app: 'mobile', domain: 'production teams', operation: 'update', status: 'ui', table: 'production_teams' },
  { app: 'mobile', domain: 'production teams', operation: 'delete', status: 'ui', table: 'production_teams' },
  { app: 'mobile', domain: 'bookings', operation: 'create', status: 'unsupported-ui', table: 'studio_bookings', notes: 'Booking creation is exposed through listing detail/payment flows; deterministic payment-step automation is a later phase.' },
  { app: 'mobile', domain: 'bookings', operation: 'read', status: 'ui', table: 'studio_bookings' },
  { app: 'mobile', domain: 'bookings', operation: 'cancel', status: 'ui', table: 'studio_bookings' },
  { app: 'mobile', domain: 'booking attendance', operation: 'create', status: 'ui', table: 'booking_attendance_events' },
  { app: 'mobile', domain: 'booking incidents', operation: 'create', status: 'ui', table: 'booking_incidents' },
  { app: 'mobile', domain: 'gig applications', operation: 'create', status: 'unsupported-ui', table: 'gig_applications', notes: 'Gig application creation is exposed through listing detail/application flows; deterministic application-step automation is a later phase.' },
  { app: 'mobile', domain: 'gig applications', operation: 'read', status: 'ui', table: 'gig_applications' },
  { app: 'mobile', domain: 'gig applications', operation: 'status', status: 'ui', table: 'gig_applications' },
  { app: 'mobile', domain: 'gig applications', operation: 'cancel', status: 'ui', table: 'gig_applications' },
  { app: 'mobile', domain: 'reports', operation: 'create', status: 'unsupported-ui', table: 'reports', notes: 'Report modals are exposed from detail screens; this phase covers report moderation cross-app from seeded mobile-style reports.' },
  { app: 'mobile', domain: 'wallet payout methods', operation: 'create', status: 'ui', table: 'payout_methods' },
  { app: 'mobile', domain: 'wallet withdrawals', operation: 'create', status: 'ui', table: 'withdrawal_requests' },
  { app: 'mobile', domain: 'social feed', operation: 'create', status: 'unsupported-ui', table: 'feed_posts', notes: 'Feed composer modal exists but no visible trigger is currently wired on the mobile feed screen.' },
  { app: 'mobile', domain: 'marketplace', operation: 'create', status: 'ui', table: 'products' },
  { app: 'mobile', domain: 'playlists', operation: 'create', status: 'ui', table: 'playlists' },
  { app: 'cross-app', domain: 'mobile report to admin moderation', operation: 'moderate', status: 'ui', table: 'reports' },
];

export function assertManifestIsExplicit() {
  const implicit = crudManifest.filter((entry) => (
    (entry.status === 'api-only' || entry.status === 'unsupported-ui') &&
    !entry.notes
  ));

  if (implicit.length > 0) {
    throw new Error(
      `Manifest entries marked api-only/unsupported-ui need notes: ${implicit
        .map((entry) => `${entry.app}:${entry.domain}:${entry.operation}`)
        .join(', ')}`,
    );
  }
}
