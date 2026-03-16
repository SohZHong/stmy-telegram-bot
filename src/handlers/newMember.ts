import { Markup, Telegraf } from "telegraf";
import { config } from "../config";
import { getMember, upsertMember } from "../models/member";
import { getRandomWelcomeMessage } from "../models/welcomeMessage";
import { muteUser } from "../permissions";

const DEFAULT_WELCOME = "Welcome to Superteam MY, {name}! Click below to introduce yourself.";

// Track welcome message IDs so introFlow can delete them after completion
export const welcomeMessageIds = new Map<number, { chatId: number; messageId: number }>();

export function setup(bot: Telegraf): void {
  bot.on("new_chat_members", async (ctx) => {
    if (ctx.chat.id !== config.mainGroupId) return;

    // Delete the "X joined the group" service message
    try {
      await ctx.deleteMessage();
    } catch {
      // May lack permission to delete service messages
    }

    for (const member of ctx.message.new_chat_members) {
      if (member.is_bot) continue;

      try {
        const existing = await getMember(member.id);

        if (existing?.intro_completed) {
          const name = member.first_name || member.username || "there";
          await ctx.telegram.sendMessage(
            config.mainGroupId,
            `Welcome back, [${name}](tg://user?id=${member.id})!`,
            {
              message_thread_id: config.welcomeTopicId,
              parse_mode: "Markdown",
            },
          );
          continue;
        }

        await upsertMember(
          member.id,
          member.username,
          member.first_name,
          ctx.chat.id,
        );

        // Mute the new member until they complete their intro
        try {
          await muteUser(ctx.telegram, member.id);
        } catch {
          // May lack permission to restrict members
        }

        const name = member.first_name || member.username || "there";
        const deepLink = `https://t.me/${ctx.botInfo.username}?start=intro`;

        const wm = await getRandomWelcomeMessage();
        const welcomeText = (wm?.message ?? DEFAULT_WELCOME).replace(
          /\{name\}/g,
          `[${name}](tg://user?id=${member.id})`,
        );

        const sent = await ctx.telegram.sendMessage(config.mainGroupId, welcomeText, {
          message_thread_id: config.welcomeTopicId,
          parse_mode: "Markdown",
          ...Markup.inlineKeyboard([
            Markup.button.url("Start Introduction", deepLink),
          ]),
        });

        // Store so introFlow can delete after completion
        welcomeMessageIds.set(member.id, {
          chatId: config.mainGroupId,
          messageId: sent.message_id,
        });
      } catch (err) {
        console.error(
          `Error handling new member ${member.id}:`,
          (err as Error).message,
        );
      }
    }
  });
}
