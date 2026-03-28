/**
 * このファイルは OpenAI API を呼び出す専門の場所です。
 *
 * 役割:
 * - AI に渡す入力を整理する
 * - system prompt と user prompt を作る
 * - OpenAI API を呼ぶ
 * - AI が返した JSON を取り出す
 * - Zod で shape を検証する
 *
 * つまり、
 * 「AI まわりの難しい部分を 1 ファイルに集めている」
 * と考えると追いやすいです。
 */
import OpenAI from "openai";
import { z } from "zod";

/**
 * API キーは要件どおり process.env.OPENAI_API_KEY から読みます。
 * 初期化自体はファイル先頭で行い、実際の不足チェックは analyzeMood() 内で明示します。
 */
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

/**
 * 入力の Person 情報です。
 * フォーム入力アプリなので、会話そのものだけでなく相手の基本属性や補足も扱います。
 */
const analyzePersonSchema = z
    .object({
        displayName: z.string().trim(),
        relationshipType: z.string().trim(),
        ageRange: z.string().trim(),
        genderHint: z.string().trim(),
        notes: z.string().trim(),
    })
    .strict();

/**
 * 入力の AnalysisCase 情報です。
 * 実際に起きた事実・会話文・ユーザーの不安や推測を分離したまま AI に渡す前提です。
 */
const analyzeCaseSchema = z
    .object({
        eventFacts: z.string().trim(),
        selfMessage: z.string().trim(),
        partnerMessage: z.string().trim(),
        recentConversationText: z.string().trim(),
        appType: z.string().trim(),
        userEmotion: z.string().trim(),
        assumedPartnerEmotion: z.string().trim(),
        partnerSpeakingStyle: z.string().trim(),
        contextNote: z.string().trim(),
        concernText: z.string().trim(),
        emojiUsed: z.boolean().nullable(),
        toneType: z.enum(["formal", "casual", "mixed", "unknown"]),
        messageLengthType: z.enum(["short", "normal", "long", "unknown"]),
    })
    .strict();

/**
 * AnalyzeMood に渡す入力全体です。
 */
export const analyzeInputSchema = z
    .object({
        person: analyzePersonSchema,
        analysisCase: analyzeCaseSchema,
    })
    .strict();

export type AnalyzeInput = z.infer<typeof analyzeInputSchema>;

/**
 * text だけを持つ配列要素の共通 schema です。
 */
const textItemSchema = z
    .object({
        text: z.string().trim().min(1),
    })
    .strict();

/**
 * 返信例の schema です。
 * tone は formal / casual / neutral だけを許可します。
 */
const replyExampleSchema = z
    .object({
        text: z.string().trim().min(1),
        tone: z.enum(["formal", "casual", "neutral"]),
    })
    .strict();

/**
 * 理由の schema です。
 */
const reasonSchema = z
    .object({
        label: z.string().trim().min(1),
        detail: z.string().trim().min(1),
    })
    .strict();

/**
 * 感情スコアは最終 schema を正として 8 種類に統一します。
 * フロントのレーダーチャートとも同じキーでそろえます。
 */
const scoresSchema = z
    .object({
        angry: z.number().min(0).max(1),
        cold: z.number().min(0).max(1),
        busy: z.number().min(0).max(1),
        pressure: z.number().min(0).max(1),
        distance: z.number().min(0).max(1),
        happy: z.number().min(0).max(1),
        joy: z.number().min(0).max(1),
        relief: z.number().min(0).max(1),
    })
    .strict();

/**
 * AI の最終出力 schema です。
 * 件数制約・文字数制約・列挙値制約をここで厳密に担保します。
 */
export const analyzeOutputSchema = z
    .object({
        textImpression: z.string().trim().min(1),
        contextImpression: z.string().trim().min(1),
        scores: scoresSchema,
        confidenceLevel: z.enum(["low", "medium", "high"]),
        contactTiming: z.string().trim().min(1).max(200),
        actions: z.array(textItemSchema).min(1).max(3),
        avoidExpressions: z.array(textItemSchema).min(1).max(3),
        goodSignals: z.array(textItemSchema).min(1).max(3),
        replyExamples: z.array(replyExampleSchema).min(2).max(4),
        reasons: z.array(reasonSchema).min(2).max(5),
    })
    .strict();

export type AnalyzeOutput = z.infer<typeof analyzeOutputSchema>;

/**
 * エラーの分類を見やすくするための専用クラスです。
 * status と code を持たせて、上位層でそのまま API エラーへ変換しやすくしています。
 */
export class AnalyzeMoodError extends Error {
    readonly code: string;
    readonly status: number;
    override readonly cause?: unknown;

