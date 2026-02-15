import { Telegraf } from "telegraf";
import { config } from "./config";
import { close } from "./db/database";
import { runMigrations } from "./db/migrate";
import { setup as setupAdmin } from "./handlers/admin";
import { setup as setupIntroFlow } from "./handlers/introFlow";
import { setup as setupMessageGuard } from "./handlers/messageGuard";
import { setup as setupNewMember } from "./handlers/newMember";

const bot = new Telegraf(config.botToken);

// Registration order matters:
// 1. Admin commands first (always available)
// 2. IntroFlow handles DM-based intro collection (private chats)
// 3. NewMember handles join events (posts welcome button)
// 4. MessageGuard blocks non-introduced users in group
setupAdmin(bot);
setupIntroFlow(bot);
setupNewMember(bot);
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

start().catch((err) => {
  console.error("Failed to start bot:", err);
  process.exit(1);
});
