import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../mobile/package.json', import.meta.url));
const ts = require('typescript');
const source = fs.readFileSync(new URL('../mobile/src/utils/listingHistory.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const module = { exports: {} };
vm.runInNewContext(compiled, { module, exports: module.exports, Date, Intl });
const { isGigInHistory, canMarkGigDone, getGigHistoryEndAt } = module.exports;
const now = Date.parse('2026-10-04T14:00:00+08:00');
const gig = { event_date: '2026-10-03T16:00:00Z', status: 'open', management_status: 'active', requirements: { event_start_time: '7:00 PM', event_end_time: '11:00 PM' } };

assert.equal(isGigInHistory(gig, now), false, 'The Manila event day is October 4, not the UTC day October 3');
assert.equal(canMarkGigDone(gig, now), false);
assert.equal(getGigHistoryEndAt(gig), Date.parse('2026-10-04T23:00:00+08:00'));
assert.equal(isGigInHistory({ ...gig, event_date: '2026-10-02' }, now), true);
assert.equal(canMarkGigDone({ ...gig, event_date: '2026-10-02' }, now), true);
assert.equal(canMarkGigDone({ ...gig, status: 'cancelled', event_date: '2026-10-02' }, now), false);
assert.equal(isGigInHistory({ ...gig, status: 'cancelled' }, now), true);
assert.equal(isGigInHistory({ ...gig, management_status: 'done' }, now), true);
assert.equal(canMarkGigDone({ ...gig, management_status: 'done', event_date: '2026-10-02' }, now), false);
assert.equal(isGigInHistory({ status: 'open' }, now), false, 'An unknown date must not silently archive an event');
assert.equal(canMarkGigDone({ status: 'open' }, now), false);
assert.equal(isGigInHistory({ ...gig, event_date: '2026-10-03', requirements: { event_start_time: '11:00 PM', event_end_time: '3:00 AM' } }, Date.parse('2026-10-04T02:00:00+08:00')), false);
assert.equal(getGigHistoryEndAt({ ...gig, requirements: { event_schedules: [
  { date: '2026-10-01', start_time: '7 PM', end_time: '10 PM' },
  { date: '2026-10-05', start_time: '11 PM', end_time: '2 AM' },
] } }), Date.parse('2026-10-06T02:00:00+08:00'));
assert.equal(canMarkGigDone({ ...gig, requirements: { event_schedules: [{ date: 'invalid' }] } }, now), false);
assert.equal(canMarkGigDone({ ...gig, requirements: { event_schedules: [{ date: '2026-10-01', end_time: 'garbage' }] } }, now), false);
console.log('PASS: 15 History/date checks, including Manila dates, multiple sets, overnight gigs, cancellation and unknown schedules.');
