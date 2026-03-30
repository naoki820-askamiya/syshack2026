import React from 'react';
import {
  BriefcaseBusiness,
  Handshake,
  ChessPawn,
  Heart,
  ChessQueen,
  HandMetal,
  Home,
  User,
} from 'lucide-react';

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
  lucideIcon?: React.ReactNode; // Lucideアイコン（必要に応じて）
};

export const RELATION_STYLES: Record<string, RelationStyle> = {
  上司: {
    badge: 'bg-[#E8F1F8] text-[#0F4C81]',
    bgHover: 'hover:bg-[#F1F4F8]',
    dot: 'bg-[#0F4C81]',
    emoji: '👤',
    lucideIcon: <BriefcaseBusiness className="w-4 h-4" />
  },
  同僚: {
    badge: 'bg-[#E8F1F8] text-[#0F4C81]',
    bgHover: 'hover:bg-[#F1F4F8]',
    dot: 'bg-[#0F4C81]',
    emoji: '👤',
    lucideIcon: <Handshake className="w-4 h-4" />
  },
  部下: {
    badge: 'bg-[#E8F1F8] text-[#0F4C81]',
    bgHover: 'hover:bg-[#F1F4F8]',
    dot: 'bg-[#0F4C81]',
    emoji: '👤',
    lucideIcon: <ChessPawn className="w-4 h-4" />
  },
  恋人: {
    badge: 'bg-[#F1F4F8] text-[#5B6573]',
    bgHover: 'hover:bg-[#F1F4F8]',
    dot: 'bg-[#5B6573]',
    emoji: '👤',
    lucideIcon: <Heart className="w-4 h-4" />
  },
  配偶者: {
    badge: 'bg-[#F1F4F8] text-[#5B6573]',
    bgHover: 'hover:bg-[#F1F4F8]',
    dot: 'bg-[#5B6573]',
    emoji: '👤',
    lucideIcon: <ChessQueen className="w-4 h-4" />
  },
  友人: {
    badge: 'bg-[#F1F4F8] text-[#5B6573]',
    bgHover: 'hover:bg-[#F1F4F8]',
    dot: 'bg-[#5B6573]',
    emoji: '👤',
    lucideIcon: <HandMetal className="w-4 h-4" />
  },
  家族: {
    badge: 'bg-[#F1F4F8] text-[#5B6573]',
    bgHover: 'hover:bg-[#F1F4F8]',
    dot: 'bg-[#5B6573]',
    emoji: '👤',
    lucideIcon: <Home className="w-4 h-4" />
  },
  その他: {
    badge: 'bg-[#F1F4F8] text-[#5B6573]',
    bgHover: 'hover:bg-[#F1F4F8]',
    dot: 'bg-[#8A94A6]',
    emoji: '👤',
    lucideIcon: <User className="w-4 h-4" />
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
  if (reaction.includes('怒')) return { text: 'text-[#C53030]', bg: 'bg-[#FDECEC]' };
  if (reaction.includes('冷たい')) return { text: 'text-[#C53030]', bg: 'bg-[#FDECEC]' };
  if (reaction.includes('嫌')) return { text: 'text-[#B7791F]', bg: 'bg-[#FFF7EA]' };
  if (reaction.includes('不満')) return { text: 'text-[#B7791F]', bg: 'bg-[#FFF7EA]' };
  if (reaction.includes('つまらな')) return { text: 'text-[#B7791F]', bg: 'bg-[#FFF7EA]' };
  if (reaction.includes('悲しそう')) return { text: 'text-[#0F4C81]', bg: 'bg-[#E8F1F8]' };
  if (reaction.includes('嬉しそう')) return { text: 'text-[#1F7A4D]', bg: 'bg-[#EAF6EF]' };
  if (reaction.includes('楽しそう')) return { text: 'text-[#1F7A4D]', bg: 'bg-[#EAF6EF]' };
  if (reaction.includes('分からない')) return { text: 'text-[#5B6573]', bg: 'bg-[#F1F4F8]' };
  return { text: 'text-[#5B6573]', bg: 'bg-[#F1F4F8]' };
};
