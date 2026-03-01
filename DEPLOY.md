# Production Deployment

## Docker Compose (recommended)

The project includes a `docker-compose.yml` with two services: `db` (PostgreSQL) and `bot`.

### 1. Configure environment

```bash
cp .env.example .env
```

Fill in all required values (see [README.md](README.md#environment-variables) for the full list). The `DATABASE_URL` is overridden by `docker-compose.yml` to point at the `db` container, so you only need it set correctly for local development.

### 2. Deploy

```bash
docker-compose up -d
```

This will:
1. Start PostgreSQL with a healthcheck
2. Build the bot image (multi-stage: compile TypeScript, then copy `dist/` to a slim runtime image)
3. Wait for PostgreSQL to be healthy, then start the bot
4. Run migrations automatically on startup

### 3. View logs

```bash
docker-compose logs -f bot
```

### 4. Update after code changes

```bash
docker-compose up -d --build bot
```

### 5. Stop

```bash
docker-compose down
```

Add `-v` to also remove the database volume (destroys all data):

```bash
docker-compose down -v
```

## Manual deployment (without Docker)

### 1. Build

```bash
npm install
npm run build
```

This compiles TypeScript to the `dist/` directory.

### 2. Run

```bash
npm start
```

Or directly:

```bash
node dist/index.js
```

Migrations run automatically on startup. Ensure `DATABASE_URL` points to an accessible PostgreSQL instance.

### 3. Process manager

For production, use a process manager like [PM2](https://pm2.io/) to keep the bot running:

```bash
npm install -g pm2
pm2 start dist/index.js --name stmy-bot
pm2 save
pm2 startup
```

## Architecture notes

- **Single instance only** — Telegram's long-polling API only allows one active connection per bot token. Running multiple instances will cause `409 Conflict` errors. Do not scale horizontally.
- **Graceful shutdown** — The bot handles `SIGINT` and `SIGTERM` to stop polling and close the database pool cleanly. Docker Compose sends `SIGTERM` on `docker-compose stop`.
- **Migrations** — Run automatically on every startup via `node-pg-migrate`. Already-applied migrations are skipped. Never edit a migration that has already been deployed; create a new one instead.
- **No external state** — All persistent state is in PostgreSQL. In-memory state (admin menu state, report flow state) is ephemeral and reset on restart. Users will need to re-enter any in-progress flows after a bot restart.

## Database

The `docker-compose.yml` provisions a PostgreSQL 16 container with:
- User: `bot`
- Password: `bot`
- Database: `stmy_bot`
- Data persisted in a Docker volume (`pgdata`)

For production, consider:
- Changing the default password
- Using a managed PostgreSQL service
- Setting up automated backups

### Backup and restore

```bash
# Backup
docker-compose exec db pg_dump -U bot stmy_bot > backup.sql

# Restore
docker-compose exec -T db psql -U bot stmy_bot < backup.sql
```

## Updating the bot

1. Pull the latest code
2. Rebuild and restart:
   ```bash
   docker-compose up -d --build bot
   ```
3. New migrations will run automatically on startup
