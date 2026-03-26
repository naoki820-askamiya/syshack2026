import { ConsultationData, AnalysisResult, ActionSuggestion, MoodLevel, EmotionType, DangerLevel, AIAnalysisResult, EmotionScores } from '../types';

// 感情を分析してモックの結果を返す
export const analyzeEmotion = (consultation: ConsultationData): AnalysisResult => {
  // 相手の反応から機嫌レベルを判定
  const moodLevel: MoodLevel = getMoodLevel(consultation.reaction);
  
  // 相手の反応から感情タイプを判定
  const emotionType: EmotionType = getEmotionType(consultation.reaction);
  
  // 危険度を判定
  const dangerLevel: DangerLevel = getDangerLevel(consultation.reaction, consultation.timing);
  
  // 要約を生成
  const summary = generateSummary(consultation, moodLevel, emotionType);
  
  return {
    consultationId: consultation.id,
    moodLevel,
    emotionType,
    dangerLevel,
    summary,
  };
};

// 行動提案を生成
export const generateActionSuggestion = (
  consultation: ConsultationData,
  analysis: AnalysisResult
): ActionSuggestion => {
  const recommendedActions = getRecommendedActions(consultation, analysis);
  const suggestedMessages = getSuggestedMessages(consultation, analysis);
  const ngActions = getNGActions(consultation, analysis);
  
  return {
    consultationId: consultation.id,
    recommendedActions,
    suggestedMessages,
    ngActions,
  };
};

// ヘルパー関数
const getMoodLevel = (reaction: string): MoodLevel => {
  if (reaction.includes('怒') || reaction.includes('冷たい') || reaction.includes('嫌')) {
    return '悪い';
  }
  if (reaction.includes('不満') || reaction.includes('つまらな')) {
    return '悪い';
  }
  if (reaction.includes('嬉しそう') || reaction.includes('楽しそう')) {
    return '良い';
  }
  return '普通';
};

const getEmotionType = (reaction: string): EmotionType => {
  if (reaction.includes('怒')) return '怒り';
  if (reaction.includes('悲しそう')) return '悲しみ';
  if (reaction.includes('不満') || reaction.includes('つまらな')) return '不満';
  if (reaction.includes('冷たい') || reaction.includes('嫌')) return '失望';
  if (reaction.includes('分からない')) return '不安';
  return '不満';
};

const getDangerLevel = (reaction: string, timing: string): DangerLevel => {
  if (reaction.includes('怒') || reaction.includes('嫌')) {
    if (timing === '数日後') return '高';
    return '中';
  }
  if (reaction.includes('冷たい') || reaction.includes('不満')) {
    return '低';
  }
  return '低';
};

const generateSummary = (
  consultation: ConsultationData,
  moodLevel: MoodLevel,
  emotionType: EmotionType
): string => {
  return `${consultation.personName}さん（${consultation.relation}）は現在、${emotionType}の感情を抱いている可能性が高いです。機嫌レベルは「${moodLevel}」で、慎重な対応が必要です。`;
};

const getRecommendedActions = (
  consultation: ConsultationData,
  analysis: AnalysisResult
): string[] => {
  const actions: string[] = [];
  
  if (analysis.dangerLevel === '高') {
    actions.push('まずは冷静になる時間を置く');
    actions.push('直接会って謝罪する機会を作る');
  } else if (analysis.dangerLevel === '中') {
    actions.push('軽くフォローのメッセージを送る');
    actions.push('相手の気持ちを確認する');
  } else {
    actions.push('普段通りに接する');
    actions.push('様子を見ながら話しかける');
  }
  
  if (consultation.relation === '上司' || consultation.relation === '同僚' || consultation.relation === '部下') {
    actions.push('仕事での貢献で信頼を回復する');
  }
  
  if (
    consultation.relation === '恋人' ||
    consultation.relation === '配偶者' ||
    consultation.relation === '友人' ||
    consultation.relation === '家族'
  ) {
    actions.push('相手の立場に立って考える');
  }
  
  return actions.slice(0, 3);
};

