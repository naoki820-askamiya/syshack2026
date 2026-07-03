import { saveAnalysis } from '../utils/storage';
import { supabase } from '../auth/supabase';

const serverUrl = import.meta.env.VITE_SERVER_URL ?? (
  import.meta.env.DEV ? 'http://127.0.0.1:3000' : undefined
);

function requireServerUrl(): string {
  if (!serverUrl) {
    throw new Error('VITE_SERVER_URL が未設定です');
  }

  return serverUrl;
}

/**
 * API共通ラッパー：Supabase Auth の access token を Authorization に付けます。
 */
async function fetchWithAuth(endpoint: string, options: RequestInit = {}): Promise<Response> {
  const baseUrl = requireServerUrl();
  const { data } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;

  if (!accessToken) {
    throw new Error('ログインが必要です。');
  }

  const headers = new Headers(options.headers || {});
  headers.set('Authorization', `Bearer ${accessToken}`);
  if (!(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(`${baseUrl}${endpoint}`, { ...options, headers });

  // 共通エラーハンドリング
  if (!res.ok) {
    const errorData = await res.json().catch(() => null);
    throw new Error(errorData?.error?.message || `APIエラー: ${res.status}`);
  }

  return res;
}

export async function getMe(): Promise<{ user: { id: string; email: string | null } | null }> {
  const baseUrl = requireServerUrl();
  const { data } = await supabase.auth.getSession();
  const headers = new Headers();

  if (data.session?.access_token) {
    headers.set('Authorization', `Bearer ${data.session.access_token}`);
  }

  const res = await fetch(`${baseUrl}/api/me`, { headers });
  if (!res.ok) {
    const errorData = await res.json().catch(() => null);
    throw new Error(errorData?.error?.message || `APIエラー: ${res.status}`);
  }

  return res.json();
}

export async function createPerson(params: {
  displayName: string;
  relationshipType: string;
  ageRange?: string;
  genderHint?: string;
  notes?: string;
}): Promise<any> {
  // フロントエンドのvalueをAPIの期待する値に変換
  const relationshipTypesToApi: { [key: string]: string } = {
    '上司': 'boss',
    '同僚': 'coworker',
    '部下': 'subordinate',
    '恋人': 'lover',
    '配偶者': 'spouse',
    '友人': 'friend',
    '家族': 'family',
    'その他': 'other',
  };
  const genderHintsToApi: { [key: string]: string } = {
    '男性':'male',
    '女性':'female',
    'その他':'other',
    '回答しない':'unknown',
  };

  const apiParams = {
    ...params,
    relationshipType: relationshipTypesToApi[params.relationshipType] || 'other',
    genderHint: genderHintsToApi[params.genderHint || '回答しない'] || 'unknown',
  };

  const res = await fetchWithAuth('/api/persons', {
    method: 'POST',
    body: JSON.stringify(apiParams),
  });
  console.log('createPerson response:', res); // debug
  return res.json();
}

export async function createAnalysisCase(params: {
  personId: string;
  eventFacts: string;
  selfMessage: string;
  partnerMessage: string;
  // その他任意項目
  [key: string]: any;
}): Promise<any> {
  const res = await fetchWithAuth('/api/analysis-cases', {
    method: 'POST',
    body: JSON.stringify(params),
  });
  console.log('createAnalysisCase response:', res); // debug
  return res.json();
}

export async function analyze(caseId: string): Promise<any> {
  const res = await fetchWithAuth(`/api/analysis-cases/${caseId}/analyze`, {
    method: 'POST',
  });
  const analysisResult = await res.json();
  console.log('analyze response:', analysisResult); // debug
  saveAnalysis(caseId, analysisResult);
  return analysisResult;
}

export async function getResult(caseId: string): Promise<any> {
  const res = await fetchWithAuth(`/api/analysis-cases/${caseId}/results`, {
    method: 'GET',
  });
  console.log('getResult response:', res); // debug
  return res.json();
}

export async function getCasesByPerson(personId: string, options?: { limit?: number; offset?: number }): Promise<any> {
  const query = options ? new URLSearchParams(options as Record<string, string>).toString() : '';
  const endpoint = `/api/persons/${personId}/analysis-cases${query ? `?${query}` : ''}`;
  const res = await fetchWithAuth(endpoint, {
    method: 'GET',
  });
  console.log('getCasesByPerson response:', res); // debug
  return res.json();
}
