CREATE TABLE IF NOT EXISTS pay_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id TEXT,
  sender_address TEXT NOT NULL,
  recipient_address TEXT NOT NULL,
  recipient_name TEXT,
  amount NUMERIC NOT NULL,
  token_symbol TEXT NOT NULL DEFAULT 'USDC',
  token_address TEXT NOT NULL DEFAULT '0x3600000000000000000000000000000000000000',
  chain_id BIGINT NOT NULL DEFAULT 5042002,
  network TEXT NOT NULL DEFAULT 'Arc Testnet',
  tx_hash TEXT NOT NULL UNIQUE,
  note TEXT,
  source_type TEXT NOT NULL, -- 'manual', 'qr', 'payment_link'
  status TEXT NOT NULL, -- 'pending', 'confirmed', 'failed', 'cancelled'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pay_history_sender
ON pay_history(sender_address);

CREATE INDEX IF NOT EXISTS idx_pay_history_recipient
ON pay_history(recipient_address);

CREATE INDEX IF NOT EXISTS idx_pay_history_request_id
ON pay_history(request_id);

CREATE INDEX IF NOT EXISTS idx_pay_history_created_at
ON pay_history(created_at DESC);
