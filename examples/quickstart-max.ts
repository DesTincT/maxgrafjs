/**
 * Quickstart (Max Messenger):
 * 1) Set MAX_BOT_TOKEN (bot token from Max messenger)
 * 2) Run: npx tsx examples/quickstart-max.ts
 */

import { Bot } from 'pipegraf';
import { createMaxAdapter } from 'pipegraf/adapters/max';

const token = process.env.MAX_BOT_TOKEN;
if (!token) throw new Error('MAX_BOT_TOKEN is required');

const bot = new Bot({ adapter: createMaxAdapter({ token }) });
bot.command('start', (ctx) => ctx.reply('Hello!'));
bot.on('message', (ctx) => ctx.reply('Got it.'));
await bot.launch({ polling: {} });
console.log('Bot started (Max Messenger).');
