/**
 * Quickstart: set BOT_TOKEN, optional BOT_MODE (polling | webhook), PORT, WEBHOOK_PATH.
 * Run: npx tsx examples/quickstart-token.ts
 */

import { Bot } from 'pipegraf';
import { createTelegramAdapter } from 'pipegraf/adapters/telegram';

const token = process.env.BOT_TOKEN;
if (!token) throw new Error('BOT_TOKEN is required');

const mode = process.env.BOT_MODE ?? 'polling';
const port = Number(process.env.PORT) || 3000;
const path = process.env.WEBHOOK_PATH ?? '/webhook';

const adapter = createTelegramAdapter({ token });
const bot = new Bot({ adapter });
bot.command('start', (ctx) => ctx.reply('Hello'));
bot.action('ok', (ctx) => ctx.reply('OK'));

if (mode === 'webhook') {
  const { controller } = adapter.createWebhookController(bot);
  controller.start({ port, path });
  console.log(`Webhook listening on port ${port}, path ${path}`);
} else {
  await bot.launch({ polling: {} });
  console.log('Polling started.');
}
