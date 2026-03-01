# stmy-telegram-bot

Telegram onboarding and moderation bot for Superteam MY. Automatically mutes new members until they introduce themselves, and provides a full admin panel with member management, announcements, content moderation, and a user-reporting system.

## Features

- **Onboarding flow** — new members are muted until they submit an introduction via DM
- **Blocked words** — admin-managed word list that rejects introductions containing blocked content
- **Member reporting** — group members can privately report others via DM; configurable alert and auto-ban thresholds
- **Admin panel** — full DM-based inline-button menu for managing members, bans, welcome messages, intro/admin guides, announcements, reports, stats, and logs
- **Announcements** — broadcast messages to admin DMs or post to a dedicated announcements topic
- **Action logging** — all admin actions are logged and browsable with filters

## How it works

### Onboarding

1. A user joins the main group
2. The bot deletes the service message, **mutes** the user, and posts a welcome message with a "Start Introduction" button in the **Welcome topic**
3. The user clicks the button, which opens a DM with the bot via deep link (`t.me/{bot}?start=intro`)
4. The bot sends the welcome message + intro guide and asks the user to type their introduction
5. The introduction is validated (minimum length, no repeating characters, no blocked words)
6. The bot posts the formatted introduction in the **Introduction topic** on their behalf, marks them as introduced, and **unmutes** them
7. The user can now post freely in all group topics

Mute/unmute is handled by `src/permissions.ts` via Telegram's `restrictChatMember` API. The messageGuard acts as a secondary layer, deleting messages from non-introduced users and sending a rate-limited DM reminder. To allow non-introduced users to chat in specific topics (e.g. Welcome, Introduction), configure those topics as open in Telegram's group admin settings.

### Reporting

1. An admin posts a "Report a Member" button in the group via `/postreport` (posted to General topic and pinned)
2. A user clicks the button, which opens a DM with the bot via deep link (`t.me/{bot}?start=report`)
3. The bot verifies the user is a group member, then asks for the target (username, name, or ID)
4. The user selects a reason from an admin-managed list, optionally adds details, and confirms
5. The report is recorded. If the pending report count for the target reaches the **alert threshold**, admins are notified via DM. If it reaches the **auto-ban threshold**, the user is automatically banned and all their reports are marked as reviewed

Configurable settings (via the admin panel): alert threshold, auto-ban threshold, designated admin for notifications, and cooldown between repeat reports.

## Project structure

```
src/
  config.ts                # Environment variable loading & validation
  errors.ts                # Startup error handling with known-error matching
  permissions.ts           # Centralized mute/unmute via Telegram restrictChatMember
  index.ts                 # Bot entrypoint — registers handlers, runs migrations, starts bot
  db/
    database.ts            # PostgreSQL connection pool and close()
    migrate.ts             # Programmatic migration runner (also works standalone)
    migrations/            # Ordered SQL migrations run by node-pg-migrate
  models/
    member.ts              # Member queries (upsert, get, search, mark intro, stats)
    settings.ts            # Key-value settings (get, set with upsert)
    adminLog.ts            # Admin action log queries and action type definitions
    welcomeMessage.ts      # Welcome message CRUD
    blockedWord.ts         # Blocked word CRUD
    reportReason.ts        # Report reason CRUD
    report.ts              # Report queries (create, count, search, status updates)
  handlers/
    newMember.ts           # Listens for new_chat_members — posts welcome button in Welcome topic
    introFlow.ts           # DM-based intro collection (/start intro deep link)
    reportFlow.ts          # DM-based report flow (/start report deep link)
    messageGuard.ts        # Deletes messages from non-introduced users, sends DM reminder
    admin/
      index.ts             # Re-exports setupCommands, setupMenu, isAdmin, isAdminById
      auth.ts              # isAdmin, isAdminById helpers
      commands.ts          # Group chat commands (/help, /logs, /announce, /postreport, etc.)
      shared.ts            # Shared types (AdminAction, CbCtx, TextCtx), state map, helpers
      menu.ts              # DM admin menu orchestrator — /start admin entry, callback + text routers
      sections/
        members.ts         # Members list, search, approve
        ban.ts             # Ban / kick flow
        welcomeMessages.ts # Welcome message CRUD
        introGuide.ts      # Intro guide view / edit
        adminGuide.ts      # Admin guide view / edit
        stats.ts           # Stats overview
        logs.ts            # Admin action logs browser with filters
        blockedWords.ts    # Blocked word CRUD
        announcements.ts   # Announcement broadcast / topic post
        reports.ts         # Report reasons CRUD, view reports, report settings
  utils/
    format.ts              # escapeHtml, truncate
    user.ts                # resolveUser, memberLabel
```

**Key conventions:**

- `models/` — Each file owns one DB table: its TypeScript interface and all query functions for that entity
- `handlers/` — Telegram-specific orchestration only; import business logic from `models/`
- `db/migrations/` — Numbered migration files executed in order; never modify a migration after it's been deployed

## Setup

See [SETUP.md](SETUP.md) for detailed local development setup instructions.

### Quick start

```bash
npm install
cp .env.example .env   # fill in your values
docker-compose up -d db
npm run dev
```

Migrations run automatically on startup. The bot will hot-reload on file changes.

## Deployment

See [DEPLOY.md](DEPLOY.md) for production deployment instructions.

### Quick deploy (Docker)

```bash
docker-compose up -d
```

## Environment variables