    constructor(
        code: string,
        message: string,
        status: number,
        cause?: unknown,
    ) {
        super(message);
        this.name = "AnalyzeMoodError";
        this.code = code;
        this.status = status;
        this.cause = cause;
    }
}

/**
 * system prompt を組み立てます。
 * 要件をコード内に明示することで、後から見返したときに
 * 「なぜこの出力制約があるか」を追いやすくしています。
 */
export function buildSystemPrompt(): string {
    return [
        "あなたは『相手の機嫌・感情傾向分析』AIです。",
        "これはチャットアプリではなく、フォーム入力型の分析アプリのバックエンド用処理です。",
        "ユーザー入力の出来事・会話文・補足情報をもとに分析してください。",
        "怒りだけでなく、冷たさ、忙しさ、圧の強さ、距離感、機嫌のよさ、嬉しさ、安心感も分析対象に含めてください。",
        "ユーザーの不安をそのまま事実として扱わないでください。",
        "悪い兆候だけでなく、良い兆候も必ず拾ってください。",
        "断定ではなく『可能性』として表現してください。",
        "実際に起きた事実、会話文から読み取れる要素、ユーザーの主観的な不安、ユーザーが推測している相手の感情、状況要因を混同しないでください。",
        "相手の人格を決めつけないでください。",
        "ユーザーの思い込みを一方的に補強しないでください。",
        "相手を責める方向の助言をしないでください。",
        "攻撃的な追撃や圧の強い催促を勧めないでください。",
        "textImpression と contextImpression は断定を避けてください。",
        "goodSignals は必ず 1 件以上返してください。",
        "contactTiming は 200 文字以内にしてください。",
        "replyExamples は実際にそのまま使える短文にしてください。",
        "不明点が多い場合は confidenceLevel を下げてください。",
        "JSON のみ返してください。",
        "JSON の外に文章を書かないでください。",
        "Markdown を使わないでください。",
        "null は使わないでください。",
        "キー名を変更しないでください。",
        "scores は次の 8 つだけを使ってください: angry, cold, busy, pressure, distance, happy, joy, relief。",
        "scores の定義は以下の通りです。",
        "angry: 怒り、不機嫌",
        "cold: 冷たさ、そっけなさ",
        "busy: 忙しさ、余裕のなさ",
        "pressure: 圧の強さ、厳しさ",
        "distance: 距離感、引いている感じ",
        "happy: 機嫌のよさ、前向きさ",
        "joy: 嬉しさ、喜び",
        "relief: 安心、ほっとしている状態",
        "スコアの意味: 0.00 に近い = 可能性がかなり低い、1.00 に近い = 可能性がかなり高い。",
        "confidenceLevel の意味: low = 根拠が少なく解釈の幅が広い、medium = 根拠はあるが断定はできない、high = 複数の根拠が整合している。",
        "最終 JSON schema は次の構造に厳密に従ってください。",
        '{"textImpression":"string","contextImpression":"string","scores":{"angry":0,"cold":0,"busy":0,"pressure":0,"distance":0,"happy":0,"joy":0,"relief":0},"confidenceLevel":"low|medium|high","contactTiming":"string","actions":[{"text":"string"}],"avoidExpressions":[{"text":"string"}],"goodSignals":[{"text":"string"}],"replyExamples":[{"text":"string","tone":"formal|casual|neutral"}],"reasons":[{"label":"string","detail":"string"}]}',
    ].join("\n");
}

/**
 * user prompt を組み立てます。
 * 指定されたフォーマットをそのまま守ることで、入力の意味を AI に伝えやすくします。
 *
 * system prompt との違い:
 * - system prompt は「AI に守ってほしい全体ルール」
 * - user prompt は「今回の分析対象データそのもの」
 */
export function buildUserPrompt(input: AnalyzeInput): string {
    const safeInput = analyzeInputSchema.parse(input);

    return [
        "以下は分析対象データです。",
        "仕様に従って分析し、JSONのみを返してください。",
        "",
        "[Person]",
        `displayName: ${safeInput.person.displayName}`,
        `relationshipType: ${safeInput.person.relationshipType}`,
        `ageRange: ${safeInput.person.ageRange}`,
        `genderHint: ${safeInput.person.genderHint}`,
        `notes: ${safeInput.person.notes}`,
        "",
        "[AnalysisCase]",
        `eventFacts: ${safeInput.analysisCase.eventFacts}`,
        `selfMessage: ${safeInput.analysisCase.selfMessage}`,
        `partnerMessage: ${safeInput.analysisCase.partnerMessage}`,
        `recentConversationText: ${safeInput.analysisCase.recentConversationText}`,
        `appType: ${safeInput.analysisCase.appType}`,
        `userEmotion: ${safeInput.analysisCase.userEmotion}`,
        `assumedPartnerEmotion: ${safeInput.analysisCase.assumedPartnerEmotion}`,
        `partnerSpeakingStyle: ${safeInput.analysisCase.partnerSpeakingStyle}`,
        `contextNote: ${safeInput.analysisCase.contextNote}`,
        `concernText: ${safeInput.analysisCase.concernText}`,
        `emojiUsed: ${formatEmojiUsedForPrompt(safeInput.analysisCase.emojiUsed)}`,
        `toneType: ${safeInput.analysisCase.toneType}`,
        `messageLengthType: ${safeInput.analysisCase.messageLengthType}`,
    ].join("\n");
}

