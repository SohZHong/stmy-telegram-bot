import { Markup, Telegraf } from "telegraf";
import { config } from "../config";
import { getMember, upsertMember } from "../models/member";
import { muteUser } from "../permissions";

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

        await ctx.telegram.sendMessage(
          config.mainGroupId,
          `Welcome, [${name}](tg://user?id=${member.id})! Click below to introduce yourself.`,
          {
            message_thread_id: config.welcomeTopicId,
            parse_mode: "Markdown",
            ...Markup.inlineKeyboard([
              Markup.button.url("Start Introduction", deepLink),
            ]),
          },
        );
      } catch (err) {
        console.error(
          `Error handling new member ${member.id}:`,
          (err as Error).message,
        );
      }
    }
  });
}
