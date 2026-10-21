-- Guest v1 starts stopped and unconfigured. No model, budget, or live service
-- is enabled by this additive migration; normal user quotas are unchanged.
CREATE TABLE guest_v1_budget (
  scope varchar(30) PRIMARY KEY CHECK (scope = 'guest-v1'),
  stopped boolean NOT NULL DEFAULT true,
  max_cost_micros bigint CHECK (max_cost_micros > 0),
  max_requests integer CHECK (max_requests > 0),
  max_concurrent integer CHECK (max_concurrent > 0),
  issuance_limit bigint CHECK (issuance_limit > 0),
  issue_window_seconds integer CHECK (issue_window_seconds > 0),
  issue_window_limit integer CHECK (issue_window_limit > 0),
  occupied_micros bigint NOT NULL DEFAULT 0 CHECK (occupied_micros >= 0),
  occupied_requests integer NOT NULL DEFAULT 0 CHECK (occupied_requests >= 0),
  active_runs integer NOT NULL DEFAULT 0 CHECK (active_runs >= 0),
  issued_total bigint NOT NULL DEFAULT 0 CHECK (issued_total >= 0),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (max_cost_micros IS NULL OR occupied_micros <= max_cost_micros),
  CHECK (max_requests IS NULL OR occupied_requests <= max_requests),
  CHECK (max_concurrent IS NULL OR active_runs <= max_concurrent)
);
INSERT INTO guest_v1_budget(scope) VALUES ('guest-v1');

CREATE TABLE guest_v1_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash varchar(64) UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  issued_expires_at timestamptz NOT NULL,
  used_until timestamptz,
  revoked_at timestamptz,
  consent_version varchar(160),
  terms_version varchar(160),
  privacy_version varchar(160),
  consented_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK ((consented_at IS NULL AND consent_version IS NULL AND terms_version IS NULL AND privacy_version IS NULL)
    OR (consented_at IS NOT NULL AND consent_version IS NOT NULL AND terms_version IS NOT NULL AND privacy_version IS NOT NULL))
);
CREATE INDEX guest_v1_sessions_issue_window_idx ON guest_v1_sessions(created_at);
CREATE INDEX guest_v1_sessions_identity_expiry_idx ON guest_v1_sessions(used_until, issued_expires_at) WHERE token_hash IS NOT NULL;

CREATE TABLE guest_v1_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES guest_v1_sessions(id) ON DELETE RESTRICT,
  intent uuid NOT NULL,
  fingerprint varchar(128) NOT NULL,
  state varchar(30) NOT NULL CHECK (state IN ('RESERVED', 'DISPATCH_AUTHORIZED', 'SUCCEEDED', 'FAILED_TERMINAL', 'UNKNOWN', 'CANCELLED')),
  policy jsonb NOT NULL CHECK (jsonb_typeof(policy) = 'object'),
  input_payload jsonb,
  result_payload jsonb,
  deleted_at timestamptz,
  content_expires_at timestamptz NOT NULL,
  authorized_at timestamptz,
  executor uuid NOT NULL,
  terminal boolean NOT NULL DEFAULT false,
  usage_observation jsonb,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(session_id, intent),
  CHECK (deleted_at IS NULL OR (input_payload IS NULL AND result_payload IS NULL)),
  CHECK ((state IN ('RESERVED', 'CANCELLED') AND authorized_at IS NULL)
    OR (state IN ('DISPATCH_AUTHORIZED', 'SUCCEEDED', 'FAILED_TERMINAL', 'UNKNOWN') AND authorized_at IS NOT NULL)),
  CHECK (terminal = (state IN ('SUCCEEDED', 'FAILED_TERMINAL')))
);
CREATE UNIQUE INDEX guest_v1_runs_one_attempt_idx ON guest_v1_runs(session_id) WHERE state <> 'CANCELLED';
CREATE INDEX guest_v1_runs_expiry_idx ON guest_v1_runs(content_expires_at);

-- Accounting survives payload erasure and credential expiry. Authorized maximum
-- money/count remain occupied even on success. Only terminal proof releases a slot.
CREATE TABLE guest_v1_receipts (
  run_id uuid PRIMARY KEY REFERENCES guest_v1_runs(id) ON DELETE RESTRICT,
  budget_scope varchar(30) NOT NULL REFERENCES guest_v1_budget(scope) ON DELETE RESTRICT,
  max_cost_micros bigint NOT NULL CHECK (max_cost_micros > 0),
  authorized boolean NOT NULL DEFAULT false,
  cancelled boolean NOT NULL DEFAULT false,
  slot_released boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (NOT (authorized AND cancelled)),
  CHECK (NOT cancelled OR slot_released)
);

ALTER TABLE guest_v1_budget ENABLE ROW LEVEL SECURITY;
ALTER TABLE guest_v1_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE guest_v1_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE guest_v1_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON guest_v1_budget, guest_v1_sessions, guest_v1_runs, guest_v1_receipts FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON guest_v1_budget, guest_v1_sessions, guest_v1_runs, guest_v1_receipts FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON guest_v1_budget, guest_v1_sessions, guest_v1_runs, guest_v1_receipts FROM authenticated;
  END IF;
END $$;
-- Backend-managed only: deliberately no client RLS policies.
