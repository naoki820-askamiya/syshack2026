-- KIGEN404 team specification v1.7 / AI specification v1.5.
-- This is intentionally additive: the already-shared initial migration is unchanged.

ALTER TYPE relationship_type ADD VALUE IF NOT EXISTS 'subordinate';
ALTER TYPE relationship_type ADD VALUE IF NOT EXISTS 'spouse';

ALTER TABLE persons
  DROP COLUMN IF EXISTS age_range,
  DROP COLUMN IF EXISTS gender_hint;

ALTER TABLE analysis_cases
  ADD COLUMN user_age_range varchar(20),
  ADD COLUMN user_gender varchar(20),
  ADD COLUMN perceived_partner_reaction varchar(30),
  ADD COLUMN elapsed_time_type varchar(30),
  ADD COLUMN user_response_type varchar(20),
  ADD COLUMN user_response_text text;

UPDATE analysis_cases
SET
  user_age_range = COALESCE(NULLIF(btrim(user_age_range), ''), 'unknown'),
  user_gender = COALESCE(NULLIF(btrim(user_gender), ''), 'unknown'),
  perceived_partner_reaction = COALESCE(
    NULLIF(btrim(perceived_partner_reaction), ''),
    NULLIF(btrim(assumed_partner_emotion), ''),
    'unknown'
  ),
  elapsed_time_type = COALESCE(NULLIF(btrim(elapsed_time_type), ''), 'unknown'),
  user_response_type = CASE
    WHEN COALESCE(NULLIF(btrim(self_message), ''), NULLIF(btrim(partner_message), '')) IS NULL THEN 'none'
    WHEN NULLIF(btrim(partner_message), '') IS NOT NULL THEN 'conversation'
    ELSE 'action'
  END,
  user_response_text = COALESCE(NULLIF(btrim(self_message), ''), NULLIF(btrim(partner_message), ''));

ALTER TABLE analysis_cases
  ALTER COLUMN user_age_range SET NOT NULL,
  ALTER COLUMN user_gender SET NOT NULL,
  ALTER COLUMN perceived_partner_reaction SET NOT NULL,
  ALTER COLUMN elapsed_time_type SET NOT NULL,
  ALTER COLUMN user_response_type SET NOT NULL;

ALTER TABLE analysis_cases
  DROP CONSTRAINT IF EXISTS analysis_cases_self_message_not_blank,
  DROP CONSTRAINT IF EXISTS analysis_cases_partner_message_not_blank,
  DROP COLUMN IF EXISTS self_message,
  DROP COLUMN IF EXISTS partner_message,
  DROP COLUMN IF EXISTS recent_conversation_text,
  DROP COLUMN IF EXISTS app_type,
  DROP COLUMN IF EXISTS user_emotion,
  DROP COLUMN IF EXISTS assumed_partner_emotion,
  DROP COLUMN IF EXISTS partner_speaking_style,
  DROP COLUMN IF EXISTS context_note,
  DROP COLUMN IF EXISTS concern_text,
  DROP COLUMN IF EXISTS emoji_used,
  DROP COLUMN IF EXISTS tone_type,
  DROP COLUMN IF EXISTS message_length_type;

ALTER TABLE analysis_cases
  ADD CONSTRAINT analysis_cases_user_response_type_known
    CHECK (user_response_type IN ('action', 'conversation', 'none')),
  ADD CONSTRAINT analysis_cases_response_consistent
    CHECK (
      (user_response_type = 'none' AND user_response_text IS NULL)
      OR (
        user_response_type IN ('action', 'conversation')
        AND user_response_text IS NOT NULL
        AND btrim(user_response_text) <> ''
      )
    );

ALTER TABLE analysis_results
  ADD COLUMN person_profile_id uuid,
  ADD COLUMN user_pattern_summary_id uuid,
  ADD COLUMN used_case_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN used_feedback_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN context_json jsonb;

ALTER TABLE analysis_results
  ADD CONSTRAINT analysis_results_v2_requires_context
  CHECK (
    result_schema_version <> 'kigen-analysis-result-v2'
    OR context_json IS NOT NULL
  );

DROP INDEX IF EXISTS analysis_results_user_id_analysis_case_id_idx;
DROP INDEX IF EXISTS analysis_results_latest_lookup_idx;
CREATE INDEX analysis_results_latest_lookup_idx
  ON analysis_results(user_id, analysis_case_id, version DESC);

CREATE INDEX analysis_cases_stale_analyzing_idx
  ON analysis_cases(analyze_started_at)
  WHERE status = 'analyzing';

