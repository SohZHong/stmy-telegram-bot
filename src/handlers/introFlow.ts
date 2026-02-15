import { Telegraf } from "telegraf";
import { message } from "telegraf/filters";
import { config } from "../config";
import { getMember, markIntroCompleted } from "../models/member";
import { getSetting } from "../models/settings";
import { postToClosedTopic, unmuteUser } from "../permissions";

interface IntroState {
  state: "AWAITING_INTRO";
}

const introState = new Map<number, IntroState>();

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function setup(bot: Telegraf): void {
  // Handle /start intro deep link in private chats
  bot.start(async (ctx, next) => {
    if (ctx.chat.type !== "private") return next();

    const payload = ctx.payload;
    if (payload !== "intro") return next();

    const userId = ctx.from.id;

    try {
      const member = await getMember(userId);

      if (!member) {
        await ctx.reply(
          "I don't have you in my records. Please join the group first!",
        );
        return;
      }

      if (member.intro_completed) {
        await ctx.reply(
          "You've already completed your introduction! You can post freely in the group.",
        );
        return;
      }

      const welcomeMsg = await getSetting("welcome_message");
      const introGuide = await getSetting("intro_guide");
      const name = member.first_name || ctx.from.username || "there";

      const text =
        (welcomeMsg ?? "").replace(/\{name\}/g, name) +
        "\n\n" +
        (introGuide ?? "") +
        "\n\nPlease type your introduction below:";

      await ctx.reply(text, { parse_mode: "Markdown" });

      introState.set(userId, { state: "AWAITING_INTRO" });
    } catch (err) {
      console.error(
        `Error in intro flow start for user ${userId}:`,
        (err as Error).message,
      );
    }
  });

  // Collect intro text in private chats
  bot.on(message("text"), async (ctx, next) => {
    if (ctx.chat.type !== "private") return next();

    const userId = ctx.from.id;
    const state = introState.get(userId);
    if (!state) return next();

    const text = ctx.message.text;

    if (text.length < 20) {
      await ctx.reply(
        "Your introduction is a bit short. Please write at least 20 characters so the group can get to know you!",
      );
      return;
    }

    try {
      const name = escapeHtml(
        ctx.from.first_name || ctx.from.username || "there",
      );
      const username = ctx.from.username ? ` @${ctx.from.username}` : "";

      const introText = `<b>Introduction from</b>${username}\n\n${escapeHtml(text)}`;

      await postToClosedTopic(ctx.telegram, config.introTopicId, () =>
        ctx.telegram.sendMessage(config.mainGroupId, introText, {
          message_thread_id: config.introTopicId,
          parse_mode: "HTML",
        }),
      );

      await markIntroCompleted(userId);
      await unmuteUser(ctx.telegram, userId);
      introState.delete(userId);

      await ctx.reply(
        "Your introduction has been posted! You can now chat freely in the group.",
      );
    } catch (err) {
      console.error(
        `Error posting intro for user ${userId}:`,
        (err as Error).message,
      );
      await ctx.reply(
        "Something went wrong while posting your introduction. Please try again.",
      );
    }
  });

  // Catch-all for non-text messages while awaiting intro
  bot.on("message", async (ctx, next) => {
    if (ctx.chat.type !== "private") return next();

    const userId = ctx.from.id;
    const state = introState.get(userId);
    if (!state) return next();

    await ctx.reply("Please send your introduction as a text message.");
  });
}
