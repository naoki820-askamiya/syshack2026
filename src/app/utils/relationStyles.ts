import {
  BriefcaseBusiness,
  Gem,
  HandMetal,
  Handshake,
  Heart,
  Home,
  Rabbit,
  User,
  type LucideIcon,
} from 'lucide-react';

export type RelationStyle = {
  badge: string;
  bgHover: string;
  dot: string;
  emoji: string;
  lucideIcon?: LucideIcon;
};

export const RELATION_STYLES: Record<string, RelationStyle> = {
  上司: {
    badge: 'bg-[#EDF2F7] text-[#1F3A4D]',
    bgHover: 'hover:bg-[#E8EEF7]',
    dot: 'bg-[#1F3A4D]',
    emoji: '👤',
    lucideIcon: BriefcaseBusiness,
  },
  同僚: {
    badge: 'bg-[#E0EEFF] text-[#0F4C81]',
    bgHover: 'hover:bg-[#DCE8FA]',
    dot: 'bg-[#0F4C81]',
    emoji: '👤',
    lucideIcon: Handshake,
  },
  部下: {
    badge: 'bg-[#E0F7FF] text-[#086A86]',
    bgHover: 'hover:bg-[#D9F0FA]',
    dot: 'bg-[#086A86]',
    emoji: '👤',
    lucideIcon: Rabbit,
  },
  恋人: {
    badge: 'bg-[#FFE4E9] text-[#A71D30]',
    bgHover: 'hover:bg-[#FCE1E6]',
    dot: 'bg-[#A71D30]',
    emoji: '👤',
    lucideIcon: Heart,
  },
  配偶者: {
    badge: 'bg-[#FFF0D6] text-[#995800]',
    bgHover: 'hover:bg-[#F9ECD8]',
    dot: 'bg-[#995800]',
    emoji: '👤',
    lucideIcon: Gem,
  },
  友人: {
    badge: 'bg-[#E8F8E8] text-[#2A6D4F]',
    bgHover: 'hover:bg-[#E3F4E3]',
    dot: 'bg-[#2A6D4F]',
    emoji: '👤',
    lucideIcon: HandMetal,
  },
  家族: {
    badge: 'bg-[#FFE8E8] text-[#8B3A3A]',
    bgHover: 'hover:bg-[#FBE3E3]',
    dot: 'bg-[#8B3A3A]',
    emoji: '👤',
    lucideIcon: Home,
  },
  その他: {
    badge: 'bg-[#E8EBEE] text-[#4A5568]',
    bgHover: 'hover:bg-[#E2E6EB]',
    dot: 'bg-[#7F8A9F]',
    emoji: '👤',
    lucideIcon: User,
  },
};

export const getRelationStyle = (relation: string): RelationStyle =>
  RELATION_STYLES[relation] ?? RELATION_STYLES['その他'];

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
