import { Telegraf } from "telegraf";
import { config } from "./config";
import { close } from "./db/database";
import { runMigrations } from "./db/migrate";
import { handleStartupError } from "./errors";
import { setupCommands as setupAdmin, setupMenu as setupAdminMenu, ensureAdminGuide } from "./handlers/admin";
import { setup as setupReportFlow, ensureReportPost } from "./handlers/reportFlow";
import { setup as setupIntroFlow } from "./handlers/introFlow";
import { setup as setupGroupCommands } from "./handlers/groupCommands";
import { setup as setupMessageGuard } from "./handlers/messageGuard";
import { setup as setupNewMember } from "./handlers/newMember";
import { setup as setupLinkSafeguard } from "./handlers/linkSafeguard";
import { setup as setupMessageTracker } from "./handlers/messageTracker";
import { setup as setupContactQuery } from "./handlers/contactQuery";

const bot = new Telegraf(config.botToken);

// Handle admin commands (group chat, backward compat)
setupAdmin(bot);
// DM admin menu (before introFlow so /start admin is caught first)
setupAdminMenu(bot);
// DM-based report flow (before introFlow so /start report is caught first)
setupReportFlow(bot);
// Handles DM-based intro collection (private chats)
setupIntroFlow(bot);
// /setup command to discover chat/topic IDs
setupGroupCommands(bot);
// Handles join events (posts welcome button)
setupNewMember(bot);
// Blocks non-introduced users in group
setupMessageGuard(bot);
// Link safety warnings + admin notification with delete button
setupLinkSafeguard(bot);
// Track group messages for summary and activity stats
setupMessageTracker(bot);
// Auto-reply to "who to contact" questions
setupContactQuery(bot);

async function start(): Promise<void> {
  await runMigrations(config.databaseUrl);
  console.log("Migrations complete");

  await ensureAdminGuide(bot.telegram);
  await ensureReportPost(bot.telegram);

  bot.launch();
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
