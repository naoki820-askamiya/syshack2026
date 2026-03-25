import type {
    AIAnalysisResult,
    AIInputDTO,
    AnalysisCaseInput,
    AnalysisReplyTone,
    AnalysisScores,
    AnalyzeResponse,
} from "../types";
import {
    ANALYZE_TIMEOUT_MS,
    AppError,
    buildAIInputDTO,
    clampScore,
    readEnv,
    withTimeout,
} from "../utils";

const OPENAI_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_MODEL = "gpt-4o-mini";

// analyze() は B 側 service から呼ばれる AI 分析の入口です。
// ここでは 1) analysisCase を AI 向け DTO に変換し、
// 2) 必須入力を確認し、
// 3) mock か外部 AI を選び、
// 4) timeout 付きで実行し、
// 5) B 側がそのまま保存しやすい shape で返します。
// B 側の呼び出しシグネチャを壊さないため、引数は analysisCase のまま受けています。
export async function analyze(
    analysisCase: AnalysisCaseInput,
): Promise<AnalyzeResponse> {
    const input = buildAIInputDTO(analysisCase);

    if (!input.eventFacts.trim()) {
        throw new AppError({
            code: "AI_RESPONSE_INVALID",
            message: "eventFacts is required for analysis",
            status: 502,
        });
    }

    const result = await withTimeout(async (signal) => {
        if (!shouldUseExternalAI()) {
            return buildMockResult(input);
        }

        return requestExternalAI(input, signal);
    }, ANALYZE_TIMEOUT_MS);

    return {
        status: "analyzed",
        result,
    };
}

// API キーがあるときだけ外部 AI を使い、ないときは mock に切り替えます。
// こうしておくと、ローカル開発や接続前の段階でも B 側の analyze フローを止めずに確認できます。
function shouldUseExternalAI(): boolean {
    return Boolean(readEnv("AI_API_KEY") || readEnv("OPENAI_API_KEY"));
}

// 外部 AI への実リクエストをまとめた関数です。
// 通信失敗・HTTP エラー・JSON 破損を分けて AppError に変換し、
// 呼び出し元が AI_PROVIDER_ERROR / AI_RESPONSE_INVALID を区別できるようにしています。
async function requestExternalAI(
    input: AIInputDTO,
    signal: AbortSignal,
): Promise<AIAnalysisResult> {
    const apiKey = readEnv("AI_API_KEY") ?? readEnv("OPENAI_API_KEY");
    const baseUrl =
        readEnv("AI_BASE_URL") ?? readEnv("OPENAI_BASE_URL") ?? OPENAI_BASE_URL;
    const model =
        readEnv("AI_MODEL") ?? readEnv("OPENAI_MODEL") ?? DEFAULT_MODEL;

    const response = await fetch(
        `${baseUrl.replace(/\/$/, "")}/chat/completions`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model,
                temperature: 0.2,
                response_format: { type: "json_object" },
                messages: [
                    {
                        role: "system",
                        content:
                            "Return JSON only. The schema must include textImpression, contextImpression, scores, confidenceLevel, contactTiming, actions, avoidExpressions, goodSignals, replyExamples, reasons.",
                    },
                    {
                        role: "user",
                        content: buildPrompt(input),
                    },
                ],
            }),
            signal,
        },
    ).catch((error) => {
        throw new AppError({
            code: "AI_PROVIDER_ERROR",
            message: "Failed to call AI provider",
            status: 502,
            cause: error,
        });
    });

    if (!response.ok) {
        throw new AppError({
            code: "AI_PROVIDER_ERROR",
            message: "AI provider returned a non-success response",
            status: 502,
            cause: response.status,
        });
    }

    const payload = (await response.json().catch((error) => {
        throw new AppError({
            code: "AI_RESPONSE_INVALID",
            message: "AI provider response was not valid JSON",
            status: 502,
            cause: error,
        });
    })) as {
        choices?: Array<{ message?: { content?: string } }>;
    };

    const content = payload.choices?.[0]?.message?.content;

    if (!content) {
        throw new AppError({
            code: "AI_RESPONSE_INVALID",
            message: "AI provider response content was empty",
            status: 502,
        });
    }

    const parsed = JSON.parse(content) as Partial<AIAnalysisResult>;
    return normalizeAIResult(parsed);
}

