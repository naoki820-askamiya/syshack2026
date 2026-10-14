import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

test('desktop and mobile primary navigation provide a registered privacy destination', () => {
  const navigation = readFileSync('src/app/components/Navigation.tsx', 'utf8');
  const routes = readFileSync('src/app/routes.tsx', 'utf8');
  for (const menu of ['sideNavItems', 'bottomNavItems']) {
    const start = navigation.indexOf(`const ${menu} = [`);
    assert.notEqual(start, -1, menu);
    const config = navigation.slice(start, navigation.indexOf('];', start) + 2);
    assert.match(config, /path: '\/privacy-settings'/, menu);
  }
  assert.match(routes, /path: '\/privacy-settings'/);
});

test('privacy UI cannot offer the unimplemented User Pattern as an enabled analysis control', () => {
  const source = readFileSync('src/app/pages/PrivacySettingsV17.tsx', 'utf8');
  assert.equal(/checked=\{settings\.useUserPatternSummary\}/.test(source), false, 'User Pattern must not be an available control');
  assert.match(source, /傾向要約[\s\S]*現在[\s\S]*利用/);
});
