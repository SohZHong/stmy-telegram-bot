# Local Development Setup

## Prerequisites

- **Node.js** 20+
- **PostgreSQL** 16+ (or Docker to run it in a container)
- A **Telegram bot token** from [@BotFather](https://t.me/BotFather)
- A **Telegram supergroup** with forum topics enabled

## 1. Clone and install

```bash
git clone <repo-url>
cd stmy-telegram-bot
npm install
```

## 2. Create your Telegram bot

1. Open [@BotFather](https://t.me/BotFather) on Telegram
2. Send `/newbot` and follow the prompts
3. Copy the bot token
4. Send `/setjoingroups` → select your bot → `Enable` (so the bot can be added to groups)
5. Send `/setprivacy` → select your bot → `Disable` (so the bot can read group messages)

## 3. Set up the Telegram group

1. Create a supergroup (or use an existing one)
2. Enable **Topics** in group settings
3. Create the following forum topics:
   - **Welcome** — where the bot posts "Start Introduction" buttons for new members
   - **Introduction** — where approved introductions are posted
   - **Announcements** (optional) — for posting announcements to the group
4. **Close** the Introduction and Announcements topics. The bot will temporarily reopen them to post, then close them again automatically. This prevents members from posting directly in these topics. The Welcome topic can be left open or closed depending on whether you want members to chat there.
5. Add your bot to the group as an **administrator** with these permissions:
   - Delete messages
   - Ban users
   - Pin messages
   - Manage topics (to open/close topics for posting)
   - Restrict members (to mute/unmute)

>[!Note]
> The bot detects admins dynamically via the Telegram API — there is no admin list to maintain. When you promote someone to admin in the group, they automatically gain access to the bot's admin commands and DM menu. Likewise, demoting them revokes access immediately.

## 4. Get the required IDs

### Group ID

Add the bot to your group, then send any message. Check the bot logs or use the Telegram Bot API:

```
https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates
```

Look for `"chat": {"id": -100XXXXXXXXXX}` — that's your `MAIN_GROUP_ID`.

### Group ID and topic IDs via browser inspect (Telegram Web)

Open [Telegram Web](https://web.telegram.org), navigate to your group, and open the browser DevTools (F12 or right-click → Inspect). Click on a topic and look at the HTML for elements like:

```html
<a class="ListItem-button" href="#-1003684599926_1" ...>
```

The format is `#<GROUP_ID>_<TOPIC_ID>`:

- **Group ID**: `-1003684599926` → use as `MAIN_GROUP_ID` (keep the `-100` prefix)
- **Topic ID**: `1` → the number after the `_` is the topic's thread ID

Repeat for each topic (Welcome, Introduction, Admin, etc.) to get all the IDs you need.

### Alternative: via Bot API

Topic IDs are the `message_thread_id` values. You can also find them by:

1. Right-clicking a topic in Telegram Desktop and copying the link — the number after the last `/` is the topic ID
2. Or sending a message in each topic and checking `getUpdates` for `message_thread_id`

## 5. Configure environment

```bash
cp .env.example .env
```

Edit `.env` with your values:

```env
BOT_TOKEN=123456:ABC-DEF...
MAIN_GROUP_ID=-1001234567890
INTRO_TOPIC_ID=7
WELCOME_TOPIC_ID=19
DATABASE_URL=postgresql://bot:bot@localhost:5432/stmy_bot

# Optional: enable posting announcements to a group topic
# ANNOUNCEMENTS_TOPIC_ID=123

# Optional: AI features (intro validation, contact auto-reply, chat summary, member queries)
# OPENAI_API_KEY=sk-...
# PIC_HANDLES=@alice, @bob
```

## 6. Start the database

Using Docker (recommended):

```bash
docker-compose up -d db
```

Or if you have PostgreSQL installed locally, create the database:

```bash
createdb stmy_bot
```

And set `DATABASE_URL` accordingly in your `.env`.

## 7. Run the bot

```bash
npm run dev
```

This starts the bot with hot-reload via `tsx --watch`. Migrations run automatically on startup.

## 8. Verify it works

1. Check the bot logs — you should see "Migrations complete", "Report button posted and pinned", and "Bot started"
2. Verify the report button is pinned in **General**
3. Open a DM with your bot on Telegram
4. Send `/start admin` — you should see the admin menu
5. In the group, use `/testjoin` (admin only) to simulate a new member join — you should see a welcome button in the Welcome topic. Or have someone actually join the group
6. If you set `OPENAI_API_KEY`, test by posting a link in the group (link safeguard warning should appear) or asking "who should I contact at superteam?" (AI auto-reply)

## Running migrations manually

Migrations are automatic on startup, but you can also run them standalone:

```bash
npm run migrate
```

To create a new migration:

```bash
npm run migrate:create -- my-migration-name
```

## Type checking

```bash
npx tsc --noEmit
```

## Troubleshooting

### Bot doesn't respond

- Check that `BOT_TOKEN` is correct
- Ensure the bot has been started (`npm run dev` is running)
- Check for `409 Conflict` errors — another bot instance may be running

### Bot can't mute/ban users

- Ensure the bot is a group **administrator** with Restrict/Ban permissions
- The bot cannot restrict other administrators

### Topic posting fails

- Verify topic IDs are correct (they're thread IDs, not chat IDs)
- Ensure the bot has permission to manage topics

### Database connection fails

- Check that PostgreSQL is running: `docker-compose ps`
- Verify `DATABASE_URL` matches your database credentials

### Migration ordering error

If you see `Not run migration ... is preceding already run migration`, the database has stale migration records from a previous schema. Reset the database:

```bash
docker compose down -v && docker compose up -d
```
