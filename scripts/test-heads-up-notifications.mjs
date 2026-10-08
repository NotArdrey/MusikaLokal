import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { PGlite } from '@electric-sql/pglite';

const requireMobile = createRequire(new URL('../mobile/package.json', import.meta.url));
const read = path => readFileSync(path, 'utf8');
const compile = source => ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const flush = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

function loadNotifications(nativeModule) {
  const exports = {};
  vm.runInNewContext(compile(read('mobile/src/notifications/expoNotifications.ts')), {
    exports, __DEV__: false,
    require: name => {
      assert.equal(name, 'expo-notifications');
      if (!nativeModule) throw new Error('Native module not installed');
      return nativeModule;
    },
  });
  return exports;
}

function mountPush({ platform = 'android', permission = 'granted', channel,
  projectId = 'fixture-project', isDevice = true } = {}) {
  const effects = [], calls = [], routes = [], warnings = [], foreground = [];
  let handler, received, response;
  const nativeModule = {
    AndroidImportance: { MAX: 7 }, AndroidNotificationPriority: { MAX: 'max' },
    setNotificationHandler: next => { handler = next; },
    setNotificationChannelAsync: (id, options) => {
      calls.push({ operation: 'channel', id, options });
      return channel ? channel() : Promise.resolve({ id, ...options });
    },
    getPermissionsAsync: async () => { calls.push({ operation: 'permissions' }); return { status: permission }; },
    requestPermissionsAsync: async () => { calls.push({ operation: 'request' }); return { status: permission }; },
    getExpoPushTokenAsync: async options => { calls.push({ operation: 'token', options }); return { data: 'ExpoPushToken[fixture]' }; },
    getLastNotificationResponseAsync: async () => null,
    clearLastNotificationResponseAsync: async () => { calls.push({ operation: 'clear-response' }); },
    addNotificationReceivedListener: fn => { received = fn; return { remove() {} }; },
    addNotificationResponseReceivedListener: fn => { response = fn; return { remove() {} }; },
  };
  const navigation = {};
  vm.runInNewContext(compile(read('mobile/src/utils/notificationNavigation.ts')), { exports: navigation });
  const exports = {};
  vm.runInNewContext(compile(read('mobile/src/hooks/usePushNotifications.ts')), {
    exports, __DEV__: true, console: { warn: (...args) => warnings.push(args) },
    require: name => {
      if (name === 'react') return { useRef: current => ({ current }), useEffect: fn => effects.push(fn) };
      if (name === 'react-native') return { Platform: { OS: platform } };
      if (name === 'expo-device') return { isDevice, modelName: 'Fixture phone' };
      if (name === 'expo-constants') return { default: { expoConfig: { version: '1.0.1' } } };
      if (name === 'expo-router') return { router: { push: target => routes.push(target) } };
      if (name.endsWith('/supabase')) return { supabase: { rpc: async (name, args) => {
        calls.push({ operation: name, args }); return { error: null };
      } } };
      if (name.endsWith('/pushInstallation')) return {
        getExpoPushProjectId: () => projectId,
        getOrCreatePushInstallationId: async () => 'fixture-installation',
      };
      if (name.endsWith('/expoNotifications')) return loadNotifications(nativeModule);
      if (name.endsWith('/notificationNavigation')) return navigation;
      throw new Error(`Unexpected dependency ${name}`);
    },
  });
  const mount = () => {
    effects.length = 0;
    exports.usePushNotifications('fixture-user', notification => foreground.push(notification));
    const cleanups = effects.map(fn => fn()).filter(fn => typeof fn === 'function');
    return () => cleanups.forEach(fn => fn());
  };
  const dispose = mount();
  return { calls, routes, foreground, warnings, dispose, mount,
    behavior: () => handler.handleNotification(), receive: value => received(value), respond: value => response(value) };
}

test('notification loader uses the native module and safely handles a missing native build', () => {
  const native = { AndroidImportance: { MAX: 7 } };
  assert.equal(loadNotifications(native).Notifications, native);
  assert.equal(loadNotifications(native).isExpoNotificationsAvailable, true);
  assert.equal(loadNotifications(null).isExpoNotificationsAvailable, false);
  assert.equal(loadNotifications(null).NotificationAndroidImportance.MAX, 7);
});

