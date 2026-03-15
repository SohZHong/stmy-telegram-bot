import { Telegraf } from "telegraf";
import { config } from "../config";
import { isContactQuery } from "../services/llm";

const CONTACT_KEYWORDS = [
  "who",
  "contact",
  "in charge",
  "person",
  "reach",
  "responsible",
  "talk to",
  "message",
  "dm",
  "point of contact",
  "poc",
  "pic",
  "lead",
  "head",
  "manager",
  "admin",
  "founder",
  "superteam",
  "stmy",
];

export function setup(bot: Telegraf): void {
  bot.on("message", async (ctx, next) => {
    if (ctx.chat.type !== "supergroup" && ctx.chat.type !== "group")
      return next();
    if (!("text" in ctx.message) || !ctx.message.text) return next();
    if (!config.picHandles) return next();
    if (!config.openaiApiKey) return next();

    const textLower = ctx.message.text.toLowerCase();
    if (!CONTACT_KEYWORDS.some((kw) => textLower.includes(kw))) return next();

    try {
      const isQuery = await isContactQuery(ctx.message.text);
      if (!isQuery) return next();

      await ctx.reply(
        `💡 For all Superteam MY related questions, feel free to reach out to:\n\n` +
          `👉 ${config.picHandles}\n\n` +
          `They'll be happy to help!`,
      );
    } catch (err) {
      console.error("Contact query check failed:", (err as Error).message);
    }

    return next();
  });
}
