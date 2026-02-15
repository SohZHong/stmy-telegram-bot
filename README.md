# stmy-telegram-bot

Telegram onboarding bot for Superteam MY. Automatically mutes new members until they introduce themselves in the designated forum topic.

## How it works

1. A user joins the main group
2. The bot mutes them and sends a welcome message with an intro guide
3. The user posts an introduction in the intro forum topic
4. The bot detects the message, unmutes them in the main group, and confirms

Admins can customize the welcome message and intro guide via bot commands.

## Project structure

```
src/
  config.ts              # Environment variable loading & validation
  index.ts               # Bot entrypoint — registers handlers, runs migrations, starts bot
  db/
    database.ts          # PostgreSQL connection pool and close()
    migrate.ts           # Programmatic migration runner (also works standalone)
    migrations/          # Ordered SQL migrations run by node-pg-migrate
  models/
    member.ts            # Member interface and DB queries (upsert, get, mark intro)
    settings.ts          # Setting interface and DB queries (get, set)
  handlers/
    newMember.ts         # Listens for new_chat_members — mutes & sends welcome
    introCheck.ts        # Listens for messages in intro topic — unmutes on intro
    admin.ts             # Admin commands (/setwelcome, /setintroguide, etc.)
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

### Adding a column to an existing table

1. Create a migration: `npm run migrate:create -- add-column-to-members`
2. Update the corresponding interface in `src/models/`
3. Add/update query functions as needed

## Admin commands

| Command | Description |
|---|---|
| `/setwelcome <message>` | Set the welcome message. Use `{name}` as a placeholder. |
| `/setintroguide <message>` | Set the intro guide text |
| `/viewwelcome` | View the current welcome message |
| `/viewintroguide` | View the current intro guide |

Only group admins can use these commands.

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
