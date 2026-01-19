import TelegramBot from 'node-telegram-bot-api';
import { config } from '../config.js';
import logger from '../utils/logger.js';
import { db } from './db.js';
import notificationService from './notifications.js';

class TelegramBotService {
    constructor() {
        this.bot = null;
        this.initialized = false;
    }

    initialize() {
        if (this.initialized) return;

        if (config.notifications.telegram.botToken) {
            try {
                // Note: We use polling=true here to receive commands. 
                // notificationService uses polling=false just for sending.
                // In a real app, we should share the instance or use webhooks.
                // For now, ensuring only one polls is key.
                this.bot = new TelegramBot(config.notifications.telegram.botToken, { polling: true });

                this.setupListeners();
                this.initialized = true;
                logger.info('Telegram Command Listener initialized');
            } catch (error) {
                logger.error('Failed to init Telegram Command Listener', error);
            }
        }
    }

    setupListeners() {
        // /start
        this.bot.onText(/\/start/, async (msg) => {
            const chatId = msg.chat.id;
            try {
                await db.getOrCreateUser(chatId);
                this.bot.sendMessage(chatId,
                    "👋 Welcome to Solana Sniper Bot!\n\n" +
                    "Use /wallets to manage wallets.\n" +
                    "Use /settings to view config."
                );
            } catch (err) {
                this.bot.sendMessage(chatId, "Error initializing user.");
            }
        });

        // /wallets
        this.bot.onText(/\/wallets/, async (msg) => {
            const chatId = msg.chat.id;
            const wallets = await db.listWallets(chatId);
            if (wallets.length === 0) {
                this.bot.sendMessage(chatId, "No wallets found. Add one with:\n/addwallet <name> <pubkey> <privkey_enc>");
            } else {
                let resp = "<b>Your Wallets:</b>\n\n";
                wallets.forEach(w => {
                    resp += `ID: ${w.id} | Name: ${w.name}\nAddress: <code>${w.address}</code>\n\n`;
                });
                this.bot.sendMessage(chatId, resp, { parse_mode: "HTML" });
            }
        });

        // /addwallet <name> <address> <privkey>
        this.bot.onText(/\/addwallet (.+) (.+) (.+)/, async (msg, match) => {
            const chatId = msg.chat.id;
            const [_, name, address, priv] = match;
            try {
                // In a real app, ENCRYPT 'priv' here before sending to DB if the client sends raw keys.
                // Assuming user sends pre-encrypted or we encrypt it here.
                // For this demo, we assume the user trusted the bot or keys are testing keys.
                // Ideally: Use a local encryption utility. 

                await db.addWallet(chatId, name, address, priv); // Storing as-is for now, matching Rust's decrypt expectation
                this.bot.sendMessage(chatId, `✅ Wallet '${name}' added.`);
            } catch (err) {
                this.bot.sendMessage(chatId, `Error: ${err.message}`);
            }
        });

        // /settrading <id>
        this.bot.onText(/\/settrading (\d+)/, async (msg, match) => {
            const chatId = msg.chat.id;
            const walletId = parseInt(match[1]);
            try {
                await db.setTradingWallet(chatId, walletId);
                this.bot.sendMessage(chatId, `✅ Trading wallet set to ID ${walletId}`);
            } catch (err) {
                this.bot.sendMessage(chatId, `Error: ${err.message}`);
            }
        });

        this.bot.on('polling_error', (error) => {
            logger.error(`Telegram Polling Error: ${error.code}`);
        });
    }
}

const telegramBotService = new TelegramBotService();
export default telegramBotService;
