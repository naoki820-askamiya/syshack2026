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

test('privacy GET metadata is not sent to the strict PATCH API', async () => {
  const flags = { ...off, personalizationEnabled: true, usePersonProfile: true, useFeedbackForContext: true };
  const loaded = {
    ...flags,
    id: 'privacy-record-id',
    userId: 'authenticated-owner-id',
    createdAt: '2026-10-06T00:00:00.000Z',
    updatedAt: '2026-10-06T00:00:00.000Z',
  };
  const result = await saveLoadedPrivacySettings(loaded, async (settings) => {
    assert.deepEqual(settings, flags);
    return { settings };
  });
  assert.deepEqual(result.settings, flags);
  assert.equal(loaded.id, 'privacy-record-id');
});
