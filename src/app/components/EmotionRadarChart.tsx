import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import { EmotionScores } from '../types';

const SCORE_META: { key: keyof EmotionScores; label: string; isPositive: boolean }[] = [
  { key: 'angry',    label: '怒り',    isPositive: false },
  { key: 'cold',     label: '冷たさ',  isPositive: false },
  { key: 'busy',     label: '忙しさ',  isPositive: false },
  { key: 'pressure', label: '圧の強さ', isPositive: false },
  { key: 'distance', label: '距離感',  isPositive: false },
  { key: 'happy',    label: '機嫌のよさ', isPositive: true },
  { key: 'joy',      label: '嬉しさ',  isPositive: true },
  { key: 'relief',   label: '安心',    isPositive: true },
];

interface Props {
  scores: EmotionScores;
}

// カスタムツールチップ
const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: { payload: { subject: string; value: number } }[] }) => {
  if (active && payload && payload.length) {
    const d = payload[0].payload;
    return (
      <div className="bg-white border border-gray-200 rounded-lg px-3 py-2 shadow-md text-sm">
        <p className="font-medium text-gray-800">{d.subject}</p>
        <p className="text-purple-600">{d.value}%</p>
      </div>
    );
  }
  return null;
};

// カスタム軸ラベル
const CustomTick = ({
  x, y, payload, cx, cy,
}: {
  x: number; y: number; payload: { value: string }; cx: number; cy: number;
}) => {
  const isPositive = SCORE_META.find(m => m.label === payload.value)?.isPositive;
  const dx = x - cx;
  const dy = y - cy;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const padX = (dx / dist) * 14;
  const padY = (dy / dist) * 14;

  return (
    <text
      x={x + padX}
      y={y + padY}
      textAnchor="middle"
      dominantBaseline="central"
      fontSize={11}
      fill={isPositive ? '#16a34a' : '#dc2626'}
      fontWeight={500}
    >
      {payload.value}
    </text>
  );
};

export function EmotionRadarChart({ scores }: Props) {
  const data = SCORE_META.map(({ key, label }) => ({
    subject: label,
    value: Math.round(scores[key] * 100),
    fullMark: 100,
  }));

  // ポジティブ系が高いかネガティブ系が高いかで色を変える
  const positiveAvg = (scores.happy + scores.joy + scores.relief) / 3;
  const negativeAvg = (scores.angry + scores.cold + scores.pressure + scores.distance) / 4;
  const isPositiveOverall = positiveAvg > negativeAvg;

  const strokeColor = isPositiveOverall ? '#16a34a' : '#a855f7';
  const fillColor = isPositiveOverall ? '#16a34a' : '#a855f7';

  return (
    <div className="w-full">
      <ResponsiveContainer width="100%" height={280}>
        <RadarChart data={data} margin={{ top: 20, right: 30, bottom: 20, left: 30 }}>
          <PolarGrid stroke="#e5e7eb" />
          <PolarAngleAxis
            dataKey="subject"
            tick={(props) => <CustomTick {...props} />}
          />
          <PolarRadiusAxis
            angle={90}
            domain={[0, 100]}
            tickCount={4}
            tick={{ fontSize: 9, fill: '#9ca3af' }}
            axisLine={false}
          />
          <Radar
            name="感情スコア"
            dataKey="value"
            stroke={strokeColor}
            fill={fillColor}
            fillOpacity={0.25}
            strokeWidth={2}
            dot={{ fill: strokeColor, r: 3 }}
          />
          <Tooltip content={<CustomTooltip />} />
        </RadarChart>
      </ResponsiveContainer>

      {/* スコア一覧 */}
      <div className="grid grid-cols-4 gap-1.5 mt-2 px-1">
        {SCORE_META.map(({ key, label, isPositive }) => {
          const pct = Math.round(scores[key] * 100);
          return (
            <div key={key} className="text-center">
              <div
                className={`text-xs font-semibold ${isPositive ? 'text-green-600' : 'text-purple-700'}`}
              >
                {pct}%
              </div>
              <div className="text-[10px] text-gray-400 leading-tight">{label}</div>
              <div className="mt-0.5 h-1 rounded-full bg-gray-100 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${isPositive ? 'bg-green-500' : 'bg-purple-500'}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
