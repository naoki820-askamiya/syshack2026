/**
 * このファイルは persons の repository です。
 *
 * Person データの保存・取得だけを担当します。
 * 今はハッカソン向けの簡易実装なので、DB ではなく `Map` を使っています。
 *
 * 注意:
 * - サーバーを再起動するとデータは消えます
 * - 本番向けではなく、MVP を素早く動かすための形です
 */
import { supabase } from "../lib/supabase.js";
import type { StoredPerson } from "../types/index.js";



/**
 * 新しい Person を保存します。
 *
 * 受け取るもの:
 * - id と日時以外の Person データ
 *
 * 返すもの:
 * - 保存後の完全な Person データ
 */
export async function create(
    input: Omit<StoredPerson, "id" | "createdAt" | "updatedAt">,
): Promise<StoredPerson> {
    const { data, error } = await supabase
        .from("persons")
        .insert({
            user_id: input.userId,
            display_name: input.displayName,
            relationship_type: input.relationshipType,
            age_range: input.ageRange,
            gender_hint: input.genderHint,
            notes: input.notes,
        })
        .select()
        .single();

    if (error) {
        throw error;
    }

    return {
        id: data.id,
        userId: data.user_id,
        displayName: data.display_name,
        relationshipType: data.relationship_type,
        ageRange: data.age_range,
        genderHint: data.gender_hint,
        notes: data.notes,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
    };
}

//userIdとpersonIDでユーザー情報を取得
export async function findById(
    userId :string,
    personId: string
): Promise<StoredPerson | null> {
    const { data, error } = await supabase
        .from("persons")
        .select("*")
        .eq("user_id", userId)
        .eq("id", personId)
        .single();

    if (error) {
        if (error.code === "PGRST116") {
            return null;
        }

        throw error;
    }

    return {
        id: data.id,
        userId: data.user_id,
        displayName: data.display_name,
        relationshipType: data.relationship_type,
        ageRange: data.age_range,
        genderHint: data.gender_hint,
        notes: data.notes,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
    };
}