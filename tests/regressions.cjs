const assert = require('node:assert/strict');
const { test } = require('node:test');
const { DatabaseSync } = require('node:sqlite');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');

function loader(mocks = {}) {
  const cache = new Map();
  function load(file) {
    file = path.resolve(root, file);
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} }; cache.set(file, module);
    const code = ts.transpileModule(readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React }
    }).outputText;
    const req = (name) => {
      if (Object.hasOwn(mocks, name)) return mocks[name];
      if (name.startsWith('.')) {
        let target = path.resolve(path.dirname(file), name);
        if (!path.extname(target)) target += '.ts';
        return load(target);
      }
      return require(name);
    };
    vm.runInThisContext(`(function(require,module,exports){${code}\n})`, { filename: file })(req, module, module.exports);
    return module.exports;
  }
  return load;
}

function database() {
  const raw = new DatabaseSync(':memory:');
  const db = {
    execAsync: async (sql) => raw.exec(sql),
    runAsync: async (sql, params = []) => raw.prepare(sql).run(...params),
    getAllAsync: async (sql, params = []) => raw.prepare(sql).all(...params),
    getFirstAsync: async (sql, params = []) => raw.prepare(sql).get(...params) ?? null,
    withTransactionAsync: async (fn) => {
      raw.exec('BEGIN');
      try { await fn(); raw.exec('COMMIT'); } catch (e) { raw.exec('ROLLBACK'); throw e; }
    },
  };
  const load = loader({ 'expo-sqlite': { openDatabaseAsync: async () => db } });
  return { raw, db, load };
}

const calc = loader()('src/utils/calculator.ts');
test('calculator rejects division by zero and malformed decimals, and supports negative results', () => {
  assert.ok(Number.isNaN(calc.evaluateExpression('50/0+20')));
  assert.ok(Number.isNaN(calc.evaluateExpression('1..2')));
  assert.equal(calc.evaluateExpression('-50+100'), 50);
  assert.equal(calc.evaluateExpression('200+10%'), 220);
  assert.equal(calc.evaluateExpression('20*3+'), 60);
});

test('recreating a deleted budget returns its persisted ID and can be deleted again', async () => {
  const { load } = database();
  const { BudgetsRepo } = load('src/db/repositories.ts');
  const base = { id: 'old', categoryId: 'cat-food', monthKey: 'recurring', amount: 100, isRecurring: true };
  await BudgetsRepo.upsert(base); await BudgetsRepo.remove('old');
  const saved = await BudgetsRepo.upsert({ ...base, id: 'new', amount: 250 });
  assert.equal(saved.id, 'old'); assert.equal(saved.amount, 250);
  await BudgetsRepo.remove(saved.id); assert.equal((await BudgetsRepo.list()).length, 0);
});

test('sync acknowledgment preserves same-millisecond edits and deletions', async () => {
  const { load, db } = database();
  const sync = load('src/db/syncStore.ts');
  const original = (await sync.readAll('accounts'))[0];
  await db.runAsync('UPDATE accounts SET initialBalance = 321 WHERE id = ?', [original.id]);
  await sync.markClean('accounts', [original]);
  assert.ok((await sync.readDirtyIds('accounts')).has(original.id));
  const edited = (await sync.readAll('accounts')).find(r => r.id === original.id);
  await sync.markClean('accounts', [edited]);
  assert.ok(!(await sync.readDirtyIds('accounts')).has(original.id));
  await db.runAsync('UPDATE accounts SET deletedAt = ?, dirty = 1 WHERE id = ?', ['deleted', original.id]);
  await sync.markClean('accounts', [edited]);
  assert.ok((await sync.readDirtyIds('accounts')).has(original.id));
});

test('remote application cannot overwrite a local edit made after planning', async () => {
  const { load, db } = database();
  const sync = load('src/db/syncStore.ts');
  const before = await sync.readAll('accounts');
  await db.runAsync('UPDATE accounts SET initialBalance = 456 WHERE id = ?', [before[0].id]);
  await sync.applyRemote('accounts', [{ ...before[0], initialBalance: 123, updatedAt: '2099' }], before);
  assert.equal((await sync.readAll('accounts'))[0].initialBalance, 456);
});

