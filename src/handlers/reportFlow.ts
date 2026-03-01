import { Markup, Telegraf } from "telegraf";
import { message } from "telegraf/filters";
import { config } from "../config";
import { searchMembers, deleteMember } from "../models/member";
import { memberLabel, resolveUser } from "../utils/user";
import { truncate, escapeHtml } from "../utils/format";
import { getAllReportReasons, getReportReason } from "../models/reportReason";
import {
  createReport,
  countPendingReportsAgainst,
  bulkUpdateReportStatus,
  hasRecentReport,
} from "../models/report";
import { getSetting, setSetting } from "../models/settings";
import { createAdminLog } from "../models/adminLog";

type ReportState =
  | { step: "AWAITING_TARGET" }
  | { step: "AWAITING_REASON"; targetId: number }
  | { step: "AWAITING_DETAILS"; targetId: number; reasonId: number }
  | {
      step: "AWAITING_CONFIRM";
      targetId: number;
      reasonId: number;
      details: string | null;
    };

const reportState = new Map<number, ReportState>();

async function notifyAdmins(
  telegram: import("telegraf").Telegram,
  text: string,
): Promise<void> {
  const designated = await getSetting("report_designated_admin");
  if (designated && designated !== "0") {
    try {
      await telegram.sendMessage(parseInt(designated, 10), text, {
        parse_mode: "HTML",
      });
    } catch {
      // designated admin may not have started DM
    }
    return;
  }

  const admins = await telegram.getChatAdministrators(config.mainGroupId);
  for (const admin of admins) {
    if (admin.user.is_bot) continue;
    try {
      await telegram.sendMessage(admin.user.id, text, {
        parse_mode: "HTML",
      });
    } catch {
      // admin may not have started DM
    }
  }
}

