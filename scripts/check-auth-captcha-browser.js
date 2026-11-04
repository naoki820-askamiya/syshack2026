// Run with playwright-cli run-code --filename=scripts/check-auth-captcha-browser.js
// Start Vite with synthetic Supabase settings, VITE_TURNSTILE_SITE_KEY and
// VITE_PASSWORD_RECOVERY_ENABLED=true. All provider traffic below is intercepted.
async page => {
  const requests = [];
  const check = (ok, label) => { if (!ok) throw new Error(label); };
  await page.route('https://captcha-test.invalid/**', async route => {
    requests.push({ url: route.request().url(), body: route.request().postDataJSON() });
    await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ code: 'invalid_credentials', msg: 'Synthetic rejection' }) });
  });
  await page.route('https://challenges.cloudflare.com/**', route => route.fulfill({
    contentType: 'application/javascript', body: `window.captchaWidgets = []; window.turnstile = {
      render(el, options) { window.captchaWidgets.push(options); el.textContent = 'Synthetic challenge'; return String(window.captchaWidgets.length - 1); },
      remove() {}
    };`,
  }));
  const success = token => page.evaluate(value => window.captchaWidgets.at(-1).callback(value), token);
  const waitWidget = () => page.waitForFunction(() => window.captchaWidgets?.length > 0);
  await page.goto('http://127.0.0.1:5178/login'); await waitWidget();
  check(await page.locator('button[type=submit]').isDisabled(), 'login requires proof');
  check(await page.getByRole('button', { name: 'パスワードを忘れた方' }).isEnabled(), 'recovery navigation remains usable');
  await page.getByLabel('メールアドレス', { exact: true }).fill('fixture@example.invalid');
  await page.getByLabel('パスワード', { exact: true }).fill('synthetic-password');
  await success('login-token');
  await page.evaluate(() => window.captchaWidgets.at(-1)['expired-callback']());
  check(await page.locator('button[type=submit]').isDisabled(), 'expiry disables login');
  await success('fresh-login'); await page.locator('button[type=submit]').click();
  await page.getByRole('alert').waitFor();
  check(requests.length === 1, 'one login request');
  check(requests[0].body.gotrue_meta_security.captcha_token === 'fresh-login', 'login SDK forwards proof');
  check(await page.locator('button[type=submit]').isDisabled(), 'failed login consumes proof');
  await page.goto('http://127.0.0.1:5178/register'); await waitWidget();
  await page.getByLabel('お名前（ニックネーム可）').fill('Fixture');
  await page.getByLabel('メールアドレス', { exact: true }).fill('fixture@example.invalid');
  await page.getByLabel('パスワード', { exact: true }).fill('synthetic-password');
  await page.getByLabel('パスワード（確認）').fill('synthetic-password');
  await page.locator('input[type=checkbox]').check();
  check(await page.locator('button[type=submit]').isDisabled(), 'signup requires proof after consent');
  await success('signup-token'); await page.locator('button[type=submit]').click(); await page.getByRole('alert').waitFor();
  check(requests.at(-1).body.gotrue_meta_security.captcha_token === 'signup-token', 'signup SDK forwards proof');
  check(await page.locator('button[type=submit]').isDisabled(), 'failed signup consumes proof');
  await page.goto('http://127.0.0.1:5178/forgot-password'); await waitWidget();
  await page.getByLabel('メールアドレス', { exact: true }).fill('fixture@example.invalid');
  check(await page.locator('button[type=submit]').isDisabled(), 'recovery requires proof');
  await success('recovery-token'); await page.locator('button[type=submit]').click();
  await page.locator('#recovery-receipt').waitFor();
  await page.waitForFunction(() => document.querySelector('button[type=submit]')?.textContent.includes('秒後'));
  check(requests.at(-1).body.gotrue_meta_security.captcha_token === 'recovery-token', 'recovery SDK forwards proof');
  check(requests.length === 3, 'exactly one request per flow');
  await page.unroute('https://challenges.cloudflare.com/**');
  await page.route('https://challenges.cloudflare.com/**', route => route.abort());
  await page.goto('http://127.0.0.1:5178/login');
  await page.getByRole('status').filter({ hasText: '確認できませんでした' }).waitFor();
  check(await page.locator('button[type=submit]').isDisabled(), 'load failure fails closed');
  await page.unroute('https://challenges.cloudflare.com/**');
  await page.route('https://challenges.cloudflare.com/**', route => route.fulfill({ contentType: 'application/javascript', body: `window.captchaWidgets = []; window.turnstile = { render(el, options) { window.captchaWidgets.push(options); return 'retry'; }, remove() {} };` }));
  await page.getByRole('button', { name: '確認をやり直す' }).click(); await waitWidget();
  await success('retry-token'); check(await page.locator('button[type=submit]').isEnabled(), 'load retry recovers');
  await page.setViewportSize({ width: 375, height: 812 });
  check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'mobile has no horizontal overflow');
  console.log('PASS: login/signup/recovery proof forwarding, expiry, failed-attempt consumption, load failure/retry, mobile layout (synthetic providers)');
}
