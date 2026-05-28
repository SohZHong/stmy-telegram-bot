import { Markup, Telegraf } from "telegraf";
import { config } from "../config";
import {
  addWhitelistedDomain,
  isDomainWhitelisted,
} from "../models/whitelistedDomain";
import { createAdminLog } from "../models/adminLog";
import { getSetting } from "../models/settings";
import { isAdminById } from "./admin/auth";

// Per-link-message state. Keyed by "chatId_linkMsgId".
//   warningMsgId: the bot's "Link Detected" reply message ID (for deletion)
//   domains:      the non-whitelisted hostnames found in this message
type LinkEntry = { warningMsgId?: number; domains: string[] };

const MAX_LINK_ENTRIES = 1000;
const linkData = new Map<string, LinkEntry>();

function setLinkData(key: string, entry: LinkEntry): void {
  // Evict oldest entries if map grows too large
  if (linkData.size >= MAX_LINK_ENTRIES) {
    const firstKey = linkData.keys().next().value;
    if (firstKey) linkData.delete(firstKey);
  }
  linkData.set(key, entry);
}

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
      return;
    } catch (err) {
      console.error(
        `Link alert: failed to DM designated admin ${designated}, falling back to all admins:`,
        (err as Error).message,
      );
    }
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

    // Skip admin topic (if configured)
    if (
      config.adminTopicId &&
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

    // Admins are trusted — no warning, no admin DM with delete button.
    if (await isAdminById(ctx.telegram, ctx.from.id)) return next();

    // Extract domains from all URLs in the message.
    // Only consider URL-typed entities — mentions, hashtags, bot_command,
    // email, phone_number, etc. are not links and must not be treated as
    // malformed URLs (which would force the safety warning to fire even
    // when every actual link in the message is whitelisted).
    const domains: string[] = [];
    let hasMalformed = false;
    for (const entity of entities) {
      let url = "";
      if (entity.type === "url") {
        url = ctx.message.text.substring(entity.offset, entity.offset + entity.length);
      } else if (entity.type === "text_link" && entity.url) {
        url = entity.url;
      } else {
        continue;
      }
      try {
        if (!/^https?:\/\//i.test(url)) url = "https://" + url;
        const hostname = new URL(url).hostname.toLowerCase();
        domains.push(hostname);
      } catch {
        hasMalformed = true;
      }
    }

    // Identify which domains aren't whitelisted (deduped)
    let nonWhitelisted: string[] = [];
    if (domains.length > 0) {
      const checks = await Promise.all(domains.map((d) => isDomainWhitelisted(d)));
      nonWhitelisted = Array.from(
        new Set(domains.filter((_, i) => !checks[i])),
      );
    }

    // Skip the warning only if every URL is parseable AND whitelisted
    if (!hasMalformed && nonWhitelisted.length === 0) return next();

    const chatId = ctx.chat.id;
    const msgId = ctx.message.message_id;
    const threadId =
      "message_thread_id" in ctx.message
        ? ctx.message.message_thread_id
        : undefined;
    const user = ctx.from;
    const display = user.username ? `@${user.username}` : user.first_name;

    const key = `${chatId}_${msgId}`;
    setLinkData(key, { domains: nonWhitelisted });

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

      const existing = linkData.get(key);
      if (existing) existing.warningMsgId = warning.message_id;
    } catch (err) {
      console.error("Failed to post link warning:", (err as Error).message);
    }

    // Notify designated admin (or all admins) via DM with action buttons
    try {
      const buttons: ReturnType<typeof Markup.button.callback>[][] = [
        [Markup.button.callback("🗑️ Delete Message", `dellink_${chatId}_${msgId}`)],
      ];
      if (nonWhitelisted.length > 0) {
        const label =
          nonWhitelisted.length === 1
            ? `✅ Whitelist ${nonWhitelisted[0]}`
            : `✅ Whitelist ${nonWhitelisted.length} domains`;
        buttons.push([Markup.button.callback(label, `wlink_${chatId}_${msgId}`)]);
      }
      const keyboard = Markup.inlineKeyboard(buttons);

      await notifyLinkAdmins(
        ctx.telegram,
        chatId,
        `🔗 Link Alert\n━━━━━━━━━━━━━━━━━━━━\n\n` +
          `👤 Posted by: ${display}\n` +
          `💬 Message:\n${ctx.message.text}\n\n` +
          `Tap below to remove this message if suspicious, or whitelist the domain if it's safe.`,
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

    // Verify the user is an admin before allowing message deletion
    if (!(await isAdminById(ctx.telegram, ctx.from.id))) {
      await ctx.answerCbQuery("Only admins can delete messages.");
      return;
    }

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
      const entry = linkData.get(key);
      if (entry?.warningMsgId) {
        try {
          await ctx.telegram.deleteMessage(targetChatId, entry.warningMsgId);
        } catch {
          // warning may already be deleted
        }
        entry.warningMsgId = undefined;
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

  // Handle admin clicking whitelist button
  bot.on("callback_query", async (ctx, next) => {
    if (!("data" in ctx.callbackQuery)) return next();
    const data = ctx.callbackQuery.data;
    if (!data.startsWith("wlink_")) return next();

    if (!(await isAdminById(ctx.telegram, ctx.from.id))) {
      await ctx.answerCbQuery("Only admins can whitelist domains.");
      return;
    }

    await ctx.answerCbQuery();

    const parts = data.split("_");
    const targetChatId = parseInt(parts[1], 10);
    const targetMsgId = parseInt(parts[2], 10);
    const key = `${targetChatId}_${targetMsgId}`;

    const originalText =
      ctx.callbackQuery.message && "text" in ctx.callbackQuery.message
        ? ctx.callbackQuery.message.text
        : "";

    const entry = linkData.get(key);
    if (!entry || entry.domains.length === 0) {
      await ctx.editMessageText(
        `${originalText}\n\n⚠️ Cannot whitelist: link data is no longer in cache (bot may have restarted). Use the admin menu to whitelist manually.`,
      );
      return;
    }

    const added: string[] = [];
    const alreadyExists: string[] = [];
    const failed: string[] = [];
    for (const domain of entry.domains) {
      try {
        const inserted = await addWhitelistedDomain(domain, ctx.from.id);
        if (inserted) {
          added.push(domain);
          await createAdminLog(
            "add_whitelisted_domain",
            ctx.from.id,
            null,
            `Domain: ${domain} (via link alert)`,
          );
        } else {
          alreadyExists.push(domain);
        }
      } catch (err) {
        console.error(
          `Failed to whitelist ${domain} from link alert:`,
          (err as Error).message,
        );
        failed.push(domain);
      }
    }

    // Remove the group warning now that the domain is trusted
    if (entry.warningMsgId) {
      try {
        await ctx.telegram.deleteMessage(targetChatId, entry.warningMsgId);
      } catch {
        // warning may already be deleted
      }
      entry.warningMsgId = undefined;
    }

    const adminName =
      ctx.from.first_name ||
      (ctx.from.username ? `@${ctx.from.username}` : String(ctx.from.id));
    const lines: string[] = [];
    if (added.length > 0) {
      lines.push(`✅ Whitelisted by ${adminName}: ${added.join(", ")}`);
    }
    if (alreadyExists.length > 0) {
      lines.push(`ℹ️ Already whitelisted: ${alreadyExists.join(", ")}`);
    }
    if (failed.length > 0) {
      lines.push(`❌ Failed to whitelist (check logs): ${failed.join(", ")}`);
    }

    try {
      await ctx.editMessageText(`${originalText}\n\n${lines.join("\n")}`);
    } catch (err) {
      console.error(
        "Failed to edit DM after whitelist action:",
        (err as Error).message,
      );
    }
  });
}