ALTER TABLE analysis_feedbacks
  ADD COLUMN actual_outcome varchar(50),
  ADD COLUMN helpfulness_score integer,
  ADD COLUMN overread_score integer,
  ADD COLUMN used_recommended_action boolean,
  ADD COLUMN outcome_note text,
  ADD COLUMN allow_personalization_use boolean NOT NULL DEFAULT false;

UPDATE analysis_feedbacks
SET
  actual_outcome = outcome_type,
  outcome_note = actual_outcome_note;

ALTER TABLE analysis_feedbacks
  DROP COLUMN IF EXISTS was_helpful,
  DROP COLUMN IF EXISTS outcome_type,
  DROP COLUMN IF EXISTS actual_outcome_note,
  DROP COLUMN IF EXISTS user_correction;

ALTER TABLE analysis_feedbacks
  ADD CONSTRAINT analysis_feedbacks_helpfulness_range
    CHECK (helpfulness_score IS NULL OR helpfulness_score BETWEEN 1 AND 5),
  ADD CONSTRAINT analysis_feedbacks_overread_range
    CHECK (overread_score IS NULL OR overread_score BETWEEN 1 AND 5),
  ADD CONSTRAINT analysis_feedbacks_outcome_note_not_blank
    CHECK (outcome_note IS NULL OR btrim(outcome_note) <> '');

ALTER TABLE person_profiles
  ADD COLUMN source_feedback_count integer NOT NULL DEFAULT 0,
  ADD COLUMN source_latest_case_id uuid,
  ADD COLUMN needs_refresh boolean NOT NULL DEFAULT false,
  ADD COLUMN stale_since timestamptz,
  ADD COLUMN generated_by_model varchar(100),
  ADD COLUMN generated_at timestamptz;

UPDATE person_profiles
SET generated_at = COALESCE(last_generated_at, created_at, now());

ALTER TABLE person_profiles
  ALTER COLUMN generated_at SET NOT NULL,
  DROP COLUMN IF EXISTS last_generated_at,
  ADD CONSTRAINT person_profiles_source_feedback_count_non_negative
    CHECK (source_feedback_count >= 0);

ALTER TABLE user_pattern_summaries
  ADD COLUMN source_feedback_count integer NOT NULL DEFAULT 0,
  ADD COLUMN generated_by_model varchar(100),
  ADD COLUMN generated_at timestamptz;

UPDATE user_pattern_summaries
SET generated_at = COALESCE(last_generated_at, created_at, now());

ALTER TABLE user_pattern_summaries
  ALTER COLUMN generated_at SET NOT NULL,
  DROP COLUMN IF EXISTS last_generated_at,
  ADD CONSTRAINT user_pattern_summaries_source_feedback_count_non_negative
    CHECK (source_feedback_count >= 0);

CREATE TABLE user_privacy_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  personalization_enabled boolean NOT NULL DEFAULT true,
  use_person_profile boolean NOT NULL DEFAULT true,
  use_user_pattern_summary boolean NOT NULL DEFAULT false,
  use_feedback_for_context boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_user_privacy_settings_user UNIQUE (user_id)
);

CREATE TRIGGER user_privacy_settings_set_updated_at
BEFORE UPDATE ON user_privacy_settings FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE user_consent_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  terms_version varchar(50) NOT NULL,
  privacy_policy_version varchar(50) NOT NULL,
  consented_at timestamptz NOT NULL DEFAULT now(),
  ip_address_hash varchar(128),
  user_agent_hash varchar(128)
);

CREATE INDEX user_consent_records_user_consented_idx
  ON user_consent_records(user_id, consented_at);

CREATE TABLE guest_trial_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trial_token_hash varchar(128) NOT NULL UNIQUE,
  ip_hash varchar(128),
  user_agent_hash varchar(128),
  device_hint_hash varchar(128),
  status varchar(20) NOT NULL,
  consumed_at timestamptz,
  blocked_reason varchar(100),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT guest_trial_attempts_status_known
    CHECK (status IN ('issued', 'consumed', 'blocked', 'expired'))
);

CREATE TRIGGER guest_trial_attempts_set_updated_at
BEFORE UPDATE ON guest_trial_attempts FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX guest_trial_attempts_status_expires_idx
  ON guest_trial_attempts(status, expires_at);

