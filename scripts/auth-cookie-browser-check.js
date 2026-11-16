async page => {
  const origin = 'http://127.0.0.1:5179';
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  for (const other of page.context().pages()) if (other !== page) await other.close();
  await page.context().clearCookies();
  await page.context().route('**/*', route => {
    const url = new URL(route.request().url());
    return url.origin === origin ? route.continue() : route.abort();
  });
  await page.goto(origin + '/login');
  await page.getByLabel('メールアドレス', { exact: true }).fill('A@example.invalid');
  await page.getByLabel('パスワード', { exact: true }).fill('synthetic-password');
  await page.getByRole('button', { name: 'ログイン', exact: true }).click();
  await page.getByText('A@example.invalid', { exact: true }).waitFor();
  const cookies = (await page.context().cookies()).filter(cookie => cookie.name.startsWith('kigen_'));
  check(cookies.length === 2 && cookies.every(cookie => cookie.httpOnly && cookie.sameSite === 'Lax'), 'HttpOnly session cookies required');
  const scriptStorage = await page.evaluate(() => ({ cookie: document.cookie,
    localKeys: Object.keys(localStorage), sessionKeys: Object.keys(sessionStorage) }));
  check(!scriptStorage.cookie.includes('kigen_') && !JSON.stringify(scriptStorage).includes('auth-token'), 'JavaScript must not read credentials');
  const a = await page.evaluate(async () => (await fetch('/api/auth/session', { method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Kigen-CSRF': '1' }, body: '{}' })).json());
  check(!/access_token|refresh_token|synthetic-access/.test(JSON.stringify(a)), 'Auth JSON must not expose tokens');
  await page.reload();
  await page.getByText('A@example.invalid', { exact: true }).waitFor();
  const second = await page.context().newPage();
  await second.goto(origin + '/history');
  await second.getByText('A@example.invalid', { exact: true }).waitFor();
  await page.goto(origin + '/login');
  await page.getByLabel('メールアドレス', { exact: true }).fill('B@example.invalid');
  await page.getByLabel('パスワード', { exact: true }).fill('synthetic-password');
  await page.getByRole('button', { name: 'ログイン', exact: true }).click();
  await page.getByText('B@example.invalid', { exact: true }).waitFor();
  await second.getByText('B@example.invalid', { exact: true }).waitFor();
  const protections = await page.evaluate(async oldId => {
    const stale = await fetch('/api/persons', { method: 'POST', headers: { 'Content-Type': 'application/json',
      'X-Kigen-CSRF': '1', 'X-Kigen-Session': oldId }, body: '{}' });
    const csrf = await fetch('/api/auth/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    return { stale: stale.status, csrf: csrf.status };
  }, a.session.id);
  check(protections.stale === 409 && protections.csrf === 403, 'stale intent and CSRF must be rejected');
  const renewed = await page.evaluate(async () => {
    const headers = { 'Content-Type': 'application/json', 'X-Kigen-CSRF': '1' };
    const current = await (await fetch('/api/auth/session', { method: 'POST', headers, body: '{}' })).json();
    await fetch('/api/__fixture/expire', { method: 'POST', headers: { ...headers, 'X-Kigen-Session': current.session.id }, body: '{}' });
    const restored = await (await fetch('/api/auth/session', { method: 'POST', headers, body: '{}' })).json();
    const status = await (await fetch('/api/__fixture/status')).json();
    return { user: restored.session.user.id, stable: restored.session.id === current.session.id, refreshes: status.refreshes };
  });
  check(renewed.user === 'B' && renewed.stable && renewed.refreshes >= 1, 'expiry must refresh the same session');
  await page.getByRole('button', { name: 'ログアウト', exact: true }).click();
  await page.waitForURL(origin + '/');
  await second.waitForURL(/\/login/);
  await page.reload();
  await page.getByRole('link', { name: 'ログイン', exact: true }).waitFor();
  const finalCookies = (await page.context().cookies()).filter(cookie => cookie.name.startsWith('kigen_'));
  check(finalCookies.length === 0, 'logout must remove the credential cookies');
  await second.close();
  return { login: true, reload: true, httpOnly: true, noTokenInJavaScript: true, crossTabSwitch: true,
    staleWriteRejected: true, csrfRejected: true, refresh: true, crossTabLogout: true, logoutAfterReload: true };
}
