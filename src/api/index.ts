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
      request<AuthResponse>('/api/mobile/auth/register', { method: 'POST', body: { email, password }, auth: false }),
    login: (email: string, password: string) =>
      request<AuthResponse>('/api/mobile/auth/login', { method: 'POST', body: { email, password }, auth: false }),
    me: () => request<User>('/api/mobile/auth/me'),
  },

  subscription: {
    status: () => request<SubscriptionStatus>('/api/mobile/subscription/status'),
    plans: () => request<SubscriptionPlan[]>('/api/plans'),
    verifyIap: (payload: VerifyIapRequest) =>
      request<SubscriptionStatus>('/api/mobile/subscription/verify-iap', { method: 'POST', body: payload }),
  },

  analysis: {
    /**
     * Upload a chart image for AI analysis.
     * Pass base64 (from ImagePicker) to send JSON; falls back to FormData for mock.
     */
    analyze: (
      image: { uri: string; base64?: string; name?: string; type?: string },
      assetName = 'chart',
      assetType = 'crypto',
    ) => {
      if (image.base64) {
        const mimeType = image.type ?? 'image/jpeg';
        return request<Analysis>('/api/analysis', {
          method: 'POST',
          body: {
            assetName,
            assetNameType: assetType,
            imageBase64: `data:${mimeType};base64,${image.base64}`,
          },
        });
      }
      // Mock fallback: multipart
      const form = new FormData();
      form.append('image', { uri: image.uri, name: image.name ?? 'chart.jpg', type: image.type ?? 'image/jpeg' } as any);
      return request<Analysis>('/api/analysis', { method: 'POST', form });
    },
    history: (page = 1, pageSize = 10) =>
      request<Paginated<Analysis>>('/api/mobile/analyses/history', { query: { page, page_size: pageSize } }),
    get: (id: string) => request<Analysis>(`/api/mobile/analyses/${id}`),
  },

  prices: {
    list: () => request<PriceListItem[]>('/api/mobile/prices'),
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
