import { Telegraf } from "telegraf";
import { config } from "../config";
import { getMember, upsertMember } from "../models/member";
import { getSetting } from "../models/settings";

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

        const welcomeMsg = await getSetting("welcome_message");
        const introGuide = await getSetting("intro_guide");
        const name = member.first_name || member.username || "there";
        const text =
          (welcomeMsg ?? "").replace(/\{name\}/g, name) +
          "\n\n" +
          (introGuide ?? "");

        // Try to DM the user
        try {
          await ctx.telegram.sendMessage(member.id, text, {
            parse_mode: "Markdown",
          });
        } catch {
          // DM failed (user hasn't started the bot) — fall back to a brief group message, then auto-delete
          const fallback = await ctx.reply(
            `Welcome, [${name}](tg://user?id=${member.id})! I sent you a DM with instructions, but it looks like you haven't started a chat with me yet. Please open a DM with me to get started!`,
            { parse_mode: "Markdown" },
          );
          setTimeout(async () => {
            try {
              await ctx.telegram.deleteMessage(
                fallback.chat.id,
                fallback.message_id,
              );
            } catch {
              // Message may already be deleted
            }
          }, 15_000);
        }
      } catch (err) {
        console.error(
          `Error handling new member ${member.id}:`,
          (err as Error).message,
        );
      }
    }
  });
}
