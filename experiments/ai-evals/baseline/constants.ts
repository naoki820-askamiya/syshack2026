export const PROMPT_VERSION = "kigen-prompt-v2";
export const RESULT_SCHEMA_VERSION = "kigen-analysis-result-v2";
export const CONTEXT_SCHEMA_VERSION = "analysis-context-snapshot-v4";
export const PERSON_SNAPSHOT_SCHEMA_VERSION = "person-snapshot-v2";
export const MAX_INTERNAL_AI_ATTEMPTS = 3;
export const DEFAULT_AI_TIMEOUT_MS = 30_000;

export const SCORE_DEFINITIONS = {
    anger: { label: "怒り気味", category: "concern" },
    coldness: { label: "冷たい", category: "concern" },
    distance: { label: "距離あり", category: "concern" },
    busyness: { label: "忙しい", category: "context" },
    flatness: { label: "淡々", category: "context" },
    reassurance: { label: "大丈夫", category: "relief" },
} as const;