// 外部 AI に渡す入力を 1 つの JSON にまとめます。
// timeout や retry なしといった制約も含めて渡すことで、
// モデル側にも期待する出力条件を明示しています。
function buildPrompt(input: AIInputDTO): string {
    return JSON.stringify({
        caseId: input.caseId,
        eventFacts: input.eventFacts,
        selfMessage: input.selfMessage,
        partnerMessage: input.partnerMessage,
        timeoutMs: ANALYZE_TIMEOUT_MS,
        constraints: {
            language: "ja",
            retry: false,
        },
    });
}

// 外部 AI を使わない場合の開発用の簡易分析です。
// 完全な推論ではなく、キーワードベースでそれらしい初期結果を返し、
// B 側の保存や画面確認を進めやすくする目的があります。
function buildMockResult(input: AIInputDTO): AIAnalysisResult {
    const combinedText = `${input.eventFacts} ${input.selfMessage} ${input.partnerMessage}`;
    const scores = buildScores(combinedText);
    const confidenceLevel =
        scores.angry > 0.65 || scores.busy > 0.65 || scores.positive > 0.6
            ? "high"
            : "medium";

    return {
        textImpression:
            scores.angry > 0.6
                ? "やり取りには緊張感があり、相手の感情がやや強く出ています。"
                : scores.busy > 0.6
                  ? "拒絶よりも、忙しさや余裕のなさが強く表れている印象です。"
                  : "強い拒絶までは読み取れず、状況要因を考慮して慎重に見る段階です。",
        contextImpression:
            scores.busy > 0.6
                ? "相手の置かれた状況の負荷が高く、反応が短くなっている可能性があります。"
                : "やり取り全体を見ると、言い方よりもタイミングや文量の影響がありそうです。",
        scores,
        confidenceLevel,
        contactTiming:
            scores.angry > 0.6
                ? "少し時間を置いてから、短く誠実に連絡するのが安全です。"
                : "急ぎでなければ、相手の負荷が下がるタイミングで簡潔に伝えるのが無難です。",
        actions: [
            { text: "次の連絡は要点を一つに絞る" },
            { text: "相手の状況を決めつけず確認する" },
        ],
        avoidExpressions: [
            { text: "感情を断定して責める言い方" },
            { text: "短時間での追いメッセージ" },
        ],
        goodSignals: [
            { text: "完全な拒絶を示す表現までは見られない" },
            { text: "文面からは調整余地が残っている" },
        ],
        replyExamples: [
            {
                text: "お忙しいところ恐れ入ります。落ち着いたタイミングでご確認いただければ大丈夫です。",
                tone: "formal",
            },
            {
                text: "急ぎではないので、落ち着いたときに見てもらえたら大丈夫です。",
                tone: "neutral",
            },
        ],
        reasons: [
            {
                label: "文面の温度感",
                detail: "短文傾向や否定表現の有無から、怒りと距離感を中心に評価しています。",
            },
            {
                label: "状況要因",
                detail: "出来事の内容とメッセージ量から、忙しさ由来の反応かどうかを補正しています。",
            },
        ],
    };
}

// 複数のキーワード群から感情スコアを組み立てる関数です。
// mock 結果でも画面側で扱いやすいよう、各スコアを 0〜1 にそろえています。
function buildScores(text: string): AnalysisScores {
    const angry = scoreByKeywords(
        text,
        ["怒", "最悪", "無理", "嫌", "イライラ"],
        0.18,
        0.14,
    );
    const busy = scoreByKeywords(
        text,
        ["忙", "あとで", "会議", "立て込", "今は"],
        0.24,
        0.14,
    );
    const justCold = scoreByKeywords(
        text,
        ["。", "了解", "はい", "ふーん", "別に"],
        0.22,
        0.08,
    );
    const positive = scoreByKeywords(
        text,
        ["ありがとう", "助かる", "大丈夫", "うれしい", "また"],
        0.18,
        0.15,
    );
    const distance = scoreByKeywords(
        text,
        ["また今度", "無理", "やめて", "距離", "控えて"],
        0.2,
        0.14,
    );

    return {
        angry,
        busy,
        justCold,
        positive,
        distance,
    };
}

