const assert = require('node:assert/strict');
const { test } = require('node:test');

for (const app of ['mobile', 'web']) {
  const { APPLICATION_FILTERS, filterAndSortApplications, getApplicationCounts, isActiveApplication } =
    require(`../../${app}/src/utils/gigApplicantFilters.ts`);
  const applications = [
    { id: 'fired', status: 'fired', created_at: '2026-09-05', ai_recommendation: { recommendation_status: 'recommended' } },
    { id: 'completed', status: 'completed', created_at: '2026-09-04' },
    { id: 'pending', status: 'pending', created_at: '2026-09-03' },
    { id: 'accepted', status: ' Accepted ', created_at: '2026-09-01', ai_recommendation: { recommendation_status: 'recommended' } },
    { id: 'approved', status: 'approved', created_at: '2026-09-02' },
    { id: 'declined', status: 'declined' },
    { id: 'rejected', status: 'rejected' },
    { id: 'cancelled', status: 'cancelled' },
    { id: 'resigned', status: 'resigned' },
  ];
  const ids = (rows) => rows.map((row) => row.id);

  test(`${app}: active contracts precede newer pending and terminal applications`, () => {
    assert.deepEqual(ids(filterAndSortApplications(applications, 'All')).slice(0, 3), ['approved', 'accepted', 'pending']);
    assert.equal(applications[0].id, 'fired', 'sorting must not mutate state');
    assert.deepEqual(ids(filterAndSortApplications(applications, 'Recommended')), ['accepted', 'fired']);
  });

  test(`${app}: every filter count matches its rows, including legacy statuses`, () => {
    const counts = getApplicationCounts(applications);
    for (const filter of APPLICATION_FILTERS) {
      assert.equal(counts[filter], filterAndSortApplications(applications, filter).length);
    }
    assert.deepEqual(counts, { All: 9, Accepted: 2, Pending: 1, Fired: 1, 'Done Contract': 1, Declined: 2, Recommended: 2 });
    assert.deepEqual(ids(filterAndSortApplications(applications, 'Fired')), ['fired']);
    assert.deepEqual(ids(filterAndSortApplications(applications, 'Done Contract')), ['completed']);
  });

  test(`${app}: firing removes a contract from Accepted and moves it to Fired`, () => {
    const updated = applications.map((app) => app.id === 'accepted' ? { ...app, status: 'fired' } : app);
    const counts = getApplicationCounts(updated);
    assert.equal(counts.Accepted, 1);
    assert.equal(counts.Fired, 2);
    assert.equal(filterAndSortApplications(updated, 'All')[0].id, 'approved');
    for (const status of ['fired', 'completed', 'pending', 'rejected', 'resigned', 'cancelled', undefined]) {
      assert.equal(isActiveApplication(status), false);
    }
    assert.equal(isActiveApplication(' APPROVED '), true);
  });

  test(`${app}: empty lists and malformed dates remain deterministic`, () => {
    assert.deepEqual(filterAndSortApplications([], 'All'), []);
    assert.equal(getApplicationCounts([])['Done Contract'], 0);
    assert.deepEqual(ids(filterAndSortApplications([
      { id: 'b', status: 'accepted', created_at: 'invalid' },
      { id: 'a', status: 'accepted' },
      { id: 'c', status: null },
    ], 'All')), ['a', 'b', 'c']);
  });
}