const getSuggestedMessages = (
  consultation: ConsultationData,
  analysis: AnalysisResult
): string[] => {
  const messages: string[] = [];
  const isPrivate =
    consultation.relation === '恋人' ||
    consultation.relation === '配偶者' ||
    consultation.relation === '友人' ||
    consultation.relation === '家族';

  if (analysis.emotionType === '怒り') {
    if (isPrivate) {
      messages.push('さっきは言い方がきつくてごめん。ちゃんと話したいから、落ち着いたら連絡してほしい。');
      messages.push('怒らせてしまって本当にごめん。自分の言動を反省してる。話せる時に教えて。');
    } else {
      messages.push('先日は配慮が足りず申し訳ございませんでした。改めて対応させていただきたいと思います。');
      messages.push('ご迷惑をおかけして申し訳ございません。今後このようなことがないよう気をつけます。');
    }
  }
  
  if (analysis.emotionType === '悲しみ' || analysis.emotionType === '失望') {
    if (isPrivate) {
      messages.push('悲しませちゃってごめん。あなたのこと大切に思ってるから、ちゃんと話したい。');
      messages.push('傷つけるつもりはなかったんだ。ごめん。話を聞かせてほしい。');
    } else {
      messages.push('期待に応えられず申し訳ございませんでした。改善の機会をいただけますと幸いです。');
    }
  }
  
  if (analysis.emotionType === '不満') {
    if (isPrivate) {
      messages.push('最近どう？何か気になることあったら教えてね。');
      messages.push('もし何か不満があったら言ってほしい。ちゃんと聞くから。');
    } else {
      messages.push('何かご不便な点がございましたら、お気軽にお申し付けください。');
    }
  }
  
  return messages.slice(0, 3);
};

const getNGActions = (
  consultation: ConsultationData,
  analysis: AnalysisResult
): string[] => {
  const ngActions: string[] = [];
  
  if (analysis.dangerLevel === '高' || analysis.dangerLevel === '中') {
    ngActions.push('長文のメッセージを送る');
    ngActions.push('何度も連絡を取ろうとする');
    ngActions.push('言い訳をする');
  }
  
  if (analysis.emotionType === '怒り') {
    ngActions.push('すぐに反論する');
    ngActions.push('相手の気持ちを否定する');
  }
  
  if (consultation.timing === '直後') {
    ngActions.push('感情的に返信する');
  }
  
  ngActions.push('問題を無視する');
  ngActions.push('第三者を巻き込む');
  
  return Array.from(new Set(ngActions)).slice(0, 4);
};

// ══════════════════════════════════════════════════
//  AI 分析結果の生成（モック）
// ════���═════════════════════════════════════════════

/** 反応別のベーススコア */
const REACTION_BASE_SCORES: Record<string, EmotionScores> = {
  '怒っていそう': { angry: 0.78, cold: 0.55, busy: 0.28, pressure: 0.62, distance: 0.48, happy: 0.14, joy: 0.10, relief: 0.10 },
  '冷たい':       { angry: 0.32, cold: 0.82, busy: 0.42, pressure: 0.28, distance: 0.72, happy: 0.18, joy: 0.14, relief: 0.14 },
  '悲しそう':     { angry: 0.22, cold: 0.42, busy: 0.18, pressure: 0.18, distance: 0.58, happy: 0.24, joy: 0.18, relief: 0.20 },
  '不満そう':     { angry: 0.55, cold: 0.50, busy: 0.38, pressure: 0.46, distance: 0.44, happy: 0.22, joy: 0.18, relief: 0.18 },
  'つまらなそう': { angry: 0.18, cold: 0.52, busy: 0.48, pressure: 0.18, distance: 0.68, happy: 0.22, joy: 0.18, relief: 0.22 },
  '嫌そう':       { angry: 0.62, cold: 0.68, busy: 0.22, pressure: 0.42, distance: 0.72, happy: 0.12, joy: 0.08, relief: 0.08 },
  '嬉しそう':     { angry: 0.06, cold: 0.08, busy: 0.22, pressure: 0.08, distance: 0.14, happy: 0.82, joy: 0.78, relief: 0.68 },
  '楽しそう':     { angry: 0.05, cold: 0.06, busy: 0.24, pressure: 0.08, distance: 0.10, happy: 0.86, joy: 0.84, relief: 0.72 },
  '分からない':   { angry: 0.32, cold: 0.38, busy: 0.42, pressure: 0.28, distance: 0.44, happy: 0.32, joy: 0.28, relief: 0.28 },
  'その他':       { angry: 0.32, cold: 0.38, busy: 0.35, pressure: 0.28, distance: 0.40, happy: 0.32, joy: 0.28, relief: 0.28 },
};

const clamp = (v: number) => Math.min(1, Math.max(0, v));

/** IDからシード値を生成（再現性確保） */
const seedFromId = (id: string): number => {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 10000;
  return h / 10000;
};

