import { Telegraf } from "telegraf";
import { isAdmin } from "./auth";
import { getSetting, setSetting } from "../../models/settings";

export function setup(bot: Telegraf): void {
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

  bot.command("viewintroguide", async (ctx) => {
    if (!(await isAdmin(ctx))) {
      return ctx.reply("Only main group admins can use this command.");
    }

    const msg = await getSetting("intro_guide");
    return ctx.reply(`Current intro guide:\n\n${msg}`);
  });
}
