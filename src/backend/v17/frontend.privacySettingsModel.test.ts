import assert from 'node:assert/strict';
import test from 'node:test';
import { saveLoadedPrivacySettings } from '../../app/utils/privacySettingsModel.js';

const off = { personalizationEnabled: false, usePersonProfile: false, useUserPatternSummary: false, useFeedbackForContext: false };

test('failed or incomplete privacy GET never PATCHes fallback values', async () => {
  let patches = 0;
  await assert.rejects(saveLoadedPrivacySettings(null, async (settings) => { patches += 1; return { settings }; }), /設定を取得/);
  assert.equal(patches, 0);
});

test('successful retry preserves original OFF values when saved', async () => {
  const result = await saveLoadedPrivacySettings(off, async (settings) => {
    assert.deepEqual(settings, off);
    return { settings };
  });
  assert.deepEqual(result.settings, off);
});
