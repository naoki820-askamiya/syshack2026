CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE relationship_type AS ENUM (
  'boss',
  'coworker',
  'lover',
  'family',
  'friend',
  'classmate',
  'customer',
  'other'
);

CREATE TYPE gender_hint AS ENUM (
  'male',
  'female',
  'other',
  'unknown'
);

CREATE TYPE analysis_case_status AS ENUM (
  'draft',
  'analyzing',
  'analyzed',
  'failed'
);

CREATE TYPE tone_type AS ENUM (
  'formal',
  'casual',
  'mixed',
  'unknown'
);

CREATE TYPE message_length_type AS ENUM (
  'short',
  'normal',
  'long',
  'unknown'
);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE persons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name varchar(50) NOT NULL,
  relationship_type relationship_type NOT NULL,
  age_range varchar(20),
  gender_hint gender_hint,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  CONSTRAINT persons_user_id_id_key UNIQUE (user_id, id),
  CONSTRAINT persons_display_name_not_blank CHECK (btrim(display_name) <> ''),
  CONSTRAINT persons_age_range_not_blank CHECK (age_range IS NULL OR btrim(age_range) <> ''),
  CONSTRAINT persons_notes_not_blank CHECK (notes IS NULL OR btrim(notes) <> '')
);

CREATE TRIGGER persons_set_updated_at
BEFORE UPDATE ON persons
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TABLE analysis_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  person_id uuid NOT NULL,
  status analysis_case_status NOT NULL DEFAULT 'draft',
  event_facts text NOT NULL,
  self_message text NOT NULL,
  partner_message text NOT NULL,
  recent_conversation_text text,
  app_type varchar(50),
  user_emotion varchar(100),
  assumed_partner_emotion varchar(100),
  partner_speaking_style text,
  context_note text,
  concern_text text,
  emoji_used boolean,
  tone_type tone_type,
  message_length_type message_length_type,
  person_snapshot jsonb NOT NULL,
  analyze_run_id uuid,
  analyze_started_at timestamptz,
  analyze_attempt_count integer NOT NULL DEFAULT 0,
  last_analyzed_at timestamptz,
  failure_code varchar(100),
  failure_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT analysis_cases_user_id_id_key UNIQUE (user_id, id),
  CONSTRAINT analysis_cases_user_person_fkey FOREIGN KEY (user_id, person_id) REFERENCES persons(user_id, id) ON DELETE NO ACTION,
  CONSTRAINT analysis_cases_event_facts_not_blank CHECK (btrim(event_facts) <> ''),
  CONSTRAINT analysis_cases_self_message_not_blank CHECK (btrim(self_message) <> ''),
  CONSTRAINT analysis_cases_partner_message_not_blank CHECK (btrim(partner_message) <> ''),
  CONSTRAINT analysis_cases_recent_conversation_text_not_blank CHECK (recent_conversation_text IS NULL OR btrim(recent_conversation_text) <> ''),
  CONSTRAINT analysis_cases_app_type_not_blank CHECK (app_type IS NULL OR btrim(app_type) <> ''),
  CONSTRAINT analysis_cases_user_emotion_not_blank CHECK (user_emotion IS NULL OR btrim(user_emotion) <> ''),
  CONSTRAINT analysis_cases_assumed_partner_emotion_not_blank CHECK (assumed_partner_emotion IS NULL OR btrim(assumed_partner_emotion) <> ''),
  CONSTRAINT analysis_cases_partner_speaking_style_not_blank CHECK (partner_speaking_style IS NULL OR btrim(partner_speaking_style) <> ''),
  CONSTRAINT analysis_cases_context_note_not_blank CHECK (context_note IS NULL OR btrim(context_note) <> ''),
  CONSTRAINT analysis_cases_concern_text_not_blank CHECK (concern_text IS NULL OR btrim(concern_text) <> ''),
  CONSTRAINT analysis_cases_attempt_count_non_negative CHECK (analyze_attempt_count >= 0),
  CONSTRAINT analysis_cases_analyzing_has_run_info CHECK (
    status <> 'analyzing'
    OR (
      analyze_run_id IS NOT NULL
      AND analyze_started_at IS NOT NULL
    )
  ),
  CONSTRAINT analysis_cases_person_snapshot_shape CHECK (
    jsonb_typeof(person_snapshot) = 'object'
    AND person_snapshot ? 'schemaVersion'
    AND person_snapshot ? 'capturedAt'
    AND person_snapshot ? 'person'
    AND jsonb_typeof(person_snapshot -> 'person') = 'object'
  )
);

