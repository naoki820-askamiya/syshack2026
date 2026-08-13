import { supabase } from '../auth/supabase';
import { saveAnalysis } from '../utils/storage';

const serverUrl = import.meta.env.VITE_SERVER_URL ?? (
  import.meta.env.DEV ? 'http://127.0.0.1:3000' : undefined
);

function requireServerUrl(): string {
  if (!serverUrl) throw new Error('VITE_SERVER_URL が未設定です');
  return serverUrl;
}

async function fetchWithAuth(endpoint: string, options: RequestInit = {}): Promise<Response> {
  const { data } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;
  if (!accessToken) throw new Error('ログインが必要です。');

  const headers = new Headers(options.headers);
  headers.set('Authorization', `Bearer ${accessToken}`);
  if (!(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${requireServerUrl()}${endpoint}`, { ...options, headers });
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as {
      error?: { message?: string; requestId?: string };
    } | null;
    const suffix = payload?.error?.requestId ? `（問い合わせID: ${payload.error.requestId}）` : '';
    throw new Error(`${payload?.error?.message ?? `APIエラー: ${response.status}`}${suffix}`);
  }
  return response;
}

const RELATIONSHIP_TYPES: Record<string, string> = {
  上司: 'boss', 同僚: 'coworker', 部下: 'subordinate', 恋人: 'lover',
  配偶者: 'spouse', 友人: 'friend', 家族: 'family', その他: 'other',
};

export async function createPerson(params: { displayName: string; relationshipType: string }) {
  const response = await fetchWithAuth('/api/persons', {
    method: 'POST',
    body: JSON.stringify({
      displayName: params.displayName,
      relationshipType: RELATIONSHIP_TYPES[params.relationshipType] ?? 'other',
    }),
  });
  return response.json() as Promise<{ person: { id: string } }>;
}

export interface CreateAnalysisCaseRequest {
  personId: string;
  userAgeRange: string;
  userGender: string;
  perceivedPartnerReaction: string;
  elapsedTimeType: string;
  eventFacts: string;
  userResponseType: 'action' | 'conversation' | 'none';
  userResponseText: string | null;
}

export async function createAnalysisCase(params: CreateAnalysisCaseRequest) {
  const response = await fetchWithAuth('/api/analysis-cases', {
    method: 'POST',
    body: JSON.stringify(params),
  });
  return response.json() as Promise<{ analysisCase: { id: string } }>;
}

export async function analyze(caseId: string): Promise<unknown> {
  const response = await fetchWithAuth(`/api/analysis-cases/${caseId}/analyze`, { method: 'POST' });
  const result: unknown = await response.json();
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    throw new Error("分析APIから不正な形式の応答が返されました。");
  }
  // 画面遷移中だけ保持し、localStorage等へ永続化しません。
  saveAnalysis(caseId, result as Record<string, unknown>);
  return result;
}
