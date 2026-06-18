/**
 * Public API surface for the app. Screens import from here; the underlying
 * transport (real fetch vs. mock) is decided by config.useMock and is fully
 * transparent to callers.
 */
import { request, setAuthToken, getAuthToken } from './client';
import type {
  Analysis,
  AuthResponse,
  CreateAlertRequest,
  Lesson,
  LessonSummary,
  Paginated,
  PriceAlert,
  PriceHistory,
  PriceListItem,
  PriceRange,
  PushTokenRequest,
  SubscriptionPlan,
  SubscriptionStatus,
  User,
  VerifyIapRequest,
} from './types';

export { ApiError } from './errors';
export { setAuthToken, getAuthToken };
export * from './types';

export const api = {
  auth: {
    register: (email: string, password: string) =>
      request<AuthResponse>('/auth/register', { method: 'POST', body: { email, password }, auth: false }),
    login: (email: string, password: string) =>
      request<AuthResponse>('/auth/login', { method: 'POST', body: { email, password }, auth: false }),
    me: () => request<User>('/auth/me'),
  },

  subscription: {
    status: () => request<SubscriptionStatus>('/subscription/status'),
    plans: () => request<SubscriptionPlan[]>('/subscription/plans'),
    verifyIap: (payload: VerifyIapRequest) =>
      request<SubscriptionStatus>('/subscription/verify-iap', { method: 'POST', body: payload }),
  },

  analysis: {
    /** Upload a chart image (multipart) and receive the analysis. */
    analyze: (image: { uri: string; name?: string; type?: string }) => {
      const form = new FormData();
      // React Native FormData accepts this file shape directly.
      form.append('image', {
        uri: image.uri,
        name: image.name ?? 'chart.jpg',
        type: image.type ?? 'image/jpeg',
      } as any);
      return request<Analysis>('/analyze', { method: 'POST', form });
    },
    history: (page = 1, pageSize = 10) =>
      request<Paginated<Analysis>>('/analyses/history', { query: { page, page_size: pageSize } }),
    get: (id: string) => request<Analysis>(`/analyses/${id}`),
  },

  prices: {
    list: () => request<PriceListItem[]>('/prices/list'),
    history: (symbol: string, range: PriceRange = '24h') =>
      request<PriceHistory>(`/prices/${symbol}`, { query: { range } }),
  },

  alerts: {
    list: () => request<PriceAlert[]>('/alerts'),
    create: (payload: CreateAlertRequest) =>
      request<PriceAlert>('/alerts', { method: 'POST', body: payload }),
    remove: (id: string) => request<{ success: boolean }>(`/alerts/${id}`, { method: 'DELETE' }),
    registerPushToken: (payload: PushTokenRequest) =>
      request<{ success: boolean }>('/push-tokens', { method: 'POST', body: payload }),
  },

  lessons: {
    list: () => request<LessonSummary[]>('/lessons'),
    get: (id: string) => request<Lesson>(`/lessons/${id}`),
  },
};
