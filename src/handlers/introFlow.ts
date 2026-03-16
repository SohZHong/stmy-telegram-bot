import { Markup, Telegraf } from "telegraf";
import { message } from "telegraf/filters";
import { config } from "../config";
import { getMember, markIntroCompleted, flagNsLongtimer } from "../models/member";
import { getSetting } from "../models/settings";
import { getRandomWelcomeMessage } from "../models/welcomeMessage";
import { unmuteUser } from "../permissions";
import { getAllBlockedWords } from "../models/blockedWord";
import { escapeHtml } from "../utils/format";
import { validateIntro } from "../services/llm";
import { welcomeMessageIds } from "./newMember";

const DEFAULT_WELCOME = "Welcome to Superteam MY, {name}!";

type IntroState =
  | { step: "AWAITING_INTRO" }
  | { step: "AWAITING_NS"; introText: string };

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

async function finalizeIntro(
  telegram: import("telegraf").Telegram,
  userId: number,
  introText: string,
  username: string | undefined,
  isNsLongtimer: boolean,
): Promise<void> {
  // Post intro to Intro topic
  const escapedIntro = escapeHtml(introText);
  const usernameTag = username ? ` @${username}` : "";
  const postText = `<b>Introduction from</b>${usernameTag}\n\n${escapedIntro}`;

  await telegram.sendMessage(config.mainGroupId, postText, {
    message_thread_id: config.introTopicId,
    parse_mode: "HTML",
  });

  // Flag NS if yes
  if (isNsLongtimer) {
    await flagNsLongtimer(userId);
    console.log(`NS long-termer flagged: ${username || userId} (${userId})`);
  }

  // Mark completed + unmute
  await markIntroCompleted(userId);
  try {
    await unmuteUser(telegram, userId);
  } catch {
    // Owner/admin can't be unmuted
  }

  // Delete welcome message from Welcome topic
  await deleteWelcomeMessage(telegram, userId);
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

    try {
      await finalizeIntro(
        ctx.telegram,
        userId,
        state.introText,
        ctx.from.username,
        data === "ns:yes",
      );

      const msg = data === "ns:yes"
        ? "Your introduction has been posted! You've been flagged as an NS long-termer. You can now chat freely in the group."
        : "Your introduction has been posted! You can now chat freely in the group.";
      await ctx.editMessageText(msg);
    } catch (err) {
      console.error(`Error finalizing intro for user ${userId}:`, (err as Error).message);
      await ctx.editMessageText("Something went wrong. Please try again with /start intro.");
    }

    introState.delete(userId);
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
      const isYes = answer === "yes" || answer === "y";

      try {
        await finalizeIntro(
          ctx.telegram,
          userId,
          state.introText,
          ctx.from.username,
          isYes,
        );

        const msg = isYes
          ? "Your introduction has been posted! You've been flagged as an NS long-termer. You can now chat freely in the group."
          : "Your introduction has been posted! You can now chat freely in the group.";
        await ctx.reply(msg);
      } catch (err) {
        console.error(`Error finalizing intro for user ${userId}:`, (err as Error).message);
        await ctx.reply("Something went wrong. Please try again with /start intro.");
      }

      introState.delete(userId);
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

    // Intro passed validation — save text and ask NS question
    introState.set(userId, { step: "AWAITING_NS", introText: text });
    await ctx.reply(
      "One last question — are you an NS long-termer?",
      Markup.inlineKeyboard([
        [Markup.button.callback("Yes", "ns:yes"),
         Markup.button.callback("No", "ns:no")],
      ]),
    );
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
