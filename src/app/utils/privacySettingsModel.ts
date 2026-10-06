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
  // GET also returns database metadata; TypeScript's interface does not remove it at runtime.
  return update({
    personalizationEnabled: settings.personalizationEnabled,
    usePersonProfile: settings.usePersonProfile,
    useUserPatternSummary: settings.useUserPatternSummary,
    useFeedbackForContext: settings.useFeedbackForContext,
  });
}
