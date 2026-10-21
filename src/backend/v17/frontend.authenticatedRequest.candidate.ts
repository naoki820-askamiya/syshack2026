// UNWIRED A05 CANDIDATE: see experiments/auth-boundary/README.md before integration.
import { assertCurrentAuthBoundary, type AuthBoundary } from '../../app/utils/authBoundary.js';

type SessionResponse = { data: { session: { user: { id: string }; access_token: string } | null } };

// Small boundary guard, separated so delayed auth/request/body completion can be tested without Supabase or Vite.
export async function fetchAuthenticated(
  boundary: AuthBoundary,
  getSession: () => Promise<SessionResponse>,
  send: (accessToken: string) => Promise<Response>,
): Promise<Response> {
  assertCurrentAuthBoundary(boundary);
  const { data } = await getSession();
  assertCurrentAuthBoundary(boundary);
  if (data.session?.user.id !== boundary.userId) throw new Error('ログイン状態が変わりました。もう一度操作してください。');
  const accessToken = data.session?.access_token;
  if (!accessToken) throw new Error('ログインが必要です。');
  const response = await send(accessToken);
  assertCurrentAuthBoundary(boundary);
  return response;
}

export async function readAuthenticatedJson<T>(boundary: AuthBoundary, response: Response): Promise<T> {
  assertCurrentAuthBoundary(boundary);
  const payload = await response.json() as T;
  assertCurrentAuthBoundary(boundary);
  return payload;
}
