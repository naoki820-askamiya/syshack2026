export type RelationType = '上司' | '同僚' | '部下' | '恋人' | '配偶者' | '友人' | '家族' | 'その他';

export type Reaction =
  | '怒っていそう'
  | '冷たい'
  | '悲しそう'
  | '不満そう'
  | 'つまらなそう'
  | '嫌そう'
  | '嬉しそう'
  | '楽しそう'
  | '分からない'
  | 'その他';

export type Timing = '直後' | '数時間後' | '翌日' | '数日後';

export interface ConsultationData {
  id: string;
  personId?: string;
  personName: string;
  relation: RelationType;
  event: string;
  reaction: Reaction;
  userAction: string;
  timing: Timing;
  createdAt: string;
  ageGroup?: string;
  gender?: string;
}
