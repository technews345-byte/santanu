import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ReminderLanguage } from '../utils/messages';

const KEY = 'settings:reminders';

export interface ReminderSettings {
  /** The evening nudge to note the day's spending. */
  enabled: boolean;
  hour: number;
  minute: number;
  language: ReminderLanguage;
  /** A short line when something is saved: "Grocery expense added 🛒". */
  confirmations: boolean;
  /** Whether the one-time offer to turn reminders on has been made. */
  offered: boolean;
}

const DEFAULTS: ReminderSettings = {
  enabled: false,
  hour: 20,
  minute: 30,
  language: 'mix',
  confirmations: true,
  offered: false,
};

interface ReminderState extends ReminderSettings {
  loaded: boolean;
  load: () => Promise<void>;
  update: (patch: Partial<ReminderSettings>) => void;
}

export const useReminderStore = create<ReminderState>((set, get) => ({
  ...DEFAULTS,
  loaded: false,
  load: async () => {
    try {
      const raw = await AsyncStorage.getItem(KEY);
      set({ ...DEFAULTS, ...(raw ? JSON.parse(raw) : {}), loaded: true });
    } catch {
      set({ loaded: true });
    }
  },
  update: (patch) => {
    set(patch);
    const { enabled, hour, minute, language, confirmations, offered } = { ...get(), ...patch };
    AsyncStorage.setItem(KEY, JSON.stringify({ enabled, hour, minute, language, confirmations, offered })).catch(() => {});
  },
}));
