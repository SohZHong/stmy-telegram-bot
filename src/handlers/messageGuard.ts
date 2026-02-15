import { Telegraf } from "telegraf";
import { config } from "../config";
import { getMember } from "../models/member";

const REMINDER_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes
const lastReminderTime = new Map<number, number>();

export function setup(bot: Telegraf): void {
  bot.on("message", async (ctx, next) => {
    // Only act in the main group
    if (ctx.chat.id !== config.mainGroupId) return next();

    // Skip messages in the intro topic and welcome topic
    if (
      "message_thread_id" in ctx.message &&
      (ctx.message.message_thread_id === config.introTopicId ||
        ctx.message.message_thread_id === config.welcomeTopicId)
    ) {
      return next();
    }

    // Skip bots
    if (ctx.from.is_bot) return next();

    const userId = ctx.from.id;

    try {
      const member = await getMember(userId);

      // If the user is not tracked or has already completed their intro, pass through
      if (!member || member.intro_completed) return next();

      // User hasn't introduced themselves then delete their message
      await ctx.deleteMessage();

      // Rate-limited DM reminder
      const now = Date.now();
      const lastSent = lastReminderTime.get(userId) ?? 0;
      if (now - lastSent >= REMINDER_COOLDOWN_MS) {
        lastReminderTime.set(userId, now);
        try {
          await ctx.telegram.sendMessage(
            userId,
            "Your message was removed because you haven't introduced yourself yet. Please go to the Welcome topic and click the \"Start Introduction\" button to introduce yourself!",
          );
        } catch {
          // User hasn't started the bot then nothing we can do
        }
      }
    } catch (err) {
      console.error(
        `Error in message guard for user ${userId}:`,
        (err as Error).message,
      );
      // On error, let the message through rather than silently failing
      return next();
    }
  });
}