export function setup(bot: Telegraf): void {
  // Handle /start report deep link
  bot.start(async (ctx, next) => {
    if (ctx.chat.type !== "private") return next();
    if (ctx.payload !== "report") return next();

    const userId = ctx.from.id;

    try {
      // Verify user is a group member
      try {
        const chatMember = await ctx.telegram.getChatMember(
          config.mainGroupId,
          userId,
        );
        if (
          chatMember.status === "left" ||
          chatMember.status === "kicked"
        ) {
          await ctx.reply("You must be a member of the group to report someone.");
          return;
        }
      } catch {
        await ctx.reply("You must be a member of the group to report someone.");
        return;
      }

      reportState.set(userId, { step: "AWAITING_TARGET" });
      await ctx.reply(
        "Who would you like to report?\n\nSend their username, name, or Telegram ID.\n\nUse /cancel to abort at any time.",
      );
    } catch (err) {
      console.error(
        `Error in report flow start for user ${userId}:`,
        (err as Error).message,
      );
    }
  });

  // Handle /cancel in DM
  bot.command("cancel", async (ctx, next) => {
    if (ctx.chat.type !== "private") return next();

    const userId = ctx.from.id;
    if (!reportState.has(userId)) return next();

    reportState.delete(userId);
    await ctx.reply("Report cancelled.");
  });

  // Handle callback queries with r: prefix
  bot.on("callback_query", async (ctx, next) => {
    if (!("data" in ctx.callbackQuery)) return next();

    const data = ctx.callbackQuery.data;
    if (!data.startsWith("r:")) return next();

    const userId = ctx.from.id;
    const state = reportState.get(userId);

    await ctx.answerCbQuery();

    try {
      // Target selection: r:sel:ID
      if (data.startsWith("r:sel:")) {
        if (!state || state.step !== "AWAITING_TARGET") return;

        const targetId = parseInt(data.split(":")[2], 10);

        // Self-report check
        if (targetId === userId) {
          await ctx.editMessageText("You cannot report yourself.");
          reportState.delete(userId);
          return;
        }

        // Cooldown check
        const cooldownHours = parseInt(
          (await getSetting("report_cooldown_hours")) ?? "24",
          10,
        );
        if (await hasRecentReport(userId, targetId, cooldownHours)) {
          await ctx.editMessageText(
            `You have already reported this user recently. Please wait ${cooldownHours} hours between reports for the same user.`,
          );
          reportState.delete(userId);
          return;
        }

        await showReasonSelection(ctx, userId, targetId);
        return;
      }

      // Reason selection: r:reason:ID
      if (data.startsWith("r:reason:")) {
        if (!state || state.step !== "AWAITING_REASON") return;

        const reasonId = parseInt(data.split(":")[2], 10);
        const reason = await getReportReason(reasonId);
        if (!reason) {
          await ctx.editMessageText("Invalid reason. Please try again.");
          reportState.delete(userId);
          return;
        }

        reportState.set(userId, {
          step: "AWAITING_DETAILS",
          targetId: state.targetId,
          reasonId,
        });

        await ctx.editMessageText(
          "Would you like to add any details? Type your message or click Skip.",
          Markup.inlineKeyboard([
            [Markup.button.callback("Skip", "r:skip")],
            [Markup.button.callback("Cancel", "r:cancel")],
          ]),
        );
        return;
      }

      // Skip details: r:skip
      if (data === "r:skip") {
        if (!state || state.step !== "AWAITING_DETAILS") return;

        reportState.set(userId, {
          step: "AWAITING_CONFIRM",
          targetId: state.targetId,
          reasonId: state.reasonId,
          details: null,
        });

        await showConfirmation(ctx, state.targetId, state.reasonId, null);
        return;
      }

      // Confirm: r:confirm
      if (data === "r:confirm") {
        if (!state || state.step !== "AWAITING_CONFIRM") return;

        const { targetId, reasonId, details } = state;
        reportState.delete(userId);

        await createReport(userId, targetId, reasonId, details);
        await createAdminLog("submit_report", userId, targetId);

        await ctx.editMessageText("Your report has been recorded. Thank you.");

        // Check thresholds
        const pendingCount = await countPendingReportsAgainst(targetId);
        const autobanThreshold = parseInt(
          (await getSetting("report_threshold_autoban")) ?? "0",
          10,
        );

        if (autobanThreshold > 0 && pendingCount >= autobanThreshold) {
          // Auto-ban
          try {
            await ctx.telegram.banChatMember(
              config.mainGroupId,
              targetId,
              undefined,
              { revoke_messages: true },
            );
            await deleteMember(targetId);
            await bulkUpdateReportStatus(targetId, "reviewed");

            const targetLabel = await resolveUser(String(targetId), ctx.telegram);
            await createAdminLog("autoban_report", 0, targetId, `Auto-banned after ${pendingCount} reports`);
            await notifyAdmins(
              ctx.telegram,
              `<b>Auto-ban (Report)</b>\n\nUser ${escapeHtml(targetLabel)} (ID: ${targetId}) has been automatically banned after receiving ${pendingCount} pending report(s).`,
            );
          } catch (err) {
            console.error(`Auto-ban failed for ${targetId}:`, (err as Error).message);
          }
          return;
        }

        const alertThreshold = parseInt(
          (await getSetting("report_threshold_alert")) ?? "3",
          10,
        );

        if (pendingCount >= alertThreshold) {
          const targetLabel = await resolveUser(String(targetId), ctx.telegram);
          await notifyAdmins(
            ctx.telegram,
            `<b>Report Alert</b>\n\nUser ${escapeHtml(targetLabel)} (ID: ${targetId}) has ${pendingCount} pending report(s). Review in the admin panel.`,
          );
        }

        return;
      }

      // Cancel: r:cancel
      if (data === "r:cancel") {
        reportState.delete(userId);
        await ctx.editMessageText("Report cancelled.");
        return;
      }
    } catch (err) {
      console.error(`Report flow callback error:`, (err as Error).message);
      reportState.delete(userId);
    }
  });

  // Text handler for report flow
  bot.on(message("text"), async (ctx, next) => {
    if (ctx.chat.type !== "private") return next();

    const userId = ctx.from.id;
    const state = reportState.get(userId);
    if (!state) return next();

    const text = ctx.message.text;

    try {
      // Target search
      if (state.step === "AWAITING_TARGET") {
        const results = await searchMembers(text);
        if (results.length === 0) {
          await ctx.reply(
            "No members found. Try a different username, name, or ID.\n\nUse /cancel to abort.",
          );
          return;
        }

        if (results.length === 1) {
          const target = results[0];
          const targetId = parseInt(target.telegram_id, 10);

          // Self-report check
          if (targetId === userId) {
            await ctx.reply("You cannot report yourself.");
            reportState.delete(userId);
            return;
          }

          // Cooldown check
          const cooldownHours = parseInt(
            (await getSetting("report_cooldown_hours")) ?? "24",
            10,
          );
          if (await hasRecentReport(userId, targetId, cooldownHours)) {
            await ctx.reply(
              `You have already reported this user recently. Please wait ${cooldownHours} hours between reports for the same user.`,
            );
            reportState.delete(userId);
            return;
          }

          await showReasonSelection(ctx, userId, targetId);
          return;
        }

        // Multiple results — show selection
        const rows = results.map((m) => [
          Markup.button.callback(
            truncate(memberLabel(m), 40),
            `r:sel:${m.telegram_id}`,
          ),
        ]);
        rows.push([Markup.button.callback("Cancel", "r:cancel")]);

        await ctx.reply(
          `Found ${results.length} member(s). Select one:`,
          Markup.inlineKeyboard(rows),
        );
        return;
      }

      // Details text
      if (state.step === "AWAITING_DETAILS") {
        reportState.set(userId, {
          step: "AWAITING_CONFIRM",
          targetId: state.targetId,
          reasonId: state.reasonId,
          details: text,
        });

        await showConfirmation(ctx, state.targetId, state.reasonId, text);
        return;
      }
    } catch (err) {
      console.error(
        `Report flow text error for user ${userId}:`,
        (err as Error).message,
      );
      reportState.delete(userId);
      await ctx.reply("Something went wrong. Please try again with /start report.");
    }
  });

  // Catch-all for non-text messages while in report flow
  bot.on("message", async (ctx, next) => {
    if (ctx.chat.type !== "private") return next();

    const userId = ctx.from.id;
    if (!reportState.has(userId)) return next();

    await ctx.reply("Please send a text message or use the buttons above.");
  });
}

