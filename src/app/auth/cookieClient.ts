export type BrowserUser = { id: string; email: string | null };
export type BrowserSession = { id: string; user: BrowserUser; expiresAt: number };
type Listener = (event: string, session: BrowserSession | null) => void;
type Result = { data: { session: BrowserSession | null }; error: Error | null };
type Options = {
  send: typeof fetch;
  serverUrl: string;
  withLock?: <T>(operation: () => Promise<T>) => Promise<T>;
  broadcast?: () => void;
  takeCallbackCode?: () => string | null;
};

function parseSession(value: unknown): BrowserSession | null {
  if (value === null) return null;
  const session = value as Partial<BrowserSession> | undefined;
  if (!session || !/^[a-f0-9]{32}$/.test(session.id ?? '') || typeof session.expiresAt !== 'number' ||
    !Number.isFinite(session.expiresAt) || typeof session.user?.id !== 'string' ||
    !(session.user.email === null || typeof session.user.email === 'string')) throw new Error('ログイン状態を確認できませんでした。');
  return { id: session.id!, expiresAt: session.expiresAt, user: { id: session.user.id, email: session.user.email } };
}

// Memory contains public identity and an anti-stale binding only. Supabase
// credentials remain in HttpOnly cookies and are never returned by this API.
export function createBrowserAuthClient(options: Options) {
  let session: BrowserSession | null = null;
  let loaded = false;
  let generation = 0;
  let callbackChecked = false;
  let queue: Promise<unknown> = Promise.resolve();
  const listeners = new Set<Listener>();
  const publish = (next: BrowserSession | null, event: string) => {
    session = next; loaded = true;
    for (const listener of listeners) listener(event, next);
  };
  function serial<T>(operation: () => Promise<T>): Promise<T> {
    const run = () => options.withLock ? options.withLock(operation) : operation();
    const result = queue.then(run, run);
    queue = result.catch(() => {});
    return result;
  }
  async function request(path: string, body: unknown = {}, binding?: string) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await options.send(options.serverUrl + '/api/auth/' + path, {
        method: 'POST', credentials: 'include', cache: 'no-store', signal: controller.signal,
        headers: { 'Content-Type': 'application/json', 'X-Kigen-CSRF': '1', ...(binding ? { 'X-Kigen-Session': binding } : {}) },
        body: JSON.stringify(body),
      });
      const value = await response.json();
      if (!response.ok) throw new Error(response.status === 429
        ? '操作が多すぎます。時間をおいて再試行してください。' : '認証処理に失敗しました。時間をおいて再試行してください。');
      return value as { session: unknown };
    } finally { clearTimeout(timeout); }
  }
  async function change(path: string, body?: unknown, binding?: string): Promise<Result> {
    try {
      const start = generation;
      const result = await request(path, body, binding);
      if (start !== generation) throw new Error('ログイン状態が変わりました。もう一度操作してください。');
      const next = parseSession(result.session);
      if (path !== 'register' || next) {
        publish(next, next ? 'SIGNED_IN' : 'SIGNED_OUT');
        options.broadcast?.();
      }
      return { data: { session: next }, error: null };
    } catch { return { data: { session: null }, error: new Error('認証処理に失敗しました。時間をおいて再試行してください。') }; }
  }
  const auth = {
    async getSession(): Promise<Result> {
      return serial(async () => {
        if (loaded && (!session || session.expiresAt > Date.now() / 1000 + 60)) return { data: { session }, error: null };
        try {
          const start = generation;
          if (!callbackChecked) {
            callbackChecked = true;
            const code = options.takeCallbackCode?.();
            if (code) return change('callback', { code });
          }
          const result = await request('session');
          if (start !== generation) throw new Error('ログイン状態が変わりました。');
          const next = parseSession(result.session);
          publish(next, loaded ? 'TOKEN_REFRESHED' : 'INITIAL_SESSION');
          return { data: { session: next }, error: null };
        } catch { return { data: { session: null }, error: new Error('ログイン状態を確認できませんでした。') }; }
      });
    },
    signInWithPassword: (input: { email: string; password: string }) => serial(() => change('login', input)),
    signUp: (input: { email: string; password: string; options?: { emailRedirectTo?: string; data?: { display_name?: string } } }) =>
      serial(() => change('register', { email: input.email, password: input.password, displayName: input.options?.data?.display_name })),
    resend: (input: { email: string; type: 'signup'; options?: { emailRedirectTo?: string } }) => serial(async () => {
      try { await request('resend', { email: input.email }); return { error: null }; }
      catch { return { error: new Error('確認メールを再送信できませんでした。時間をおいて再試行してください。') }; }
    }),
    signOut: () => {
      const expectedId = session?.id ?? null;
      return serial(async () => {
      const current = parseSession((await request('session')).session);
      if ((expectedId && current?.id !== expectedId) || (!expectedId && current)) {
        publish(current, 'SIGNED_IN');
        return { error: new Error('ログイン状態が変わりました。もう一度操作してください。') };
      }
      return change('logout', {}, current?.id);
      });
    },
    onAuthStateChange: (listener: Listener) => {
      listeners.add(listener);
      return { data: { subscription: { unsubscribe: () => { listeners.delete(listener); } } } };
    },
  };
  function invalidate() {
    generation++;
    publish(null, 'SESSION_PENDING');
    loaded = false;
  }
  return { auth, invalidate, async revalidate(): Promise<Result> {
    const start = generation;
    loaded = false;
    let result: Result;
    try { result = await auth.getSession(); }
    catch { result = { data: { session: null }, error: new Error('ログイン状態を確認できませんでした。') }; }
    if (result.error && start === generation) {
      publish(null, 'SESSION_ERROR');
      loaded = false;
    }
    return result;
  } };
}
