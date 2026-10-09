-- Staged only. Configure DATABASE_URL and apply before enabling Payments API traffic.
CREATE TABLE IF NOT EXISTS payments_security_rate_limits(key TEXT PRIMARY KEY,count INTEGER NOT NULL CHECK(count>0),reset_at TIMESTAMPTZ NOT NULL);
CREATE INDEX IF NOT EXISTS payments_security_rate_limits_expiry ON payments_security_rate_limits(reset_at);