// キーワードのヒット数をスコアに変換する小さな補助関数です。
// 単純な規則でも毎回同じ基準で評価できるため、mock の挙動が読みやすくなります。
function scoreByKeywords(
    text: string,
    keywords: string[],
    base: number,
    step: number,
): number {
    const hits = keywords.reduce(
        (count, keyword) => (text.includes(keyword) ? count + 1 : count),
        0,
    );
    return clampScore(base + hits * step);
}

// 外部 AI から返ってきた JSON を、このアプリで使う型に整える関数です。
// AI の出力は欠落や型ずれが起こりやすいため、ここで最低限の検証と補正を行い、
// 以降の処理が「期待した shape を前提」に動けるようにしています。
function normalizeAIResult(
    result: Partial<AIAnalysisResult>,
): AIAnalysisResult {
    if (
        typeof result.textImpression !== "string" ||
        typeof result.contextImpression !== "string" ||
        typeof result.contactTiming !== "string"
    ) {
        throw new AppError({
            code: "AI_RESPONSE_INVALID",
            message: "AI provider response did not match the expected schema",
            status: 502,
        });
    }

    return {
        textImpression: result.textImpression,
        contextImpression: result.contextImpression,
        scores: {
            angry: clampScore(Number(result.scores?.angry ?? 0)),
            busy: clampScore(Number(result.scores?.busy ?? 0)),
            justCold: clampScore(Number(result.scores?.justCold ?? 0)),
            positive: clampScore(Number(result.scores?.positive ?? 0)),
            distance: clampScore(Number(result.scores?.distance ?? 0)),
        },
        confidenceLevel: normalizeConfidenceLevel(result.confidenceLevel),
        contactTiming: result.contactTiming,
        actions: normalizeTextItems(result.actions),
        avoidExpressions: normalizeTextItems(result.avoidExpressions),
        goodSignals: normalizeTextItems(result.goodSignals),
        replyExamples: normalizeReplyExamples(result.replyExamples),
        reasons: normalizeReasons(result.reasons),
    };
}

// confidenceLevel は想定外の文字列が来る可能性があるため、
// 不正値のときは安全側で medium に寄せます。
function normalizeConfidenceLevel(
    value: unknown,
): AIAnalysisResult["confidenceLevel"] {
    return value === "low" || value === "medium" || value === "high"
        ? value
        : "medium";
}

// { text } の配列として扱いたい項目を共通化して正規化します。
// 文字列だけ、オブジェクトだけ、という揺れがあっても吸収できるようにしています。
function normalizeTextItems(value: unknown): AIAnalysisResult["actions"] {
    if (!Array.isArray(value)) {
        return [];
    }

    return value
        .map((item) => {
            const text =
                typeof item === "string"
                    ? item
                    : (item as { text?: unknown })?.text;
            return typeof text === "string" && text ? { text } : null;
        })
        .filter(
            (item): item is AIAnalysisResult["actions"][number] =>
                item !== null,
        );
}

// 返信例は text に加えて tone も必要なので、通常の text 配列とは別に整形します。
function normalizeReplyExamples(
    value: unknown,
): AIAnalysisResult["replyExamples"] {
    if (!Array.isArray(value)) {
        return [];
    }

    return value
        .map((item) => {
            const candidate = item as { text?: unknown; tone?: unknown };
            if (typeof candidate.text !== "string" || !candidate.text) {
                return null;
            }

            return {
                text: candidate.text,
                tone: normalizeTone(candidate.tone),
            };
        })
        .filter(
            (item): item is AIAnalysisResult["replyExamples"][number] =>
                item !== null,
        );
}

// 分析理由は label と detail の 2 つがそろって初めて意味を持つため、
// 両方あるものだけを通します。
function normalizeReasons(value: unknown): AIAnalysisResult["reasons"] {
    if (!Array.isArray(value)) {
        return [];
    }

    return value
        .map((item) => {
            const candidate = item as { label?: unknown; detail?: unknown };
            if (
                typeof candidate.label !== "string" ||
                typeof candidate.detail !== "string"
            ) {
                return null;
            }

            return {
                label: candidate.label,
                detail: candidate.detail,
            };
        })
        .filter(
            (item): item is AIAnalysisResult["reasons"][number] =>
                item !== null,
        );
}

// tone も AI 出力の揺れが起きやすいので、想定外は neutral に寄せます。
function normalizeTone(value: unknown): AnalysisReplyTone {
    return value === "formal" || value === "neutral" || value === "casual"
        ? value
        : "neutral";
}
