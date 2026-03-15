import { Telegraf } from "telegraf";

export function setup(bot: Telegraf): void {
  bot.command("setup", async (ctx) => {
    if (ctx.chat.type === "private") {
      await ctx.reply("Run this command inside your group topics.");
      return;
    }

    const threadId =
      "message_thread_id" in ctx.message
        ? ctx.message.message_thread_id
        : null;
    const topicName =
      threadId == null
        ? "General (no topic)"
        : `Topic thread ID: ${threadId}`;

    await ctx.reply(`Chat ID: \`${ctx.chat.id}\`\n${topicName}`, {
      parse_mode: "Markdown",
    });
  });
}
