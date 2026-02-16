import { Markup } from "telegraf";
import type { CbCtx, TextCtx, AdminAction } from "../shared";
import {
  adminState,
  PAGE_SIZE,
  truncate,
  backButton,
  memberLabel,
} from "../shared";
import {
  getMember,
  getPendingMembers,
  countPendingMembers,
  searchMembers,
  markIntroCompleted,
  resetIntroStatus,
} from "../../../models/member";
import { muteUser, unmuteUser } from "../../../permissions";
import { createAdminLog } from "../../../models/adminLog";

export async function handleCallback(
  ctx: CbCtx,
  data: string,
  userId: number,
): Promise<boolean> {
  if (data === "a:mem") {
    adminState.delete(userId);
    await ctx.editMessageText(
      "Members",
      Markup.inlineKeyboard([
        [Markup.button.callback("List Pending", "a:mem:pend:0")],
        [Markup.button.callback("Search", "a:mem:find")],
        [backButton("a:main")],
      ]),
    );
    return true;
  }

  if (data.startsWith("a:mem:pend:")) {
    const page = parseInt(data.split(":")[3], 10);
    const offset = page * PAGE_SIZE;
    const [members, total] = await Promise.all([
      getPendingMembers(PAGE_SIZE, offset),
      countPendingMembers(),
    ]);

    if (total === 0) {
      await ctx.editMessageText(
        "No pending members.",
        Markup.inlineKeyboard([[backButton("a:mem")]]),
      );
      return true;
    }

    const totalPages = Math.ceil(total / PAGE_SIZE);
    const rows = members.map((m) => [
      Markup.button.callback(
        truncate(memberLabel(m), 40),
        `a:mem:v:${m.telegram_id}`,
      ),
    ]);

    const nav: ReturnType<typeof Markup.button.callback>[] = [];
    if (page > 0)
      nav.push(Markup.button.callback("< Prev", `a:mem:pend:${page - 1}`));
    nav.push(Markup.button.callback(`${page + 1}/${totalPages}`, "a:noop"));
    if (page < totalPages - 1)
      nav.push(Markup.button.callback("Next >", `a:mem:pend:${page + 1}`));

    rows.push(nav);
    rows.push([backButton("a:mem")]);

    await ctx.editMessageText(
      `Pending Members (${total})`,
      Markup.inlineKeyboard(rows),
    );
    return true;
  }

  if (data === "a:mem:find") {
    adminState.set(userId, { type: "AWAITING_MEMBER_SEARCH" });
    await ctx.editMessageText(
      "Send a username, name, or Telegram ID to search.",
      Markup.inlineKeyboard([[backButton("a:mem")]]),
    );
    return true;
  }

  if (data.startsWith("a:mem:v:")) {
    const telegramId = parseInt(data.split(":")[3], 10);
    const member = await getMember(telegramId);
    if (!member) {
      await ctx.editMessageText(
        "Member not found.",
        Markup.inlineKeyboard([[backButton("a:mem")]]),
      );
      return true;
    }

    const status = member.intro_completed ? "Completed" : "Pending";
    const text = [
      `Name: ${member.first_name || "N/A"}`,
      `Username: ${member.username ? "@" + member.username : "N/A"}`,
      `Telegram ID: ${member.telegram_id}`,
      `Intro: ${status}`,
      `Joined: ${member.joined_at.toISOString().split("T")[0]}`,
    ].join("\n");

    const buttons: ReturnType<typeof Markup.button.callback>[][] = [];
    if (!member.intro_completed) {
      buttons.push([
        Markup.button.callback(
          "Approve (mark done + unmute)",
          `a:mem:apr:${member.telegram_id}`,
        ),
      ]);
    } else {
      buttons.push([
        Markup.button.callback(
          "Reset Intro (mute + require redo)",
          `a:mem:rst:${member.telegram_id}`,
        ),
      ]);
    }
    buttons.push([backButton("a:mem")]);

    await ctx.editMessageText(text, Markup.inlineKeyboard(buttons));
    return true;
  }

  if (data.startsWith("a:mem:apr:")) {
    const telegramId = parseInt(data.split(":")[3], 10);
    await markIntroCompleted(telegramId);
    try {
      await unmuteUser(ctx.telegram, telegramId);
    } catch {
      // May lack permission
    }
    await createAdminLog("approve_member", userId, telegramId);
    await ctx.editMessageText(
      `Member ${telegramId} approved and unmuted.`,
      Markup.inlineKeyboard([[backButton("a:mem")]]),
    );
    return true;
  }

  if (data.startsWith("a:mem:rst:")) {
    const telegramId = parseInt(data.split(":")[3], 10);
    await resetIntroStatus(telegramId);
    try {
      await muteUser(ctx.telegram, telegramId);
    } catch {
      // May lack permission
    }
    await createAdminLog("reset_intro", userId, telegramId);
    await ctx.editMessageText(
      `Member ${telegramId} intro reset and muted.`,
      Markup.inlineKeyboard([[backButton(`a:mem:v:${telegramId}`)]]),
    );
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
  if (state.type !== "AWAITING_MEMBER_SEARCH") return false;

  adminState.delete(userId);
  const results = await searchMembers(text);
  if (results.length === 0) {
    await ctx.reply(
      "No members found.",
      Markup.inlineKeyboard([[backButton("a:mem")]]),
    );
    return true;
  }

  const rows = results.map((m) => [
    Markup.button.callback(
      truncate(memberLabel(m), 40),
      `a:mem:v:${m.telegram_id}`,
    ),
  ]);
  rows.push([backButton("a:mem")]);

  await ctx.reply(
    `Found ${results.length} member(s)`,
    Markup.inlineKeyboard(rows),
  );
  return true;
}
