import { Markup, Telegraf } from "telegraf";
import { config } from "../config";
import { getMember, upsertMember } from "../models/member";
import { getRandomWelcomeMessage } from "../models/welcomeMessage";
import { muteUser } from "../permissions";

const INTRO_GATE_PREFIX = "igate_";

const DEFAULT_WELCOME = "Welcome to Superteam MY, {name}! Click below to introduce yourself.";

// Builds the welcome text + Start Introduction button. Shared between the
// public-welcome path (this file) and the join-request DM path (joinRequest.ts).
export async function buildIntroWelcome(user: {
  id: number;
  first_name?: string;
  username?: string;
}): Promise<{ text: string; keyboard: ReturnType<typeof Markup.inlineKeyboard> }> {
  const name = user.first_name || user.username || "there";
  const wm = await getRandomWelcomeMessage();
  const text = (wm?.message ?? DEFAULT_WELCOME).replace(
    /\{name\}/g,
    `[${name}](tg://user?id=${user.id})`,
  );
  const keyboard = Markup.inlineKeyboard([
    Markup.button.callback(
      "Start Introduction",
      `${INTRO_GATE_PREFIX}${user.id}`,
    ),
  ]);
  return { text, keyboard };
}

// Track welcome message IDs so introFlow can delete them after completion
export const welcomeMessageIds = new Map<number, { chatId: number; messageId: number }>();

// Deduplication: prevent both new_chat_members and chat_member from processing the same join
const recentlyProcessed = new Set<number>();

// Set by joinRequest.ts when a joiner has already been DMed via user_chat_id —
// suppresses the public welcome-topic post for that user.
const dmedViaJoinRequest = new Set<number>();
const DMED_VIA_JOIN_REQUEST_TTL_MS = 60_000;

export function markDmedViaJoinRequest(userId: number): void {
  dmedViaJoinRequest.add(userId);
  setTimeout(
    () => dmedViaJoinRequest.delete(userId),
    DMED_VIA_JOIN_REQUEST_TTL_MS,
  );
}

async function handleNewMember(
  telegram: import("telegraf").Telegram,
  chatId: number,
  member: { id: number; is_bot: boolean; username?: string; first_name?: string },
): Promise<void> {
  if (member.is_bot) return;
  // Already handled via chat_join_request: DM was sent, mute applied, upsert done.
  if (dmedViaJoinRequest.has(member.id)) return;
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

  // Mute the new member until they complete their intro
  try {
    await muteUser(telegram, member.id);
  } catch {
    // May lack permission to restrict members
  }

  const { text, keyboard } = await buildIntroWelcome(member);

  const sent = await telegram.sendMessage(config.mainGroupId, text, {
    message_thread_id: config.welcomeTopicId,
    parse_mode: "Markdown",
    ...keyboard,
  });

  // Store so introFlow can delete after completion
  welcomeMessageIds.set(member.id, {
    chatId: config.mainGroupId,
    messageId: sent.message_id,
  });
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

  // Intro-button gate: only the intended joiner can use the button.
  // Others get an alert popup naming the rightful user.
  bot.on("callback_query", async (ctx, next) => {
    if (!("data" in ctx.callbackQuery)) return next();
    const data = ctx.callbackQuery.data;
    if (!data.startsWith(INTRO_GATE_PREFIX)) return next();

    const targetId = parseInt(data.slice(INTRO_GATE_PREFIX.length), 10);
    if (!Number.isFinite(targetId)) {
      await ctx.answerCbQuery("Invalid button.");
      return;
    }

    if (ctx.from.id !== targetId) {
      let targetName = `user ${targetId}`;
      try {
        const target = await getMember(targetId);
        if (target) {
          targetName =
            target.first_name ||
            (target.username ? `@${target.username}` : targetName);
        }
      } catch {
        // fall back to "user <id>"
      }
      await ctx.answerCbQuery(
        `This Start Introduction button is for ${targetName}. Your own welcome message will appear when you join — please use the button there.`,
        { show_alert: true },
      );
      return;
    }

    const deepLink = `https://t.me/${ctx.botInfo.username}?start=intro`;
    await ctx.answerCbQuery(undefined, { url: deepLink });
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