function formatEmojiUsedForPrompt(value: boolean | null): string {
    if (value === true) {
        return "true";
    }

    if (value === false) {
        return "false";
    }

    return "unknown";
}

/**
 * LLM の返答から JSON 部分だけを抜き出します。
 * ```json ... ``` で囲まれているケースや、前後に余計な文字が付いたケースを吸収するためです。
 */
export function extractJsonText(rawText: string): string {
    const trimmed = rawText.trim();

    const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fencedMatch?.[1]) {
        return fencedMatch[1].trim();
    }

    const firstBraceIndex = trimmed.indexOf("{");
    const lastBraceIndex = trimmed.lastIndexOf("}");

    if (
        firstBraceIndex !== -1 &&
        lastBraceIndex !== -1 &&
        lastBraceIndex > firstBraceIndex
    ) {
        return trimmed.slice(firstBraceIndex, lastBraceIndex + 1).trim();
    }

    return trimmed;
}

/**
 * OpenAI SDK 由来のエラーから、原因の見当が付くメッセージだけを抜き出します。
 * モデル ID 不正や認証エラーのときに、呼び出し側で切り分けしやすくするためです。
 */
function getProviderErrorMessage(error: unknown): string {
    if (error instanceof Error && error.message.trim()) {
        return error.message.trim();
    }

    return "詳細不明の provider error";
}

/**
 * Zod エラーを初心者にも読みやすい文字列に変換します。
 * どの項目が壊れているかを path ごとに返すため、デバッグしやすくなります。
 */
function formatZodIssues(error: z.ZodError<unknown>): string {
    return error.issues
        .map((issue) => {
            const path =
                issue.path.length > 0 ? issue.path.join(".") : "(root)";
            return `${path}: ${issue.message}`;
        })
        .join("; ");
}

/**
 * OpenAI の返答テキストを JSON.parse し、Zod で厳密に検証します。
 * parse 失敗と schema 不一致を分けて扱うことで、何が壊れていたかを追いやすくします。
 */
function parseAnalyzeOutput(rawText: string): AnalyzeOutput {
    const jsonText = extractJsonText(rawText);

    let parsedJson: unknown;
    try {
        parsedJson = JSON.parse(jsonText);
    } catch (error) {
        throw new AnalyzeMoodError(
            "AI_RESPONSE_INVALID",
            `AI の返答を JSON.parse できませんでした。抽出結果: ${jsonText.slice(0, 300)}`,
            502,
            error,
        );
    }

    const validated = analyzeOutputSchema.safeParse(parsedJson);
    if (!validated.success) {
        throw new AnalyzeMoodError(
            "AI_RESPONSE_INVALID",
            `AI の返答が schema に一致しません。${formatZodIssues(validated.error)}`,
            502,
            validated.error,
        );
    }

    // goodSignals は「悪い面だけで決めつけない」ために必須にしています。
    if (validated.data.goodSignals.length === 0) {
        throw new AnalyzeMoodError(
            "AI_RESPONSE_INVALID",
            "AI の返答で goodSignals が 0 件でした。",
            502,
        );
    }

    return validated.data;
}

/**
 * 実際の OpenAI 呼び出しを行う本体です。
 * prompt 構築、SDK 呼び出し、JSON 抽出、schema 検証を順番に担当します。
 */
