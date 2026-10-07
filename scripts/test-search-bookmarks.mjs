import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { PGlite } from '@electric-sql/pglite';

const read = file => readFileSync(file, 'utf8');
const compile = source => ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React },
}).outputText;
function moduleFrom(file, require) {
  const exports = {};
  vm.runInNewContext(compile(read(file)), { exports, require, console, Response, Request, Deno: { env: { get: () => 'fixture' } } });
  return exports;
}
function expression(file, predicate) {
  const ast = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let found;
  function visit(node) {
    if (predicate(node, ast)) found = node;
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(found, `Production expression in ${file}`);
  return found.getText(ast);
}
function evaluate(source, scope) { return vm.runInNewContext(compile(`(${source})`), scope); }
function events() {
  const listeners = new Set();
  const DeviceEventEmitter = {
    emit(_, payload) { for (const listener of listeners) listener(payload); },
    addListener(_, listener) { listeners.add(listener); return { remove: () => listeners.delete(listener) }; },
  };
  return moduleFrom('mobile/src/utils/favoriteEvents.ts', () => ({ DeviceEventEmitter }));
}
function hookFixture(supabase, favoriteEvents, initial) {
  const slots = [];
  let cursor = 0;
  let pendingEffects = [];
  let params = initial;
  const react = {
    useState(initialState) {
      const index = cursor++;
      slots[index] ??= { value: initialState };
      return [slots[index].value, value => { slots[index].value = value; }];
    },
    useRef(initialValue) { return (slots[cursor++] ??= { current: initialValue }); },
    useCallback(fn) { cursor++; return fn; },
    useEffect(fn, deps) {
      const index = cursor++;
      const slot = slots[index] ??= {};
      if (!slot.deps || deps.some((value, i) => value !== slot.deps[i])) {
        slot.cleanup?.();
        slot.deps = deps;
        pendingEffects.push(() => { slot.cleanup = fn(); });
      }
    },
  };
  const { useListingFavorite } = moduleFrom('mobile/src/hooks/useListingFavorite.ts', name =>
    name === 'react' ? react : name.endsWith('/supabase') ? { supabase } : favoriteEvents);
  const fixture = {
    render(next = params) {
      params = next;
      cursor = 0;
      pendingEffects = [];
      const result = useListingFavorite(...params);
      pendingEffects.forEach(fn => fn());
      return result;
    },
    unmount() { slots.forEach(slot => slot?.cleanup?.()); },
  };
  fixture.render();
  return fixture;
}

async function databaseFixture(workspace) {
  const db = new PGlite();
  await db.exec(`
    create table favorites (id serial primary key, user_id text not null, group_id text,
      profile_id text, studio_id text, gig_id text, production_team_id text,
      created_at timestamptz default now());
    create table production_teams (id text primary key, name text, description text, logo_url text);
    insert into production_teams values ('roots', 'Roots Unite Production', 'Production Team', null);
  `);
  await db.exec(read(`${workspace}/supabase/migrations/20260927104335_dedupe_and_constrain_favorites.sql`));
  const pending = new Set();
  const control = { failNext: false, invokes: 0, readGate: null, mutationGate: null };
  const supabase = {
    from(table) {
      assert.ok(['favorites', 'production_teams'].includes(table), table);
      const filters = [];
      let op = 'select', payload, columns = '*', head = false;
      const query = {
        select(value = '*', options = {}) { columns = value; head = options.head; return query; },
        eq(column, value) { filters.push([column, value]); return query; },
        in(column, values) { filters.push([column, values]); return query; },
        order() { return query; }, limit() { return query; },
        insert(value) { op = 'insert'; payload = value; return query; },
        delete() { op = 'delete'; return query; },
        then(resolve, reject) {
          const run = async () => {
            const values = [];
            const where = filters.map(([column, value]) => {
              assert.match(column, /^[a-z_]+$/);
              if (Array.isArray(value)) return `${column} in (${value.map(v => { values.push(v); return '$' + values.length; }).join(',')})`;
              values.push(value); return `${column} = $${values.length}`;
            }).join(' and ');
            let sql;
            if (op === 'insert') {
              const fields = Object.keys(payload);
              fields.forEach(field => assert.match(field, /^[a-z_]+$/));
              values.push(...Object.values(payload));
              sql = `insert into ${table} (${fields.join(',')}) values (${values.map((_, i) => '$' + (i + 1)).join(',')}) returning *`;
            } else {
              assert.match(columns, /^[a-z_, *]+$/);
              sql = `${op === 'delete' ? 'delete' : 'select ' + columns} from ${table}${where ? ' where ' + where : ''}${op === 'delete' ? ' returning *' : ''}`;
            }
            try {
              const { rows } = await db.query(sql, values);
              if (head && filters.some(([field]) => field === 'user_id') && control.readGate) {
                const gate = control.readGate; control.readGate = null; await gate;
              }
              return { data: head ? null : rows, count: rows.length, error: null };
            } catch (error) { return { data: null, error }; }
          };
          const promise = run(); pending.add(promise);
          promise.finally(() => pending.delete(promise));
          return promise.then(resolve, reject);
        },
      };
      return query;
    },
  };
  let handler;
  moduleFrom(`${workspace}/supabase/functions/manage-details/index.ts`, name =>
    name.includes('/http/') ? { serve: fn => { handler = fn; } } : { createClient: () => supabase });
  supabase.functions = { async invoke(_, { body }) {
    control.invokes++;
    if (control.failNext) { control.failNext = false; return { error: new Error('offline') }; }
    const response = await handler(new Request('https://fixture.invalid', { method: 'POST', body: JSON.stringify(body) }));
    const data = await response.json();
    if (control.mutationGate) { const gate = control.mutationGate; control.mutationGate = null; await gate; }
    return { data, error: response.ok ? null : new Error(data.error) };
  } };
  return { db, supabase, control, async idle() {
    await new Promise(resolve => setImmediate(resolve));
    while (pending.size) await Promise.all([...pending]);
    await new Promise(resolve => setImmediate(resolve));
  } };
}

test('all production-team card labels map to the persisted favorite column', () => {
  const { getFavoriteTargetType } = events();
  for (const label of ['Production', 'Production Team', 'production_team', 'production-team', ' production ']) {
    assert.equal(getFavoriteTargetType(label), 'production_team');
  }
  assert.equal(getFavoriteTargetType('Artist'), 'profile');
  assert.equal(getFavoriteTargetType('Group'), 'group');
  assert.equal(getFavoriteTargetType('unknown'), null);
});

for (const workspace of ['mobile', 'web']) {
  test(`${workspace}: production bookmarks persist across client recreation, sync details/profile, and roll back failures`, async () => {
    const api = await databaseFixture(workspace);
    const bus = events();
    const card = hookFixture(api.supabase, bus, ['production_team', 'roots', 'neil']);
    const details = hookFixture(api.supabase, bus, ['production_team', 'roots', 'neil', true]);
    let bookmarks;
    const requestId = { current: 0 };
    const profileFile = 'mobile/app/(tabs)/profile.tsx';
    const fetch = evaluate(expression(profileFile, node => ts.isVariableDeclaration(node) && node.name.getText() === 'fetchBookmarkedListings'), {
      useCallback: fn => fn, supabase: api.supabase, bookmarkRequestIdRef: requestId,
      setBookmarkedListings: value => { bookmarks = value; }, setLoadingBookmarks() {},
      resolveBookmarkImage: value => value.logo_url, normalizeBookmarkBuckets: value => value,
      createEmptyBookmarks: () => ({ production: [] }),
    });
    const focusExpression = expression(profileFile, node => ts.isCallExpression(node) &&
      node.expression.getText() === 'useFocusEffect' && node.getText().includes('addFavoriteChangedListener'));
    const cleanup = evaluate(focusExpression, { useFocusEffect: fn => fn(), useCallback: fn => fn,
      authLoading: false, currentUserId: 'neil', normalizedParamUserId: null, isGuest: false,
      fetchBookmarkedListings: fetch, addFavoriteChangedListener: bus.addFavoriteChangedListener,
      bookmarkRequestIdRef: requestId });
    await api.idle();
    assert.equal(card.render().isFavorited, false);
    assert.equal(bookmarks.production.length, 0);
    await card.render().toggle(); await api.idle();
    assert.equal(details.render().isFavorited, true);
    assert.equal(details.render().favoriteCount, 1);
    assert.equal(bookmarks.production[0].name, 'Roots Unite Production');
    assert.equal((await api.db.query('select * from favorites')).rows.length, 1);
    card.unmount(); details.unmount(); cleanup();
    const restarted = hookFixture(api.supabase, bus, ['production_team', 'roots', 'neil', true]);
    await api.idle();
    assert.equal(restarted.render().isFavorited, true);
    api.control.failNext = true;
    await assert.rejects(restarted.render().toggle(), /offline/);
    assert.equal(restarted.render().isFavorited, true);
    assert.equal(restarted.render().favoriteCount, 1);
    assert.equal((await api.db.query('select * from favorites')).rows.length, 1);
    const before = api.control.invokes;
    await Promise.all([restarted.render().toggle(), restarted.render().toggle()]);
    assert.equal(api.control.invokes - before, 1, 'duplicate presses issue one request');
    assert.equal(restarted.render().isFavorited, false);
    await fetch('neil', true);
    assert.equal(bookmarks.production.length, 0);
    restarted.unmount(); await api.db.close();
  });
}

test('delayed favorite reads and saved mutations cannot overwrite a newer listing or signed-in user', async () => {
  const api = await databaseFixture('mobile');
  const bus = events();
  let releaseRead;
  api.control.readGate = new Promise(resolve => { releaseRead = resolve; });
  const card = hookFixture(api.supabase, bus, ['production_team', 'roots', 'neil', true]);
  await new Promise(resolve => setTimeout(resolve, 20));
  await card.render().toggle();
  releaseRead(); await api.idle();
  assert.equal(card.render().isFavorited, true);
  bus.emitFavoriteChanged({ targetType: 'production_team', id: 'roots', userId: 'jared', isFavorited: false });
  assert.equal(card.render().isFavorited, true);
  let releaseMutation;
  api.control.mutationGate = new Promise(resolve => { releaseMutation = resolve; });
  const mutation = card.render().toggle();
  card.render(['production_team', 'roots', 'jared', true]);
  releaseMutation(); await mutation; await api.idle();
  assert.equal(card.render().isFavorited, false);
  card.render(['production_team', 'different-team', 'jared', true]); await api.idle();
  bus.emitFavoriteChanged({ targetType: 'production_team', id: 'roots', userId: 'jared', isFavorited: true });
  assert.equal(card.render().isFavorited, false);
  card.render(['production_team', 'roots', null, true]); await api.idle();
  assert.equal(card.render().isFavorited, false);
  card.unmount(); await api.db.close();
});

for (const workspace of ['mobile', 'web']) {
  test(`${workspace}: search returns individuals for Musician, groups for Group, and both for All`, async () => {
    let handler;
    const rows = {
      groups_with_stats: [{ id: 'band', name: 'Roots Band', management_status: 'active', open_group_applications: true, created_at: '2026-10-07' }],
      groups: [{ id: 'band', open_group_applications: true }],
      profiles: [{ id: 'solo', full_name: 'Neil', role: 'musician', is_verified: true, verification_status: 'APPROVED', created_at: '2026-10-07' }],
    };
    const client = { from(table) {
      let data = rows[table] || [];
      const query = new Proxy({}, { get(_, method) {
        if (method === 'then') return resolve => resolve({ data, error: null });
        return (...args) => {
          if (method === 'eq') data = data.filter(row => row[args[0]] === args[1]);
          if (method === 'in') data = data.filter(row => args[1].includes(row[args[0]]));
          if (method === 'range') data = data.slice(args[0], args[1] + 1);
          return query;
        };
      } });
      return query;
    } };
    moduleFrom(`${workspace}/supabase/functions/search-content/index.ts`, name =>
      name.includes('/http/') ? { serve: fn => { handler = fn; } } : { createClient: () => client });
    for (const role of [{}, { isOwner: true }, { isGuest: true }]) {
      for (const [activeFilter, expected] of [['Musician', ['Artist']], ['Group', ['Group']],
        ['Solo Artist', ['Artist']], ['Music Group', ['Group']], ['All', ['Artist', 'Group']]]) {
        const response = await handler(new Request('https://fixture.invalid', { method: 'POST',
          body: JSON.stringify({ ...role, activeFilter, limit: 20 }) }));
        assert.equal(response.status, 200);
        assert.deepEqual((await response.json()).items.map(row => row.type).sort(), expected);
      }
    }
  });
}

test('Group is selectable for musician and owner searches and cached mixed Musician results are not reused', () => {
  const file = 'mobile/src/components/SearchBottomSheet.tsx';
  const filters = expression(file, node => ts.isVariableDeclaration(node) && node.name.getText() === 'TYPE_FILTERS');
  for (const isOwner of [true, false]) {
    const result = evaluate(filters, { useMemo: fn => fn(), isOwner, isGuest: false });
    assert.ok(result.includes('Group'));
    assert.ok(result.includes('Musician'));
  }
  const { queryKeys } = moduleFrom('mobile/src/data/queryKeys.ts', () => ({}));
  const musician = queryKeys.search.results({ activeFilter: 'Musician', cursor: null });
  const group = queryKeys.search.results({ activeFilter: 'Group', cursor: null });
  assert.notDeepEqual(musician, group);
  assert.notDeepEqual(musician, ['search', 'results', { activeFilter: 'Musician', cursor: null }]);
});
