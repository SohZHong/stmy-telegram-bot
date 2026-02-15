import { Context, Telegraf } from "telegraf";
import { config } from "../config";
import { getSetting, setSetting } from "../models/settings";

async function isAdmin(ctx: Context): Promise<boolean> {
  if (!ctx.from) return false;
  try {
    const chatMember = await ctx.telegram.getChatMember(
      config.mainGroupId,
      ctx.from.id,
    );
    return (
      chatMember.status === "administrator" || chatMember.status === "creator"
    );
  } catch {
    return false;
  }
}

export function setup(bot: Telegraf): void {
  bot.command("setwelcome", async (ctx) => {
    if (!(await isAdmin(ctx))) {
      return ctx.reply("Only main group admins can use this command.");
    }

    const text = ctx.message.text.replace(/^\/setwelcome\s*/, "");
    if (!text) {
      return ctx.reply(
        "Usage: /setwelcome <message>\nUse {name} as a placeholder for the user's name.",
      );
    }

    await setSetting("welcome_message", text, ctx.from.id);
    return ctx.reply("Welcome message updated!");
  });

  bot.command("setintroguide", async (ctx) => {
    if (!(await isAdmin(ctx))) {
      return ctx.reply("Only main group admins can use this command.");
    }

    const text = ctx.message.text.replace(/^\/setintroguide\s*/, "");
    if (!text) {
      return ctx.reply("Usage: /setintroguide <message>");
    }

    await setSetting("intro_guide", text, ctx.from.id);
    return ctx.reply("Intro guide updated!");
  });

  bot.command("viewwelcome", async (ctx) => {
    if (!(await isAdmin(ctx))) {
      return ctx.reply("Only main group admins can use this command.");
    }

    const msg = await getSetting("welcome_message");
    return ctx.reply(`Current welcome message:\n\n${msg}`);
  });

  bot.command("viewintroguide", async (ctx) => {
    if (!(await isAdmin(ctx))) {
      return ctx.reply("Only main group admins can use this command.");
    }

    const msg = await getSetting("intro_guide");
    return ctx.reply(`Current intro guide:\n\n${msg}`);
  });
}