const buildScores = (consultation: ConsultationData): EmotionScores => {
  const base = REACTION_BASE_SCORES[consultation.reaction] ?? REACTION_BASE_SCORES['その他'];
  const seed = seedFromId(consultation.id);

  // タイミング補正
  const timingMod = { '直後': 0.08, '数時間後': 0.04, '翌日': 0, '数日後': -0.06 };
  const tm = timingMod[consultation.timing] ?? 0;

  // 関係性補正（ビジネス系は pressure ↑）
  const bizRelations = ['上司', '同僚', '部下'];
  const pressureMod = bizRelations.includes(consultation.relation) ? 0.10 : -0.05;

  // シードに基づく微小ノイズ（±0.07）
  const n = (i: number) => ((seed * 17 + i * 13) % 1) * 0.14 - 0.07;

  return {
    angry:    clamp(base.angry    + tm * 0.5 + n(0)),
    cold:     clamp(base.cold     + tm * 0.3 + n(1)),
    busy:     clamp(base.busy     + n(2)),
    pressure: clamp(base.pressure + pressureMod * 0.5 + n(3)),
    distance: clamp(base.distance + (consultation.timing === '数日後' ? 0.10 : 0) + n(4)),
    happy:    clamp(base.happy    - tm * 0.3 + n(5)),
    joy:      clamp(base.joy      - tm * 0.3 + n(6)),
    relief:   clamp(base.relief   - tm * 0.2 + n(7)),
  };
};

const getTextImpression = (consultation: ConsultationData, scores: EmotionScores): string => {
  const r = consultation.reaction;
  if (r === '怒っていそう') return '文面からは強い感情的な緊張感が読み取れます。言葉の選び方や短さに怒りのサインが見られます。';
  if (r === '冷たい') return '返答は形式的であり、感情的な温かみが感じられません。距離を置きたいサインの可能性があります。';
  if (r === '悲しそう') return '文面は落ち着いていますが、傷ついた気持ちが言葉の端々に見え隠れしています。';
  if (r === '不満そう') return 'はっきりとした拒絶ではないものの、不満や納得のいかない様子が文面に漂っています。';
  if (r === 'つまらなそう') return '返答はありますが、積極的な関与が見られず、関心の薄さが感じられます。';
  if (r === '嫌そう') return '明確な拒否ではないものの、前向きでない感情が文面から読み取れます。';
  if (r === '嬉しそう') return '文面は全体的にポジティブで、嬉しさや喜���が伝わってきます。';
  if (r === '楽しそう') return '活き活きとした表現が多く、相手がこの状況を楽しんでいることが文面から伝わります。';
  if (r === '分からない') return '文面は中立的であり、感情的なシグナルが読み取りにくい状態です。';
  return '文面からは複合的な感情の動きが見られます。単一の感情では説明しきれない反応の可能性があります。';
};

const getContextImpression = (consultation: ConsultationData): string => {
  const rel = consultation.relation;
  const timing = consultation.timing;
  const isPrivate = ['恋人', '配偶者', '友人', '家族'].includes(rel);
  const isBiz = ['上司', '同僚', '部下'].includes(rel);

  if (isBiz && timing === '直後') return `職場の${rel}という関係性から、直後の感情表現は抑制されている可能性があります。ビジネス上の立場がこの反応に影響しているかもしれません。`;
  if (isBiz && timing === '数日後') return `時間が経過しても解消されていない場合、${rel}との信頼関係に影響が及んでいる可能性があります。早めの誠実な対応が重要です。`;
  if (isPrivate && timing === '直後') return `親しい${rel}との関係だからこそ、直後の感情はより率直に表れやすいです。相手の気持ちに寄り添ったアプローチが有効です。`;
  if (isPrivate && timing === '数日後') return `${rel}との間で時間が経過している状況は、感情的な距離が広がっているサインの可能性があります。丁寧なアプローチで溝を縮める必要があります。`;
  if (timing === '翌日') return '一晩置いた状況での反応のため、初期の感情的な反応から少し落ち着いた状態である可能性があります。';
  return `${rel}という立場と現在の状況を踏まえると、相手なりの事情や感情的な背景がこの反応に影響している可能性があります。`;
};

const getConfidenceLevel = (consultation: ConsultationData): 'low' | 'medium' | 'high' => {
  if (consultation.reaction === '分からない') return 'low';
  if (['怒っていそう', '嬉しそう', '楽しそう', '嫌そう'].includes(consultation.reaction)) return 'high';
  return 'medium';
};

