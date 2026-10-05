import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const compile = (source) => ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const source = read('mobile/app/edit_group.tsx');
const ast = ts.createSourceFile('edit_group.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const expressions = new Map();
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.initializer) {
    expressions.set(node.name.getText(ast), node.initializer.getText(ast));
  }
  ts.forEachChild(node, visit);
}
visit(ast);
function evaluate(name, scope) {
  assert.ok(expressions.has(name), `Missing editor expression: ${name}`);
  return runInNewContext(compile(`(${expressions.get(name)})`), scope);
}
function loadModule(path) {
  const exports = {};
  runInNewContext(compile(read(path)), { exports });
  return exports;
}
const groupTypes = loadModule('mobile/src/constants/groupTypes.ts');
const groupMembers = loadModule('mobile/src/utils/groupMembers.ts');
const leader = { user_id: 'owner', name: 'Leader', role: 'leader', instrument: 'Drums' };
const member = { user_id: 'member', name: 'Member', role: 'member', instrument: 'Guitar' };

function fixture(overrides = {}) {
  const alerts = [];
  const queries = [];
  const scope = {
    ...groupTypes, ...groupMembers,
    groupName: 'Acoustic Group', selectedGenres: ['Acoustic'], description: 'Our group',
    address: 'Bulacan', latitude: 14.8, longitude: 120.9, images: ['photo.jpg'],
    groupType: 'acoustic_duo', initialGroupType: 'acoustic_duo', groupOwnerId: 'owner',
    members: [leader, member], initialMemberUserIds: ['owner', 'member'],
    memberInstrumentFinalization: { 0: true, 1: true }, isLeaderInstrumentFinalized: true,
    hasActiveEngagements: false, impactSummary: { activeApplications: 0, activeBookings: 0 },
    showAlert: (...args) => alerts.push(args), Keyboard: { dismiss() {} },
    saving: false, id: 'group', thumbnailIndex: 0, aiRecommendationSettings: { required_genres: [] },
    selectedPlaylistIds: [], selectedInviteTargets: [], inviteMessage: '', normalizedReturnTab: 'About',
    syncGroupLinkedPlaylists: async () => {}, logActionError() {},
    setSaving: (value) => { scope.saving = value; },
    setMembers: (update) => { scope.members = update(scope.members); },
    setMemberInstrumentFinalization: (update) => {
      scope.memberInstrumentFinalization = update(scope.memberInstrumentFinalization);
    },
    ...overrides,
  };
  scope.supabase = {
    auth: { getUser: async () => ({ data: { user: { id: 'owner' } } }) },
    from(table) {
      const query = { table, calls: [] };
      queries.push(query);
      const builder = {
        then(resolve, reject) {
          return Promise.resolve({ data: table === 'groups' ? [{ id: 'group' }] : null, error: null }).then(resolve, reject);
        },
      };
      for (const method of ['update', 'delete', 'insert', 'eq', 'select', 'upsert', 'not']) {
        builder[method] = (...args) => { query.calls.push([method, ...args]); return builder; };
      }
      return builder;
    },
  };
  for (const name of ['getLeaderIndex', 'getRosterMemberName', 'buildRosterInviteTargets',
    'mergeInviteTargets', 'formatSupabaseError', 'validateForm', 'performSave', 'handleSave', 'removeMember']) {
    scope[name] = evaluate(name, scope);
  }
  const refresh = () => {
    for (const name of ['membersMissingInstrumentCount', 'leaderIndexForSave', 'leaderNeedsFinalization',
      'nonLeaderNeedsFinalizationCount', 'disableSaveForMissingInstruments', 'selectedGroupType',
      'requiredMemberCount', 'remainingMemberCount', 'isFormComplete']) {
      scope[name] = evaluate(name, scope);
    }
  };
  refresh();
  return { scope, alerts, queries, refresh };
}

test('removing the second duo member allows saving and removes their membership access', async () => {
  const { scope, alerts, queries, refresh } = fixture({
    hasActiveEngagements: true, impactSummary: { activeApplications: 1, activeBookings: 1 },
  });
  scope.removeMember(1);
  alerts.at(-1)[3].find((button) => button.text === 'Remove').onPress();
  refresh();
  assert.equal(scope.members.length, 1);
  assert.equal(scope.isFormComplete, true);
  assert.equal(scope.validateForm(), true);
  await scope.handleSave();
  const confirmation = alerts.at(-1);
  assert.match(confirmation[2], /lose active membership access/);
  assert.match(confirmation[2], /invite 1 more/);
  assert.match(confirmation[2], /1 active application.*1 active booking/);
  await confirmation[3].find((button) => button.text === 'Save & Update').onPress();
  assert.equal(alerts.at(-1)[0], 'success');
  const rosterRows = queries.find((query) => query.table === 'group_roster_members' &&
    query.calls.some(([method]) => method === 'insert')).calls.find(([method]) => method === 'insert')[1];
  assert.deepEqual(Array.from(rosterRows, (row) => row.user_id), ['owner']);
  const removedMemberships = queries.find((query) => query.table === 'group_members' &&
    query.calls.some(([method]) => method === 'delete'));
  assert.ok(removedMemberships.calls.some(([method, column, operator, value]) =>
    method === 'not' && column === 'user_id' && operator === 'in' && value === '(owner)'));
});

for (const groupType of ['acoustic_duo', 'standard_opm_band', 'choir']) {
  test(`an existing ${groupType} with only its leader can be edited after reopening`, () => {
    const { scope } = fixture({ members: [leader], initialMemberUserIds: ['owner'], groupType });
    assert.equal(scope.isFormComplete, true);
    assert.equal(scope.validateForm(), true);
  });
}

test('an incomplete lineup still requires profile fields, a leader, and confirmed instruments', () => {
  for (const overrides of [
    { groupName: '' }, { selectedGenres: [] }, { description: '' }, { images: [] },
    { address: '' }, { members: [] }, { members: [member] },
    { members: [{ ...leader, instrument: '' }] }, { isLeaderInstrumentFinalized: false },
    { members: [leader, { ...member, instrument: '' }] },
    { members: [leader, member], memberInstrumentFinalization: { 0: true, 1: false } },
  ]) {
    const { scope } = fixture({ members: [leader], ...overrides });
    assert.equal(scope.isFormComplete, false, JSON.stringify(overrides));
    assert.equal(scope.validateForm(), false, JSON.stringify(overrides));
  }
});

test('the group leader cannot be removed', () => {
  const { scope, alerts } = fixture();
  scope.removeMember(0);
  assert.equal(alerts.at(-1)[1], 'Cannot Remove');
  assert.equal(scope.members.length, 2);
});
