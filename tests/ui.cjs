const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync, existsSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { create, act } = require('react-test-renderer');
const { create: createStore } = require('zustand');
global.IS_REACT_ACT_ENVIRONMENT = true;

function loader(mocks) {
  const cache = new Map();
  function load(file) {
    file = path.resolve(__dirname, '..', file);
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} };
    cache.set(file, module);
    const code = ts.transpileModule(readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
    }).outputText;
    const req = name => {
      if (Object.hasOwn(mocks, name)) return mocks[name];
      if (name.startsWith('.')) {
        const target = path.resolve(path.dirname(file), name);
        return load([target, `${target}.ts`, `${target}.tsx`].find(existsSync));
      }
      return require(name);
    };
    vm.runInThisContext(`(function(require,module,exports){${code}\n})`, { filename: file })(req, module, module.exports);
    return module.exports;
  }
  return load;
}

function environment() {
  let reduced = true;
  const animations = [];
  const values = [];
  class Value {
    constructor(value) { this.value = value; values.push(this); }
    setValue(value) { this.value = value; }
    stopAnimation() {}
    interpolate(config) { return { value: this, config, interpolate: next => this.interpolate(next) }; }
  }
  function animation(kind, value, config) {
    const a = { kind, value, config, stopped: false, start(callback) { a.callback = callback; }, stop() { a.stopped = true; }, finish() { if (!a.stopped) { value.setValue(config.toValue); a.callback?.({ finished: true }); } } };
    animations.push(a); return a;
  }
  const native = {
    Image: 'Image', View: 'View', Pressable: 'Pressable', Modal: 'Modal', ScrollView: 'ScrollView', FlatList: 'FlatList',
    Text: 'Text', TextInput: 'TextInput', ActivityIndicator: 'Spinner',
    Platform: { OS: 'web' }, Alert: { alert() {} },
    StyleSheet: { create: s => s, absoluteFill: {}, hairlineWidth: 1 },
    useWindowDimensions: () => ({ width: 390, height: 844 }),
    Animated: { multiply: (a,b) => ({a,b}), Value, View: 'AnimatedView', spring: (v,c) => animation('spring',v,c), timing: (v,c) => animation('timing',v,c) },
    Easing: { cubic: x => x, in: x => x },
  };
  const mocks = {
    'react-native': native,
    'react-native-reanimated': { __esModule: true, default: { View: 'ReanimatedView' }, useAnimatedStyle: fn => fn() },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 24, bottom: 34, left: 0, right: 0 }) },
    '../theme/useReducedMotion': { useReducedMotion: () => reduced },
    '../../theme/useReducedMotion': { useReducedMotion: () => reduced },
    '../theme/ThemeContext': { useTheme: () => ({ theme: { tint: '#4353E8', mode: 'light' } }) },
    '../../theme/ThemeContext': { useTheme: () => ({ theme: { tint: '#4353E8', mode: 'light' } }) },
    '../theme/type': { Text: 'Text', TextInput: 'TextInput' },
    '../../theme/type': { Text: 'Text' },
    './glass/GlassSurface': { GlassSurface: 'GlassSurface' },
    './GlassSurface': { GlassSurface: 'GlassSurface' },
    './GlassPressable': { GlassPressable: 'GlassPressable' },
    'expo-linear-gradient': { LinearGradient: 'Gradient' },
    'expo-haptics': {},
    'react-native-svg': { __esModule: true, default: 'Svg', Defs: 'Defs', Ellipse: 'Ellipse', RadialGradient: 'RadialGradient', Stop: 'Stop' },
    './TabIcons': { ActivityGlyph: 'Glyph', BudgetGlyph: 'Glyph', HomeGlyph: 'Glyph', InsightsGlyph: 'Glyph', SettingsGlyph: 'Glyph', Orb: 'Orb', ORB_SIZE: 42, GLYPH_SIZE: 22 },
    './Aurora': { ROOM: {dark: 1, light: 2} },
    './glass/Aurora': { ROOM: {dark: 1, light: 2} },
    './glass/GlassTabBar': { TAB_BAR_HEIGHT: 82 },
    '@expo/vector-icons/Ionicons': 'Icon',
  };
  return { native, mocks, animations, values, setReduced: value => { reduced = value; } };
}

