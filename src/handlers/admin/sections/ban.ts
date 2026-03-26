import { Markup } from "telegraf";
import type { CbCtx, TextCtx, AdminAction } from "../shared";
import { adminState, backButton } from "../shared";
import { truncate } from "../../../utils/format";
import { memberLabel } from "../../../utils/user";
import { getMember, searchMembers, deleteMember } from "../../../models/member";
import { config } from "../../../config";
import { createAdminLog } from "../../../models/adminLog";
import { isAdminById } from "../auth";

export async function handleCallback(
  ctx: CbCtx,
  data: string,
  userId: number,
): Promise<boolean> {
  if (data === "a:ban") {
    adminState.set(userId, { type: "AWAITING_BAN_SEARCH" });
    await ctx.editMessageText(
      "Ban / Kick\n\nSearch for a member to ban (with message wipe) or kick from the group. Group admins are protected from moderation.\n\nSend a username, name, or Telegram ID to find the member.",
      Markup.inlineKeyboard([[backButton("a:main")]]),
    );
    return true;
  }

  if (data.startsWith("a:ban:v:")) {
    const telegramId = parseInt(data.split(":")[3], 10);
    const member = await getMember(telegramId);
    if (!member) {
      await ctx.editMessageText(
        "Member not found.",
        Markup.inlineKeyboard([[backButton("a:main")]]),
      );
      return true;
    }

    const text = `${memberLabel(member)}\nID: ${member.telegram_id}`;
    await ctx.editMessageText(
      text,
      Markup.inlineKeyboard([
        [
          Markup.button.callback(
            "Ban + Wipe Messages",
            `a:ban:ban:${member.telegram_id}`,
          ),
        ],
        [Markup.button.callback("Kick", `a:ban:kick:${member.telegram_id}`)],
        [backButton("a:main")],
      ]),
    );
    return true;
  }

  if (data.startsWith("a:ban:ban:")) {
    const telegramId = parseInt(data.split(":")[3], 10);
    if (await isAdminById(ctx.telegram, telegramId)) {
      await ctx.editMessageText(
        "This user is a group admin and cannot be banned.",
        Markup.inlineKeyboard([[backButton("a:main")]]),
      );
      return true;
    }
    try {
      await ctx.telegram.banChatMember(
        config.mainGroupId,
        telegramId,
        undefined,
        { revoke_messages: true },
      );
      await deleteMember(telegramId);
      await createAdminLog("ban_member", userId, telegramId);
      await ctx.editMessageText(
        `User ${telegramId} banned and messages wiped.`,
        Markup.inlineKeyboard([[backButton("a:main")]]),
      );
    } catch (err) {
      await ctx.editMessageText(
        `Failed to ban: ${(err as Error).message}`,
        Markup.inlineKeyboard([[backButton("a:main")]]),
      );
    }
    return true;
  }

  if (data.startsWith("a:ban:kick:")) {
    const telegramId = parseInt(data.split(":")[3], 10);
    if (await isAdminById(ctx.telegram, telegramId)) {
      await ctx.editMessageText(
        "This user is a group admin and cannot be kicked.",
        Markup.inlineKeyboard([[backButton("a:main")]]),
      );
      return true;
    }
    try {
      await ctx.telegram.banChatMember(config.mainGroupId, telegramId);
      await ctx.telegram.unbanChatMember(config.mainGroupId, telegramId);
      await deleteMember(telegramId);
      await createAdminLog("kick_member", userId, telegramId);
      await ctx.editMessageText(
        `User ${telegramId} kicked.`,
        Markup.inlineKeyboard([[backButton("a:main")]]),
      );
    } catch (err) {
      await ctx.editMessageText(
        `Failed to kick: ${(err as Error).message}`,
        Markup.inlineKeyboard([[backButton("a:main")]]),
      );
    }
    return true;
  }

  return false;
}

export async function handleText(
  ctx: TextCtx,
  text: string,
  state: AdminAction,
  userId: number,
): Promise<boolean> {
  if (state.type !== "AWAITING_BAN_SEARCH") return false;

  adminState.delete(userId);
  const results = await searchMembers(text);
  if (results.length === 0) {
    await ctx.reply(
      "No members found.",
      Markup.inlineKeyboard([[backButton("a:main")]]),
    );
    return true;
  }

  const rows = results.map((m) => [
    Markup.button.callback(
      truncate(memberLabel(m), 40),
      `a:ban:v:${m.telegram_id}`,
    ),
  ]);
  rows.push([backButton("a:main")]);

  await ctx.reply(
    `Found ${results.length} member(s)`,
    Markup.inlineKeyboard(rows),
  );
  return true;
}
