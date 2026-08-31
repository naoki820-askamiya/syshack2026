import type { Reaction, RelationType, Timing } from '../types.js';

export type ChatMessage = { sender: '自分' | '相手'; text: string };
export type ActionMode = 'text' | 'chat' | 'none';
export type ChatPlatform = 'LINE' | 'other';

export interface ConsultationFormState {
  personId: string;
  personName: string;
  relation: RelationType;
  relationOther: string;
  event: string;
  reaction: Reaction;
  reactionOther: string;
  timing: Timing;
  userAction: string;
  ageGroup: string;
  gender: string;
}

export interface ConsultationFormErrors {
  personName: boolean;
  event: boolean;
  relationOther: boolean;
  reactionOther: boolean;
  userAction: boolean;
  chatContent: boolean;
}

export const BUSINESS_RELATIONS: RelationType[] = ['上司', '同僚', '部下'];
export const PRIVATE_RELATIONS: RelationType[] = ['恋人', '配偶者', '友人', '家族', 'その他'];
export const REACTIONS: Reaction[] = [
  '怒っていそう', '冷たい', '悲しそう', '不満そう',
  'つまらなそう', '嫌そう', '嬉しそう', '楽しそう', '分からない', 'その他',
];
export const TIMINGS: Timing[] = ['直後', '数時間後', '翌日', '数日後'];
export const AGE_GROUPS = ['10代', '20代', '30代', '40代', '50代', '60代以上'];
export const GENDERS = ['男性', '女性', 'その他', '回答しない'];

export const REACTION_EMOJI: Record<Reaction, string> = {
  '怒っていそう': '😡',
  '冷たい': '🥶',
  '悲しそう': '😢',
  '不満そう': '😤',
  'つまらなそう': '😑',
  '嫌そう': '😒',
  '嬉しそう': '😊',
  '楽しそう': '😄',
  '分からない': '🤷',
  'その他': '✏️',
};

export const EMPTY_CONSULTATION_FORM: ConsultationFormState = {
  personId: '',
  personName: '',
  relation: '上司',
  relationOther: '',
  event: '',
  reaction: '怒っていそう',
  reactionOther: '',
  timing: '直後',
  userAction: '',
  ageGroup: '20代',
  gender: '回答しない',
};

export function buildChatSummary(messages: ChatMessage[]): string {
  return messages.map((message) => `${message.sender}: ${message.text}`).join('\n');
}

export function getConsultationFormErrors(
  form: ConsultationFormState,
  actionMode: ActionMode,
  chatPlatform: ChatPlatform,
  chatMessages: ChatMessage[],
  otherChatText: string,
): ConsultationFormErrors {
  return {
    personName: !form.personName.trim(),
    event: !form.event.trim(),
    relationOther: form.relation === 'その他' && !form.relationOther.trim(),
    reactionOther: form.reaction === 'その他' && !form.reactionOther.trim(),
    userAction: actionMode === 'text' && !form.userAction.trim(),
    chatContent:
      actionMode === 'chat' &&
      (chatPlatform === 'LINE' ? chatMessages.length === 0 : !otherChatText.trim()),
  };
}

export function resolveRelation(form: ConsultationFormState): RelationType {
  return (form.relation === 'その他' && form.relationOther.trim()
    ? form.relationOther.trim()
    : form.relation) as RelationType;
}

export function resolveReaction(form: ConsultationFormState): Reaction {
  return (form.reaction === 'その他' && form.reactionOther.trim()
    ? form.reactionOther.trim()
    : form.reaction) as Reaction;
}

export function resolveUserAction(
  form: ConsultationFormState,
  actionMode: ActionMode,
  chatPlatform: ChatPlatform,
  chatMessages: ChatMessage[],
  otherChatText: string,
): string | null {
  if (actionMode === 'chat') {
    return chatPlatform === 'LINE' ? buildChatSummary(chatMessages) : otherChatText;
  }
  return actionMode === 'text' ? form.userAction : null;
}
