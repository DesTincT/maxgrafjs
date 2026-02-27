# Production adapter verification report

## Checklist (pass/fail + notes)

### 1) Adapter contract compliance
| Item | Status | Notes |
|------|--------|--------|
| Adapter implements Adapter + BotAdapter contracts | **PASS** | Telegram and Max both implement createContext, reply, getUpdateId, getMessageText, getCommand, getCallbackData, getChatId, getUserId; createReplyApi; createPollingController (Telegram also createWebhookController). |
| ctx.reply from command handler | **PASS** | reference adapter reply callback delegates to getReplyTargetFromUpdate + sendReply; command handler uses ctx.reply. |
| ctx.reply from action/callback handler | **PASS** | Telegram test: callback_query update → action handler → ctx.reply sends to chat_id. Max: getReplyTargetFromUpdate now supports callback_query.message.recipient/chat. |
| ctx.reply inside wizard step | **PASS** | Same reply path; wizard uses same context/adapter. |
| Dedupe uses adapter.getUpdateId | **PASS** | Polling transport uses options.dedupe.getKey/getUpdateId; adapters pass getUpdateId from normalized update_id. Callbacks use callback_id or composite key in Max. |

### 2) Reply target correctness (CRITICAL)
| Item | Status | Notes |
|------|--------|--------|
| chat_id for message updates | **PASS** | Both adapters set chat_id at top level in normalized update; getReplyTargetFromUpdate returns it. |
| chat_id for callback updates | **PASS** | Telegram: normalizeUpdate sets chat_id from callback_query.message.chat. Max: **FIXED** — normalizeMaxUpdate now extracts chat_id from callback/callback_query.message.recipient or .chat; reply-api getChatIdFromUpdate falls back to callback_query.message.recipient/chat. |
| Regression test: callback → action → ctx.reply | **PASS** | Telegram test (telegram.test.ts) already covers this. Added Max reply-api tests for getReplyTargetFromUpdate with callback_query.message.recipient and message.chat.id. |

### 3) Polling mode
| Item | Status | Notes |
|------|--------|--------|
| Respects offset | **PASS** | Generic transport uses lastUpdateId + 1; Telegram getUpdates URL uses offset; Max uses marker. |
| Stops cleanly | **PASS** | transport.stop() aborts signal and awaits loop. |
| No spam on transient non-200 | **PASS** | Telegram getUpdates returns [] when !res.ok. |
| BOT_TOKEN required and clear error on startup | **PASS** | quickstart-token throws if !token; **FIXED** — both adapters now throw "BOT_TOKEN is required" if token is missing/empty. |

### 4) Webhook mode (node:http only)
| Item | Status | Notes |
|------|--------|--------|
| PORT env (default 3000) | **PASS** | quickstart-token uses Number(process.env.PORT) \|\| 3000. |
| PATH optional (default /webhook) | **PASS** | quickstart-token uses process.env.WEBHOOK_PATH ?? '/webhook'. |
| POST JSON → handleUpdate | **PASS** | Telegram webhook server reads body, JSON.parse, normalizeUpdate, bot.handleUpdate(normalized). |
| Returns 200 quickly | **PASS** | res.writeHead(200); res.end() after handleUpdate. |
| stop() method | **PASS** | controller.stop() closes server. |
| No new runtime deps | **PASS** | node:http only (createServer). |

### 5) Quickstart file (examples/quickstart-token.ts)
| Item | Status | Notes |
|------|--------|--------|
| BOT_TOKEN from env, clear error if missing | **PASS** | if (!token) throw new Error('BOT_TOKEN is required'). |
| BOT_MODE=polling\|webhook (default polling) | **PASS** | process.env.BOT_MODE ?? 'polling'. |
| Webhook: PORT (default 3000), path (WEBHOOK_PATH, default /webhook) | **PASS** | port and path from env. |
| command /start → reply "Hello" | **PASS** | bot.command('start', (ctx) => ctx.reply('Hello')). |
| One action/callback → reply "OK" | **PASS** | bot.action('ok', (ctx) => ctx.reply('OK')). |
| No platform names in comments/text | **PASS** | Comments only mention BOT_TOKEN, BOT_MODE, PORT, WEBHOOK_PATH. |
| Imports only from public package exports | **PASS** | pipegraf, pipegraf/adapters/telegram. |
| &lt; ~40 lines | **PASS** | 32 lines (excluding block comment). |

