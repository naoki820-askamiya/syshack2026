-- Resource-local, optional creation intent; existing NULL rows are not backfilled.
ALTER TABLE persons ADD COLUMN create_intent_key UUID,
    ADD COLUMN create_intent_fingerprint VARCHAR(67),
    ADD CONSTRAINT persons_create_intent_pair CHECK (
        (create_intent_key IS NULL AND create_intent_fingerprint IS NULL) OR
        (create_intent_key IS NOT NULL AND create_intent_fingerprint IS NOT NULL
         AND create_intent_fingerprint ~ '^v1:[a-f0-9]{64}$'));
CREATE UNIQUE INDEX persons_user_id_create_intent_key_key ON persons(user_id, create_intent_key);
ALTER TABLE analysis_cases ADD COLUMN create_intent_key UUID,
    ADD COLUMN create_intent_fingerprint VARCHAR(67),
    ADD CONSTRAINT analysis_cases_create_intent_pair CHECK (
        (create_intent_key IS NULL AND create_intent_fingerprint IS NULL) OR
        (create_intent_key IS NOT NULL AND create_intent_fingerprint IS NOT NULL
         AND create_intent_fingerprint ~ '^v1:[a-f0-9]{64}$'));
CREATE UNIQUE INDEX analysis_cases_user_id_create_intent_key_key ON analysis_cases(user_id, create_intent_key);