| Variable                 | Required | Description                                                                                  |
| ------------------------ | -------- | -------------------------------------------------------------------------------------------- |
| `BOT_TOKEN`              | Yes      | Telegram bot token from [@BotFather](https://t.me/BotFather)                                 |
| `MAIN_GROUP_ID`          | Yes      | Telegram chat ID of the main supergroup                                                      |
| `INTRO_TOPIC_ID`         | Yes      | Forum topic thread ID for introductions                                                      |
| `WELCOME_TOPIC_ID`       | Yes      | Forum topic thread ID for welcome messages (where the "Start Introduction" button is posted) |
| `ADMIN_TOPIC_ID`         | Yes      | Forum topic thread ID for admin-related posts (e.g. admin guide)                             |
| `DATABASE_URL`           | Yes      | PostgreSQL connection string                                                                 |
| `ANNOUNCEMENTS_TOPIC_ID` | No       | Forum topic thread ID for announcements. If set, enables posting announcements to the topic  |

## Admin interface

### Group chat commands

| Command                       | Description                                                          |
| ----------------------------- | -------------------------------------------------------------------- |
| `/help`                       | List all available commands                                          |
| `/setintroguide <message>`    | Set the intro guide text                                             |
| `/viewintroguide`             | View the current intro guide                                         |
| `/logs [type] [count]`        | View recent admin action logs                                        |
| `/logs [type] [start] [end]`  | View logs by date range                                              |
| `/announce <message>`         | Broadcast announcement to all admins via DM                          |
| `/announce preview <message>` | Preview announcement (sent only to you)                              |
| `/adminguide`                 | Post and pin admin getting-started guide in the admin topic          |
| `/posthelp`                   | Post a pinnable help message to the current chat                     |
| `/postreport`                 | Post and pin a "Report a Member" button in the group's General topic |

Only group admins can use these commands.

**Log type aliases:** `approve`, `ban`, `kick`, `reset`, `add_wm`, `edit_wm`, `del_wm`, `edit_ig`, `edit_ag`, `add_bw`, `edit_bw`, `del_bw`, `announce`, `report`, `autoban_rpt`, `dismiss_rpt`, `add_rr`, `edit_rr`, `del_rr`

### DM admin menu

Open via the deep link `t.me/{bot}?start=admin` (group admins only). Provides an inline-button menu for:

- **Members** — list pending, search, approve (mark intro done + unmute)
- **Ban / Kick** — search for a member, then ban (with message wipe) or kick
- **Welcome Messages** — list, add, edit, delete welcome message templates
- **Intro Guide** — view and edit the intro guide
- **Admin Guide** — view and edit the admin getting-started guide
- **Stats** — member counts, intro completion stats
- **Blocked Words** — manage words blocked from intro submissions
- **Announcements** — broadcast to admin DMs or post to announcements topic
- **Reports** — report reasons CRUD, view/dismiss/ban reported users, configure thresholds
- **Logs** — browse admin action logs with filters and pagination
- **Help** — view available commands and menu section descriptions

### Report settings

These are stored in the `settings` table and configured via the Reports > Settings admin menu:

| Setting                    | Default | Description                                              |
| -------------------------- | ------- | -------------------------------------------------------- |
| `report_threshold_alert`   | `3`     | Pending report count that triggers admin DM notification |
| `report_threshold_autoban` | `0`     | Pending report count that triggers auto-ban (0=disabled) |
| `report_designated_admin`  | —       | Telegram ID to notify; if unset, all admins are notified |
| `report_cooldown_hours`    | `24`    | Hours before same reporter can re-report same user       |

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
import type { MigrationBuilder } from "node-pg-migrate" with {
  "resolution-mode": "import",
};

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.addColumns("members", {
    bio: { type: "text" },
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropColumns("members", ["bio"]);
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

| Error                                                  | Cause                                                              | Fix                                                                    |
| ------------------------------------------------------ | ------------------------------------------------------------------ | ---------------------------------------------------------------------- |
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
   import { setup as setupMyHandler } from "./handlers/myHandler";
   setupMyHandler(bot);
   ```

> **Important:** `bot.launch()` returns a promise that resolves when the bot **stops**, not when it starts. Any startup tasks that need to make Telegram API calls (e.g. posting or pinning a message on boot) must run **before** `bot.launch()`. Code placed after `await bot.launch()` will never execute while the bot is running.

### Adding a new admin menu section

1. Create `src/handlers/admin/sections/mySection.ts` exporting:
   ```typescript
   export async function handleCallback(
     ctx: CbCtx,
     data: string,
     userId: number,
   ): Promise<boolean>;
   // Optional — only needed if the section collects text input:
   export async function handleText(
     ctx: TextCtx,
     text: string,
     state: AdminAction,
     userId: number,
   ): Promise<boolean>;
   ```
   Return `true` if handled, `false` to pass to the next section.
2. Add it to the `sections` array in `src/handlers/admin/menu.ts`
3. Add a button for it in `mainMenuKeyboard()` in the same file

### Adding a column to an existing table

1. Create a migration: `npm run migrate:create -- add-column-to-members`
2. Update the corresponding interface in `src/models/`
3. Add/update query functions as needed

## Scripts

| Script                             | Description                   |
| ---------------------------------- | ----------------------------- |
| `npm run dev`                      | Start with hot-reload (tsx)   |
| `npm run build`                    | Compile TypeScript to `dist/` |
| `npm start`                        | Run compiled output           |
| `npm run migrate`                  | Run migrations manually       |
| `npm run migrate:create -- <name>` | Scaffold a new migration file |