export async function analyzeMood(input: AnalyzeInput): Promise<AnalyzeOutput> {
    const sanitizedInput = analyzeInputSchema.parse(input);

    // OpenAI を呼ぶ前に、必要な環境変数があるか確認します。
    // ここが無いと、原因が分かりにくいまま失敗してしまいます。
    if (!process.env.OPENAI_API_KEY?.trim()) {
        throw new AnalyzeMoodError(
            "AI_PROVIDER_ERROR",
            "process.env.OPENAI_API_KEY が設定されていません。",
            500,
        );
    }

    const model = process.env.OPENAI_MODEL?.trim();
    if (!model) {
        throw new AnalyzeMoodError(
            "AI_PROVIDER_ERROR",
            "process.env.OPENAI_MODEL が設定されていません。",
            500,
        );
    }

    const systemPrompt = buildSystemPrompt();
    const userPrompt = buildUserPrompt(sanitizedInput);

    let rawText = "";

    try {
        // 実際に OpenAI API を呼んでいる場所です。
        // ここでは「JSON だけ返してほしい」と明示しています。
        const completion = await openai.chat.completions.create({
            model,
            temperature: 0.2,
            response_format: { type: "json_object" },
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt },
            ],
        });

        // OpenAI の返答本文だけを取り出します。
        rawText = completion.choices[0]?.message?.content?.trim() ?? "";
    } catch (error) {
        throw new AnalyzeMoodError(
            "AI_PROVIDER_ERROR",
            `OpenAI API の呼び出しに失敗しました。model=${model}. ${getProviderErrorMessage(error)}`,
            502,
            error,
        );
    }

    if (!rawText) {
        throw new AnalyzeMoodError(
            "AI_RESPONSE_INVALID",
            "OpenAI から空の応答が返されました。",
            502,
        );
    }

    // 返ってきた文字列を JSON として取り出し、
    // schema（データの形のルール）に合っているか確認します。
    return parseAnalyzeOutput(rawText);
}

/**
 * 既存コードで analyze という関数名を期待していても流用しやすいよう、
 * analyzeMood の別名も export しておきます。
 */
export const analyze = analyzeMood;

/**
 * サンプル入力です。
 * 実装の利用イメージを確認しやすいように export しています。
 */
export const sampleAnalyzeInput: AnalyzeInput = {
    person: {
        displayName: "取引先A",
        relationshipType: "customer",
        ageRange: "30代",
        genderHint: "unknown",
        notes: "ふだんは返信が早く、文面は簡潔。",
    },
    analysisCase: {
        eventFacts: "提案資料を送ったあと、短い返信だけが返ってきた。",
        selfMessage: "ご確認よろしくお願いします。",
        partnerMessage: "確認します。",
        recentConversationText:
            "昨日は打ち合わせの後に資料送付。相手は会議続きだった。",
        appType: "LINE",
        userEmotion: "不安",
        assumedPartnerEmotion: "少し冷たいかも",
        partnerSpeakingStyle: "普段から短文",
        contextNote: "今週は相手が繁忙期らしい。",
        concernText: "嫌われたのか、忙しいだけなのか知りたい。",
        emojiUsed: false,
        toneType: "formal",
        messageLengthType: "short",
    },
};

/**
 * サンプル出力です。
 * schema を満たす完成形の見本として使えます。
 */
export const sampleAnalyzeOutput: AnalyzeOutput = {
    textImpression:
        "文面は短く事務的ですが、強い拒絶や怒りを示す表現までは見られず、忙しさが影響している可能性があります。",
    contextImpression:
        "繁忙期という状況や普段から短文という情報を踏まえると、そっけなさがそのまま否定的感情とは限らない可能性があります。",
    scores: {
        angry: 0.18,
        cold: 0.41,
        busy: 0.74,
        pressure: 0.24,
        distance: 0.32,
        happy: 0.28,
        joy: 0.18,
        relief: 0.26,
    },
    confidenceLevel: "medium",
    contactTiming:
        "急ぎでなければ少し時間を置き、相手の負荷が下がりそうな時間帯に短く連絡するのが無難です。",
    actions: [
        { text: "次の連絡は要点を一つに絞って送る" },
        { text: "返信を急かさず、確認しやすい形で補足情報を出す" },
    ],
    avoidExpressions: [
        { text: "返事を催促するような強い追撃" },
        { text: "冷たいと決めつけて責める言い方" },
    ],
    goodSignals: [
        { text: "返信自体は返ってきている" },
        { text: "明確な拒絶表現は見られない" },
    ],
    replyExamples: [
        {
            text: "お忙しいところ恐れ入ります。お手すきの際にご確認いただければ幸いです。",
            tone: "formal",
        },
        {
            text: "急ぎではないので、落ち着いたタイミングで大丈夫です。",
            tone: "neutral",
        },
    ],
    reasons: [
        {
            label: "文面の短さ",
            detail: "返信は短いものの、怒りや拒絶を直接示す語は含まれていません。",
        },
        {
            label: "状況要因",
            detail: "繁忙期という背景があり、忙しさ由来の簡潔な反応である可能性があります。",
        },
    ],
};