test('account switch clears previous rows and failed clearing retains old owner', async () => {
  const { load, db } = database();
  const sync = load('src/db/syncStore.ts');
  const engine = load('src/sync/engine.ts');
  assert.equal(await engine.claimLocalDataFor('alice'), 'first-sign-in');
  assert.equal(await engine.claimLocalDataFor('alice'), 'same-account');
  const run = db.runAsync;
  db.runAsync = async (sql, params) => { if (sql === 'DELETE FROM categories') throw Error('disk error'); return run(sql, params); };
  await assert.rejects(engine.claimLocalDataFor('bob'));
  assert.equal(await sync.getMeta('sync:ownerUid'), 'alice');
  assert.ok((await sync.readAll('accounts')).length > 0);
  db.runAsync = run;
  assert.equal(await engine.claimLocalDataFor('bob'), 'switched-account');
  assert.equal((await sync.readAll('accounts')).length, 0);
});

test('cloud pull reads all pages including equal timestamps and old offline uploads', async () => {
  const docs = Array.from({ length: 4001 }, (_, i) => ({ id: String(i).padStart(5, '0'), data: () => ({ id: String(i).padStart(5, '0'), updatedAt: '2000-01-01T00:00:00.000Z', createdAt: '2000-01-01T00:00:00.000Z', name: 'Cash', type: 'cash', color: '#123456', icon: 'cash', archived: 0, sortOrder: 0, currency: 'INR', initialBalance: 0 }) }));
  const firestore = {
    collection: () => ({}), documentId: () => '__name__', orderBy: () => ({ type: 'order' }), limit: (n) => ({ type: 'limit', n }),
    startAfter: (id) => ({ type: 'cursor', id }), query: (_, ...constraints) => constraints,
    getDocs: async (constraints) => {
      const after = constraints.find(c => c.type === 'cursor')?.id;
      return { docs: docs.filter(d => !after || d.id > after).slice(0, 2000) };
    }
  };
  const load = loader({ 'firebase/firestore': firestore, '../services/firebase': { getFirestoreDb: () => ({}) } });
  const adapter = load('src/sync/firestoreAdapter.ts').createFirestoreAdapter('alice');
  assert.equal((await adapter.pull('accounts', '2026')).length, 4001);
});

test('monthly and yearly repeats keep month-end anchors', () => {
  const { nextOccurrence } = loader()('src/utils/recurrence.ts');
  const jan = new Date(2024, 0, 31, 12).toISOString();
  const feb = nextOccurrence(jan, 'monthly');
  assert.equal(new Date(feb).getDate(), 29);
  assert.equal(new Date(nextOccurrence(feb, 'monthly', jan)).getDate(), 31);
  const leap = new Date(2024, 1, 29, 12).toISOString();
  assert.equal(new Date(nextOccurrence(leap, 'yearly')).getDate(), 28);
  assert.equal(nextOccurrence(jan, 'none'), null);
});

test('recurring transactions catch up once, survive retries and do not recreate deletions', async () => {
  const { load } = database();
  const { TransactionsRepo } = load('src/db/repositories.ts');
  const { materializeRecurring } = load('src/db/recurring.ts');
  const date = new Date(2026, 9, 1, 12).toISOString();
  await TransactionsRepo.upsert({ id: 'template', type: 'expense', amount: 100, currency: 'INR', accountId: 'acc-cash',
    toAccountId: null, categoryId: 'cat-food', note: '', date, attachments: [], recurrence: 'daily', nextOccurrence: null, createdAt: date, updatedAt: date });
  const now = new Date(2026, 9, 4, 12);
  await materializeRecurring(now); await materializeRecurring(now);
  const rows = await TransactionsRepo.list();
  assert.equal(rows.length, 4);
  assert.equal(rows.filter(r => r.recurrence === 'daily').length, 1);
  await TransactionsRepo.remove(rows.find(r => r.id !== 'template').id);
  await materializeRecurring(now);
  assert.equal((await TransactionsRepo.list()).length, 3);
});

