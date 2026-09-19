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

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  const { theme } = useTheme();

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
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Tabs" component={TabNavigator} />
        <Stack.Group screenOptions={{ presentation: 'modal' }}>
          <Stack.Screen name="TransactionEntry" component={TransactionEntryScreen} />
          <Stack.Screen name="AccountForm" component={AccountFormScreen} />
          <Stack.Screen name="CategoryForm" component={CategoryFormScreen} />
          <Stack.Screen name="BudgetForm" component={BudgetFormScreen} />
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen name="PhoneLogin" component={PhoneLoginScreen} />
        </Stack.Group>
        <Stack.Screen name="CategoryDetail" component={CategoryDetailScreen} />
        <Stack.Screen name="Account" component={AccountScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
