import { Markup, Telegraf } from "telegraf";
import { message } from "telegraf/filters";
import { isAdminById } from "./auth";
import { adminState, backButton, ADMIN_HELP_BODY } from "./shared";
import type { CbCtx, TextCtx, AdminAction } from "./shared";
import * as members from "./sections/members";
import * as ban from "./sections/ban";
import * as welcomeMessages from "./sections/welcomeMessages";
import * as introGuide from "./sections/introGuide";
import * as stats from "./sections/stats";
import * as logs from "./sections/logs";

const sections: {
  handleCallback: (
    ctx: CbCtx,
    data: string,
    userId: number,
  ) => Promise<boolean>;
  handleText?: (
    ctx: TextCtx,
    text: string,
    state: AdminAction,
    userId: number,
  ) => Promise<boolean>;
}[] = [members, ban, welcomeMessages, introGuide, stats, logs];

const HELP_TEXT = "<b>Admin Menu Help</b>\n\n" + ADMIN_HELP_BODY;

function mainMenuKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("Members", "a:mem")],
    [Markup.button.callback("Ban / Kick", "a:ban")],
    [Markup.button.callback("Welcome Messages", "a:wm")],
    [Markup.button.callback("Intro Guide", "a:ig")],
    [Markup.button.callback("Stats", "a:stats")],
    [Markup.button.callback("Logs", "a:log")],
    [Markup.button.callback("Help", "a:help")],
  ]);
}

export function setup(bot: Telegraf): void {
  // /start admin deep link
  bot.start(async (ctx, next) => {
    if (ctx.chat.type !== "private") return next();
    if (ctx.payload !== "admin") return next();

    const userId = ctx.from.id;
    if (!(await isAdminById(ctx.telegram, userId))) {
      await ctx.reply("You are not an admin of the main group.");
      return;
    }

    adminState.delete(userId);
    await ctx.reply("Admin Menu", mainMenuKeyboard());
  });

  // Callback query router
  bot.on("callback_query", async (ctx, next) => {
    if (!("data" in ctx.callbackQuery)) return next();

    const data = ctx.callbackQuery.data;
    if (!data.startsWith("a:")) return next();

    const userId = ctx.from.id;

    if (!(await isAdminById(ctx.telegram, userId))) {
      await ctx.answerCbQuery("You are not an admin.");
      return;
    }

    await ctx.answerCbQuery();

    try {
      // Main menu
      if (data === "a:main") {
        adminState.delete(userId);
        await ctx.editMessageText("Admin Menu", mainMenuKeyboard());
        return;
      }

      // Noop for pagination label
      if (data === "a:noop") return;

      // Help
      if (data === "a:help") {
        await ctx.editMessageText(HELP_TEXT, {
          parse_mode: "HTML",
          ...Markup.inlineKeyboard([[backButton("a:main")]]),
        });
        return;
      }

      // Delegate to sections
      for (const section of sections) {
        if (await section.handleCallback(ctx, data, userId)) return;
      }
    } catch (err) {
      console.error(`Admin menu error:`, (err as Error).message);
      try {
        await ctx.editMessageText(
          `Error: ${(err as Error).message}`,
          Markup.inlineKeyboard([[backButton("a:main")]]),
        );
      } catch {
        // editMessageText may fail if message hasn't changed
      }
    }
  });

  // Text input handler
  bot.on(message("text"), async (ctx, next) => {
    if (ctx.chat.type !== "private") return next();

    const userId = ctx.from.id;
    const state = adminState.get(userId);
    if (!state) return next();

    if (!(await isAdminById(ctx.telegram, userId))) {
      adminState.delete(userId);
      return next();
    }

    const text = ctx.message.text;

    try {
      for (const section of sections) {
        if (
          section.handleText &&
          (await section.handleText(ctx, text, state, userId))
        )
          return;
      }
    } catch (err) {
      console.error(`Admin menu text handler error:`, (err as Error).message);
      adminState.delete(userId);
      await ctx.reply(
        `Error: ${(err as Error).message}`,
        Markup.inlineKeyboard([[backButton("a:main")]]),
      );
    }
  });
}
