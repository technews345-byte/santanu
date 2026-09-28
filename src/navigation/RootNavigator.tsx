import React, { useEffect, useRef } from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { NavigationContainer, DefaultTheme, DarkTheme, createNavigationContainerRef } from '@react-navigation/native';
import { useTheme } from '../theme/ThemeContext';
import { TabNavigator } from './TabNavigator';
import TransactionEntryScreen from '../screens/TransactionEntryScreen';
import CategoriesScreen from '../screens/CategoriesScreen';
import CategoryDetailScreen from '../screens/CategoryDetailScreen';
import AccountFormScreen from '../screens/AccountFormScreen';
import CategoryFormScreen from '../screens/CategoryFormScreen';
import BudgetFormScreen from '../screens/BudgetFormScreen';
import LoginScreen from '../screens/LoginScreen';
import AccountScreen from '../screens/AccountScreen';
import { RootStackParamList } from './types';
import { useAuthStore } from '../store/useAuthStore';
import { onReminderTapped } from '../services/reminders';

const Stack = createNativeStackNavigator<RootStackParamList>();
const navigationRef = createNavigationContainerRef<RootStackParamList>();

export function RootNavigator() {
  const { theme } = useTheme();

  // A tapped reminder opens straight onto a new expense — the thing it was
  // asking for. If it arrives before navigation is ready (it opened the app)
  // it waits for it; on the sign-in screen there is no form to open yet.
  const pendingEntry = useRef(false);
  const openEntry = () => {
    const ready = navigationRef.isReady() && navigationRef.getRootState()?.routeNames.includes('TransactionEntry');
    if (!ready) {
      pendingEntry.current = true;
      return;
    }
    pendingEntry.current = false;
    navigationRef.navigate('TransactionEntry', { initialType: 'expense' });
  };
  useEffect(() => onReminderTapped(openEntry), []);
  const ready = useAuthStore((s) => s.ready);
  const user = useAuthStore((s) => s.user);
  const guestAcknowledged = useAuthStore((s) => s.guestAcknowledged);

  // Someone opening Spendly for the first time is offered the choice up front:
  // sign in, or carry on without an account. Once either is answered the screen
  // steps aside and never asks again.
  const askToSignIn = ready && !user && !guestAcknowledged;

  const navTheme = {
    ...(theme.mode === 'dark' ? DarkTheme : DefaultTheme),
    colors: {
      ...(theme.mode === 'dark' ? DarkTheme.colors : DefaultTheme.colors),
      background: theme.bg,
      card: theme.surface,
      text: theme.text,
      border: theme.border,
      primary: theme.tint,
    },
  };

  return (
    <NavigationContainer
      ref={navigationRef}
      theme={navTheme}
      onReady={() => pendingEntry.current && openEntry()}
      onStateChange={() => pendingEntry.current && openEntry()}
    >
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          animation: 'slide_from_right',
          animationDuration: 260,
        }}
      >
        {askToSignIn ? (
          <>
            <Stack.Screen name="Welcome" component={LoginScreen} />
          </>
        ) : (
          <>
            <Stack.Screen name="Tabs" component={TabNavigator} />
            <Stack.Group screenOptions={{ presentation: 'modal', animation: 'slide_from_bottom', animationDuration: 300 }}>
              <Stack.Screen name="TransactionEntry" component={TransactionEntryScreen} />
              <Stack.Screen name="AccountForm" component={AccountFormScreen} />
              <Stack.Screen name="CategoryForm" component={CategoryFormScreen} />
              <Stack.Screen name="BudgetForm" component={BudgetFormScreen} />
              <Stack.Screen name="Login" component={LoginScreen} />
            </Stack.Group>
            <Stack.Screen name="CategoryDetail" component={CategoryDetailScreen} />
            <Stack.Screen name="Categories" component={CategoriesScreen} />
            <Stack.Screen name="Account" component={AccountScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
