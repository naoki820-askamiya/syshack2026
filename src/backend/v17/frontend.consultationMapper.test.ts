import assert from "node:assert/strict";
import test from "node:test";
import {
    toConsultation,
    type ApiAnalysisCase,
    type ApiPerson,
} from "../../app/api/consultationMapper.js";

const analysisCase: ApiAnalysisCase = {
    id: "case-1",
    personId: "person-1",
    eventFacts: "会議後に短い返事があった",
    perceivedPartnerReaction: "冷たい",
    elapsedTimeType: "翌日",
    userResponseText: null,
    userAgeRange: "20代",
    userGender: "回答しない",
    createdAt: "2026-08-30T00:00:00.000Z",
};

test("APIの相談と人物を画面用データへ変換する", () => {
    const person: ApiPerson = {
        id: "person-1",
        displayName: "テスト相手",
        relationshipType: "boss",
    };

    assert.deepEqual(toConsultation(analysisCase, person), {
        id: "case-1",
        personId: "person-1",
        personName: "テスト相手",
        relation: "上司",
        event: "会議後に短い返事があった",
        reaction: "冷たい",
        userAction: "",
        timing: "翌日",
        createdAt: "2026-08-30T00:00:00.000Z",
        ageGroup: "20代",
        gender: "回答しない",
    });
});

test("未知のAPI値は既存の画面フォールバックへ変換する", () => {
    const person: ApiPerson = {
        id: "person-1",
        displayName: "テスト相手",
        relationshipType: "unknown-relation",
    };

    const result = toConsultation({
        ...analysisCase,
        perceivedPartnerReaction: "unknown-reaction",
        elapsedTimeType: "unknown-timing",
    }, person);

    assert.equal(result.relation, "その他");
    assert.equal(result.reaction, "その他");
    assert.equal(result.timing, "直後");
});
