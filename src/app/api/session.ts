
import { saveAnalysis } from '../utils/storage';

const serverUrl = import.meta.env.VITE_SERVER_URL;

/**
 * API共通ラッパー：ヘッダーの付与と，401エラー時のセッション自動再生成を行います
 */
async function fetchWithSession(endpoint: string, options: RequestInit = {}): Promise<Response> {
  let sessionId = localStorage.getItem("sessionId");

  // セッションがない場合は新規作成
  if (!sessionId) {
    await createSession();
    sessionId = localStorage.getItem("sessionId");
  }

  const headers = new Headers(options.headers || {});
  if (sessionId) {
    headers.set('X-Session-Id', sessionId);
  }
  if (!(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  let res = await fetch(`${serverUrl}${endpoint}`, { ...options, headers });

  // 401エラー時はセッションを作り直して1度だけリトライする
  if (res.status === 401) {
    console.warn("セッションが切れました。再作成します。");
    await createSession();
    const newSessionId = localStorage.getItem("sessionId");
    if (newSessionId) {
      headers.set('X-Session-Id', newSessionId);
      res = await fetch(`${serverUrl}${endpoint}`, { ...options, headers });
    }
  }

  // 共通エラーハンドリング
  if (!res.ok) {
    const errorData = await res.json().catch(() => null);
    throw new Error(errorData?.error?.message || `APIエラー: ${res.status}`);
  }

  return res;
}

export async function createSession(): Promise<{ sessionId: string, expiresAt: string }> {
  const res = await fetch(`${serverUrl}/api/sessions`, { method: 'POST' });
  if (!res.ok) throw new Error("セッションの作成に失敗しました");
  
  const data = await res.json();
  console.log('セッションID:', data.sessionId);
  console.log('有効期限:', data.expiresAt);

  localStorage.setItem("sessionId", data.sessionId);
  return data;
}

export async function createPerson(params: {
  displayName: string;
  relationshipType: string;
  ageRange?: string;
  genderHint?: string;
  notes?: string;
}): Promise<any> {
  const res = await fetchWithSession('/api/persons', {
    method: 'POST',
    body: JSON.stringify(params),
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
  const res = await fetchWithSession('/api/analysis-cases', {
    method: 'POST',
    body: JSON.stringify(params),
  });
  console.log('createAnalysisCase response:', res); // debug
  return res.json();
}

export async function analyze(caseId: string): Promise<any> {
  const res = await fetchWithSession(`/api/analysis-cases/${caseId}/analyze`, {
    method: 'POST',
  });
  const analysisResult = await res.json();
  console.log('analyze response:', analysisResult); // debug
  saveAnalysis(caseId, analysisResult);
  return analysisResult;
}

export async function getResult(caseId: string): Promise<any> {
  const res = await fetchWithSession(`/api/analysis-cases/${caseId}/results`, {
    method: 'GET',
  });
  console.log('getResult response:', res); // debug
  return res.json();
}

export async function getCasesByPerson(personId: string, options?: { limit?: number; offset?: number }): Promise<any> {
  const query = options ? new URLSearchParams(options as Record<string, string>).toString() : '';
  const endpoint = `/api/persons/${personId}/analysis-cases${query ? `?${query}` : ''}`;
  const res = await fetchWithSession(endpoint, {
    method: 'GET',
  });
  console.log('getCasesByPerson response:', res); // debug
  return res.json();
}