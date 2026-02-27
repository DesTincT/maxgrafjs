## Pipegraf

This project is a Node.js/TypeScript bot framework built around a deterministic middleware runtime and explicit adapters.

## What Problem It Solves

Bot applications often accumulate transport-specific logic inside business code. That makes behavior harder to reason about, test, and evolve.

This framework separates concerns:

- core runtime handles middleware, routing, sessions, scenes, and wizard flow
- adapters handle transport-specific update parsing and reply delivery

The result is minimal magic, predictable control flow, and production-friendly behavior.

## Core Concepts

### `Bot`

Runtime coordinator for middleware composition and update handling.

- deterministic middleware order
- explicit error boundary via `bot.catch(...)`
- routing helpers (`on`, `hears`, `command`, `action`)

### `Context`

Per-update execution object passed through middleware.

- exposes normalized data such as `messageText`, `callbackData`, `command`
- provides `ctx.reply(...)` delegated to the configured adapter
- stores state for `session`, `scene`, and `wizard`

### `Adapter`

Boundary between core and transport-specific update/reply behavior.

- creates normalized context from raw updates
- resolves update identifiers for deduplication
- implements reply behavior for a target transport

### `Transport`

Delivery mechanism for updates into `bot.handleUpdate(update)`.

- polling and webhook flows are supported
- transport is independent from bot logic

## Architecture Notes

- Core is **transport-agnostic**.
- Transport/platform specifics are implemented via **adapters**.
- Application logic should depend on `Bot`/`Context`, not transport payload structure.

## Minimal Example (Generic Adapter)

```ts
/**
 * Quickstart (Telegram):
 * 1) Set TELEGRAM_BOT_TOKEN (from @BotFather)
 * 2) Run: npx tsx examples/quickstart-telegram.ts
 */

import { Bot } from 'pipegraf';
import { createTelegramAdapter } from 'pipegraf/adapters/telegram';

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) throw new Error('TELEGRAM_BOT_TOKEN is required');

const bot = new Bot({ adapter: createTelegramAdapter({ token }) });
bot.command('start', (ctx) => ctx.reply('Hello!'));
bot.on('message', (ctx) => ctx.reply('Got it.'));
await bot.launch({ polling: {} });
console.log('Bot started (Telegram).');
```

## Sessions / Scenes / Wizard Overview

### Sessions

`session()` attaches per-key mutable state to `ctx.session` for cross-update workflows.

### Scenes

`createStage()` + `createScene()` provide named flow partitions with explicit enter/leave control.

### Wizard

`createWizard(name, steps)` provides step-based interaction with deterministic progression (`next`, `back`, `selectStep`).

## Runtime Characteristics

- deterministic middleware pipeline
- explicit adapter-based transport integration
- in-memory deduplication support for polling transports
- no hidden background orchestration beyond configured transport loops

## Project Status

Current API is stable enough for iterative production use, with ongoing focus on runtime clarity and explicit contracts.

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md).

## License

MIT. See [`LICENSE`](LICENSE).
