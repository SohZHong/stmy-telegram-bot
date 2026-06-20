import { Telegraf } from "telegraf";
import { config } from "../config";
import { getMember, upsertMember } from "../models/member";
import { muteUser } from "../permissions";

// Deduplication: prevent both new_chat_members and chat_member from processing the same join
const recentlyProcessed = new Set<number>();

async function handleNewMember(
  telegram: import("telegraf").Telegram,
  chatId: number,
  member: { id: number; is_bot: boolean; username?: string; first_name?: string },
): Promise<void> {
  if (member.is_bot) return;
  if (recentlyProcessed.has(member.id)) return;
  recentlyProcessed.add(member.id);
  setTimeout(() => recentlyProcessed.delete(member.id), 10_000);

  const existing = await getMember(member.id);

  if (existing?.intro_completed) {
    const name = member.first_name || member.username || "there";
    await telegram.sendMessage(
      config.mainGroupId,
      `Welcome back, [${name}](tg://user?id=${member.id})!`,
      {
        message_thread_id: config.welcomeTopicId,
        parse_mode: "Markdown",
      },
    );
    return;
  }

  // If member already exists (not intro completed), skip to avoid double-processing
  if (existing) return;

  await upsertMember(
    member.id,
    member.username,
    member.first_name,
    chatId,
  );

  // Mute the new member until they complete their intro. No per-join message is
  // posted — they introduce via the single pinned "Introduce yourself" button
  // (see ensureIntroPost in introFlow.ts). Muting blocks sending messages but
  // NOT tapping inline buttons, so a muted member can still start the flow.
  try {
    await muteUser(telegram, member.id);
  } catch {
    // May lack permission to restrict members
  }
}

export function setup(bot: Telegraf): void {
  bot.on("new_chat_members", async (ctx) => {
    if (ctx.chat.id !== config.mainGroupId) return;

    // Delete the "X joined the group" service message
    try {
      await ctx.deleteMessage();
    } catch {
      // May lack permission to delete service messages
    }

    for (const member of ctx.message.new_chat_members) {
      try {
        await handleNewMember(ctx.telegram, ctx.chat.id, member);
      } catch (err) {
        console.error(
          `Error handling new member ${member.id}:`,
          (err as Error).message,
        );
      }
    }
  });

  // Fallback: ChatMemberUpdate for cases where new_chat_members is not fired
  bot.on("chat_member", async (ctx) => {
    if (ctx.chat.id !== config.mainGroupId) return;

    const oldStatus = ctx.chatMember.old_chat_member.status;
    const newStatus = ctx.chatMember.new_chat_member.status;

    // Only handle joins: left/kicked → member/restricted
    if (
      (oldStatus !== "left" && oldStatus !== "kicked") ||
      (newStatus !== "member" && newStatus !== "restricted")
    ) {
      return;
    }

    const user = ctx.chatMember.new_chat_member.user;

    try {
      await handleNewMember(ctx.telegram, ctx.chat.id, user);
    } catch (err) {
      console.error(
        `Error handling chat_member update for ${user.id}:`,
        (err as Error).message,
      );
    }
  });
}
