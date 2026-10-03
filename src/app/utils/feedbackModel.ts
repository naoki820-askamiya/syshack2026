export interface FeedbackInput {
  helpfulnessScore: number | null;
  overreadScore: number | null;
  outcomeNote: string | null;
  allowPersonalizationUse: boolean;
}

export interface SavedFeedback extends FeedbackInput {
  id: string;
}

export interface FeedbackRequests {
  create: (resultId: string, input: FeedbackInput) => Promise<{ feedback: SavedFeedback }>;
  update: (feedbackId: string, input: FeedbackInput) => Promise<{ feedback: SavedFeedback }>;
}

export function feedbackInput(feedback: SavedFeedback | null): FeedbackInput {
  return {
    helpfulnessScore: feedback?.helpfulnessScore ?? null,
    overreadScore: feedback?.overreadScore ?? null,
    outcomeNote: feedback?.outcomeNote ?? null,
    allowPersonalizationUse: feedback?.allowPersonalizationUse ?? false,
  };
}

export async function saveLoadedFeedback(
  resultId: string, existing: SavedFeedback | null | undefined,
  input: FeedbackInput, requests: FeedbackRequests,
): Promise<{ feedback: SavedFeedback }> {
  if (existing === undefined) throw new Error('Feedbackを取得してから保存してください。');
  return existing ? requests.update(existing.id, input) : requests.create(resultId, input);
}
