import { Telegraf } from "telegraf";
import { isAdmin } from "./auth";
import { ACTION_ALIASES, ADMIN_HELP_BODY, formatAction } from "./shared";
import { getSetting, setSetting } from "../../models/settings";
import {
  createAdminLog,
  getRecentLogs,
  getLogsByDateRange,
} from "../../models/adminLog";
import type { AdminLogAction, AdminLog } from "../../models/adminLog";

const HELP_TEXT = [
  "<b>Superteam MY Bot</b>",
  "",
  "<b>General</b>",
  "/help  —  Show this message",
  "",
  "<b>Admin only</b>",
  "/setintroguide <code>&lt;msg&gt;</code>  —  Set the intro guide",
  "/viewintroguide  —  View the current intro guide",
  "/logs <code>[type] [count]</code>  —  View recent admin logs",
  "/logs <code>[type] [start] [end]</code>  —  View logs by date range",
  "/posthelp  —  Post a pinnable help message to the current chat",
  "",
  "<b>Admin menu (DM only)</b>",
  "Send <code>/start admin</code> to the bot in DM to open the admin panel.",
  "Manage members, bans, welcome messages, intro guide, stats, and logs.",
].join("\n");

const POSTHELP_TEXT =
  "<b>Superteam MY Bot — Admin Help</b>\n\n" +
  "<b>DM Admin Menu</b>\n" +
  "Send <code>/start admin</code> to the bot in DM to open the admin panel.\n\n" +
  ADMIN_HELP_BODY;

function formatLog(log: AdminLog): string {
  const date = log.created_at.toISOString().replace("T", " ").split(".")[0];
  const action = formatAction(log.action);
  let line = `[${date}] ${action} by ${log.admin_telegram_id}`;
  if (log.target_id) line += ` → ${log.target_id}`;
  if (log.details) line += ` (${log.details.slice(0, 50)})`;
  return line;
}

function isDateString(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

export function setup(bot: Telegraf): void {
  bot.command("help", async (ctx) => {
    await ctx.reply(HELP_TEXT, { parse_mode: "HTML" });
  });

  bot.command("setintroguide", async (ctx) => {
    if (!(await isAdmin(ctx))) {
      return ctx.reply("Only main group admins can use this command.");
    }

    const text = ctx.message.text.replace(/^\/setintroguide\s*/, "");
    if (!text) {
      return ctx.reply("Usage: /setintroguide <message>");
    }

    await setSetting("intro_guide", text, ctx.from.id);
    await createAdminLog(
      "edit_intro_guide",
      ctx.from.id,
      null,
      text.slice(0, 100),
    );
    return ctx.reply("Intro guide updated!");
  });

  bot.command("viewintroguide", async (ctx) => {
    if (!(await isAdmin(ctx))) {
      return ctx.reply("Only main group admins can use this command.");
    }

    const msg = await getSetting("intro_guide");
    return ctx.reply(`Current intro guide:\n\n${msg}`);
  });

  bot.command("logs", async (ctx) => {
    if (!(await isAdmin(ctx))) {
      return ctx.reply("Only main group admins can use this command.");
    }

    const args = ctx.message.text
      .replace(/^\/logs\s*/, "")
      .trim()
      .split(/\s+/)
      .filter(Boolean);

    let action: AdminLogAction | undefined;
    let logs: AdminLog[];

    if (args.length === 0) {
      // /logs — default: all, 10
      logs = await getRecentLogs(10);
    } else if (args.length === 1) {
      // /logs <type>
      action = ACTION_ALIASES[args[0]];
      if (!action)
        return ctx.reply(
          `Unknown type: ${args[0]}\nValid: ${Object.keys(ACTION_ALIASES).join(", ")}`,
        );
      logs = await getRecentLogs(10, action);
    } else if (args.length === 2 && !isDateString(args[1])) {
      // /logs <type> <count>
      action = args[0] === "all" ? undefined : ACTION_ALIASES[args[0]];
      if (args[0] !== "all" && !action)
        return ctx.reply(
          `Unknown type: ${args[0]}\nValid: all, ${Object.keys(ACTION_ALIASES).join(", ")}`,
        );
      const count = parseInt(args[1], 10);
      if (isNaN(count) || count < 1)
        return ctx.reply("Count must be a positive number.");
      logs = await getRecentLogs(Math.min(count, 50), action);
    } else if (
      args.length === 3 &&
      isDateString(args[1]) &&
      isDateString(args[2])
    ) {
      // /logs <type> <start> <end>
      action = args[0] === "all" ? undefined : ACTION_ALIASES[args[0]];
      if (args[0] !== "all" && !action)
        return ctx.reply(
          `Unknown type: ${args[0]}\nValid: all, ${Object.keys(ACTION_ALIASES).join(", ")}`,
        );
      const start = new Date(args[1]);
      const end = new Date(args[2] + "T23:59:59.999Z");
      logs = await getLogsByDateRange(start, end, action);
    } else {
      return ctx.reply(
        "Usage:\n/logs [type] [count]\n/logs [type] [start] [end]\n\nExamples:\n/logs\n/logs ban 10\n/logs all 2024-01-01 2024-12-31",
      );
    }

    if (logs.length === 0) {
      return ctx.reply("No logs found.");
    }

    const lines = logs.map(formatLog);
    return ctx.reply(lines.join("\n"));
  });

  bot.command("posthelp", async (ctx) => {
    if (!(await isAdmin(ctx))) {
      return ctx.reply("Only main group admins can use this command.");
    }

    await ctx.reply(POSTHELP_TEXT, { parse_mode: "HTML" });
  });
}