async function showReasonSelection(
  ctx: import("telegraf").Context,
  userId: number,
  targetId: number,
): Promise<void> {
  const reasons = await getAllReportReasons();
  if (reasons.length === 0) {
    await ctx.reply("No report reasons have been configured. Please contact an admin.");
    reportState.delete(userId);
    return;
  }

  reportState.set(userId, { step: "AWAITING_REASON", targetId });

  const rows = reasons.map((r) => [
    Markup.button.callback(r.label, `r:reason:${r.id}`),
  ]);
  rows.push([Markup.button.callback("Cancel", "r:cancel")]);

  const targetLabel = await resolveUser(String(targetId), ctx.telegram);
  const msgText = `Reporting ${escapeHtml(targetLabel)}.\n\nSelect a reason:`;

  // Use reply for text-triggered flow, editMessageText for callback-triggered
  if (ctx.callbackQuery) {
    await ctx.editMessageText(msgText, {
      parse_mode: "HTML",
      ...Markup.inlineKeyboard(rows),
    });
  } else {
    await ctx.reply(msgText, {
      parse_mode: "HTML",
      ...Markup.inlineKeyboard(rows),
    });
  }
}

async function showConfirmation(
  ctx: import("telegraf").Context,
  targetId: number,
  reasonId: number,
  details: string | null,
): Promise<void> {
  const targetLabel = await resolveUser(String(targetId), ctx.telegram);
  const reason = await getReportReason(reasonId);

  const lines = [
    "<b>Report Summary</b>",
    "",
    `<b>User:</b> ${escapeHtml(targetLabel)} (ID: ${targetId})`,
    `<b>Reason:</b> ${escapeHtml(reason?.label ?? "Unknown")}`,
  ];
  if (details) {
    lines.push(`<b>Details:</b> ${escapeHtml(details)}`);
  }
  lines.push("", "Confirm this report?");

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback("Confirm", "r:confirm")],
    [Markup.button.callback("Cancel", "r:cancel")],
  ]);

  if (ctx.callbackQuery) {
    await ctx.editMessageText(lines.join("\n"), {
      parse_mode: "HTML",
      ...keyboard,
    });
  } else {
    await ctx.reply(lines.join("\n"), {
      parse_mode: "HTML",
      ...keyboard,
    });
  }
}

export async function ensureReportPost(
  telegram: import("telegraf").Telegram,
): Promise<void> {
  console.log("Ensuring report post exists...");

  const existingId = await getSetting("report_post_message_id");
  if (existingId) {
    console.log(`Found existing report post ID: ${existingId}, verifying...`);
    try {
      await telegram.pinChatMessage(
        config.mainGroupId,
        parseInt(existingId, 10),
        { disable_notification: true },
      );
      console.log("Existing report post is still valid");
      return;
    } catch (err) {
      console.log(
        `Existing report post gone: ${(err as Error).message}, posting new one`,
      );
    }
  }

  const botInfo = await telegram.getMe();
  const keyboard = Markup.inlineKeyboard([
    [
      Markup.button.url(
        "Report a Member",
        `https://t.me/${botInfo.username}?start=report`,
      ),
    ],
  ]);
  const text =
    "If you see a member violating community guidelines, you can report them privately.";

  let sent;
  try {
    console.log(`Sending report post to General (thread 1) in ${config.mainGroupId}...`);
    sent = await telegram.sendMessage(config.mainGroupId, text, {
      message_thread_id: 1,
      ...keyboard,
    });
    console.log(`Sent to General, message_id: ${sent.message_id}`);
  } catch (err1) {
    console.log(`General (thread 1) failed: ${(err1 as Error).message}`);
    try {
      console.log("Retrying without thread_id...");
      sent = await telegram.sendMessage(config.mainGroupId, text, keyboard);
      console.log(`Sent without thread_id, message_id: ${sent.message_id}`);
    } catch (err2) {
      console.error(
        "Failed to post report button:",
        (err2 as Error).message,
      );
      return;
    }
  }

  try {
    await telegram.pinChatMessage(config.mainGroupId, sent.message_id, {
      disable_notification: true,
    });
    console.log("Report post pinned");
  } catch (err) {
    console.log(`Pin failed: ${(err as Error).message}`);
  }

  await setSetting("report_post_message_id", String(sent.message_id), 0);
  console.log("Report button posted and pinned");
}