test('transaction search matches category and note; category sorting leaves source order intact; unrelated store changes do not render the screen', async () => {
  const env = environment();
  const categories = [{ id: 'food', name: 'Food & Dining' }, { id: 'travel', name: 'Travel' }];
  const transactions = [
    { id: 'a', note: 'Lunch', categoryId: 'food', type: 'expense', accountId: 'cash', toAccountId: null, amount: 250, date: '2026-10-25T12:00:00Z' },
    { id: 'b', note: 'Taxi', categoryId: 'travel', type: 'expense', accountId: 'cash', toAccountId: null, amount: 100, date: '2026-10-24T12:00:00Z' },
    { id: 'c', note: 'Gift', categoryId: null, type: 'income', accountId: 'bank', toAccountId: null, amount: 500, date: '2026-10-23T12:00:00Z' },
  ];
  transactions.reverse();
  const originalOrder = transactions.map(t => t.id);
  const store = createStore(() => ({ transactions, categories, accounts: [], activeAccountId: null, removeTransaction() {}, duplicateTransaction() {}, updateTransaction() {} }));
  let renderCount = 0;
  const load = loader({ ...env.mocks,
    '@react-navigation/native': { useNavigation: () => ({ navigate() {} }) },
    'react-native-gesture-handler/ReanimatedSwipeable': 'Swipeable',
    '../store/useStore': { useStore: store },
    '../components/Screen': { Screen: props => { renderCount++; return React.createElement('Screen', props); } },
    ...Object.fromEntries(['Pill', 'IconBadge', 'AmountText', 'EmptyState', 'QuickAddFab', 'BottomSheetModal'].map(n => [`../components/${n}`, { [n]: n }])),
    '../components/glass/GlassSurface': { GlassSurface: 'GlassSurface' },
    '../components/glass/GlassPressable': { GlassPressable: 'GlassPressable' },
  });
  let tree;
  await act(async () => { tree = create(React.createElement(load('src/screens/TransactionsScreen.tsx').default)); });
  const initialRenders = renderCount;
  await act(async () => { store.setState({ supportCount: 10, balanceVisible: false }); });
  assert.equal(renderCount, initialRenders);
  const input = () => tree.root.findByType('TextInput');
  const ids = () => tree.root.findByType('FlatList').props.data.map(t => t.id);
  await act(async () => input().props.onChangeText('  FOOD  '));
  assert.deepEqual(ids(), ['a']);
  await act(async () => input().props.onChangeText('taxi'));
  assert.deepEqual(ids(), ['b']);
  await act(async () => input().props.onChangeText(''));
  const categorySort = tree.root.findAllByType('Pressable').find(n => n.findAllByType('Text').some(t => t.children.includes('Category: A-Z')));
  await act(async () => categorySort.props.onPress());
  assert.deepEqual(ids(), ['a', 'b', 'c']);
  assert.deepEqual(transactions.map(t => t.id), originalOrder);
  await act(async () => store.setState({ activeAccountId: 'bank' }));
  assert.deepEqual(ids(), ['c']);
  await act(async () => tree.unmount());
});

test('transaction swipe actions stay hidden at rest and reveal working edit and delete controls', async () => {
  const env = environment();
  const calls = []; const alerts = [];
  env.native.Alert = { alert: (...args) => alerts.push(args) };
  const item = { id: 'a', note: 'Lunch', categoryId: 'food', type: 'expense', accountId: 'cash', amount: 250, date: '2026-10-25T12:00:00Z' };
  const store = createStore(() => ({ transactions: [item], categories: [{ id: 'food', name: 'Food' }], accounts: [], activeAccountId: null, removeTransaction: id => calls.push(['delete', id]), updateTransaction() {} }));
  const Component = loader({ ...env.mocks,
    '@react-navigation/native': { useNavigation: () => ({ navigate: (...args) => calls.push(args) }) },
    'react-native-gesture-handler/ReanimatedSwipeable': 'Swipeable',
    '../store/useStore': { useStore: store },
    '../components/Screen': { Screen: 'Screen' },
    ...Object.fromEntries(['Pill', 'IconBadge', 'AmountText', 'EmptyState', 'QuickAddFab', 'BottomSheetModal'].map(n => [`../components/${n}`, { [n]: n }])),
    '../components/glass/GlassSurface': { GlassSurface: 'GlassSurface' },
    '../components/glass/GlassPressable': { GlassPressable: 'GlassPressable' },
  })('src/screens/TransactionsScreen.tsx').default;
  let screen, row, action;
  await act(async () => { screen = create(React.createElement(Component)); });
  await act(async () => { row = create(screen.root.findByType('FlatList').props.renderItem({ item })); });
  const swipe = row.root.findByType('Swipeable');
  const progress = { value: 0 };
  for (const side of ['renderLeftActions', 'renderRightActions']) {
    await act(async () => { action = create(swipe.props[side](progress)); });
    assert.equal(action.root.findByType('ReanimatedView').props.style[1].opacity, 0);
    progress.value = 1;
    await act(async () => action.update(swipe.props[side](progress)));
    assert.equal(action.root.findByType('ReanimatedView').props.style[1].opacity, 1);
    await act(async () => action.root.findByType('Pressable').props.onPress());
    if (side === 'renderRightActions') await act(async () => alerts[0][2][1].onPress());
    progress.value = 0;
    await act(async () => action.unmount());
  }
  assert.deepEqual(calls, [['TransactionEntry', { transactionId: 'a' }], ['delete', 'a']]);
  await act(async () => { row.unmount(); screen.unmount(); });
});