test('Android waits for the heads-up channel before permission, token, and device registration', async () => {
  const channel = deferred();
  const app = mountPush({ channel: () => channel.promise });
  await flush();
  assert.deepEqual(app.calls.map(call => call.operation), ['channel']);
  assert.equal(app.calls[0].options.importance, 7);
  assert.equal(app.calls[0].options.sound, 'default');
  assert.equal(app.calls[0].options.enableVibrate, true);
  channel.resolve({ id: app.calls[0].id });
  await flush();
  assert.deepEqual(app.calls.map(call => call.operation), ['channel', 'permissions', 'token', 'register_push_device']);
  assert.equal(app.calls[2].options.projectId, 'fixture-project');
  assert.equal(app.calls[3].args.p_platform, 'android');
  app.dispose();
});

test('a failed channel stops registration and can be retried on a later mount', async () => {
  let attempt = 0;
  const app = mountPush({ channel: () => ++attempt === 1
    ? Promise.reject(new Error('Fixture channel failure')) : Promise.resolve({ id: 'ready' }) });
  await flush();
  assert.deepEqual(app.calls.map(call => call.operation), ['channel']);
  assert.ok(app.warnings.length > 0);
  app.dispose();
  const dispose = app.mount();
  await flush();
  assert.equal(attempt, 2);
  assert.ok(app.calls.some(call => call.operation === 'register_push_device'));
  dispose();
});

test('unmounting while the channel is pending never requests permission or registers a device', async () => {
  const channel = deferred();
  const app = mountPush({ channel: () => channel.promise });
  app.dispose();
  channel.resolve({ id: 'ready' });
  await flush();
  assert.deepEqual(app.calls.map(call => call.operation), ['channel']);
});

test('denied notification permission unregisters this installation without getting a push token', async () => {
  const app = mountPush({ permission: 'denied' });
  await flush();
  assert.deepEqual(app.calls.map(call => call.operation), ['channel', 'permissions', 'request', 'unregister_push_device']);
  assert.equal(app.calls[3].args.p_reason, 'permission_denied');
  app.dispose();
});

test('missing Expo project ID stops registration with a useful diagnostic', async () => {
  const app = mountPush({ projectId: null });
  await flush();
  assert.ok(!app.calls.some(call => call.operation === 'token' || call.operation === 'register_push_device'));
  assert.match(String(app.warnings[0][1]), /EXPO_PUBLIC_EAS_PROJECT_ID/);
  app.dispose();
});

test('iOS registers without Android channels; web and simulator never register native push devices', async () => {
  const ios = mountPush({ platform: 'ios' });
  await flush();
  assert.deepEqual(ios.calls.map(call => call.operation), ['permissions', 'token', 'register_push_device']);
  ios.dispose();
  for (const options of [{ platform: 'web' }, { isDevice: false }]) {
    const app = mountPush(options);
    await flush();
    assert.ok(!app.calls.some(call => call.operation === 'token' || call.operation === 'register_push_device'));
    app.dispose();
  }
});

test('foreground pushes keep the in-app toast and tapping a push opens its destination only once', async () => {
  const app = mountPush();
  const notification = { request: { identifier: 'fixture-notification', content: {
    title: 'Booking confirmed', body: 'Your studio is booked.', data: { route: '/wallet', params: { section: 'outstanding' } },
  } } };
  const behavior = await app.behavior();
  assert.equal(behavior.shouldShowBanner, false);
  assert.equal(behavior.shouldPlaySound, false);
  app.receive(notification);
  assert.equal(app.foreground.length, 1);
  app.respond({ notification });
  app.respond({ notification });
  assert.equal(app.routes.length, 1);
  assert.equal(app.routes[0].pathname, '/wallet');
  assert.equal(app.routes[0].params.section, 'outstanding');
  app.dispose();
});

function pushConfig(env, config) {
  const module = { exports: {} };
  vm.runInNewContext(read('mobile/app.config.js'), {
    module, __dirname: 'E:/Codes/MusikaLokal/mobile', process: { env },
    require: name => name === 'dotenv' ? { config() {} } : requireMobile(name),
  });
  return module.exports({ config });
}