test('native session migration removes plaintext, handles large Unicode tokens and preserves old session on write failure', async () => {
  const legacy = new Map([['session', 'অসমীয়া🔒'.repeat(500)]]);
  const secure = new Map(); let failAt = null; let count = 0;
  const store = { getItem: async k => legacy.get(k) ?? null, setItem: async (k,v) => { legacy.set(k,v); }, removeItem: async k => { legacy.delete(k); } };
  const secureStore = {
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: 1,
    getItemAsync: async k => secure.get(k) ?? null,
    deleteItemAsync: async k => { secure.delete(k); },
    setItemAsync: async (k,v) => {
      assert.ok(Buffer.byteLength(v) < 2048);
      if (++count === failAt) throw Error('keystore unavailable');
      secure.set(k,v);
    },
  };
  const crypto = require('node:crypto');
  const load = loader({ '@react-native-async-storage/async-storage': store, 'expo-secure-store': secureStore,
    'expo-crypto': { CryptoDigestAlgorithm: { SHA256: 'sha256' }, digestStringAsync: async (_,v) => crypto.createHash('sha256').update(v).digest('hex'), randomUUID: crypto.randomUUID },
    'react-native': { Platform: { OS: 'android' } } });
  const auth = load('src/services/authStorage.ts').authStorage;
  const original = legacy.get('session');
  assert.equal(await auth.getItem('session'), original);
  assert.equal(legacy.has('session'), false);
  failAt = count + 2;
  await assert.rejects(auth.setItem('session', 'replacement'.repeat(300)));
  assert.equal(await auth.getItem('session'), original);
  await auth.removeItem('session');
  assert.equal(await auth.getItem('session'), null);
  assert.equal(secure.size, 0);
});

test('cloud input rejects malformed attachments, nonfinite amounts and privileged account types', () => {
  const { assertRecord } = loader()('src/security/validation.ts');
  const at = '2026-10-07T00:00:00.000Z';
  const tx = { id: 't', type: 'expense', amount: 10, currency: 'INR', accountId: 'a', toAccountId: null, categoryId: null,
    note: '<script>alert(1)</script>', date: at, createdAt: at, updatedAt: at, attachments: '[]', recurrence: 'none', nextOccurrence: null };
  assert.doesNotThrow(() => assertRecord('transactions', tx, true)); // text is allowed; escaped on export
  for (const patch of [{ amount: NaN }, { amount: Infinity }, { amount: -1 }, { attachments: '{}' }, { attachments: '[1]' }, { date: 'bad' }, { note: 'x'.repeat(1001) }]) {
    assert.throws(() => assertRecord('transactions', { ...tx, ...patch }, true));
  }
});

test('session changes cancel a sync before old remote data reaches SQLite', async () => {
  const { load } = database();
  const engine = load('src/sync/engine.ts');
  const sync = load('src/db/syncStore.ts');
  const rows = await sync.readAll('accounts'); let current = true;
  await assert.rejects(engine.runSync({ pull: async () => { current = false; return [{ ...rows[0], name: 'Other account', updatedAt: '2099' }]; }, push: async () => assert.fail('must not upload') }, () => current));
  assert.notEqual((await sync.readAll('accounts'))[0].name, 'Other account');
});

test('sign out keeps the local owner marker', async () => {
  let released = false;
  const load = loader({
    'react-native': { AppState: {} }, '@react-native-async-storage/async-storage': {}, '@react-native-community/netinfo': {},
    './useStore': { useStore: {} }, '../services/cloudConfig': { isCloudConfigured: true },
    '../db/syncStore': {}, '../services/auth': { signOut: async () => {} },
    '../sync/engine': { releaseOwner: async () => { released = true; } },
  });
  const store = load('src/store/useAuthStore.ts').useAuthStore;
  await store.getState().signOut();
  assert.equal(released, false);
});

test('account deletion removes cloud documents before deleting Firebase identity', async () => {
  const events = []; let reads = 0;
  const user = { uid: 'alice', getIdTokenResult: async () => ({ claims: { auth_time: Date.now() / 1000 } }) };
  const load = loader({
    'firebase/auth': { deleteUser: async () => { events.push('identity'); } },
    './firebase': { getFirebaseAuth: () => ({ currentUser: user }), getFirestoreDb: () => ({}) },
    'firebase/firestore': { collection: (_,p) => p, limit: () => 400, query: x => x,
      getDocs: async () => { const hasRows = reads++ % 2 === 0; return { empty: !hasRows, docs: hasRows ? [{ ref: 'doc' }] : [] }; },
      writeBatch: () => ({ delete: () => { events.push('document'); }, commit: async () => {} }) },
  });
  await load('src/services/auth.ts').deleteAccount();
  assert.deepEqual(events, ['document', 'document', 'document', 'document', 'identity']);
  user.getIdTokenResult = async () => ({ claims: { auth_time: 0 } });
  await assert.rejects(load('src/services/auth.ts').deleteAccount(), { code: 'auth/requires-recent-login' });
  assert.equal(events.length, 5);
});