const getContactTiming = (scores: EmotionScores, timing: string): string => {
  if (scores.angry > 0.6) return '少なくとも数時間〜翌日は間を置いてから連絡することをおすすめします。感情が落ち着いた頃に短く誠実に伝えるのが効果的です。';
  if (scores.cold > 0.7 || scores.distance > 0.65) return '無理に連絡を急がず、相手のペースを尊重しましょう。必要最低限の連絡にとどめ、様子を見ることが大切です。';
  if (scores.happy > 0.7 || scores.joy > 0.7) return '今がコミュニケーションのよいタイミングです。相手が前向きな状態のうちに、気持ちを伝えるとよいでしょう。';
  if (timing === '数日後') return '既に時間が経過しています。これ以上引き延ばすより、誠実な言葉で早めに連絡する方がよい可能性があります。';
  return '急ぎでなければ少し時間を置いてから、要点だけを短く伝える方が効果的です。相手の状況を考慮した上でタイミングを見計らいましょう。';
};

const getActions = (consultation: ConsultationData, scores: EmotionScores): { text: string }[] => {
  const actions: { text: string }[] = [];
  const isBiz = ['上司', '同僚', '部下'].includes(consultation.relation);

  if (scores.angry > 0.55) {
    actions.push({ text: 'まず冷静な時間を置いてから連絡する' });
    actions.push({ text: isBiz ? '直接会って誠実に謝罪の機会を作る' : '相手の気持ちを先に受け止め、言い訳をしない' });
  } else if (scores.cold > 0.65 || scores.distance > 0.60) {
    actions.push({ text: '無理に距離を縮めようとせず、相手のペースを尊重する' });
    actions.push({ text: '短く誠実なメッセージで存在を示す' });
  } else if (scores.happy > 0.65 || scores.joy > 0.65) {
    actions.push({ text: 'このポジティブな雰囲気を活かして関係をさらに深める' });
    actions.push({ text: '感謝や喜びを素直に言葉で伝える' });
  } else {
    actions.push({ text: '普段通りの自然な接し方を心がける' });
    actions.push({ text: '相手の様子を観察しながら適切なタイミングで話しかける' });
  }

  if (isBiz) actions.push({ text: '仕事上の貢献や丁寧な対応で信頼を積み重ねる' });
  else actions.push({ text: '相手の立場に立って感情に共感する姿勢を見せる' });

  return actions.slice(0, 3);
};

const getAvoidExpressions = (scores: EmotionScores): { text: string }[] => {
  const list: { text: string }[] = [];
  if (scores.angry > 0.5) {
    list.push({ text: '「なんで怒ってるの？」など直接感情を問い詰める表現' });
    list.push({ text: '言い訳や自己弁護を並べ立てる内容' });
  }
  if (scores.cold > 0.6 || scores.distance > 0.6) {
    list.push({ text: '「無視しないで」などプレッシャーを与える表現' });
    list.push({ text: '何度も連続してメッセージを送ること' });
  }
  if (scores.pressure > 0.5) {
    list.push({ text: '返答を急かす・期限を一方的に設ける表現' });
  }
  list.push({ text: '感情的になった状態でのメッセージ送信' });
  list.push({ text: '第三者を巻き込んだり、SNSで間接的に伝えること' });
  return list.slice(0, 3);
};

const getGoodSignals = (consultation: ConsultationData, scores: EmotionScores): { text: string }[] => {
  const list: { text: string }[] = [];
  if (scores.angry < 0.7) list.push({ text: '強い拒絶や絶縁を示す言葉は見られない' });
  if (scores.distance < 0.8) list.push({ text: '完全に連絡を断っているわけではない' });
  if (scores.happy > 0.3 || scores.relief > 0.3) list.push({ text: '部分的にポジティブな反応も含まれている' });
  if (consultation.timing === '直後') list.push({ text: '出来事の直後であり、時間経過で落ち着く可能性がある' });
  if (consultation.timing === '翌日' || consultation.timing === '数時間後') {
    list.push({ text: 'まだ関係修復の余地が十分にある段階' });
  }
  list.push({ text: '相手が状況を把握していることは確認できている' });
  return list.slice(0, 3);
};

