import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { useTheme } from '../theme/ThemeContext';
import { TabNavigator } from './TabNavigator';
import TransactionEntryScreen from '../screens/TransactionEntryScreen';
import CategoryDetailScreen from '../screens/CategoryDetailScreen';
import AccountFormScreen from '../screens/AccountFormScreen';
import CategoryFormScreen from '../screens/CategoryFormScreen';
import BudgetFormScreen from '../screens/BudgetFormScreen';
import LoginScreen from '../screens/LoginScreen';
import PhoneLoginScreen from '../screens/PhoneLoginScreen';
import AccountScreen from '../screens/AccountScreen';
import { RootStackParamList } from './types';
import { useAuthStore } from '../store/useAuthStore';

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  const { theme } = useTheme();
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
    <NavigationContainer theme={navTheme}>
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
            <Stack.Screen
              name="PhoneLogin"
              component={PhoneLoginScreen}
              options={{ presentation: 'modal', animation: 'slide_from_bottom', animationDuration: 300 }}
            />
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
              <Stack.Screen name="PhoneLogin" component={PhoneLoginScreen} />
            </Stack.Group>
            <Stack.Screen name="CategoryDetail" component={CategoryDetailScreen} />
            <Stack.Screen name="Account" component={AccountScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
