import { useState, useRef, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { ArrowLeft, Send, MessageSquare, PenLine, X, ChevronDown, AlertCircle, UserCheck } from 'lucide-react';
import { ConsultationData, RelationType, Reaction, Timing } from '../types';
import { createPerson, createAnalysisCase, analyze } from '../api/session';
import { saveConsultation, getConsultations } from '../utils/storage';
import { getRelationStyle } from '../utils/relationStyles';
import { Navigation } from '../components/Navigation';

type ChatMessage = { sender: '自分' | '相手'; text: string };
type ActionMode = 'text' | 'chat';
type ChatPlatform = 'LINE' | 'other';

const BUSINESS_RELATIONS: RelationType[] = ['上司', '同僚', '部下'];
const PRIVATE_RELATIONS: RelationType[] = ['恋人', '配偶者', '友人', '家族', 'その他'];
const REACTIONS: Reaction[] = [
  '怒っていそう', '冷たい', '悲しそう', '不満そう',
  'つまらなそう', '嫌そう', '嬉しそう', '楽しそう', '分からない', 'その他',
];

const REACTION_EMOJI: Record<Reaction, string> = {
  '怒っていそう': '😡',
  '冷たい':       '🥶',
  '悲しそう':     '😢',
  '不満そう':     '😤',
  'つまらなそう': '😑',
  '嫌そう':       '😒',
  '嬉しそう':     '😊',
  '楽しそう':     '😄',
  '分からない':   '🤷',
  'その他':       '✏️',
};

const EMPTY_FORM = {
  personName: '',
  relation: '上司' as RelationType,
  relationOther: '',
  event: '',
  reaction: '怒っていそう' as Reaction,
  reactionOther: '',
  timing: '直後' as Timing,
  userAction: '',
  ageGroup: '20代',
  gender: '回答しない',
};

/** personName ごとに最新の相談1件を返す */
function getLatestByName(name: string): ConsultationData | undefined {
  return getConsultations()
    .filter(c => c.personName === name)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
}

/** 名前ごとに最新1件にまとめた候補一覧 */
function getPersonCandidates(): ConsultationData[] {
  const map = new Map<string, ConsultationData>();
  [...getConsultations()]
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .forEach(c => map.set(c.personName, c));
  return Array.from(map.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export function NewConsultation() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const chatEndRef = useRef<HTMLDivElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // ── URL パラメータ ?person=xxx から初期値を解決 ──
  const resolveInitialData = () => {
    const nameParam = searchParams.get('person');
    if (nameParam) {
      const past = getLatestByName(nameParam);
      if (past) {
        return {
          ...EMPTY_FORM,
          personName: past.personName,
          relation: past.relation as RelationType,
          ageGroup: past.ageGroup ?? EMPTY_FORM.ageGroup,
          gender: past.gender ?? EMPTY_FORM.gender,
        };
      }
      return { ...EMPTY_FORM, personName: nameParam };
    }
    return { ...EMPTY_FORM };
  };

  const [formData, setFormData] = useState(resolveInitialData);
  const [prefilled, setPrefilled] = useState(() => {
    const name = searchParams.get('person');
    return !!name && !!getLatestByName(name);
  });

  // チャット関連
  const [actionMode, setActionMode] = useState<ActionMode>('text');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatSender, setChatSender] = useState<'自分' | '相手'>('自分');
  const [chatPlatform, setChatPlatform] = useState<ChatPlatform>('LINE');
  const [otherChatText, setOtherChatText] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [apiError, setApiError] = useState("");

  // オートコンプリート
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState<ConsultationData[]>([]);

  const timings: Timing[] = ['直後', '数時間後', '翌日', '数日後'];
  const ageGroups = ['10代', '20代', '30代', '40代', '50代', '60代以上'];
  const genders = ['男性', '女性', 'その他', '回答しない'];

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // ニックネーム変更 → オートコンプリート候補更新
  const handleNameChange = (value: string) => {
    setFormData(prev => ({ ...prev, personName: value }));
    setPrefilled(false);
    if (value.trim().length > 0) {
      const matched = getPersonCandidates().filter(c =>
        c.personName.toLowerCase().includes(value.toLowerCase())
      );
      setSuggestions(matched);
      setShowSuggestions(matched.length > 0);
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  };

  // 候補選択 → 自動入力
  const applyPerson = (person: ConsultationData) => {
    setFormData(prev => ({
      ...prev,
      personName: person.personName,
      relation: person.relation as RelationType,
      ageGroup: person.ageGroup ?? prev.ageGroup,
      gender: person.gender ?? prev.gender,
    }));
    setPrefilled(true);
    setShowSuggestions(false);
    setSuggestions([]);
  };

  const addChatMessage = () => {
    if (!chatInput.trim()) return;
    setChatMessages(prev => [...prev, { sender: chatSender, text: chatInput.trim() }]);
    setChatInput('');
    setChatSender(prev => prev === '自分' ? '相手' : '自分');
  };

  const removeChatMessage = (index: number) => {
    setChatMessages(prev => prev.filter((_, i) => i !== index));
  };

  const getChatSummary = () =>
    chatMessages.map(m => `${m.sender}: ${m.text}`).join('\n');

  const getErrors = () => ({
    personName: !formData.personName.trim(),
    event: !formData.event.trim(),
    relationOther: formData.relation === 'その他' && !formData.relationOther.trim(),
    reactionOther: formData.reaction === 'その他' && !formData.reactionOther.trim(),
    userAction: actionMode === 'text' && !formData.userAction.trim(),
    chatContent:
      actionMode === 'chat' &&
      (chatPlatform === 'LINE' ? chatMessages.length === 0 : !otherChatText.trim()),
  });

// フォーム送信・画面遷移
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    setApiError("");
    const errors = getErrors();
    if (Object.values(errors).some(Boolean)) return;

    const effectiveRelation = (formData.relation === 'その他' && formData.relationOther.trim()
      ? formData.relationOther.trim()
      : formData.relation) as RelationType;

    const effectiveReaction = (formData.reaction === 'その他' && formData.reactionOther.trim()
      ? formData.reactionOther.trim()
      : formData.reaction) as Reaction;

    const effectiveUserAction = actionMode === 'chat'
      ? (chatPlatform === 'LINE' ? getChatSummary() : otherChatText)
      : formData.userAction;

    // --- ここからAPI連携の実装 ---
    setIsAnalyzing(true);
    
    try {
      // 1. 相手（Person）の作成+API呼び出し+保存
      const personRes = await createPerson({
        displayName: formData.personName,
        relationshipType: effectiveRelation,
        ageRange: formData.ageGroup,
        genderHint: formData.gender,
      });
      const personId = personRes.person.id;

      // 2. 相談ケース（AnalysisCase）の作成+API呼び出し+保存
      const caseRes = await createAnalysisCase({
        personId,
        eventFacts: formData.event,
        selfMessage: effectiveUserAction,
        partnerMessage: effectiveReaction, // APIの必須項目に合わせてマッピング
        assumedPartnerEmotion: effectiveReaction,
      });
      const caseId = caseRes.analysisCase.id;

      // ローカルに相談内容を保存
      const consultation: ConsultationData = {
        id: caseId,
        personName: formData.personName,
        relation: effectiveRelation,
        event: formData.event,
        reaction: effectiveReaction,
        userAction: effectiveUserAction,
        timing: formData.timing,
        createdAt: new Date().toISOString(),
        ageGroup: formData.ageGroup,
        gender: formData.gender,
      };
      saveConsultation(consultation);

      // 3. 分析の実行 (分析終了まで待機)
      await analyze(caseId);

      // 4. 結果画面へ遷移
      navigate(`/analysis/${caseId}`);

    } catch (err: any) {
      console.error(err);
      setApiError(err.message || "サーバーとの通信に失敗しました。時間をおいて再試行してください。");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const errors = submitted ? getErrors() : {} as ReturnType<typeof getErrors>;

  const inputClass = (hasError?: boolean) =>
    `w-full px-4 py-3 rounded-lg border-2 focus:ring-2 focus:border-transparent outline-none transition ${
      hasError
        ? 'border-red-400 bg-red-50 focus:ring-red-300'
        : 'border-gray-300 bg-white focus:ring-purple-500'
    }`;

  const selectedBtn = 'border-purple-500 bg-purple-50 text-purple-700 font-medium';
  const unselectedBtn = 'border-gray-200 bg-white text-gray-700 hover:border-gray-300';

  const RelationButton = ({ relation }: { relation: RelationType }) => (
    <button
      type="button"
      onClick={() => setFormData({ ...formData, relation, relationOther: '' })}
      className={`py-2.5 px-3 rounded-lg border-2 transition-colors text-sm ${
        formData.relation === relation ? selectedBtn : unselectedBtn
      }`}
    >
      {relation}
    </button>
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-pink-50 to-purple-50">
      <Navigation />

      <div className="lg:ml-64 pb-24 lg:pb-8">
        {/* ヘッダー */}
        <div className="bg-white border-b border-gray-200 p-4 lg:px-8 sticky top-0 z-10">
          <div className="max-w-4xl mx-auto flex items-center gap-3">
            <button onClick={() => navigate('/')} className="text-gray-600 hover:text-gray-800">
              <ArrowLeft className="w-6 h-6" />
            </button>
            <h1 className="text-xl lg:text-2xl font-semibold">状況を入力</h1>
          </div>
        </div>

        <div className="max-w-4xl mx-auto p-4 lg:p-8">
          {/* 自動入力バナー */}
          {prefilled && (
            <div className="mb-6 flex items-center gap-2 bg-purple-50 border border-purple-200 text-purple-700 rounded-lg px-4 py-3 text-sm">
              <UserCheck className="w-4 h-4 flex-shrink-0" />
              <span>
                過去の相談から <strong>{formData.personName}</strong> さんの情報を自動で入力しました。内容を確認してください。
              </span>
            </div>
          )}

          {/* 未入力エラーバナー */}
          {submitted && Object.values(errors).some(Boolean) && (
            <div className="mb-6 flex items-center gap-2 bg-red-50 border border-red-300 text-red-700 rounded-lg px-4 py-3 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>入力されていない必須項目があります。赤くなっている欄を確認してください。</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6 lg:space-y-8" noValidate>
            <div className="lg:grid lg:grid-cols-2 lg:gap-8 space-y-6 lg:space-y-0">

              {/* ── 左カラム ── */}
              <div className="space-y-6">

                {/* ① ニックネーム */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    ニックネーム<span className="text-red-500 ml-0.5">*</span>
                  </label>
                  <p className="text-xs text-gray-400 mb-2">本名は入力しないでください</p>
                  <div className="relative">
                    <input
                      ref={nameInputRef}
                      type="text"
                      value={formData.personName}
                      onChange={(e) => handleNameChange(e.target.value)}
                      onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                      onFocus={() => {
                        if (suggestions.length > 0) setShowSuggestions(true);
                      }}
                      className={inputClass(errors.personName)}
                      placeholder="例：田中さん、彼女、友人A"
                    />
                    {/* オートコンプリートドロップダウン */}
                    {showSuggestions && (
                      <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-20 overflow-hidden">
                        <p className="px-3 pt-2 pb-1 text-[10px] text-gray-400 font-semibold uppercase tracking-wide">
                          過去の相談相手
                        </p>
                        {suggestions.map((person) => {
                          const style = getRelationStyle(person.relation);
                          return (
                            <button
                              key={person.id}
                              type="button"
                              onMouseDown={() => applyPerson(person)}
                              className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-purple-50 transition-colors text-left"
                            >
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm flex-shrink-0 ${style.badge}`}>
                                {style.emoji}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-800">{person.personName}</p>
                                <p className="text-xs text-gray-400">
                                  {person.relation}{person.ageGroup ? ` · ${person.ageGroup}` : ''}{person.gender ? ` · ${person.gender}` : ''}
                                </p>
                              </div>
                              <span className="text-xs text-purple-500 flex-shrink-0">自動入力</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  {errors.personName && (
                    <p className="mt-1 text-xs text-red-500 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />入力してください
                    </p>
                  )}
                </div>

                {/* ② 年代・性別 */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      あなたの年代<span className="text-red-500 ml-0.5">*</span>
                    </label>
                    <div className="relative">
                      <select
                        value={formData.ageGroup}
                        onChange={(e) => setFormData({ ...formData, ageGroup: e.target.value })}
                        className={`${inputClass()} appearance-none pr-10 cursor-pointer`}
                      >
                        {ageGroups.map((age) => (
                          <option key={age} value={age}>{age}</option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      あなたの性別<span className="text-red-500 ml-0.5">*</span>
                    </label>
                    <div className="relative">
                      <select
                        value={formData.gender}
                        onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                        className={`${inputClass()} appearance-none pr-10 cursor-pointer`}
                      >
                        {genders.map((g) => (
                          <option key={g} value={g}>{g}</option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                    </div>
                  </div>
                </div>

                {/* ③ 相手との関係 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    相手との関係<span className="text-red-500 ml-0.5">*</span>
                  </label>
                  <div className="mb-2">
                    <p className="text-xs text-gray-400 mb-1.5 flex items-center gap-1">
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                      ビジネス
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                      {BUSINESS_RELATIONS.map((relation) => (
                        <RelationButton key={relation} relation={relation} />
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 mb-1.5 flex items-center gap-1">
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-pink-400"></span>
                      プライベート
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                      {PRIVATE_RELATIONS.map((relation) => (
                        <RelationButton key={relation} relation={relation} />
                      ))}
                    </div>
                  </div>
                  {formData.relation === 'その他' && (
                    <div className="mt-3">
                      <input
                        type="text"
                        value={formData.relationOther}
                        onChange={(e) => setFormData({ ...formData, relationOther: e.target.value })}
                        className={inputClass(errors.relationOther)}
                        placeholder="関係性を入力してください（例：先輩、クライアント）"
                      />
                      {errors.relationOther && (
                        <p className="mt-1 text-xs text-red-500 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" />関係性を入力してください
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {/* ④ 起きた出来事 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    起きた出来事<span className="text-red-500 ml-0.5">*</span>
                  </label>
                  <textarea
                    value={formData.event}
                    onChange={(e) => setFormData({ ...formData, event: e.target.value })}
                    className={inputClass(errors.event)}
                    placeholder="例：約束の時間に遅刻してしまった"
                    rows={4}
                  />
                  {errors.event && (
                    <p className="mt-1 text-xs text-red-500 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />入力してください
                    </p>
                  )}
                </div>
              </div>

              {/* ── 右カラム ── */}
              <div className="space-y-6">

                {/* ⑤ 相手の反応 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    相手の反応<span className="text-red-500 ml-0.5">*</span>
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {REACTIONS.map((reaction) => (
                      <button
                        key={reaction}
                        type="button"
                        onClick={() => setFormData({ ...formData, reaction, reactionOther: '' })}
                        className={`py-2.5 px-2 rounded-lg border-2 transition-colors text-sm flex flex-col items-center gap-1 ${
                          formData.reaction === reaction ? selectedBtn : unselectedBtn
                        }`}
                      >
                        <span className="text-lg leading-none">{REACTION_EMOJI[reaction]}</span>
                        <span className="leading-tight text-center">{reaction}</span>
                      </button>
                    ))}
                  </div>
                  {formData.reaction === 'その他' && (
                    <div className="mt-3">
                      <input
                        type="text"
                        value={formData.reactionOther}
                        onChange={(e) => setFormData({ ...formData, reactionOther: e.target.value })}
                        className={inputClass(errors.reactionOther)}
                        placeholder="相手の反応を入力してください（例：急に無口になった）"
                      />
                      {errors.reactionOther && (
                        <p className="mt-1 text-xs text-red-500 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" />反応を入力してください
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {/* ⑥ 出来事からの経過時間 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    出来事からの経過時間<span className="text-red-500 ml-0.5">*</span>
                  </label>
                  <div className="grid grid-cols-4 lg:grid-cols-2 gap-2">
                    {timings.map((timing) => (
                      <button
                        key={timing}
                        type="button"
                        onClick={() => setFormData({ ...formData, timing })}
                        className={`py-3 px-2 rounded-lg border-2 transition-colors text-sm ${
                          formData.timing === timing ? selectedBtn : unselectedBtn
                        }`}
                      >
                        {timing}
                      </button>
                    ))}
                  </div>
                </div>

                {/* ⑦ 自分の行動 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    自分の行動（その後どうしたか）<span className="text-red-500 ml-0.5">*</span>
                  </label>

                  {/* 入力モード切替 */}
                  <div className="flex gap-2 mb-3">
                    <button
                      type="button"
                      onClick={() => setActionMode('text')}
                      className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border-2 text-sm transition-colors ${
                        actionMode === 'text' ? selectedBtn : unselectedBtn
                      }`}
                    >
                      <PenLine className="w-4 h-4" />
                      行動を入力
                    </button>
                    <button
                      type="button"
                      onClick={() => setActionMode('chat')}
                      className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border-2 text-sm transition-colors ${
                        actionMode === 'chat' ? selectedBtn : unselectedBtn
                      }`}
                    >
                      <MessageSquare className="w-4 h-4" />
                      会話を入力
                    </button>
                  </div>

                  {/* テキスト入力モード */}
                  {actionMode === 'text' && (
                    <>
                      <textarea
                        value={formData.userAction}
                        onChange={(e) => setFormData({ ...formData, userAction: e.target.value })}
                        className={inputClass(errors.userAction)}
                        placeholder="例：謝ったが返事がなかった"
                        rows={4}
                      />
                      {errors.userAction && (
                        <p className="mt-1 text-xs text-red-500 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" />入力してください
                        </p>
                      )}
                    </>
                  )}

                  {/* チャット形式モード */}
                  {actionMode === 'chat' && (
                    <div className="space-y-3">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setChatPlatform('LINE')}
                          className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg border-2 text-sm transition-colors ${
                            chatPlatform === 'LINE' ? selectedBtn : unselectedBtn
                          }`}
                        >
                          対話形式 (LINEなど)
                        </button>
                        <button
                          type="button"
                          onClick={() => setChatPlatform('other')}
                          className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg border-2 text-sm transition-colors ${
                            chatPlatform === 'other' ? selectedBtn : unselectedBtn
                          }`}
                        >
                          スレッド形式（Discord等）
                        </button>
                      </div>

                      {chatPlatform === 'LINE' && (
                        <div className={`border-2 rounded-lg overflow-hidden bg-gray-50 ${
                          errors.chatContent ? 'border-red-400' : 'border-gray-200'
                        }`}>
                          <div className="h-48 overflow-y-auto p-3 space-y-2">
                            {chatMessages.length === 0 ? (
                              <div className="h-full flex items-center justify-center">
                                <p className={`text-xs text-center ${errors.chatContent ? 'text-red-400' : 'text-gray-400'}`}>
                                  やり取りを順番に入力してください
                                </p>
                              </div>
                            ) : (
                              chatMessages.map((msg, i) => (
                                <div
                                  key={i}
                                  className={`flex items-end gap-1.5 ${msg.sender === '自分' ? 'flex-row-reverse' : 'flex-row'}`}
                                >
                                  <span className="text-base flex-shrink-0">
                                    {msg.sender === '自分' ? '🙋' : '👤'}
                                  </span>
                                  <div
                                    className={`relative max-w-[75%] px-3 py-2 rounded-2xl text-sm leading-relaxed group ${
                                      msg.sender === '自分'
                                        ? 'bg-purple-500 text-white rounded-br-sm'
                                        : 'bg-white text-gray-800 border border-gray-200 rounded-bl-sm'
                                    }`}
                                  >
                                    <p>{msg.text}</p>
                                    <button
                                      type="button"
                                      onClick={() => removeChatMessage(i)}
                                      className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full hidden group-hover:flex items-center justify-center"
                                    >
                                      <X className="w-3 h-3" />
                                    </button>
                                  </div>
                                </div>
                              ))
                            )}
                            <div ref={chatEndRef} />
                          </div>
                          <div className="border-t border-gray-200 bg-white p-2">
                            <div className="flex gap-1.5 mb-2">
                              <button
                                type="button"
                                onClick={() => setChatSender('自分')}
                                className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-colors ${
                                  chatSender === '自分'
                                    ? 'bg-purple-500 text-white'
                                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                }`}
                              >
                                🙋 自分
                              </button>
                              <button
                                type="button"
                                onClick={() => setChatSender('相手')}
                                className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-colors ${
                                  chatSender === '相手'
                                    ? 'bg-gray-700 text-white'
                                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                }`}
                              >
                                👤 相手
                              </button>
                            </div>
                            <div className="flex gap-2">
                              <input
                                type="text"
                                value={chatInput}
                                onChange={(e) => setChatInput(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    addChatMessage();
                                  }
                                }}
                                className="flex-1 px-3 py-2 text-sm rounded-lg border border-gray-300 focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none"
                                placeholder={`${chatSender}のメッセージを入力…`}
                              />
                              <button
                                type="button"
                                onClick={addChatMessage}
                                disabled={!chatInput.trim()}
                                className="w-9 h-9 flex items-center justify-center rounded-lg bg-purple-500 text-white hover:bg-purple-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex-shrink-0"
                              >
                                <Send className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        </div>
                      )}

                      {chatPlatform === 'other' && (
                        <div className="space-y-2">
                          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                            <p className="text-xs text-blue-700 leading-relaxed">
                              <span className="font-semibold">📋 貼り付け方法：</span><br />
                              Slackなどのチャット画面で、やり取り部分をそのまま選択してコピーし、下のボックスに貼り付けてください。<br />
                              <span className="text-blue-600">ユーザー名も含めてコピーするとより正確に分析できます。</span>
                            </p>
                          </div>
                          <textarea
                            value={otherChatText}
                            onChange={(e) => setOtherChatText(e.target.value)}
                            className={inputClass(errors.chatContent)}
                            placeholder={`例：\n田中さん  14:23\nなんで昨日の件、報告してくれなかったの？\n\n自分  14:25\nすみません、後で送ろうと思っていました`}
                            rows={7}
                          />
                        </div>
                      )}

                      {errors.chatContent && (
                        <p className="text-xs text-red-500 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" />
                          {chatPlatform === 'LINE' ? 'メッセージを1件以上追加してください' : 'チャット内容を貼り付けてください'}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* APIエラー時の表示 */}
            {apiError && (
              <div className="mb-6 flex items-center gap-2 bg-red-50 border border-red-300 text-red-700 rounded-lg px-4 py-3 text-sm">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{apiError}</span>
              </div>
            )}

            {/* 送信ボタン */}
            <button
              type="submit"
              disabled={isAnalyzing}
              className={`w-full text-white py-4 lg:py-5 rounded-xl font-semibold shadow-lg transition-shadow lg:text-lg flex justify-center items-center gap-2 ${
                isAnalyzing
                  ? "bg-gray-400 cursor-not-allowed"
                  : "bg-gradient-to-r from-pink-500 to-purple-500 hover:shadow-xl"
              }`}
            >
              {isAnalyzing ? (
                <>
                  <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  分析中です...
                </>
              ) : (
                "分析する"
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
