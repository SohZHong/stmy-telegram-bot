import { Telegraf } from "telegraf";
import { config } from "./config";
import { close } from "./db/database";
import { runMigrations } from "./db/migrate";
import { handleStartupError } from "./errors";
import { setup as setupAdmin } from "./handlers/admin";
import { setup as setupIntroFlow } from "./handlers/introFlow";
import { setup as setupMessageGuard } from "./handlers/messageGuard";
import { setup as setupNewMember } from "./handlers/newMember";

const bot = new Telegraf(config.botToken);

// Handle admin commands
setupAdmin(bot);
// Handles DM-based intro collection (private chats)
setupIntroFlow(bot);
// Handles join events (posts welcome button)
setupNewMember(bot);
// Blocks non-introduced users in group
setupMessageGuard(bot);

async function start(): Promise<void> {
  await runMigrations(config.databaseUrl);
  console.log("Migrations complete");

  await bot.launch();
  console.log("Bot started");
}

function shutdown(signal: string): void {
  console.log(`${signal} received, shutting down...`);
  bot.stop(signal);
  close().then(() => process.exit(0));
}

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));

start().catch(handleStartupError);
