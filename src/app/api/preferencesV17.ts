import { fetchApiJson } from './client';

import type { PrivacySettings } from '../utils/privacySettingsModel';
export type { PrivacySettings } from '../utils/privacySettingsModel';

export async function getPrivacySettings() {
  return fetchApiJson<{ settings: PrivacySettings }>('/api/privacy-settings');
}

export async function updatePrivacySettings(settings: Partial<PrivacySettings>) {
  return fetchApiJson<{ settings: PrivacySettings }>('/api/privacy-settings', {
    method: 'PATCH',
    body: JSON.stringify(settings),
  });
}

import type { FeedbackInput, SavedFeedback } from '../utils/feedbackModel';
export type { FeedbackInput, SavedFeedback } from '../utils/feedbackModel';

export async function submitFeedback(resultId: string, feedback: FeedbackInput) {
  return fetchApiJson<{ feedback: SavedFeedback }>(`/api/analysis-results/${resultId}/feedback`, {
    method: 'POST',
    body: JSON.stringify(feedback),
  });
}


export async function getFeedback(resultId: string) {
  return fetchApiJson<{ feedback: SavedFeedback | null }>(`/api/analysis-results/${resultId}/feedback`);
}

export async function updateFeedback(feedbackId: string, feedback: FeedbackInput) {
  return fetchApiJson<{ feedback: SavedFeedback }>(`/api/analysis-feedbacks/${feedbackId}`, {
    method: 'PATCH',
    body: JSON.stringify(feedback),
  });
}
