CREATE TABLE IF NOT EXISTS users (
    telegram_id BIGINT PRIMARY KEY,
    is_whitelisted BOOLEAN DEFAULT FALSE,
    trading_wallet_id INT,
    min_tokens_to_buy DOUBLE PRECISION DEFAULT 0.01,
    slippage_pct DOUBLE PRECISION DEFAULT 10.0,
    tip_amount BIGINT DEFAULT 1000000,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS wallets (
    id SERIAL PRIMARY KEY,
    telegram_id BIGINT REFERENCES users(telegram_id),
    name VARCHAR(50),
    address VARCHAR(44) NOT NULL,
    private_key_enc TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_user_wallet UNIQUE (telegram_id, address)
);

-- Index for faster wallet lookups by user
CREATE INDEX IF NOT EXISTS idx_wallets_telegram_id ON wallets(telegram_id);