### 6) Minimal test coverage
| Test | Status | Location |
|------|--------|----------|
| Callback update reply target present (action → ctx.reply) | **PASS** | tests/adapters/telegram.test.ts (callback_query update, action handler, ctx.reply). tests/adapters/max/reply-api.test.ts: getReplyTargetFromUpdate for callback_query.message.recipient and message.chat.id. |
| Webhook parses JSON and passes update to bot.handleUpdate | **PASS** | tests/adapters/telegram.test.ts (webhook controller POST JSON, 200); tests/webhook-transport.test.ts (http server parses POST JSON, calls handler(body), 200). |

### 7) Runnable verification (maintainers)
| Item | Status |
|------|--------|
| Polling command | See below. |
| Webhook command | See below. |
| Optional WEBHOOK_URL | Not implemented; webhook server only listens, does not register URL. |

---

## What was fixed

1. **Max adapter callback reply target**  
   - **polling.ts**: In `normalizeMaxUpdate`, added fallbacks for `chat_id` from `raw.callback.recipient`, `raw.callback.message.recipient`, `raw.callback_query.message.recipient`, and `raw.callback_query.message.chat.id` so callback-only updates have a top-level `chat_id`.  
   - **reply-api.ts**: In `getChatIdFromUpdate`, added fallback for `callback_query.message.recipient.chat_id` and `callback_query.message.chat.id` when top-level `chat_id` and `message` are absent.

2. **Token validation**  
   - **Telegram adapter**: `createTelegramAdapter` now throws `Error('BOT_TOKEN is required')` if token is missing, not a string, or empty/whitespace.  
   - **Max adapter**: Same check in `createMaxAdapter`.

3. **Quickstart**  
   - Removed platform-specific wording from comments.  
   - Added `bot.action('ok', (ctx) => ctx.reply('OK'))`.  
   - Webhook path from `process.env.WEBHOOK_PATH ?? '/webhook'`.  
   - Console messages no longer mention platform.

4. **Tests**  
   - **tests/adapters/max/reply-api.test.ts**: Two tests for `createMaxReplyApi` — callback update with `callback_query.message.recipient` and with `callback_query.message.chat.id` both yield correct `ReplyTarget`.  
   - **tests/webhook-transport.test.ts**: New test — node:http server receives POST JSON, parses body, calls `bot.webhookCallback()(body)`, responds 200; asserts `handleUpdate` received the payload.

---

## Exact local commands to run

Use `npx tsx` to run the TypeScript example (or compile to JS and use `node`).

**Polling**

```bash
BOT_TOKEN=<your_token> BOT_MODE=polling npx tsx examples/quickstart-token.ts
```

**Webhook**

```bash
BOT_TOKEN=<your_token> BOT_MODE=webhook PORT=3000 npx tsx examples/quickstart-token.ts
```

Optional path (default `/webhook`):

```bash
BOT_TOKEN=<your_token> BOT_MODE=webhook PORT=3000 WEBHOOK_PATH=/bot npx tsx examples/quickstart-token.ts
```

**Tests**

```bash
pnpm test
```

---

## Files changed

- `src/adapters/max/polling.ts` — callback reply target: extract `chat_id` from callback/callback_query when not from message.
- `src/adapters/max/reply-api.ts` — `getChatIdFromUpdate`: fallback for `callback_query.message.recipient` and `callback_query.message.chat`.
- `src/adapters/telegram/index.ts` — token validation on create.
- `src/adapters/max/index.ts` — token validation on create.
- `examples/quickstart-token.ts` — no platform names; action handler; WEBHOOK_PATH; &lt; 40 lines.
- `tests/adapters/max/reply-api.test.ts` — callback reply target tests for `createMaxReplyApi`.
- `tests/webhook-transport.test.ts` — http server POST JSON → handler → 200 test.
- `docs/PRODUCTION-ADAPTER-VERIFICATION.md` — this report.

---

## Remaining known risks

1. **Quickstart adapter**: Example uses a single adapter (from `pipegraf/adapters/telegram`). Switching to another adapter requires changing the import and ensuring that adapter supports the same launch contract (polling + webhook if used).
2. **Webhook URL registration**: The example only starts an HTTP server. Registering the webhook URL with the provider (e.g. for setWebhook) is outside this scope and must be done separately.
3. **Transient polling errors**: Telegram adapter returns `[]` on non-200 getUpdates; no backoff or logging. Acceptable for “set BOT_TOKEN and run” but may need tuning for production.