const getReplyExamples = (consultation: ConsultationData, scores: EmotionScores): { text: string; tone: 'formal' | 'neutral' | 'casual' }[] => {
  const isBiz = ['上司', '同僚', '部下'].includes(consultation.relation);
  const isClose = ['恋人', '配偶者', '友人'].includes(consultation.relation);
  const name = consultation.personName;

  if (scores.angry > 0.55 || scores.cold > 0.65) {
    if (isBiz) return [
      { text: `先日はご迷惑をおかけし、大変申し訳ございませんでした。改めてきちんとご説明できればと思います。`, tone: 'formal' },
      { text: `ご不快をおかけしてしまい、すみませんでした。もしよろしければ、一度お時間をいただけますか。`, tone: 'neutral' },
    ];
    if (isClose) return [
      { text: `${name}さん、さっきはごめん。もう少し落ち着いたら話せたらうれしいな。`, tone: 'casual' },
      { text: `怒らせてしまってごめんなさい。話を聞いてほしいことがあります。`, tone: 'neutral' },
    ];
    return [
      { text: `先日のことはこちらの配慮が足りませんでした。申し訳ございません。`, tone: 'formal' },
      { text: `ごめんなさい。ちゃんと話したいので、時間があるときに連絡してもらえると助かります。`, tone: 'neutral' },
    ];
  }

  if (scores.happy > 0.65 || scores.joy > 0.65) {
    if (isBiz) return [
      { text: `いつも前向きに対応いただき、ありがとうございます。引き続きよろしくお願いいたします。`, tone: 'formal' },
      { text: `今日も楽しく話せてよかったです。また気軽に話しかけてください！`, tone: 'neutral' },
    ];
    return [
      { text: `今日すごく楽しかった！また一緒に話しよう。`, tone: 'casual' },
      { text: `こちらこそ、いつもありがとう。また会えるの楽しみにしてます。`, tone: 'neutral' },
    ];
  }

  // Default neutral
  if (isBiz) return [
    { text: `お忙しいところ恐れ入ります。ご確認いただければ幸いです。`, tone: 'formal' },
    { text: `先ほどの件、何かご不明な点があればお気軽にお声がけください。`, tone: 'neutral' },
  ];
  return [
    { text: `最近どうかな？何か気になることがあれば話してね。`, tone: 'casual' },
    { text: `少し前のこと、気になっていました。よかったら聞かせてもらえますか。`, tone: 'neutral' },
  ];
};

const getReasons = (consultation: ConsultationData, scores: EmotionScores): { label: string; detail: string }[] => {
  const reasons: { label: string; detail: string }[] = [];
  const topScore = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  const labelMap: Record<string, string> = {
    angry: '怒りの感情', cold: '冷たさ・距離感', busy: '余裕のなさ',
    pressure: '圧の強さ', distance: '引いている感じ',
    happy: '前向きな姿勢', joy: '喜びの感情', relief: '安心感',
  };

  reasons.push({
    label: `主要因：${labelMap[topScore[0]] ?? topScore[0]}`,
    detail: `今回の状況で最も強く読み取れるのは「${labelMap[topScore[0]] ?? topScore[0]}」です（スコア: ${Math.round(topScore[1] * 100)}%）。この感情が相手の反応に最も影響していると考えられます。`,
  });

  if (consultation.timing === '数日後') {
    reasons.push({ label: '時間の経過', detail: '出来事から数日経過しており、初期の感情的な反応が継続している場合、より深刻な感情的影響が生じている可能性があります。' });
  } else if (consultation.timing === '直後') {
    reasons.push({ label: '直後の反応', detail: '出来事の直後であるため、感情がまだ整理されていない状態の反応と考えられます。時間の経過とともに落ち着く可能性があります。' });
  }

  const isBiz = ['上司', '同僚', '部下'].includes(consultation.relation);
  reasons.push({
    label: isBiz ? '職場の関係性' : 'プライベートな関係性',
    detail: isBiz
      ? `${consultation.relation}という職場の関係性は、感情表現を抑制させる傾向があります。表面的な反応だけでなく、その背後にある本音を意識する必要があります。`
      : `${consultation.relation}という親しい関係だからこそ、感情がより率直に反応に表れている可能性があります。`,
  });

  return reasons;
};

// AI分析結果の生成（モック）
export const generateAIAnalysis = (consultation: ConsultationData): AIAnalysisResult => {
  const scores = buildScores(consultation);
  return {
    consultationId: consultation.id,
    textImpression: getTextImpression(consultation, scores),
    contextImpression: getContextImpression(consultation),
    scores,
    confidenceLevel: getConfidenceLevel(consultation),
    contactTiming: getContactTiming(scores, consultation.timing),
    actions: getActions(consultation, scores),
    avoidExpressions: getAvoidExpressions(scores),
    goodSignals: getGoodSignals(consultation, scores),
    replyExamples: getReplyExamples(consultation, scores),
    reasons: getReasons(consultation, scores),
  };
};