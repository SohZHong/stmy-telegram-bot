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
import * as blockedWords from "./sections/blockedWords";
import * as announcements from "./sections/announcements";
import * as adminGuide from "./sections/adminGuide";
import * as reports from "./sections/reports";
import * as insights from "./sections/insights";
import * as delegation from "./sections/delegation";

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
}[] = [
  members,
  ban,
  welcomeMessages,
  introGuide,
  adminGuide,
  stats,
  logs,
  blockedWords,
  announcements,
  reports,
  insights,
  delegation,
];

const HELP_TEXT = "<b>Admin Menu Help</b>\n\n" + ADMIN_HELP_BODY;

function mainMenuKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("Members", "a:mem")],
    [Markup.button.callback("Ban / Kick", "a:ban")],
    [Markup.button.callback("Welcome Messages", "a:wm")],
    [Markup.button.callback("Intro Guide", "a:ig")],
    [Markup.button.callback("Admin Guide", "a:ag")],
    [Markup.button.callback("Stats", "a:stats")],
    [Markup.button.callback("Blocked Words", "a:bw")],
    [Markup.button.callback("Announcements", "a:ann")],
    [Markup.button.callback("Reports", "a:rpt")],
    [Markup.button.callback("Logs", "a:log")],
    [Markup.button.callback("AI Insights", "a:ai")],
    [Markup.button.callback("Delegation", "a:dlg")],
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
      const msg = (err as Error).message;
      // Ignore "message is not modified" — happens on double-tap or navigating back to the same screen
      if (msg.includes("message is not modified")) return;
      console.error(`Admin menu error:`, msg);
      try {
        await ctx.editMessageText(
          `Error: ${msg}`,
          Markup.inlineKeyboard([[backButton("a:main")]]),
        );
      } catch {
        // editMessageText may fail
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
