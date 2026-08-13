-- Run from a deployment-specific cron, internal job, or controlled operations task.
-- The deployment mechanism is intentionally not chosen here (team spec v1.7 section 18).
UPDATE analysis_cases
SET
  status = 'failed',
  failure_code = 'ANALYSIS_STALE',
  failure_message = '分析処理が途中で停止した可能性があります'
WHERE status = 'analyzing'
  AND analyze_started_at IS NOT NULL
  AND analyze_started_at < now() - interval '5 minutes';