CREATE TRIGGER analysis_cases_set_updated_at
BEFORE UPDATE ON analysis_cases
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TABLE analysis_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  analysis_case_id uuid NOT NULL,
  analyze_run_id uuid NOT NULL,
  version integer NOT NULL,
  prompt_version varchar(50) NOT NULL,
  result_schema_version varchar(50) NOT NULL,
  model varchar(100) NOT NULL,
  result_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT analysis_results_user_id_id_key UNIQUE (user_id, id),
  CONSTRAINT analysis_results_analysis_case_version_key UNIQUE (analysis_case_id, version),
  CONSTRAINT analysis_results_analysis_case_run_key UNIQUE (analysis_case_id, analyze_run_id),
  CONSTRAINT analysis_results_case_fkey FOREIGN KEY (user_id, analysis_case_id) REFERENCES analysis_cases(user_id, id) ON DELETE CASCADE,
  CONSTRAINT analysis_results_version_positive CHECK (version >= 1),
  CONSTRAINT analysis_results_prompt_version_not_blank CHECK (btrim(prompt_version) <> ''),
  CONSTRAINT analysis_results_result_schema_version_not_blank CHECK (btrim(result_schema_version) <> ''),
  CONSTRAINT analysis_results_model_not_blank CHECK (btrim(model) <> ''),
  CONSTRAINT analysis_results_result_json_object CHECK (jsonb_typeof(result_json) = 'object')
);

CREATE TABLE analysis_feedbacks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  analysis_case_id uuid NOT NULL,
  analysis_result_id uuid NOT NULL UNIQUE,
  was_helpful boolean,
  outcome_type varchar(50),
  actual_outcome_note text,
  user_correction text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT analysis_feedbacks_case_fkey FOREIGN KEY (user_id, analysis_case_id) REFERENCES analysis_cases(user_id, id) ON DELETE CASCADE,
  CONSTRAINT analysis_feedbacks_user_result_key UNIQUE (user_id, analysis_result_id),
  CONSTRAINT analysis_feedbacks_result_fkey FOREIGN KEY (user_id, analysis_result_id) REFERENCES analysis_results(user_id, id) ON DELETE CASCADE,
  CONSTRAINT analysis_feedbacks_outcome_type_known CHECK (
    outcome_type IS NULL
    OR outcome_type IN (
      'not_checked',
      'seemed_correct',
      'seemed_wrong',
      'relationship_improved',
      'relationship_unchanged',
      'relationship_worsened',
      'unknown'
    )
  ),
  CONSTRAINT analysis_feedbacks_actual_outcome_note_not_blank CHECK (actual_outcome_note IS NULL OR btrim(actual_outcome_note) <> ''),
  CONSTRAINT analysis_feedbacks_user_correction_not_blank CHECK (user_correction IS NULL OR btrim(user_correction) <> '')
);

CREATE TRIGGER analysis_feedbacks_set_updated_at
BEFORE UPDATE ON analysis_feedbacks
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TABLE person_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  person_id uuid NOT NULL UNIQUE,
  profile_schema_version varchar(50) NOT NULL,
  profile_json jsonb NOT NULL,
  source_case_count integer NOT NULL DEFAULT 0,
  last_generated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT person_profiles_user_person_key UNIQUE (user_id, person_id),
  CONSTRAINT person_profiles_person_fkey FOREIGN KEY (user_id, person_id) REFERENCES persons(user_id, id) ON DELETE CASCADE,
  CONSTRAINT person_profiles_profile_schema_version_not_blank CHECK (btrim(profile_schema_version) <> ''),
  CONSTRAINT person_profiles_profile_json_object CHECK (jsonb_typeof(profile_json) = 'object'),
  CONSTRAINT person_profiles_source_case_count_non_negative CHECK (source_case_count >= 0)
);

