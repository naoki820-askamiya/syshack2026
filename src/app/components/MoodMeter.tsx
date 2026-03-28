import { MoodLevel, EmotionType, DangerLevel } from '../types';

interface MoodMeterProps {
  moodLevel: MoodLevel;
  emotionType: EmotionType;
  dangerLevel: DangerLevel;
}

export function MoodMeter({ moodLevel, emotionType, dangerLevel }: MoodMeterProps) {
  const getMoodEmoji = (mood: MoodLevel): string => {
    switch (mood) {
      case '良い': return '😊';
      case '普通': return '😐';
      case '悪い': return '😠';
    }
  };

  const getMoodColor = (mood: MoodLevel): string => {
    switch (mood) {
      case '良い': return 'bg-green-500';
      case '普通': return 'bg-yellow-500';
      case '悪い': return 'bg-red-500';
    }
  };

  const getDangerColor = (danger: DangerLevel): string => {
    switch (danger) {
      case '低': return 'bg-[#E8F1F8] text-[#0F4C81]';
      case '中': return 'bg-[#FFF7EA] text-[#B7791F]';
      case '高': return 'bg-[#FDECEC] text-[#C53030]';
    }
  };

  const getMoodPercentage = (mood: MoodLevel): number => {
    switch (mood) {
      case '良い': return 80;
      case '普通': return 50;
      case '悪い': return 20;
    }
  };

  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm border border-[#D9E1EA]">
      <h2 className="text-lg font-semibold mb-4">感情メーター</h2>
      
      {/* 機嫌メーター */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-[#5B6573]">機嫌レベル</span>
          <div className="flex items-center gap-2">
            <span className="text-2xl">{getMoodEmoji(moodLevel)}</span>
            <span className="font-semibold">{moodLevel}</span>
          </div>
        </div>
        <div className="w-full bg-[#F1F4F8] rounded-full h-3 overflow-hidden">
          <div
            className={`h-full ${getMoodColor(moodLevel)} transition-all duration-500`}
            style={{ width: `${getMoodPercentage(moodLevel)}%` }}
          />
        </div>
      </div>

      {/* 感情タイプ */}
      <div className="mb-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-[#5B6573]">感情タイプ</span>
          <span className="bg-[#E8F1F8] text-[#0F4C81] px-3 py-1 rounded-full text-sm font-medium">
            {emotionType}
          </span>
        </div>
      </div>

      {/* 危険度 */}
      <div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-[#5B6573]">危険度</span>
          <span className={`${getDangerColor(dangerLevel)} px-3 py-1 rounded-full text-sm font-medium`}>
            {dangerLevel}
          </span>
        </div>
      </div>
    </div>
  );
}
