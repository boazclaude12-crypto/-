import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { NavigationContainer, DefaultTheme, Theme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '@/auth/AuthContext';
import { LoginScreen } from '@/screens/LoginScreen';
import { RegisterScreen } from '@/screens/RegisterScreen';
import { AnalyzeScreen } from '@/screens/AnalyzeScreen';
import { HistoryScreen } from '@/screens/HistoryScreen';
import { AnalysisDetailScreen } from '@/screens/AnalysisDetailScreen';
import { PricesListScreen } from '@/screens/PricesListScreen';
import { PriceDetailScreen } from '@/screens/PriceDetailScreen';
import { AlertsScreen } from '@/screens/AlertsScreen';
import { LessonsScreen } from '@/screens/LessonsScreen';
import { LessonDetailScreen } from '@/screens/LessonDetailScreen';
import { LiveChartScreen } from '@/screens/LiveChartScreen';
import { colors } from '@/theme/colors';
import type { AppStackParamList, AuthStackParamList } from './types';

const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const AppStack = createNativeStackNavigator<AppStackParamList>();

const navTheme: Theme = {
  ...DefaultTheme,
  dark: true,
  colors: {
    ...DefaultTheme.colors,
    background: colors.bg,
    card: colors.surface,
    text: colors.text,
    border: colors.border,
    primary: colors.primary,
  },
};

function AuthFlow() {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false }}>
      <AuthStack.Screen name="Login" component={LoginScreen} />
      <AuthStack.Screen name="Register" component={RegisterScreen} />
    </AuthStack.Navigator>
  );
}

function AppFlow() {
  return (
    <AppStack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.text,
        headerShadowVisible: false,
      }}
    >
      <AppStack.Screen
        name="Analyze"
        component={AnalyzeScreen}
        options={{ headerShown: false }}
      />
      <AppStack.Screen
        name="History"
        component={HistoryScreen}
        options={{ title: 'History' }}
      />
      <AppStack.Screen
        name="AnalysisDetail"
        component={AnalysisDetailScreen}
        options={{ title: 'Analysis' }}
      />
      <AppStack.Screen
        name="Prices"
        component={PricesListScreen}
        options={{ title: 'Live Prices' }}
      />
      <AppStack.Screen
        name="PriceDetail"
        component={PriceDetailScreen}
        options={({ route }) => ({ title: route.params.symbol.replace('USDT', '') })}
      />
      <AppStack.Screen
        name="Alerts"
        component={AlertsScreen}
        options={{ title: 'Price Alerts' }}
      />
      <AppStack.Screen
        name="Lessons"
        component={LessonsScreen}
        options={{ title: 'Learn' }}
      />
      <AppStack.Screen
        name="LessonDetail"
        component={LessonDetailScreen}
        options={{ title: 'Lesson' }}
      />
      <AppStack.Screen
        name="LiveChart"
        component={LiveChartScreen}
        options={{ title: 'Live Charts' }}
      />
    </AppStack.Navigator>
  );
}

export function RootNavigator() {
  const { user, initializing } = useAuth();

  if (initializing) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <NavigationContainer theme={navTheme}>
      {user ? <AppFlow /> : <AuthFlow />}
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
});
