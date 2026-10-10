-- Additive, nullable for legacy/guest events; never infer missing linkage by timestamp.
-- No FK to mutable current run or cascade change to existing usage retention.
ALTER TABLE api_usage_events
  ADD COLUMN analysis_case_id uuid,
  ADD COLUMN analyze_run_id uuid,
  ADD CONSTRAINT api_usage_events_run_linkage_pair CHECK (
    (analysis_case_id IS NULL AND analyze_run_id IS NULL) OR
    (analysis_case_id IS NOT NULL AND analyze_run_id IS NOT NULL AND route_key = 'analyze')
  );
CREATE INDEX api_usage_events_analysis_case_id_analyze_run_id_idx
  ON api_usage_events (analysis_case_id, analyze_run_id);
