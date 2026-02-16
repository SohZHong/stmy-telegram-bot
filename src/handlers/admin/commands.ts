import { Telegraf } from "telegraf";
import { isAdmin } from "./auth";
import { getSetting, setSetting } from "../../models/settings";

const HELP_TEXT = [
  "<b>Superteam MY Bot</b>",
  "",
  "<b>General</b>",
  "/help  —  Show this message",
  "",
  "<b>Admin only</b>",
  "/setintroguide <code>&lt;msg&gt;</code>  —  Set the intro guide",
  "/viewintroguide  —  View the current intro guide",
  "",
  "<b>Admin menu (DM only)</b>",
  "Send <code>/start admin</code> to the bot in DM to open the admin panel.",
  "Manage members, bans, welcome messages, intro guide, and stats.",
].join("\n");

export function setup(bot: Telegraf): void {
  bot.command("help", async (ctx) => {
    await ctx.reply(HELP_TEXT, { parse_mode: "HTML" });
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

  bot.command("viewintroguide", async (ctx) => {
    if (!(await isAdmin(ctx))) {
      return ctx.reply("Only main group admins can use this command.");
    }

    const msg = await getSetting("intro_guide");
    return ctx.reply(`Current intro guide:\n\n${msg}`);
  });
}
