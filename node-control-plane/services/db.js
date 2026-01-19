import pg from 'pg';
const { Pool } = pg;
import { config } from '../config.js';
import logger from '../utils/logger.js';

// Initialize pool using environment variables or config
const pool = new Pool({
  connectionString: process.env.POSTGRES_URI || 'postgresql://postgres:password@localhost:5432/solana_bot',
});

pool.on('error', (err) => {
  logger.error('Unexpected error on idle client', err);
});

export const db = {
  // User Management
  async getOrCreateUser(telegramId) {
    try {
      const res = await pool.query(
        `INSERT INTO users (telegram_id) VALUES ($1) 
         ON CONFLICT (telegram_id) DO UPDATE SET telegram_id = EXCLUDED.telegram_id 
         RETURNING *`,
        [telegramId]
      );
      return res.rows[0];
    } catch (err) {
      logger.error('Error creating user', err);
      throw err;
    }
  },

  async getUser(telegramId) {
    try {
      const res = await pool.query('SELECT * FROM users WHERE telegram_id = $1', [telegramId]);
      return res.rows[0];
    } catch (err) {
      logger.error('Error fetching user', err);
      throw err;
    }
  },

  // Wallet Management
  async addWallet(telegramId, name, address, privateKeyEnc) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // Check limit
      const countRes = await client.query('SELECT COUNT(*) FROM wallets WHERE telegram_id = $1', [telegramId]);
      if (parseInt(countRes.rows[0].count) >= 5) {
        throw new Error('Wallet limit reached (5)');
      }

      const res = await client.query(
        'INSERT INTO wallets (telegram_id, name, address, private_key_enc) VALUES ($1, $2, $3, $4) RETURNING *',
        [telegramId, name, address, privateKeyEnc]
      );
      
      await client.query('COMMIT');
      return res.rows[0];
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  async listWallets(telegramId) {
    try {
      const res = await pool.query('SELECT * FROM wallets WHERE telegram_id = $1', [telegramId]);
      return res.rows;
    } catch (err) {
      logger.error('Error listing wallets', err);
      throw err;
    }
  },

  async setTradingWallet(telegramId, walletId) {
    try {
      // Verify ownership
      const res = await pool.query(
        'UPDATE users SET trading_wallet_id = $1 WHERE telegram_id = $2 AND EXISTS (SELECT 1 FROM wallets WHERE id = $1 AND telegram_id = $2)',
        [walletId, telegramId]
      );
      if (res.rowCount === 0) {
        throw new Error('Wallet not found or not owned by user');
      }
    } catch (err) {
      logger.error('Error setting trading wallet', err);
      throw err;
    }
  },

  // Settings
  async updateSetting(telegramId, setting, value) {
    const allowedSettings = ['min_tokens_to_buy', 'slippage_pct', 'tip_amount'];
    if (!allowedSettings.includes(setting)) {
       throw new Error('Invalid setting');
    }
    
    try {
      await pool.query(`UPDATE users SET ${setting} = $1 WHERE telegram_id = $2`, [value, telegramId]);
    } catch (err) {
      logger.error(`Error updating ${setting}`, err);
      throw err;
    }
  }
};
