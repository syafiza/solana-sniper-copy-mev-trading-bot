// src/db.rs
use anyhow::{Result, Context};
use deadpool_postgres::{Config, ManagerConfig, Pool, RecyclingMethod, Runtime};
use tokio_postgres::NoTls;
use postgres_types::{FromSql, ToSql};
use serde::{Serialize, Deserialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct WalletEntry {
    pub id: Option<i32>, // SQL Serial ID
    pub telegram_id: i64,
    pub name: String,
    pub address: String,
    pub private_key_enc: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UserRecord {
    pub telegram_id: i64,
    pub is_whitelisted: bool,
    pub wallets: Vec<WalletEntry>,
    pub trading_wallet_id: Option<i32>,
    pub min_tokens_to_buy: Option<f64>,
    pub slippage_pct: Option<f64>,
    pub tip_amount: Option<i64>,
}

pub struct Database {
    pool: Pool,
}

impl Database {
    pub async fn new(postgres_config: &str, _db_name: &str) -> Result<Self> {
        // Parse config string like "host=localhost user=postgres password=pass dbname=solana_bot"
        let mut cfg = Config::new();
        for kv in postgres_config.split_whitespace() {
            let parts: Vec<&str> = kv.split('=').collect();
            if parts.len() == 2 {
                match parts[0] {
                    "host" => cfg.host = Some(parts[1].to_string()),
                    "user" => cfg.user = Some(parts[1].to_string()),
                    "password" => cfg.password = Some(parts[1].to_string()),
                    "dbname" => cfg.dbname = Some(parts[1].to_string()),
                     _ => {}
                }
            }
        }
        cfg.manager = Some(ManagerConfig { recycling_method: RecyclingMethod::Fast });
        
        let pool = cfg.create_pool(Some(Runtime::Tokio1), NoTls)
            .context("Failed to create Postgres pool")?;
            
        Ok(Self { pool })
    }

    pub async fn get_or_create_user(&self, telegram_id: i64) -> Result<UserRecord> {
        let client = self.pool.get().await?;
        
        // Upsert user
        let row = client.query_one(
            "INSERT INTO users (telegram_id) VALUES ($1) 
             ON CONFLICT (telegram_id) DO UPDATE SET telegram_id = EXCLUDED.telegram_id 
             RETURNING telegram_id, is_whitelisted, trading_wallet_id, min_tokens_to_buy, slippage_pct, tip_amount",
            &[&telegram_id]
        ).await?;

        // Fetch wallets
        let wallets_rows = client.query(
            "SELECT id, name, address, private_key_enc FROM wallets WHERE telegram_id = $1",
            &[&telegram_id]
        ).await?;

        let wallets = wallets_rows.iter().map(|r| WalletEntry {
            id: Some(r.get(0)),
            telegram_id,
            name: r.get(1),
            address: r.get(2),
            private_key_enc: r.get(3),
        }).collect();

        Ok(UserRecord {
            telegram_id: row.get(0),
            is_whitelisted: row.get(1),
            wallets,
            trading_wallet_id: row.get(2),
            min_tokens_to_buy: row.get(3),
            slippage_pct: row.get(4),
            tip_amount: row.get(5),
        })
    }

    pub async fn is_whitelisted(&self, telegram_id: i64) -> Result<bool> {
        let client = self.pool.get().await?;
        let row = client.query_opt("SELECT is_whitelisted FROM users WHERE telegram_id = $1", &[&telegram_id]).await?;
        if let Some(r) = row {
            Ok(r.get(0))
        } else {
            Ok(false)
        }
    }

    pub async fn add_wallet(&self, telegram_id: i64, name: String, address: String, private_enc: String) -> Result<WalletEntry> {
        let client = self.pool.get().await?;
        
        // Count existing (enforce limit 5)
        let count: i64 = client.query_one("SELECT COUNT(*) FROM wallets WHERE telegram_id = $1", &[&telegram_id]).await?.get(0);
        if count >= 5 {
            anyhow::bail!("wallet limit reached (5)");
        }

        let row = client.query_one(
            "INSERT INTO wallets (telegram_id, name, address, private_key_enc) VALUES ($1, $2, $3, $4) RETURNING id",
            &[&telegram_id, &name, &address, &private_enc]
        ).await?;

        Ok(WalletEntry {
            id: Some(row.get(0)),
            telegram_id,
            name,
            address,
            private_key_enc,
        })
    }

    pub async fn list_wallets(&self, telegram_id: i64) -> Result<Vec<WalletEntry>> {
        let client = self.pool.get().await?;
        let rows = client.query(
            "SELECT id, name, address, private_key_enc FROM wallets WHERE telegram_id = $1",
            &[&telegram_id]
        ).await?;

        Ok(rows.iter().map(|r| WalletEntry {
            id: Some(r.get(0)),
            telegram_id,
            name: r.get(1),
            address: r.get(2),
            private_key_enc: r.get(3),
        }).collect())
    }

    pub async fn set_trading_wallet(&self, telegram_id: i64, wallet_id: i32) -> Result<()> {
        let client = self.pool.get().await?;
        // verify ownership
        let output = client.execute(
            "UPDATE users SET trading_wallet_id = $1 WHERE telegram_id = $2 AND EXISTS (SELECT 1 FROM wallets WHERE id = $1 AND telegram_id = $2)",
            &[&wallet_id, &telegram_id]
        ).await?;
        
        if output == 0 {
             anyhow::bail!("wallet not found or not owned by user");
        }
        Ok(())
    }

    // Setting updaters
    pub async fn update_setting_min_tokens(&self, telegram_id: i64, val: f64) -> Result<()> {
        let client = self.pool.get().await?;
        client.execute("UPDATE users SET min_tokens_to_buy = $1 WHERE telegram_id = $2", &[&val, &telegram_id]).await?;
        Ok(())
    }
    
    pub async fn update_setting_slippage(&self, telegram_id: i64, val: f64) -> Result<()> {
        let client = self.pool.get().await?;
        client.execute("UPDATE users SET slippage_pct = $1 WHERE telegram_id = $2", &[&val, &telegram_id]).await?;
        Ok(())
    }

    pub async fn update_setting_tip(&self, telegram_id: i64, val: i64) -> Result<()> {
        let client = self.pool.get().await?;
        client.execute("UPDATE users SET tip_amount = $1 WHERE telegram_id = $2", &[&val, &telegram_id]).await?;
        Ok(())
    }

    pub async fn get_user(&self, telegram_id: i64) -> Result<Option<UserRecord>> {
       let client = self.pool.get().await?;
       let row_opt = client.query_opt(
            "SELECT telegram_id, is_whitelisted, trading_wallet_id, min_tokens_to_buy, slippage_pct, tip_amount FROM users WHERE telegram_id = $1",
            &[&telegram_id]
        ).await?;

        if let Some(row) = row_opt {
             let wallets_rows = client.query(
                "SELECT id, name, address, private_key_enc FROM wallets WHERE telegram_id = $1",
                &[&telegram_id]
            ).await?;
            
             let wallets = wallets_rows.iter().map(|r| WalletEntry {
                id: Some(r.get(0)),
                telegram_id,
                name: r.get(1),
                address: r.get(2),
                private_key_enc: r.get(3),
            }).collect();

            Ok(Some(UserRecord {
                telegram_id: row.get(0),
                is_whitelisted: row.get(1),
                wallets,
                trading_wallet_id: row.get(2),
                min_tokens_to_buy: row.get(3),
                slippage_pct: row.get(4),
                tip_amount: row.get(5),
            }))
        } else {
            Ok(None)
        }
    }
    
    // Whitelisted users fetcher for TradeDispatcher
    pub async fn get_whitelisted_users(&self) -> Result<Vec<i64>> {
        let client = self.pool.get().await?;
        let rows = client.query("SELECT telegram_id FROM users WHERE is_whitelisted = true", &[]).await?;
        Ok(rows.iter().map(|r| r.get(0)).collect())
    }
}