CREATE TRIGGER person_profiles_set_updated_at
BEFORE UPDATE ON person_profiles
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TABLE user_pattern_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  summary_schema_version varchar(50) NOT NULL,
  summary_json jsonb NOT NULL,
  source_case_count integer NOT NULL DEFAULT 0,
  last_generated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_pattern_summaries_summary_schema_version_not_blank CHECK (btrim(summary_schema_version) <> ''),
  CONSTRAINT user_pattern_summaries_summary_json_object CHECK (jsonb_typeof(summary_json) = 'object'),
  CONSTRAINT user_pattern_summaries_source_case_count_non_negative CHECK (source_case_count >= 0)
);

CREATE TRIGGER user_pattern_summaries_set_updated_at
BEFORE UPDATE ON user_pattern_summaries
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE INDEX persons_user_id_updated_at_idx ON persons(user_id, updated_at);
CREATE INDEX persons_user_id_archived_at_idx ON persons(user_id, archived_at);
CREATE INDEX analysis_cases_user_id_created_at_idx ON analysis_cases(user_id, created_at);
CREATE INDEX analysis_cases_user_id_person_id_created_at_idx ON analysis_cases(user_id, person_id, created_at);
CREATE INDEX analysis_cases_user_id_person_id_status_created_at_idx ON analysis_cases(user_id, person_id, status, created_at);
CREATE INDEX analysis_cases_user_id_status_idx ON analysis_cases(user_id, status);
CREATE INDEX analysis_cases_stale_analyzing_idx ON analysis_cases(analyze_started_at) WHERE status = 'analyzing';
CREATE INDEX analysis_results_user_id_analysis_case_id_idx ON analysis_results(user_id, analysis_case_id);
CREATE INDEX analysis_results_latest_lookup_idx ON analysis_results(user_id, analysis_case_id, version DESC);
CREATE INDEX analysis_feedbacks_user_id_analysis_case_id_idx ON analysis_feedbacks(user_id, analysis_case_id);
CREATE INDEX person_profiles_user_id_idx ON person_profiles(user_id);

ALTER TABLE persons ENABLE ROW LEVEL SECURITY;
ALTER TABLE analysis_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE analysis_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE analysis_feedbacks ENABLE ROW LEVEL SECURITY;
ALTER TABLE person_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_pattern_summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY persons_select_own ON persons FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY persons_insert_own ON persons FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY persons_update_own ON persons FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY persons_delete_own ON persons FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY analysis_cases_select_own ON analysis_cases FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY analysis_cases_insert_own ON analysis_cases FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY analysis_cases_update_own ON analysis_cases FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY analysis_cases_delete_own ON analysis_cases FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY analysis_results_select_own ON analysis_results FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY analysis_results_insert_own ON analysis_results FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY analysis_results_update_own ON analysis_results FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY analysis_results_delete_own ON analysis_results FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY analysis_feedbacks_select_own ON analysis_feedbacks FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY analysis_feedbacks_insert_own ON analysis_feedbacks FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY analysis_feedbacks_update_own ON analysis_feedbacks FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY analysis_feedbacks_delete_own ON analysis_feedbacks FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY person_profiles_select_own ON person_profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY person_profiles_insert_own ON person_profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY person_profiles_update_own ON person_profiles FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY person_profiles_delete_own ON person_profiles FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY user_pattern_summaries_select_own ON user_pattern_summaries FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY user_pattern_summaries_insert_own ON user_pattern_summaries FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY user_pattern_summaries_update_own ON user_pattern_summaries FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY user_pattern_summaries_delete_own ON user_pattern_summaries FOR DELETE USING (auth.uid() = user_id);
