import { fetchApiJson } from './client';

export interface PrivacySettings {
  personalizationEnabled: boolean;
  usePersonProfile: boolean;
  useUserPatternSummary: boolean;
  useFeedbackForContext: boolean;
}

export async function getPrivacySettings() {
  return fetchApiJson<{ settings: PrivacySettings }>('/api/privacy-settings');
}

export async function updatePrivacySettings(settings: Partial<PrivacySettings>) {
  return fetchApiJson<{ settings: PrivacySettings }>('/api/privacy-settings', {
    method: 'PATCH',
    body: JSON.stringify(settings),
  });
}

export interface FeedbackInput {
  helpfulnessScore: number | null;
  overreadScore: number | null;
  outcomeNote: string | null;
  allowPersonalizationUse: boolean;
}

export async function submitFeedback(resultId: string, feedback: FeedbackInput) {
  return fetchApiJson(`/api/analysis-results/${resultId}/feedback`, {
    method: 'POST',
    body: JSON.stringify(feedback),
  });
}
