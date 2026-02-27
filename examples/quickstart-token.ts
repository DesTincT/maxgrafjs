/**
 * Quickstart: BOT_TOKEN required. Optional: BOT_MODE, PORT, WEBHOOK_PATH, WEBHOOK_URL, WEBHOOK_SECRET, WEBHOOK_TOKEN.
 * If BOT_MODE=webhook and WEBHOOK_URL is set, webhook is registered on startup.
 *
 * Polling:  BOT_TOKEN=... npx tsx examples/quickstart-token.ts
 * Webhook:  BOT_TOKEN=... BOT_MODE=webhook PORT=3000 npx tsx examples/quickstart-token.ts
 * Register: BOT_TOKEN=... BOT_MODE=webhook WEBHOOK_URL=https://your-domain.com/webhook npx tsx examples/quickstart-token.ts
 */

import { Bot } from 'pipegraf';
import { createProductionAdapter } from 'pipegraf/adapters/production';

const token = process.env.BOT_TOKEN;
if (!token) throw new Error('BOT_TOKEN is required');

const mode = process.env.BOT_MODE ?? 'polling';
const port = Number(process.env.PORT) || 3000;
const path = process.env.WEBHOOK_PATH ?? '/webhook';
const webhookUrl = process.env.WEBHOOK_URL;
const webhookSecret = process.env.WEBHOOK_SECRET ?? process.env.WEBHOOK_TOKEN;

const adapter = createProductionAdapter({ token });
const bot = new Bot({ adapter });
bot.command('start', (ctx) => ctx.reply('Hello'));
bot.action('ok', (ctx) => ctx.reply('OK'));

if (mode === 'webhook') {
  const { controller } = adapter.createWebhookController(bot);
  controller.start({ port, path });
  console.log(`Webhook listening on port ${port}, path ${path}`);
  if (webhookUrl) {
    await adapter.registerWebhook({
      url: webhookUrl,
      ...(webhookSecret ? { secret: webhookSecret } : {}),
    });
    console.log('Webhook registered');
  }
} else {
  await bot.launch({ polling: {} });
  console.log('Polling started.');
}
