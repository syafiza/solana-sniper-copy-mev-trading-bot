use crate::common::utils::{AppState, SwapInput, SwapConfig, SwapDirection, SwapExecutionMode};
use crate::engine::swap::pump_swap;
use crate::db::Database;
use shared_state::{BuyOrder, SellOrder, BOUGHT_TOKENS};
use solana_sdk::pubkey::Pubkey;
use solana_sdk::signature::Keypair;
use std::sync::{Arc, atomic::{AtomicUsize, Ordering}};
use tokio::sync::Mutex;
use anyhow::{Result, anyhow};
use log::{info, error};

// TODO: Replace with real AES-GCM decryption using MASTER_KEY env var
fn decrypt_keypair(encrypted: &str) -> Result<Keypair> {
    // SECURITY WARNING: This is a placeholder. 
    // In production, use the MASTER_KEY to decrypt.
    // For now, we assume the 'encrypted' string is just the base58 private key for testing simplicity.
    // To enable real encryption, add 'aes-gcm' to Cargo.toml.
    
    Keypair::from_base58_string(encrypted)
    // Err(anyhow!("Decryption not implemented. Ensure PRIVATE_KEY is stored as base58 for now."))
    Ok(Keypair::from_base58_string(encrypted))
}

pub struct TradeDispatcher {
    db: Database,
    // bot: AutoSend<Bot>, // Removed Bot dependency for now to simplify compilation - can re-add later
    user_ids: Vec<i64>,
    next_idx: AtomicUsize,
}

impl TradeDispatcher {
    pub async fn new(db: Database) -> Self {
        // Fetch whitelisted users
        let ids = match db.users
            .find(mongodb::bson::doc! { "is_whitelisted": true }, None)
            .await 
        {
            Ok(cursor) => {
                use futures::StreamExt;
                cursor.map(|r| r.unwrap().telegram_id).collect().await
            },
            Err(_) => Vec::new(),
        };

        TradeDispatcher { 
            db, 
            // bot, 
            user_ids: ids, 
            next_idx: AtomicUsize::new(0) 
        }
    }

    fn pop_next_user(&self) -> Option<i64> {
        if self.user_ids.is_empty() { return None; }
        let len = self.user_ids.len();
        let i = self.next_idx.fetch_add(1, Ordering::Relaxed) % len;
        Some(self.user_ids[i])
    }

    pub async fn dispatch_buy(&self, buy: BuyOrder, app_state: AppState) {
        let telegram_id = match self.pop_next_user() {
            Some(id) => id,
            None => {
                error!("No whitelisted users found for buy dispatch");
                return;
            }
        };

        let user_opt = self.db.get_user(telegram_id).await.unwrap_or(None);
        if let Some(user) = user_opt {
             if let Some(wallet_id) = user.trading_wallet_id {
                if let Some(wallet_entry) = user.wallets.iter().find(|w| w.id == wallet_id) {
                    if let Ok(keypair) = decrypt_keypair(&wallet_entry.private_key_enc) {
                        
                        let amount = user.min_tokens_to_buy.unwrap_or(100_000.0) as u64; // Default amount
                        
                        let input = SwapInput {
                            input_token_mint: solana_sdk::pubkey::Pubkey::default(), // SOL
                            output_token_mint: Pubkey::new_from_array([0; 32]), // Placeholder, need from string
                            slippage_bps: (user.slippage_pct.unwrap_or(1.0) * 100.0) as u16,
                            amount,
                            mode: SwapExecutionMode::ExactIn,
                            market: None,
                            creator_vault: None, // Need to fetch or pass this
                        };

                        // Clone state and replace wallet with user's wallet
                        let user_state = AppState {
                            rpc_client: app_state.rpc_client.clone(),
                            rpc_nonblocking_client: app_state.rpc_nonblocking_client.clone(),
                            wallet: Arc::new(keypair),
                        };
                        
                        // Parse mint string to Pubkey
                        let mint_pubkey = match Pubkey::try_from(buy.mint.as_str()) {
                            Ok(p) => p,
                            Err(_) => return,
                        };
                        
                        // Re-construct input with correct mint
                        let mut final_input = input;
                        final_input.output_token_mint = mint_pubkey;

                        // Execute Swap
                        match pump_swap(
                            user_state,
                            final_input,
                            "buy",
                            buy.use_jito,
                            buy.urgent
                        ).await {
                             Ok(sigs) => info!("✅ User {} bought {}: {:?}", telegram_id, buy.mint, sigs),
                             Err(e) => error!("❌ User {} buy failed: {}", telegram_id, e),
                        }
                    }
                }
             }
        }
    }

    pub async fn dispatch_sell(&self, sell: SellOrder, app_state: AppState) {
         // Logic to find who owns the token would go here
         // For now, simplistic implementation
    }
}