test('native build config accepts Expo project and Firebase file, preserving existing app settings', () => {
  const config = { android: { package: 'com.anonymous.musikalokal' }, plugins: [], extra: { eas: { existing: true } } };
  const result = pushConfig({ EXPO_PUBLIC_EAS_PROJECT_ID: ' fixture-project ', GOOGLE_SERVICES_JSON: ' ./google-services.json ' }, config);
  assert.equal(result.extra.eas.projectId, 'fixture-project');
  assert.equal(result.extra.eas.existing, true);
  assert.equal(result.android.googleServicesFile, './google-services.json');
  assert.equal(result.android.package, config.android.package);
  const inherited = pushConfig({}, { ...config, android: { ...config.android, googleServicesFile: './inherited.json' }, extra: { eas: { projectId: 'inherited-project' } } });
  assert.equal(inherited.android.googleServicesFile, './inherited.json');
  assert.equal(inherited.extra.eas.projectId, 'inherited-project');
  assert.equal(pushConfig({}, config).android.googleServicesFile, undefined);
});

test('real notification insert dispatches a matching high-priority push and honors opt-out, read state and device deduplication', async () => {
  const migration = 'supabase/migrations/20260430014500_use_high_importance_push_channel.sql';
  assert.equal(read(`mobile/${migration}`), read(`web/${migration}`));
  const app = mountPush();
  const channelId = app.calls[0].id;
  app.dispose();
  const plugin = JSON.parse(read('mobile/app.json')).expo.plugins.find(value => Array.isArray(value) && value[0] === 'expo-notifications');
  assert.equal(plugin[1].defaultChannel, channelId);
  const db = new PGlite();
  try {
    await db.exec(`
      create schema net;
      create table net.requests(id bigint generated always as identity, url text, body jsonb);
      create function net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer)
      returns bigint language plpgsql as $$ declare request_id bigint; begin
        insert into net.requests(url,body) values (url,body) returning id into request_id; return request_id;
      end $$;
      create table notification_preferences(user_id uuid primary key,push_enabled boolean);
      create table push_notification_devices(user_id uuid,push_token text,is_active boolean);
      create table notifications(id uuid default gen_random_uuid(),user_id uuid,title text,message text,read boolean,meta jsonb);
      insert into push_notification_devices values
        ('00000000-0000-4000-8000-000000000001','ExpoPushToken[fixture]',true),
        ('00000000-0000-4000-8000-000000000001','ExpoPushToken[fixture]',true),
        ('00000000-0000-4000-8000-000000000001','ExpoPushToken[inactive]',false),
        ('00000000-0000-4000-8000-000000000002','ExpoPushToken[other-user]',true);
    `);
    await db.exec(read(`mobile/${migration}`));
    await db.exec(`create trigger dispatch after insert on notifications for each row execute function dispatch_push_notification_on_insert();`);
    const insert = (message = 'Confirmed', isRead = false) => db.query(`insert into notifications(user_id,title,message,read,meta)
      values ('00000000-0000-4000-8000-000000000001','Booking',$1,$2,'{"route":"/wallet","route_params":{"section":"outstanding"}}')`, [message, isRead]);
    await insert();
    const requests = (await db.query('select * from net.requests')).rows;
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, 'https://exp.host/--/api/v2/push/send');
    const payload = requests[0].body;
    assert.equal(payload.channelId, channelId);
    assert.equal(payload.priority, 'high');
    assert.equal(payload.sound, 'default');
    assert.equal(payload.to, 'ExpoPushToken[fixture]');
    assert.equal(payload.data.route, '/wallet');
    assert.equal(payload.data.params.section, 'outstanding');
    await insert('Already read', true);
    await insert('   ');
    await db.exec(`insert into notification_preferences values ('00000000-0000-4000-8000-000000000001',false);`);
    await insert('Disabled push');
    assert.equal((await db.query('select count(*)::int as n from net.requests')).rows[0].n, 1);
  } finally { await db.close(); }
});
