# stmy-telegram-bot

Telegram onboarding bot for Superteam MY. Automatically mutes new members until they introduce themselves in the designated forum topic.

## How it works

1. A user joins the main group
2. The bot deletes the service message, **mutes** the user, and posts a welcome message with a "Start Introduction" button in the **Welcome topic**
3. The user clicks the button, which opens a DM with the bot via deep link (`t.me/{bot}?start=intro`)
4. The bot sends the welcome message + intro guide and asks the user to type their introduction
5. The user types their intro in the DM
6. The bot posts the formatted introduction in the **Introduction topic** on their behalf, marks them as introduced, and **unmutes** them
7. The user can now post freely in all group topics

Mute/unmute is handled by `src/permissions.ts` via Telegram's `restrictChatMember` API. The messageGuard acts as a secondary layer, deleting messages from non-introduced users and sending a rate-limited DM reminder. To allow non-introduced users to chat in specific topics (e.g. Welcome, Introduction), configure those topics as open in Telegram's group admin settings.

Admins can customize the welcome message and intro guide via bot commands.

## Project structure

```
src/
  config.ts              # Environment variable loading & validation
  errors.ts              # Startup error handling with known-error matching
  permissions.ts         # Centralized mute/unmute via Telegram restrictChatMember
  index.ts               # Bot entrypoint — registers handlers, runs migrations, starts bot
  db/
    database.ts          # PostgreSQL connection pool and close()
    migrate.ts           # Programmatic migration runner (also works standalone)
    migrations/          # Ordered SQL migrations run by node-pg-migrate
  models/
    member.ts            # Member interface and DB queries (upsert, get, mark intro)
    settings.ts          # Setting interface and DB queries (get, set)
  handlers/
    newMember.ts         # Listens for new_chat_members — posts welcome button in Welcome topic
    introFlow.ts         # DM-based intro collection (/start intro deep link → collects text → posts to Introduction topic)
    messageGuard.ts      # Deletes messages from non-introduced users, sends DM reminder
    admin/
      index.ts           # Re-exports setupCommands, setupMenu, isAdmin, isAdminById
      auth.ts            # isAdmin, isAdminById helpers
      commands.ts        # Group chat commands (/setintroguide, /viewintroguide)
      shared.ts          # Shared types (AdminAction, CbCtx, TextCtx), state map, and helpers
      menu.ts            # DM admin menu orchestrator — /start admin entry, callback + text routers
      sections/
        members.ts       # Members list, search, approve
        ban.ts           # Ban / kick flow
        welcomeMessages.ts # Welcome message CRUD
        introGuide.ts    # Intro guide view / edit
        stats.ts         # Stats overview
```

**Key conventions:**

- `models/` — Each file owns one DB table: its TypeScript interface and all query functions for that entity
- `handlers/` — Telegram-specific orchestration only; import business logic from `models/`
- `db/migrations/` — Numbered migration files executed in order; never modify a migration after it's been deployed

## Setup

### Prerequisites

- Node.js 20+
- PostgreSQL 16+ (or Docker)

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Fill in your `.env`:

| Variable | Description |
|---|---|
| `BOT_TOKEN` | Telegram bot token from [@BotFather](https://t.me/BotFather) |
| `MAIN_GROUP_ID` | Telegram chat ID of the main supergroup |
| `INTRO_TOPIC_ID` | Forum topic thread ID for introductions (not a chat ID — just the thread number) |
| `WELCOME_TOPIC_ID` | Forum topic thread ID for welcome messages (where the "Start Introduction" button is posted) |
| `DATABASE_URL` | PostgreSQL connection string |

### 3. Start the database

```bash
docker-compose up -d db
```

### 4. Run in development

```bash
npm run dev
```

Migrations run automatically on startup. The bot will hot-reload on file changes.

## Database migrations

Migrations are managed by [node-pg-migrate](https://github.com/salsita/node-pg-migrate) and run automatically when the bot starts. You can also run them manually:

```bash
npm run migrate
```

### Creating a new migration

```bash
npm run migrate:create -- my-migration-name
```

This creates a new timestamped file in `src/db/migrations/`. Edit the generated file to add your `up` and `down` functions:

```typescript
import type { MigrationBuilder } from 'node-pg-migrate' with { "resolution-mode": "import" };

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.addColumns('members', {
    bio: { type: 'text' },
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropColumns('members', ['bio']);
}
```

## Error handling

Startup errors are handled in `src/errors.ts` via a `knownErrors` array. Each entry matches a specific error and provides a human-readable message. To add a new known error:

```typescript
// src/errors.ts — add to the knownErrors array
{
  match: (err) => /* your condition */,
  message: "What went wrong and how to fix it.",
},
```

Unrecognized errors fall through and log the full error object.

### Common errors

| Error | Cause | Fix |
|---|---|---|
| `409 Conflict: terminated by other getUpdates request` | Two bot instances running simultaneously (e.g. Docker + local dev) | Stop one instance: `docker compose stop bot` or kill the local process |

## Adding a new feature

### Adding a new DB entity

1. Create a migration: `npm run migrate:create -- add-my-table`
2. Create `src/models/myEntity.ts` with the interface and query functions
3. Import from the model in your handler

### Adding a new handler

1. Create `src/handlers/myHandler.ts` with a `setup(bot: Telegraf)` function
2. Register it in `src/index.ts`:
   ```typescript
   import { setup as setupMyHandler } from './handlers/myHandler.js';
   setupMyHandler(bot);
   ```

### Adding a new admin menu section

1. Create `src/handlers/admin/sections/mySection.ts` exporting:
   ```typescript
   export async function handleCallback(ctx: CbCtx, data: string, userId: number): Promise<boolean>
   // Optional — only needed if the section collects text input:
   export async function handleText(ctx: TextCtx, text: string, state: AdminAction, userId: number): Promise<boolean>
   ```
   Return `true` if handled, `false` to pass to the next section.
2. Add it to the `sections` array in `src/handlers/admin/menu.ts`
3. Add a button for it in `mainMenuKeyboard()` in the same file

### Adding a column to an existing table

1. Create a migration: `npm run migrate:create -- add-column-to-members`
2. Update the corresponding interface in `src/models/`
3. Add/update query functions as needed

## Admin interface

### Group chat commands

| Command | Description |
|---|---|
| `/setintroguide <message>` | Set the intro guide text |
| `/viewintroguide` | View the current intro guide |

Only group admins can use these commands.

### DM admin menu

Open via the deep link `t.me/{bot}?start=admin` (group admins only). Provides an inline-button menu for:

- **Members** — list pending, search, approve (mark intro done + unmute)
- **Ban / Kick** — search for a member, then ban (with message wipe) or kick
- **Welcome Messages** — list, add, edit, delete welcome message templates
- **Intro Guide** — view and edit the intro guide
- **Stats** — member counts, intro completion stats, welcome message count

## Production

### Build and run

```bash
npm run build
npm start
```

### Docker

```bash
docker-compose up -d
```

The `db` service includes a healthcheck — the bot container waits for PostgreSQL to be ready before starting.

## Scripts

| Script | Description |
|---|---|
| `npm run dev` | Start with hot-reload (tsx) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run compiled output |
| `npm run migrate` | Run migrations manually |
| `npm run migrate:create -- <name>` | Scaffold a new migration file |
