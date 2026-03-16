import { Markup, Telegraf } from "telegraf";
import { message } from "telegraf/filters";
import { config } from "../config";
import { getMember, markIntroCompleted, flagNsLongtimer } from "../models/member";
import { getSetting } from "../models/settings";
import { getRandomWelcomeMessage } from "../models/welcomeMessage";
import { unmuteUser } from "../permissions";
import { getAllBlockedWords } from "../models/blockedWord";
import { escapeHtml } from "../utils/format";
import { validateIntro, detectNsLongtimer } from "../services/llm";
import { welcomeMessageIds } from "./newMember";

const DEFAULT_WELCOME = "Welcome to Superteam MY, {name}!";

type IntroState =
  | { step: "AWAITING_INTRO" }
  | { step: "AWAITING_NS" };

const introState = new Map<number, IntroState>();

async function deleteWelcomeMessage(
  telegram: import("telegraf").Telegram,
  userId: number,
): Promise<void> {
  const welcome = welcomeMessageIds.get(userId);
  if (welcome) {
    try {
      await telegram.deleteMessage(welcome.chatId, welcome.messageId);
    } catch {
      // message may already be deleted
    }
    welcomeMessageIds.delete(userId);
  }
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

      const wm = await getRandomWelcomeMessage();
      const introGuide = await getSetting("intro_guide");
      const name = member.first_name || ctx.from.username || "there";

      const text =
        (wm?.message ?? DEFAULT_WELCOME).replace(/\{name\}/g, name) +
        "\n\n" +
        (introGuide ?? "") +
        "\n\nPlease type your introduction below:";

      await ctx.reply(text, { parse_mode: "Markdown" });

      introState.set(userId, { step: "AWAITING_INTRO" });
    } catch (err) {
      console.error(
        `Error in intro flow start for user ${userId}:`,
        (err as Error).message,
      );
    }
  });

  // Handle NS yes/no callback buttons
  bot.on("callback_query", async (ctx, next) => {
    if (!("data" in ctx.callbackQuery)) return next();
    const data = ctx.callbackQuery.data;
    if (!data.startsWith("ns:")) return next();

    const userId = ctx.from.id;
    const state = introState.get(userId);
    if (!state || state.step !== "AWAITING_NS") return next();

    await ctx.answerCbQuery();

    if (data === "ns:yes") {
      await flagNsLongtimer(userId);
      console.log(`NS long-termer flagged: ${ctx.from.username || ctx.from.first_name} (${userId})`);
    }

    await markIntroCompleted(userId);
    try {
      await unmuteUser(ctx.telegram, userId);
    } catch {
      // Owner/admin can't be unmuted
    }

    const msg = data === "ns:yes"
      ? "Your introduction has been posted! You've been flagged as an NS long-termer. You can now chat freely in the group."
      : "Your introduction has been posted! You can now chat freely in the group.";
    await ctx.editMessageText(msg);

    introState.delete(userId);
    await deleteWelcomeMessage(ctx.telegram, userId);
  });

  // Collect intro text in private chats
  bot.on(message("text"), async (ctx, next) => {
    if (ctx.chat.type !== "private") return next();

    const userId = ctx.from.id;
    const state = introState.get(userId);
    if (!state) return next();

    // If waiting for NS answer as text fallback
    if (state.step === "AWAITING_NS") {
      const answer = ctx.message.text.trim().toLowerCase();
      if (answer === "yes" || answer === "y") {
        await flagNsLongtimer(userId);
        console.log(`NS long-termer flagged: ${ctx.from.username || ctx.from.first_name} (${userId})`);
      }

      await markIntroCompleted(userId);
      try {
        await unmuteUser(ctx.telegram, userId);
      } catch {
        // Owner/admin can't be unmuted
      }

      const msg = (answer === "yes" || answer === "y")
        ? "You've been flagged as an NS long-termer. You can now chat freely in the group."
        : "Got it! You can now chat freely in the group.";
      await ctx.reply(msg);
      introState.delete(userId);
      await deleteWelcomeMessage(ctx.telegram, userId);
      return;
    }

    const text = ctx.message.text;

    if (text.length < 20) {
      await ctx.reply(
        "Your introduction is a bit short. Please write at least 20 characters so the group can get to know you!",
      );
      return;
    }

    if (/(.)\1{4,}/.test(text)) {
      await ctx.reply(
        "Your introduction contains too many repeating characters. Please write a more meaningful introduction.",
      );
      return;
    }

    const blockedWords = await getAllBlockedWords();
    const hasBlockedWord = blockedWords.some((bw) => {
      const escaped = bw.word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return new RegExp(`\\b${escaped}\\b`, "i").test(text);
    });
    if (hasBlockedWord) {
      await ctx.reply(
        "Your introduction contains content that is not allowed. Please revise and try again.",
      );
      return;
    }

    // LLM validation (if OpenAI is configured)
    if (config.openaiApiKey) {
      try {
        const validation = await validateIntro(text);
        if (!validation.valid) {
          await ctx.reply(
            "Your introduction doesn't seem meaningful enough. Please write a genuine introduction about yourself so the community can get to know you!",
          );
          return;
        }
      } catch (err) {
        console.error(
          `LLM intro validation error for user ${userId}:`,
          (err as Error).message,
        );
      }
    }

    try {
      const name = escapeHtml(
        ctx.from.first_name || ctx.from.username || "there",
      );
      const username = ctx.from.username ? ` @${ctx.from.username}` : "";

      const introText = `<b>Introduction from</b>${username}\n\n${escapeHtml(text)}`;

      await ctx.telegram.sendMessage(config.mainGroupId, introText, {
        message_thread_id: config.introTopicId,
        parse_mode: "HTML",
      });

      // Don't mark completed yet — wait for NS answer
      // Always ask NS question
      introState.set(userId, { step: "AWAITING_NS" });
      await ctx.reply(
        "One last question — are you an NS long-termer?",
        Markup.inlineKeyboard([
          [Markup.button.callback("Yes", "ns:yes"),
           Markup.button.callback("No", "ns:no")],
        ]),
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
