import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import DashboardScreen from '../screens/DashboardScreen';
import TransactionsScreen from '../screens/TransactionsScreen';
import BudgetsScreen from '../screens/BudgetsScreen';
import AnalyticsScreen from '../screens/AnalyticsScreen';
import SettingsScreen from '../screens/SettingsScreen';
import { TabParamList } from './types';
import { GlassTabBar } from '../components/glass/GlassTabBar';

const Tab = createBottomTabNavigator<TabParamList>();

export function TabNavigator() {
  return (
    <Tab.Navigator
      tabBar={(props) => <GlassTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        // A tab out of view stops re-rendering: adding a transaction used to
        // redraw all five screens at once, four of them unseen.
        freezeOnBlur: true,
        // The incoming screen drifts a few points in the direction of travel
        // as it fades up, so moving between tabs has a direction — the same
        // way the selected pane glides along the shelf below.
        animation: 'shift',
        transitionSpec: { animation: 'timing', config: { duration: 240 } },
        // Icons and colours are drawn by GlassTabBar.
      }}
    >
      <Tab.Screen name="Dashboard" component={DashboardScreen} options={{ tabBarLabel: 'Home' }} />
      <Tab.Screen name="Transactions" component={TransactionsScreen} />
      <Tab.Screen name="Budgets" component={BudgetsScreen} />
      <Tab.Screen name="Analytics" component={AnalyticsScreen} />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
}
