import React, { createContext, useContext } from 'react';
import { darkTheme, Theme } from './tokens';

// Preserve the preference API for older consumers; this skin is dark-only.
export type ThemePreference = 'system' | 'light' | 'dark';
type ThemeContextValue = {
  theme: Theme;
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
};
const value: ThemeContextValue = { theme: darkTheme, preference: 'dark', setPreference: () => {} };
const ThemeContext = createContext(value);
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
export function useTheme() { return useContext(ThemeContext); }
