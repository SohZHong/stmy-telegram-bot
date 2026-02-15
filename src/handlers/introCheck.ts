import { Telegraf } from "telegraf";
import { config } from "../config";
import { getMember, markIntroCompleted } from "../models/member";

export function setup(bot: Telegraf): void {
  bot.on("message", async (ctx, next) => {
    const isIntroTopic =
      ctx.chat.id === config.mainGroupId &&
      "message_thread_id" in ctx.message &&
      ctx.message.message_thread_id === config.introTopicId;
    if (!isIntroTopic) return next();
    if (!("text" in ctx.message)) return next();

    const userId = ctx.from.id;
    if (ctx.from.is_bot) return next();

    try {
      const member = await getMember(userId);

      if (!member || member.intro_completed) return next();

      await markIntroCompleted(userId);

      const name = ctx.from.first_name || ctx.from.username || "there";

      // Send group confirmation, then auto-delete after 10 seconds
      const confirmation = await ctx.reply(
        `Thanks for introducing yourself, ${name}! You can now post freely in the group.`,
      );
      setTimeout(async () => {
        try {
          await ctx.telegram.deleteMessage(
            confirmation.chat.id,
            confirmation.message_id,
          );
        } catch {
          // Message may already be deleted
        }
      }, 10_000);

      // DM the user a persistent confirmation
      try {
        await ctx.telegram.sendMessage(
          userId,
          `Thanks for introducing yourself, ${name}! You can now post freely in the group. 🎉`,
        );
      } catch {
        // User hasn't started the bot but group message already sent above
      }
    } catch (err) {
      console.error(
        `Error checking intro for user ${userId}:`,
        (err as Error).message,
      );
    }

    return next();
  });
}
