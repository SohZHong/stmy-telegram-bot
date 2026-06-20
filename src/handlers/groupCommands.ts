import { Telegraf } from "telegraf";
import { config } from "../config";
import { getMember, upsertMember } from "../models/member";
import { isAdminById } from "./admin/auth";

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

  // Simulate new member registration for testing (admin only)
  bot.command("testjoin", async (ctx) => {
    if (ctx.chat.type === "private") {
      await ctx.reply("Run this command in the group.");
      return;
    }
    if (ctx.chat.id !== config.mainGroupId) return;

    // Gate behind admin check
    if (!(await isAdminById(ctx.telegram, ctx.from.id))) {
      await ctx.reply("Only admins can use /testjoin.");
      return;
    }

    const user = ctx.from;
    const existing = await getMember(user.id);

    if (existing?.intro_completed) {
      await ctx.reply("You're already introduced. Clear your data first.");
      return;
    }

    await upsertMember(user.id, user.username, user.first_name, ctx.chat.id);

    await ctx.reply(
      'Test join registered — you are now an un-introduced member. Tap the pinned "Introduce yourself" button (or DM me /start intro) to test the intro flow.',
    );
  });
}
