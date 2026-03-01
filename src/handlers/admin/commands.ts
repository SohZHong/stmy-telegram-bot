import { Markup, Telegraf } from "telegraf";
import { isAdmin } from "./auth";
import {
  ACTION_ALIASES,
  formatAction,
  HELP_TEXT,
  POSTHELP_TEXT,
  DEFAULT_ADMIN_GUIDE,
  renderAdminGuide,
} from "./shared";
import { config } from "../../config";
import { getSetting, setSetting } from "../../models/settings";
import {
  createAdminLog,
  getRecentLogs,
  getLogsByDateRange,
} from "../../models/adminLog";
import type { AdminLogAction, AdminLog } from "../../models/adminLog";
import { resolveUser } from "../../utils/user";
import { escapeHtml } from "../../utils/format";

async function formatLog(
  log: AdminLog,
  telegram: import("telegraf").Telegram,
): Promise<string> {
  const date = log.created_at.toISOString().replace("T", " ").split(".")[0];
  const action = formatAction(log.action);
  const admin = await resolveUser(log.admin_telegram_id, telegram);
  let line = `[${date}] ${action} by ${admin}`;
  if (log.target_id) {
    const target = await resolveUser(log.target_id, telegram);
    line += ` → ${target}`;
  }
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

    const lines = await Promise.all(logs.map((l) => formatLog(l, ctx.telegram)));
    return ctx.reply(lines.join("\n"));
  });

  bot.command("posthelp", async (ctx) => {
    if (!(await isAdmin(ctx))) {
      return ctx.reply("Only main group admins can use this command.");
    }

    await ctx.reply(POSTHELP_TEXT, { parse_mode: "HTML" });
  });

  bot.command("announce", async (ctx) => {
    if (!(await isAdmin(ctx))) {
      return ctx.reply("Only main group admins can use this command.");
    }

    const raw = ctx.message.text.replace(/^\/announce\s*/, "");
    const isPreview = raw.startsWith("preview ");
    const message = isPreview ? raw.replace(/^preview\s*/, "") : raw;

    if (!message) {
      return ctx.reply(
        "Usage:\n/announce <message> — Broadcast to all admins\n/announce preview <message> — Preview (sent only to you)",
      );
    }

    const sender = await resolveUser(String(ctx.from.id), ctx.telegram);
    const text = `<b>Announcement by ${escapeHtml(sender)}</b>\n\n${message}`;

    if (isPreview) {
      return ctx.telegram.sendMessage(ctx.from.id, text, {
        parse_mode: "HTML",
      });
    }

    const admins = await ctx.telegram.getChatAdministrators(config.mainGroupId);

    let sent = 0;
    let failed = 0;
    for (const admin of admins) {
      if (admin.user.is_bot || admin.user.id === ctx.from.id) continue;
      try {
        await ctx.telegram.sendMessage(admin.user.id, text, {
          parse_mode: "HTML",
        });
        sent++;
      } catch {
        failed++;
      }
    }

    await createAdminLog(
      "send_announcement",
      ctx.from.id,
      null,
      message.slice(0, 100),
    );

    return ctx.reply(
      `Announcement sent to ${sent} admin(s).${failed > 0 ? ` ${failed} failed (admin hasn't started a DM with the bot).` : ""}`,
    );
  });

  bot.command("postreport", async (ctx) => {
    if (!(await isAdmin(ctx))) {
      return ctx.reply("Only main group admins can use this command.");
    }

    const chatId = config.mainGroupId;

    // Unpin previous report post if one exists
    const prevMessageId = await getSetting("report_post_message_id");
    if (prevMessageId) {
      try {
        await ctx.telegram.unpinChatMessage(
          chatId,
          parseInt(prevMessageId, 10),
        );
      } catch {
        // Old message may have been deleted
      }
    }

    const botInfo = await ctx.telegram.getMe();
    const messageBody = {
      text: "If you see a member violating community guidelines, you can report them privately.",
      keyboard: Markup.inlineKeyboard([
        [
          Markup.button.url(
            "Report a Member",
            `https://t.me/${botInfo.username}?start=report`,
          ),
        ],
      ]),
    };

    let sent;
    try {
      // Try sending to General topic (thread_id 1)
      sent = await ctx.telegram.sendMessage(
        chatId,
        messageBody.text,
        { message_thread_id: 1, ...messageBody.keyboard },
      );
    } catch {
      try {
        // Fallback: send without thread_id (works if General is hidden)
        sent = await ctx.telegram.sendMessage(
          chatId,
          messageBody.text,
          messageBody.keyboard,
        );
      } catch (err) {
        return ctx.reply(
          `Failed to post report button: ${(err as Error).message}`,
        );
      }
    }

    // Pin the report button and store its message ID
    try {
      await ctx.telegram.pinChatMessage(chatId, sent.message_id, {
        disable_notification: true,
      });
    } catch {
      // Bot may lack pin permissions
    }

    await setSetting(
      "report_post_message_id",
      String(sent.message_id),
      ctx.from.id,
    );

    await ctx.reply("Report button posted and pinned in the group.");
  });

  bot.command("adminguide", async (ctx) => {
    if (!(await isAdmin(ctx))) {
      return ctx.reply("Only main group admins can use this command.");
    }

    const botInfo = await ctx.telegram.getMe();
    const template = (await getSetting("admin_guide")) || DEFAULT_ADMIN_GUIDE;
    const guideText = renderAdminGuide(template, botInfo.username!);
    const chatId = config.mainGroupId;
    const topicId = config.adminTopicId;

    // Unpin previous admin guide if one exists
    const prevMessageId = await getSetting("admin_guide_message_id");
    if (prevMessageId) {
      try {
        await ctx.telegram.unpinChatMessage(
          chatId,
          parseInt(prevMessageId, 10),
        );
      } catch {
        // Old message may have been deleted
      }
    }

    const sent = await ctx.telegram.sendMessage(chatId, guideText, {
      message_thread_id: topicId,
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
    });

    // Pin the new guide and store its message ID
    try {
      await ctx.telegram.pinChatMessage(chatId, sent.message_id, {
        disable_notification: true,
      });
    } catch {
      // Bot may lack pin permissions
    }

    await setSetting(
      "admin_guide_message_id",
      String(sent.message_id),
      ctx.from.id,
    );

    await ctx.reply("Admin guide posted and pinned in the admin topic.");
  });
}
