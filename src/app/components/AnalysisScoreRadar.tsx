import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import type { AnalysisScoreView } from '../utils/analysisViewModel';

interface Props {
  scores: AnalysisScoreView[];
}

function ScoreTooltip({ active, payload }: {
  active?: boolean;
  payload?: { payload: AnalysisScoreView }[];
}) {
  const score = active ? payload?.[0]?.payload : undefined;
  if (!score) return null;
  return (
    <div className="max-w-64 rounded-lg border border-[#D9E1EA] bg-white px-3 py-2 text-sm shadow-md">
      <p className="font-medium text-[#1F2A37]">{score.label}：{score.score}/100</p>
      {score.reason && <p className="mt-1 text-xs text-[#5B6573]">{score.reason}</p>}
    </div>
  );
}

export function AnalysisScoreRadar({ scores }: Props) {
  return (
    <div className="w-full">
      <ResponsiveContainer width="100%" height={280}>
        <RadarChart data={scores} margin={{ top: 20, right: 30, bottom: 20, left: 30 }}>
          <PolarGrid stroke="#d9e1ea" />
          <PolarAngleAxis dataKey="label" tick={{ fontSize: 11, fill: '#5B6573' }} />
          <PolarRadiusAxis
            angle={90}
            domain={[0, 100]}
            tickCount={5}
            tick={{ fontSize: 9, fill: '#8a94a6' }}
            axisLine={false}
          />
          <Radar
            name="感情スコア"
            dataKey="score"
            stroke="#0f4c81"
            fill="#0f4c81"
            fillOpacity={0.22}
            strokeWidth={2}
            dot={{ fill: '#0f4c81', r: 3 }}
          />
          <Tooltip content={<ScoreTooltip />} />
        </RadarChart>
      </ResponsiveContainer>

      <p className="mb-3 text-center text-xs text-[#5B6573]">
        0〜100の相対スコアです。確率ではありません。
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {scores.map((item) => (
          <div key={item.key} className="rounded-lg bg-[#F7F9FC] p-2 text-center">
            <div className={`text-sm font-semibold ${item.category === 'reassurance' ? 'text-[#1F7A4D]' : 'text-[#0F4C81]'}`}>
              {item.score}/100
            </div>
            <div className="text-xs text-[#5B6573]">{item.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