test('tab bar exposes selection and long press; a prevented tab press does not navigate; Reduce Motion avoids springs', async () => {
  const env = environment();
  const calls = []; let prevent = true;
  const props = {
    state: { index: 0, routes: [{ key: 'home', name: 'Dashboard' }, { key: 'tx', name: 'Transactions' }] },
    descriptors: { home: { options: { tabBarLabel: 'Home' } }, tx: { options: { tabBarLabel: 'Activity', tabBarAccessibilityLabel: 'Transactions' } } },
    navigation: { emit: e => { calls.push(e.type); return { defaultPrevented: prevent }; }, navigate: name => calls.push(name) },
  };
  const Component = loader(env.mocks)('src/components/glass/GlassTabBar.tsx').GlassTabBar;
  let tree;
  await act(async () => { tree = create(React.createElement(Component, props)); });
  const items = tree.root.findAllByType('Pressable');
  assert.equal(items[0].props.accessibilityRole, 'tab');
  assert.equal(items[0].props.accessibilityState.selected, true);
  assert.equal(items[1].props.accessibilityLabel, 'Transactions');
  await act(async () => items[1].props.onPress());
  assert.deepEqual(calls, ['tabPress']);
  prevent = false;
  await act(async () => items[1].props.onPress());
  assert.equal(calls.at(-1), 'Transactions');
  await act(async () => items[1].props.onLongPress());
  assert.equal(calls.at(-1), 'tabLongPress');
  assert.equal(env.animations.length, 0);
  env.setReduced(false);
  await act(async () => tree.update(React.createElement(Component, { ...props, state: { ...props.state, index: 1 } })));
  assert.ok(env.animations.some(a => a.kind === 'spring'));
  env.setReduced(true);
  await act(async () => tree.update(React.createElement(Component, props)));
  assert.ok(env.animations.every(a => a.stopped));
  await act(async () => tree.unmount());
});

test('closed quick actions cannot receive touches or screen reader focus; opening announces expanded state without motion', async () => {
  const env = environment();
  const routes = [];
  const Component = loader({ ...env.mocks, '@react-navigation/native': { useNavigation: () => ({ navigate: (...args) => routes.push(args) }) } })('src/components/QuickAddFab.tsx').QuickAddFab;
  let tree;
  await act(async () => { tree = create(React.createElement(Component)); });
  const hidden = () => tree.root.findAllByType('AnimatedView').filter(n => n.props.importantForAccessibility);
  assert.equal(hidden().length, 3);
  assert.ok(hidden().every(n => n.props.pointerEvents === 'none' && n.props.accessibilityElementsHidden));
  const toggle = tree.root.findAllByType('Pressable').find(n => n.props.accessibilityLabel === 'Add transaction');
  await act(async () => toggle.props.onPress());
  assert.ok(hidden().every(n => n.props.pointerEvents === 'box-none' && !n.props.accessibilityElementsHidden));
  const expanded = tree.root.findAllByType('Pressable').find(n => n.props.accessibilityState?.expanded);
  assert.ok(expanded);
  assert.equal(env.animations.length, 0);
  await act(async () => tree.root.findAllByType('Pressable').find(n => n.props.accessibilityLabel === 'Add Expense').props.onPress());
  assert.deepEqual(routes, [['TransactionEntry', { initialType: 'expense' }]]);
  assert.ok(hidden().every(n => n.props.pointerEvents === 'none'));
  await act(async () => tree.unmount());
});

