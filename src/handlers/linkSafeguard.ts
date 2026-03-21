import { Markup, Telegraf } from "telegraf";
import { config } from "../config";
import { getSetting } from "../models/settings";

// Track warning message IDs so we can delete them when the link is removed
// key: "chatId_linkMsgId" → value: warningMsgId
const warningMessages = new Map<string, number>();

async function notifyLinkAdmins(
  telegram: import("telegraf").Telegram,
  chatId: number,
  text: string,
  keyboard: ReturnType<typeof Markup.inlineKeyboard>,
): Promise<void> {
  const designated = await getSetting("link_designated_admin");
  if (designated && designated !== "0") {
    try {
      await telegram.sendMessage(parseInt(designated, 10), text, keyboard);
    } catch {
      // designated admin may not have started DM
    }
    return;
  }

  const admins = await telegram.getChatAdministrators(chatId);
  for (const admin of admins) {
    if (admin.user.is_bot) continue;
    try {
      await telegram.sendMessage(admin.user.id, text, keyboard);
    } catch {
      // admin may not have started DM with bot
    }
  }
}

export function setup(bot: Telegraf): void {
  // Detect links in group messages and warn
  bot.on("message", async (ctx, next) => {
    if (ctx.chat.type !== "supergroup" && ctx.chat.type !== "group")
      return next();
    if (ctx.chat.id !== config.mainGroupId) return next();
    if (!("text" in ctx.message)) return next();

    // Skip admin topic
    if (
      "message_thread_id" in ctx.message &&
      ctx.message.message_thread_id === config.adminTopicId
    ) {
      return next();
    }

    const entities = ctx.message.entities ?? [];
    const hasUrl = entities.some(
      (e) => e.type === "url" || e.type === "text_link",
    );
    if (!hasUrl) return next();

    const chatId = ctx.chat.id;
    const msgId = ctx.message.message_id;
    const threadId =
      "message_thread_id" in ctx.message
        ? ctx.message.message_thread_id
        : undefined;
    const user = ctx.from;
    const display = user.username ? `@${user.username}` : user.first_name;

    // Auto-reply safety warning as a reply to the link message
    try {
      const warning = await ctx.telegram.sendMessage(
        chatId,
        "🛡️ *Link Detected — Stay Safe!*\n" +
          "━━━━━━━━━━━━━━━━━━━━\n\n" +
          "🔍 Verify the link before clicking\n" +
          "🔑 Never share your private keys\n" +
          "🚫 Watch out for scams & phishing\n\n" +
          "_Automated security alert_",
        {
          message_thread_id: threadId,
          reply_parameters: { message_id: msgId },
          parse_mode: "Markdown",
        },
      );

      // Store warning message ID for cleanup
      warningMessages.set(`${chatId}_${msgId}`, warning.message_id);
    } catch (err) {
      console.error("Failed to post link warning:", (err as Error).message);
    }

    // Notify designated admin (or all admins) via DM with delete button
    try {
      const keyboard = Markup.inlineKeyboard([
        [
          Markup.button.callback(
            "🗑️ Delete Message",
            `dellink_${chatId}_${msgId}`,
          ),
        ],
      ]);

      await notifyLinkAdmins(
        ctx.telegram,
        chatId,
        `🔗 Link Alert\n━━━━━━━━━━━━━━━━━━━━\n\n` +
          `👤 Posted by: ${display}\n` +
          `💬 Message:\n${ctx.message.text}\n\n` +
          `Tap below to remove this message if suspicious.`,
        keyboard,
      );
    } catch (err) {
      console.error(
        "Failed to notify admins about link:",
        (err as Error).message,
      );
    }

    return next();
  });

  // Handle admin clicking delete button
  bot.on("callback_query", async (ctx, next) => {
    if (!("data" in ctx.callbackQuery)) return next();
    const data = ctx.callbackQuery.data;
    if (!data.startsWith("dellink_")) return next();

    await ctx.answerCbQuery();

    const parts = data.split("_");
    const originalText =
      ctx.callbackQuery.message && "text" in ctx.callbackQuery.message
        ? ctx.callbackQuery.message.text
        : "";

    try {
      const targetChatId = parseInt(parts[1], 10);
      const targetMsgId = parseInt(parts[2], 10);

      // Delete the link message
      await ctx.telegram.deleteMessage(targetChatId, targetMsgId);

      // Delete the warning reply too
      const key = `${targetChatId}_${targetMsgId}`;
      const warningMsgId = warningMessages.get(key);
      if (warningMsgId) {
        try {
          await ctx.telegram.deleteMessage(targetChatId, warningMsgId);
        } catch {
          // warning may already be deleted
        }
        warningMessages.delete(key);
      }

      await ctx.editMessageText(
        `${originalText}\n\n✅ Deleted by ${ctx.from.first_name}`,
      );
    } catch (e) {
      await ctx.editMessageText(
        `${originalText}\n\n❌ Could not delete: ${(e as Error).message}`,
      );
    }
  });
}