CREATE TABLE api_usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  guest_trial_attempt_id uuid REFERENCES guest_trial_attempts(id) ON DELETE SET NULL,
  route_key varchar(100) NOT NULL,
  ip_hash varchar(128),
  user_agent_hash varchar(128),
  cost_units integer NOT NULL,
  status varchar(30) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT api_usage_events_cost_non_negative CHECK (cost_units >= 0),
  CONSTRAINT api_usage_events_status_known
    CHECK (status IN ('allowed', 'blocked', 'failed', 'succeeded'))
);

CREATE INDEX api_usage_events_route_user_created_idx
  ON api_usage_events(route_key, user_id, created_at);
CREATE INDEX api_usage_events_route_ip_created_idx
  ON api_usage_events(route_key, ip_hash, created_at);
CREATE INDEX api_usage_events_route_ip_ua_created_idx
  ON api_usage_events(route_key, ip_hash, user_agent_hash, created_at);

CREATE TABLE rate_limit_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_key varchar(100) NOT NULL UNIQUE,
  subject_type varchar(30) NOT NULL,
  route_key varchar(100) NOT NULL,
  window_type varchar(30) NOT NULL,
  window_seconds integer,
  reset_timezone varchar(50),
  max_requests integer,
  max_cost_units integer,
  plan_type varchar(30),
  is_enabled boolean NOT NULL DEFAULT true,
  priority integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rate_limit_policies_window_type_known
    CHECK (window_type IN ('rolling', 'calendar_day')),
  CONSTRAINT rate_limit_policies_subject_type_known
    CHECK (subject_type IN ('guest', 'user', 'ip', 'ip_user_agent', 'admin')),
  CONSTRAINT rate_limit_policies_window_positive
    CHECK (window_seconds IS NULL OR window_seconds > 0),
  CONSTRAINT rate_limit_policies_max_requests_positive
    CHECK (max_requests IS NULL OR max_requests > 0),
  CONSTRAINT rate_limit_policies_max_cost_positive
    CHECK (max_cost_units IS NULL OR max_cost_units > 0)
);

CREATE TRIGGER rate_limit_policies_set_updated_at
BEFORE UPDATE ON rate_limit_policies FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX rate_limit_policies_route_enabled_priority_idx
  ON rate_limit_policies(route_key, is_enabled, priority);

ALTER TABLE user_privacy_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_consent_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE guest_trial_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_usage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limit_policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_privacy_settings_select_own
  ON user_privacy_settings FOR SELECT USING ((select auth.uid()) = user_id);
CREATE POLICY user_privacy_settings_insert_own
  ON user_privacy_settings FOR INSERT WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY user_privacy_settings_update_own
  ON user_privacy_settings FOR UPDATE
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY user_privacy_settings_delete_own
  ON user_privacy_settings FOR DELETE USING ((select auth.uid()) = user_id);

CREATE POLICY user_consent_records_select_own
  ON user_consent_records FOR SELECT USING ((select auth.uid()) = user_id);
CREATE POLICY user_consent_records_insert_own
  ON user_consent_records FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

-- No client policies are intentionally created for guest_trial_attempts,
-- api_usage_events, or rate_limit_policies. They are backend-managed tables.

INSERT INTO rate_limit_policies (
  policy_key, subject_type, route_key, window_type, window_seconds,
  reset_timezone, max_requests, max_cost_units, is_enabled, priority
) VALUES
  ('guest_trial_once', 'guest', 'guest_analyze', 'calendar_day', NULL, 'Asia/Tokyo', 1, 3, true, 10),
  ('guest_ip_hourly', 'ip', 'guest_analyze', 'rolling', 3600, NULL, 5, 15, true, 20),
  ('guest_ip_ua_daily', 'ip_user_agent', 'guest_analyze', 'calendar_day', NULL, 'Asia/Tokyo', 2, 6, true, 30),
  ('guest_global_abuse_guard', 'ip', 'guest_analyze', 'rolling', 86400, NULL, 20, 60, true, 40)
ON CONFLICT (policy_key) DO UPDATE SET
  subject_type = EXCLUDED.subject_type,
  route_key = EXCLUDED.route_key,
  window_type = EXCLUDED.window_type,
  window_seconds = EXCLUDED.window_seconds,
  reset_timezone = EXCLUDED.reset_timezone,
  max_requests = EXCLUDED.max_requests,
  max_cost_units = EXCLUDED.max_cost_units,
  is_enabled = EXCLUDED.is_enabled,
  priority = EXCLUDED.priority,
  updated_at = now();

-- Login user limits are intentionally not seeded here. Their concrete burst/daily
-- values are explicitly undecided in v1.7 and must be configured operationally.
