/**
 * 関係性ごとのスタイル定義（色の一元管理）
 * badge: カテゴリバッジの色クラス
 * bg: 背景色（ホバー含む）
 * emoji: 関係性の絵文字
 */
export type RelationStyle = {
  badge: string;       // バッジのbg + textクラス
  bgHover: string;     // カードホバー背景
  dot: string;         // アクセントカラー（ドットなど）
  emoji: string;
};

export const RELATION_STYLES: Record<string, RelationStyle> = {
  上司: {
    badge: 'bg-emerald-100 text-emerald-700',
    bgHover: 'hover:bg-emerald-50',
    dot: 'bg-emerald-400',
    emoji: '👔',
  },
  同僚: {
    badge: 'bg-teal-100 text-teal-700',
    bgHover: 'hover:bg-teal-50',
    dot: 'bg-teal-400',
    emoji: '🤝',
  },
  部下: {
    badge: 'bg-cyan-100 text-cyan-700',
    bgHover: 'hover:bg-cyan-50',
    dot: 'bg-cyan-400',
    emoji: '👥',
  },
  恋人: {
    badge: 'bg-pink-100 text-pink-700',
    bgHover: 'hover:bg-pink-50',
    dot: 'bg-pink-400',
    emoji: '💕',
  },
  配偶者: {
    badge: 'bg-rose-100 text-rose-700',
    bgHover: 'hover:bg-rose-50',
    dot: 'bg-rose-400',
    emoji: '💍',
  },
  友人: {
    badge: 'bg-blue-100 text-blue-700',
    bgHover: 'hover:bg-blue-50',
    dot: 'bg-blue-400',
    emoji: '😊',
  },
  家族: {
    badge: 'bg-amber-100 text-amber-700',
    bgHover: 'hover:bg-amber-50',
    dot: 'bg-amber-400',
    emoji: '🏠',
  },
  その他: {
    badge: 'bg-gray-100 text-gray-600',
    bgHover: 'hover:bg-gray-50',
    dot: 'bg-gray-400',
    emoji: '👤',
  },
};

/** 関係性スタイルを取得（未定義の場合はその他を返す） */
export const getRelationStyle = (relation: string): RelationStyle =>
  RELATION_STYLES[relation] ?? RELATION_STYLES['その他'];

/**
 * 相手の反応を色付けする
 * returns Tailwind text + bg クラス
 */
export type ReactionStyle = { text: string; bg: string };

export const getReactionStyle = (reaction: string): ReactionStyle => {
  if (reaction.includes('怒')) return { text: 'text-red-700', bg: 'bg-red-50' };
  if (reaction.includes('冷たい')) return { text: 'text-red-600', bg: 'bg-red-50' };
  if (reaction.includes('嫌')) return { text: 'text-orange-700', bg: 'bg-orange-50' };
  if (reaction.includes('不満')) return { text: 'text-orange-600', bg: 'bg-orange-50' };
  if (reaction.includes('つまらな')) return { text: 'text-yellow-700', bg: 'bg-yellow-50' };
  if (reaction.includes('悲しそう')) return { text: 'text-blue-600', bg: 'bg-blue-50' };
  if (reaction.includes('嬉しそう')) return { text: 'text-green-600', bg: 'bg-green-50' };
  if (reaction.includes('楽しそう')) return { text: 'text-green-700', bg: 'bg-green-50' };
  if (reaction.includes('分からない')) return { text: 'text-gray-500', bg: 'bg-gray-50' };
  return { text: 'text-gray-600', bg: 'bg-gray-50' };
};