test('picker keeps close control outside the scrollable body and cancels closing when reopened', async () => {
  const env = environment(); env.setReduced(false);
  const Sheet = loader(env.mocks)('src/components/BottomSheetModal.tsx').BottomSheetModal;
  const props = { visible: true, onClose() {}, title: 'Category', children: Array.from({ length: 80 }, (_, i) => React.createElement('Option', { key: i }, `Category ${i}`)) };
  let tree;
  await act(async () => { tree = create(React.createElement(Sheet, props)); });
  assert.equal(tree.root.findByType('ScrollView').findAllByType('Option').length, 80);
  assert.equal(tree.root.findByType('ScrollView').findAllByType('Pressable').length, 0);
  assert.ok(tree.root.findAllByType('Pressable').some(n => n.props.accessibilityLabel === 'Close Category'));
  await act(async () => tree.update(React.createElement(Sheet, { ...props, visible: false })));
  const closing = env.animations.at(-1);
  await act(async () => tree.update(React.createElement(Sheet, props)));
  assert.ok(closing.stopped);
  await act(async () => closing.finish());
  assert.equal(tree.root.findAllByType('Modal').length, 1);
  await act(async () => tree.update(React.createElement(Sheet, { ...props, visible: false })));
  await act(async () => env.animations.at(-1).finish());
  assert.equal(tree.toJSON(), null);
  await act(async () => tree.unmount());
});

test('save button shows a spinner and disabled/busy semantics while saving', async () => {
  const env = environment();
  const Button = loader(env.mocks)('src/components/glass/GlassButton.tsx').GlassButton;
  let tree;
  await act(async () => { tree = create(React.createElement(Button, { label: 'Saving…', loading: true, onPress() {} })); });
  const button = tree.root.findByType('GlassPressable');
  assert.equal(button.props.disabled, true);
  assert.equal(button.props.busy, true);
  assert.equal(tree.root.findAllByType('Spinner').length, 1);
  await act(async () => tree.update(React.createElement(Button, { label: 'Save Transaction', loading: false, onPress() {} })));
  assert.equal(tree.root.findByType('GlassPressable').props.disabled, false);
  assert.equal(tree.root.findAllByType('Spinner').length, 0);
  await act(async () => tree.unmount());
});

test('expanded cards measure their origin, retain detail identity, and interrupted dismissal cannot unmount a reopened card', async () => {
  const env = environment(); env.setReduced(false);
  const transitions = [];
  const createShared = initial => {
    const ref = React.useRef(null);
    if (!ref.current) {
      let value = initial;
      let pending;
      ref.current = {
        get value() { return value; },
        set value(next) {
          if (pending) pending.cancelled = true;
          if (next && typeof next === 'object' && next.transition) { pending = next; next.shared = ref.current; value = next.target; }
          else { pending = null; value = next; }
        },
        cancel() { if (pending) pending.cancelled = true; },
      };
    }
    return ref.current;
  };
  const transition = (target, config, callback) => {
    const result = { transition: true, target, callback, cancelled: false, finish() { callback?.(!this.cancelled); } };
    transitions.push(result);
    return result;
  };
  const gesture = () => {
    const handlers = {};
    const object = { handlers };
    for (const key of ['enabled', 'minDistance', 'onStart', 'onUpdate', 'onEnd', 'onFinalize']) object[key] = value => { handlers[key] = value; return object; };
    return object;
  };
  const mocks = { ...env.mocks,
    'react-native-reanimated': { __esModule: true, default: { View: 'AnimatedView' },
      useSharedValue: createShared, useAnimatedStyle: () => ({}), cancelAnimation: v => v.cancel(),
      runOnJS: f => f, withSpring: transition, withTiming: transition, interpolate: v => v },
    'react-native-gesture-handler': { Gesture: { Pan: gesture }, GestureDetector: 'GestureDetector', GestureHandlerRootView: 'GestureRoot' },
    './Aurora': { Aurora: 'Aurora' },
  };
  const { HeroTransitionContainer, HeroCard } = loader(mocks)('src/components/glass/HeroTransitionContainer.tsx');
  const Fixture = () => React.createElement(HeroTransitionContainer, {
    renderDetail: detail => React.createElement('Detail', { detail }),
  }, React.createElement(HeroCard, { detail: 'budget', title: 'Monthly budget' }, open => React.createElement('Pressable', { onPress: open })));
  let tree;
  await act(async () => { tree = create(React.createElement(Fixture), { createNodeMock: element => element.type === 'View' ? { measureInWindow: cb => cb(23,177,344,190) } : null }); });
  await act(async () => tree.root.findByType('Pressable').props.onPress());
  assert.equal(tree.root.findByType('Detail').props.detail, 'budget');
  assert.equal(tree.root.findAllByType('Modal').length, 1);
  const overlay = tree.root.findAll(n => n.props.card && n.props.card.title === 'Monthly budget')[0];
  assert.deepEqual([overlay.props.card.x, overlay.props.card.y, overlay.props.card.width, overlay.props.card.height], [23,177,344,190]);
  await act(async () => tree.root.findByType('Modal').props.onRequestClose());
  const interrupted = transitions.at(-1);
  const pan = tree.root.findAllByType('GestureDetector')[0].props.gesture.handlers;
  await act(async () => { pan.onStart(); pan.onUpdate({ translationY: -120 }); pan.onEnd({ velocityY: -200 }); });
  assert.ok(interrupted.cancelled);
  await act(async () => interrupted.finish());
  assert.equal(tree.root.findAllByType('Modal').length, 1);
  await act(async () => tree.root.findByType('Modal').props.onRequestClose());
  await act(async () => transitions.at(-1).finish());
  assert.equal(tree.root.findAllByType('Modal').length, 0);
  await act(async () => tree.unmount());
});

