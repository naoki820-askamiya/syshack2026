/**
 * このファイルは analysis-cases の repository です。
 *
 * repository とは:
 * - データの保存・取得を担当する場所
 *
 * 今回はハッカソン用の簡易実装として、
 * 本物の DB ではなく `Map` を使ったインメモリ実装にしています。
 *
 * インメモリ実装とは:
 * - データをメモリ上だけに持つ形
 * - サーバーを再起動すると消える
 *
 * `Map` を使う理由:
 * - `id` をキーにして素早く取り出しやすいからです
 */
import type { PaginationOptions, StoredAnalysisCase } from "../types/index.js";
import { supabase } from "../lib/supabase.js";



/**
 * 新しい analysis-case を保存します。
 *
 * 受け取るもの:
 * - id と日時以外の analysis-case データ
 *
 * 返すもの:
 * - 保存後の完全な analysis-case データ
 */
export async function create(
    input: Omit<StoredAnalysisCase, "id" | "createdAt" | "updatedAt">,
): Promise<StoredAnalysisCase> {
    const { data, error } = await supabase
        .from("analysis_cases")
        .insert({
            user_id: input.userId,
            person_id: input.personId,

            status: input.status,

            event_facts: input.analysisCase.eventFacts,
            self_message: input.analysisCase.selfMessage,
            partner_message: input.analysisCase.partnerMessage,

            recent_conversation_text:
                input.analysisCase.recentConversationText,

            app_type: input.analysisCase.appType,
            user_emotion: input.analysisCase.userEmotion,
            assumed_partner_emotion:
                input.analysisCase.assumedPartnerEmotion,

            partner_speaking_style:
                input.analysisCase.partnerSpeakingStyle,

            context_note: input.analysisCase.contextNote,
            concern_text: input.analysisCase.concernText,

            emoji_used: input.analysisCase.emojiUsed,
            tone_type: input.analysisCase.toneType,
            message_length_type:
                input.analysisCase.messageLengthType,

            person_snapshot: {
                schemaVersion: "v1",
                capturedAt: new Date().toISOString(),
                person: input.person,
            },
        })
        .select()
        .single();

    if (error) {
        throw error;
    }

    return toStoredAnalysisCase(data);
}

/**
 * caseId を使って 1 件の analysis-case を取り出します。
 * 無いときは `null` を返します。
 */
export async function findById(
    userId: string,
    caseId: string
): Promise<StoredAnalysisCase | null> {
    const { data, error } = await supabase
        .from("analysis_cases")
        .select("*")
        .eq("user_id", userId)
        .eq("id", caseId)
        .single();

    if(error){
        return null;
    }

    return toStoredAnalysisCase(data);
}

/**
 * status だけを更新する関数です。
 *
 * `draft` → `analyzing` → `analyzed/failed`
 * のような流れで呼ばれます。
 */
export async function updateStatus(
    userId : string,
    caseId: string,
    status: StoredAnalysisCase["status"],
): Promise<StoredAnalysisCase | null> {
    const { data, error } = await supabase
        .from("analysis_cases")
        .update({
            status,
        })
        .eq("user_id", userId)
        .eq("id", caseId)
        .select()
        .single();

    if (error) {
        return null;
    }

    return toStoredAnalysisCase(data);
}

/**
 * 特定の Person にひも付く analysis-case 一覧を返します。
 *
 * `limit` と `offset` はページング用です。
 * たくさん増えたときでも、少しずつ読めるようにしています。
 */
export async function findByPersonId(
    userId: string,
    personId: string,
    options: PaginationOptions,
) {
    const { data, error } = await supabase
        .from("analysis_cases")
        .select("*")
        .eq("user_id", userId)
        .eq("person_id", personId)
        .order("created_at", { ascending: false })
        .range(
            options.offset,
            options.offset + options.limit - 1,
        );

    if (error) {
        throw error;
    }

    const analysisCases = (data ?? []).map(toStoredAnalysisCase);

    return {
        analysisCases,
        pagination: {
            hasMore: analysisCases.length === options.limit,
            limit: options.limit,
            offset: options.offset,
        },
    };
}

function toStoredAnalysisCase(row: any): StoredAnalysisCase {
    return {
        id: row.id,
        userId: row.user_id,
        personId: row.person_id,

        person: row.person_snapshot?.person,

        analysisCase: {
            eventFacts: row.event_facts,
            selfMessage: row.self_message,
            partnerMessage: row.partner_message,

            recentConversationText:
                row.recent_conversation_text,

            appType: row.app_type,
            userEmotion: row.user_emotion,

            assumedPartnerEmotion:
                row.assumed_partner_emotion,

            partnerSpeakingStyle:
                row.partner_speaking_style,

            contextNote: row.context_note,
            concernText: row.concern_text,

            emojiUsed: row.emoji_used,
            toneType: row.tone_type,

            messageLengthType:
                row.message_length_type,
        },

        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}
