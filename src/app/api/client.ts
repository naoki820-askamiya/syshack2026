import { supabase } from '../auth/supabase';

const serverUrl = import.meta.env.VITE_SERVER_URL ?? (
  import.meta.env.DEV ? 'http://127.0.0.1:3000' : undefined
);

function requireServerUrl(): string {
  if (!serverUrl) throw new Error('VITE_SERVER_URL が未設定です');
  return serverUrl;
}

async function buildApiError(response: Response): Promise<Error> {
  const payload = await response.json().catch(() => null) as {
    error?: { message?: string; requestId?: string };
  } | null;
  const requestId = payload?.error?.requestId;
  const suffix = requestId ? `（問い合わせID: ${requestId}）` : '';
  return new Error(`${payload?.error?.message ?? `APIエラー: ${response.status}`}${suffix}`);
}

export async function fetchApi(endpoint: string, options: RequestInit = {}): Promise<Response> {
  // refreshやlogoutを即時反映し、APIクライアント側に別のtoken状態を持たせないため毎回取得します。
  const { data } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;
  if (!accessToken) throw new Error('ログインが必要です。');

  const headers = new Headers(options.headers);
  headers.set('Authorization', `Bearer ${accessToken}`);
  if (!(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${requireServerUrl()}${endpoint}`, { ...options, headers });
  if (!response.ok) throw await buildApiError(response);
  return response;
}

export async function fetchApiJson<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const response = await fetchApi(endpoint, options);
  return response.json() as Promise<T>;
}