test('notification switch respects permission and retains existing reminder preferences', async () => {
  const env = environment();
  const alerts = [];
  let granted = false;
  env.native.Switch = 'Switch';
  env.native.AppState = { addEventListener: () => ({ remove() {} }) };
  env.native.Linking = { openSettings: async () => {} };
  env.native.Alert = { alert: (...args) => alerts.push(args) };
  const store = createStore((set) => ({ enabled: false, hour: 19, minute: 42, language: 'en', confirmations: false, offered: false, update: patch => set(patch) }));
  const Component = loader({ ...env.mocks,
    '../store/useReminderStore': { useReminderStore: store },
    '../services/reminders': { remindersSupported: true, notificationsAllowed: async () => true, ensurePermission: async () => granted },
    './Card': { Card: 'Card' },
  })('src/components/ReminderSettings.tsx').ReminderSettings;
  let tree;
  await act(async () => { tree = create(React.createElement(Component)); });
  const toggle = () => tree.root.findByType('Switch');
  assert.equal(tree.root.findAllByType('Switch').length, 1);
  assert.equal(toggle().props.value, false);
  await act(async () => toggle().props.onValueChange(true));
  assert.equal(store.getState().enabled, false);
  assert.equal(alerts.length, 1);
  granted = true;
  await act(async () => toggle().props.onValueChange(true));
  assert.equal(store.getState().enabled, true);
  assert.equal(toggle().props.value, true);
  assert.deepEqual([store.getState().hour, store.getState().minute, store.getState().language, store.getState().confirmations], [19, 42, 'en', false]);
  await act(async () => toggle().props.onValueChange(false));
  assert.equal(store.getState().enabled, false);
  assert.equal(store.getState().offered, true);
  await act(async () => tree.unmount());
});

test('glass touch feedback springs on press and remains still with Reduce Motion', async () => {
  const env = environment(); env.setReduced(false);
  const Component = loader(env.mocks)('src/components/glass/GlassPressable.tsx').GlassPressable;
  let pressed = 0; let tree;
  await act(async () => { tree = create(React.createElement(Component, { onPress: () => pressed++, accessibilityLabel: 'Open card' }, 'Content')); });
  const button = () => tree.root.findByType('Pressable');
  await act(async () => button().props.onPressIn());
  assert.equal(env.animations.at(-1).kind, 'spring');
  assert.equal(env.animations.at(-1).config.useNativeDriver, true);
  await act(async () => button().props.onPress());
  await act(async () => button().props.onPressOut());
  assert.equal(pressed, 1);
  assert.equal(env.animations.at(-1).config.toValue, 0);
  const count = env.animations.length;
  env.setReduced(true);
  await act(async () => tree.update(React.createElement(Component, { onPress: () => pressed++, accessibilityLabel: 'Open card' }, 'Content')));
  await act(async () => button().props.onPressIn());
  await act(async () => button().props.onPressOut());
  assert.equal(env.animations.length, count);
  await act(async () => tree.unmount());
});
