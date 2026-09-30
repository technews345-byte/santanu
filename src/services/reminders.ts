import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { addDays, format, isSameDay, parseISO, subDays } from 'date-fns';
import { Category, Transaction } from '../types';
import { ReminderSettings } from '../store/useReminderStore';
import { reminderFor, reminderPool, SpendingFocus } from '../utils/messages';
import { holdAppOpenAds } from './ads';

/**
 * The evening reminder, scheduled on the phone itself: no server, no account,
 * and it works offline.
 *
 * Rather than one repeating alarm, each of the next two weeks gets its own
 * reminder, so each day can say something different and a day that already
 * has an entry can simply have its reminder taken away. Reopening the app, or
 * saving anything, rolls the fortnight forward.
 *
 * On by default. The phone still has to allow notifications: Spendly asks
 * once, shortly after it first opens, and Settings shows when they are off.
 */

const PREFIX = 'spendly-reminder-';
// Android fixes a channel's importance when it is first created, so raising
// it means a new channel; the old, quieter one is removed.
const CHANNEL = 'daily-reminders';
const OLD_CHANNELS = ['reminders'];
const DAYS_AHEAD = 14;
/** Tapping a reminder opens the expense form. */
export const ADD_EXPENSE_ACTION = 'add-expense';

export const remindersSupported = Platform.OS === 'android' || Platform.OS === 'ios';

let configured = false;

/** How notifications behave while Spendly itself is open, and the channel
 *  Android files them under. Safe to call more than once. */
export async function configureNotifications(): Promise<void> {
  if (!remindersSupported || configured) return;
  configured = true;
  Notifications.setNotificationHandler({
    // With sound off, Android drops the pop-up banner as well, so a reminder
    // arriving while the app was open showed nowhere but the shade.
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
  if (Platform.OS === 'android') {
    // High importance: the reminder drops down over whatever is on screen,
    // with the phone's notification sound — a reminder nobody notices
    // reminds no one.
    await Notifications.setNotificationChannelAsync(CHANNEL, {
      name: 'Daily reminders',
      description: 'A nudge to note the day’s spending',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
      enableVibrate: true,
      vibrationPattern: [0, 180, 120, 180],
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    }).catch(() => {});
    for (const old of OLD_CHANNELS) await Notifications.deleteNotificationChannelAsync(old).catch(() => {});
  }
}

/** Whether notifications are allowed now, without asking. */
export async function notificationsAllowed(): Promise<boolean> {
  if (!remindersSupported) return false;
  return (await Notifications.getPermissionsAsync()).granted;
}

/** Whether notifications may be shown, asking once if the answer isn't known. */
export async function ensurePermission(): Promise<boolean> {
  if (!remindersSupported) return false;
  await configureNotifications();
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  // Android's permission dialog briefly sends the app to the background;
  // coming back from it must not count as reopening the app and bring an ad.
  const release = holdAppOpenAds();
  try {
    const asked = await Notifications.requestPermissionsAsync();
    return asked.granted;
  } finally {
    setTimeout(release, 2000);
  }
}

/** Which kinds of spending this person actually does, from the last weeks. */
function spendingFocus(transactions: Transaction[], categories: Category[], now: Date): SpendingFocus {
  const since = subDays(now, 45).toISOString();
  const recent = transactions.filter((t) => t.type === 'expense' && t.date >= since);
  // Too little history to tell: assume the everyday kinds.
  if (recent.length < 5) return { groceries: true, shopping: true };
  const kind = (id?: string | null) => {
    const c = categories.find((x) => x.id === id);
    const icon = c?.icon.replace(/-outline$/, '');
    const name = c?.name.toLowerCase() ?? '';
    if (icon === 'cart' || name.includes('grocer')) return 'groceries';
    if (icon === 'bag' || name.includes('shopping')) return 'shopping';
    return null;
  };
  const kinds = new Set(recent.map((t) => kind(t.categoryId)));
  return { groceries: kinds.has('groceries'), shopping: kinds.has('shopping') };
}

let queue: Promise<void> = Promise.resolve();

/**
 * Brings the scheduled reminders in line with the settings and the data.
 * Calls are queued, so a burst of saves never leaves two fortnights behind.
 */
export function rescheduleReminders(
  settings: Pick<ReminderSettings, 'enabled' | 'hour' | 'minute' | 'language'>,
  transactions: Transaction[],
  categories: Category[]
): Promise<void> {
  if (!remindersSupported) return Promise.resolve();
  queue = queue.then(() => reschedule(settings, transactions, categories)).catch(() => {});
  return queue;
}

async function reschedule(
  settings: Pick<ReminderSettings, 'enabled' | 'hour' | 'minute' | 'language'>,
  transactions: Transaction[],
  categories: Category[]
): Promise<void> {
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(
      scheduled
        .filter((n) => n.identifier.startsWith(PREFIX))
        .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier))
    );
  } catch {
    // A schedule that can't be read (left by an older version) is cleared
    // outright rather than blocking every future one. Spendly schedules
    // nothing else.
    await Notifications.cancelAllScheduledNotificationsAsync().catch(() => {});
  }
  if (!settings.enabled) return;
  const permission = await Notifications.getPermissionsAsync();
  if (!permission.granted) return;
  await configureNotifications();

  const now = new Date();
  const pool = reminderPool(settings.language, spendingFocus(transactions, categories, now));
  // Anything entered today counts: the point is the habit, not the kind.
  const trackedToday = transactions.some((t) => isSameDay(parseISO(t.date), now));

  for (let d = 0; d < DAYS_AHEAD; d++) {
    const day = addDays(now, d);
    const at = new Date(day.getFullYear(), day.getMonth(), day.getDate(), settings.hour, settings.minute, 0, 0);
    if (at <= now) continue;
    if (d === 0 && trackedToday) continue;
    const dayNumber = Math.floor((at.getTime() - at.getTimezoneOffset() * 60000) / 86400000);
    await Notifications.scheduleNotificationAsync({
      identifier: PREFIX + format(at, 'yyyy-MM-dd'),
      content: {
        title: 'Spendly',
        body: reminderFor(dayNumber, pool),
        data: { action: ADD_EXPENSE_ACTION },
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at, channelId: CHANNEL },
    });
  }
}

/**
 * A sample reminder, shown at once. Shown rather than scheduled: a scheduled
 * one goes through Android's alarm queue, which may hold it back for minutes.
 */
export async function sendTestReminder(language: ReminderSettings['language']): Promise<boolean> {
  if (!(await ensurePermission())) return false;
  const pool = reminderPool(language, { groceries: true, shopping: true });
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Spendly',
      body: pool[Math.floor(Math.random() * pool.length)],
      data: { action: ADD_EXPENSE_ACTION },
    },
    trigger: Platform.OS === 'android' ? { channelId: CHANNEL } : null,
  });
  return true;
}

/** Calls back when a reminder is tapped, including the one that opened the app. */
export function onReminderTapped(handler: () => void): () => void {
  if (!remindersSupported) return () => {};
  const handle = (response: Notifications.NotificationResponse | null) => {
    if (response?.notification.request.content.data?.action !== ADD_EXPENSE_ACTION) return;
    // Handled once: without clearing, every later launch would reopen it.
    Notifications.clearLastNotificationResponse();
    handler();
  };
  handle(Notifications.getLastNotificationResponse());
  const sub = Notifications.addNotificationResponseReceivedListener(handle);
  return () => sub.remove();
}
