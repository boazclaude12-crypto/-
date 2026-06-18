import type { NativeStackScreenProps } from '@react-navigation/native-stack';

/** Screens shown when the user is signed out. */
export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
};

/** Screens shown when the user is signed in. */
export type AppStackParamList = {
  Analyze: undefined;
  History: undefined;
  AnalysisDetail: { id: string };
  Prices: undefined;
  PriceDetail: { symbol: string };
  Alerts: undefined;
  Lessons: undefined;
  LessonDetail: { id: string };
};

export type AuthStackScreenProps<T extends keyof AuthStackParamList> = NativeStackScreenProps<
  AuthStackParamList,
  T
>;

export type AppStackScreenProps<T extends keyof AppStackParamList> = NativeStackScreenProps<
  AppStackParamList,
  T
>;
