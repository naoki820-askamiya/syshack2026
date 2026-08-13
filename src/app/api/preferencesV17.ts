import { supabase } from '../auth/supabase';

const serverUrl = import.meta.env.VITE_SERVER_URL ?? (
  import.meta.env.DEV ? 'http://127.0.0.1:3000' : undefined
);

async function api<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  if (!serverUrl) throw new Error('VITE_SERVER_URL が未設定です');
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('ログインが必要です。');
  const headers = new Headers(options.headers);
  headers.set('Authorization', `Bearer ${token}`);
  headers.set('Content-Type', 'application/json');
  const response = await fetch(`${serverUrl}${endpoint}`, { ...options, headers });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error?.message ?? `APIエラー: ${response.status}`);
  }
  return payload as T;
}

export interface PrivacySettings {
  personalizationEnabled: boolean;
  usePersonProfile: boolean;
  useUserPatternSummary: boolean;
  useFeedbackForContext: boolean;
}

export async function getPrivacySettings() {
  return api<{ settings: PrivacySettings }>('/api/privacy-settings');
}

export async function updatePrivacySettings(settings: Partial<PrivacySettings>) {
  return api<{ settings: PrivacySettings }>('/api/privacy-settings', {
    method: 'PATCH',
    body: JSON.stringify(settings),
  });
}

export interface FeedbackInput {
  helpfulnessScore: number | null;
  overreadScore: number | null;
  outcomeNote: string | null;
  allowPersonalizationUse: boolean;
}

export async function submitFeedback(resultId: string, feedback: FeedbackInput) {
  return api(`/api/analysis-results/${resultId}/feedback`, {
    method: 'POST',
    body: JSON.stringify(feedback),
  });
}
