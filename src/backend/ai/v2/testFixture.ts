export function makeValidV2Result() {
  return {
    confidenceLevel: 'medium' as const,
    summary: { oneLine: '入力された情報だけでは、相手の感情を一つに決めることはできません。' },
    textImpression: { body: '短い返答ですが、怒りを直接示す表現は確認できません。' },
    situationReading: { body: '忙しさなど複数の説明があり、現時点では確認が必要です。' },
    emotionScoreAnalysis: {
      description: '入力された事実をもとにした相対的なスコアです。',
      scores: {
        anger: { label: '怒り気味' as const, score: 40, category: 'concern' as const, reason: '明確な怒りの言葉はない一方、返答が短いためです。' },
        coldness: { label: '冷たい' as const, score: 55, category: 'concern' as const, reason: '普段との比較はできませんが、返答が短いためです。' },
        distance: { label: '距離あり' as const, score: 45, category: 'concern' as const, reason: '会話を切り上げた可能性があるためです。' },
        busyness: { label: '忙しい' as const, score: 65, category: 'context' as const, reason: '返信に時間がかかっているためです。' },
        flatness: { label: '淡々' as const, score: 60, category: 'context' as const, reason: '返答に補足がなく短いためです。' },
        reassurance: { label: '大丈夫' as const, score: 35, category: 'relief' as const, reason: '拒絶や非難を示す明確な言葉はないためです。' },
      },
    },
    evidence: {
      signalsForConcern: [{ text: '返答が短い', source: 'current_case' as const, strength: 'medium' as const }],
      signalsAgainstConcern: [{ text: '拒絶の言葉はない', source: 'current_case' as const, strength: 'medium' as const }],
      unknowns: ['普段の返信速度は不明です'],
    },
    alternativeInterpretations: [{ label: '忙しかった', reason: '作業中で短い返答になった可能性があります。' }],
    cognitiveReframe: {
      possibleBiases: [{ label: '悪い方向への先読み', basis: '短い返答だけで怒りと結びつけています。' }],
      balancedView: '冷たく感じる要素はありますが、怒り以外の説明も残っています。',
    },
    recommendedActions: [{ label: '少し待つ', actionType: 'wait' as const, safety: 'safe' as const, reason: '追加情報を待てるためです。' }],
    avoidActions: [{ label: '感情を決めつける', reason: '確認できていないためです。' }],
    replyDrafts: [{ tone: 'normal' as const, text: '忙しいところごめんね。落ち着いたら確認してもらえると助かります。' }],
    contactTiming: '急ぎでなければ少し時間を置いてから連絡する案があります。',
    usualVsCurrent: {
      enabled: false, usualPatternsUsed: [], sameAsUsual: [], deviationSignals: [],
      comparisonConclusion: '普段の傾向を判断できる情報が不足しています。',
    },
    disclaimer: { notDiagnosis: true as const, text: 'この分析は診断や感情の断定ではなく、状況整理の参考情報です。' },
  };
}
