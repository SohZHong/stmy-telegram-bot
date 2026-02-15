import { Telegraf } from 'telegraf';
import { config } from './config';
import { close, initDb } from './db/database';
import { setup as setupAdmin } from './handlers/admin';
import { setup as setupIntroCheck } from './handlers/introCheck';
import { setup as setupNewMember } from './handlers/newMember';

const bot = new Telegraf(config.botToken);

// Register command handlers first (so commands in intro group don't trigger intro check)
setupAdmin(bot);
setupNewMember(bot);
setupIntroCheck(bot);

async function start(): Promise<void> {
  await initDb();
  console.log('Database initialized');

  await bot.launch();
  console.log('Bot started');
}

function shutdown(signal: string): void {
  console.log(`${signal} received, shutting down...`);
  bot.stop(signal);
  close().then(() => process.exit(0));
}

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));

start().catch((err) => {
  console.error('Failed to start bot:', err);
  process.exit(1);
});