test('PDF export escapes hostile input and disables scripts; XLSX keeps formula-looking notes as text', async () => {
  let html = '';
  const load = loader({ 'expo-file-system': {}, 'expo-sharing': { isAvailableAsync: async () => false },
    'expo-print': { printToFileAsync: async options => { html = options.html; return { uri: 'local' }; } } });
  const hostile = '<script>alert("x")</script>';
  await load('src/utils/export.ts').exportToPdf({ transactions: [], categories: [], accounts: [], rangeLabel: hostile, user: { displayName: hostile, email: hostile } });
  assert.ok(!html.includes(hostile));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(html.includes('Content-Security-Policy'));
  const { buildXlsx } = load('src/utils/xlsx.ts');
  const bytes = buildXlsx({ name: 'Report', header: ['Note'], rows: [['=HYPERLINK("https://example.com")']] });
  const xml = Buffer.from(bytes).toString('utf8');
  assert.ok(!xml.includes('<f>'));
  assert.ok(xml.includes('t="inlineStr"'));
});

test('app relocks on background and retains the mounted form behind the lock', async () => {
  const React = require('react');
  const { create, act } = require('react-test-renderer');
  global.IS_REACT_ACT_ENVIRONMENT = true;
  const listeners = new Set(); let mounted = 0; let authCalls = 0;
  const state = { hydrated: true, hydrationError: null, hydrate: async () => {}, biometricLockEnabled: true, transactions: [], categories: [] };
  const Root = () => { React.useEffect(() => { mounted++; }, []); return React.createElement('Ledger'); };
  const reminders = { loaded: false };
  const useStore = Object.assign(() => state, { getState: () => state });
  const useReminderStore = Object.assign(() => reminders, { getState: () => ({ load() {} }) });
  const load = loader({
    'react-native': { AppState: { currentState: 'active', addEventListener: (_, f) => { listeners.add(f); return { remove: () => listeners.delete(f) }; } }, StyleSheet: { create: x => x }, View: 'View', Pressable: 'Pressable' },
    './src/theme/type': { fontAssets: {}, Text: 'Text' }, 'expo-status-bar': { StatusBar: 'StatusBar' },
    'react-native-safe-area-context': { SafeAreaProvider: 'Provider' }, 'react-native-gesture-handler': { GestureHandlerRootView: 'Gesture' },
    '@expo/vector-icons/Ionicons': 'Icon', 'expo-local-authentication': { authenticateAsync: async () => { authCalls++; return { success: true }; } },
    'expo-splash-screen': { preventAutoHideAsync: async () => {}, hideAsync: async () => {} },
    'expo-system-ui': { setBackgroundColorAsync: async () => {} }, 'expo-font': { useFonts: () => [true, null] },
    './src/theme/ThemeContext': { ThemeProvider: 'Theme', useTheme: () => ({ theme: { bg: '#fff' } }) },
    './src/navigation/RootNavigator': { RootNavigator: Root }, './src/components/BrandSplash': { BrandSplash: 'BrandSplash' },
    './src/store/useStore': { useStore }, './src/store/useReminderStore': { useReminderStore },
    './src/store/useAuthStore': { useAuthStore: selector => selector({ init: () => {}, ready: true }) },
    './src/services/ads': { initAds() {}, preloadAppOpenAd() {}, showAppOpenAd() {}, holdAppOpenAds: () => () => {} },
    './src/services/reminders': { configureNotifications() {}, remindersSupported: false },
    './src/components/Toast': { ToastHost: 'Toast' }, './src/theme/tokens': { fontSizes: {}, radius: {}, spacing: {} },
  });
  const App = load('App.tsx').default;
  let renderer;
  await act(async () => { renderer = create(React.createElement(App)); });
  assert.equal(authCalls, 1); assert.equal(mounted, 1);
  await act(async () => { for (const listener of listeners) listener('background'); });
  assert.ok(renderer.root.findAllByType('Text').some(node => node.children.includes('Locked')));
  assert.equal(mounted, 1);
  await act(async () => { for (const listener of listeners) listener('active'); });
  assert.equal(authCalls, 2); assert.equal(mounted, 1);
  assert.ok(!renderer.root.findAllByType('Text').some(node => node.children.includes('Locked')));
  await act(async () => { renderer.unmount(); });
});
