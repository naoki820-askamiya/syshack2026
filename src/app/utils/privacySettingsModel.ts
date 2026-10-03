export interface PrivacySettings {
  personalizationEnabled: boolean;
  usePersonProfile: boolean;
  useUserPatternSummary: boolean;
  useFeedbackForContext: boolean;
}

export async function saveLoadedPrivacySettings(
  settings: PrivacySettings | null,
  update: (settings: PrivacySettings) => Promise<{ settings: PrivacySettings }>,
): Promise<{ settings: PrivacySettings }> {
  if (!settings) throw new Error('設定を取得してから保存してください。');
  return update(settings);
}
