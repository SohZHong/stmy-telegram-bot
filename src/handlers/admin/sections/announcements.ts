import { Markup } from "telegraf";
import type { CbCtx, TextCtx, AdminAction } from "../shared";
import { adminState, backButton } from "../shared";
import { config } from "../../../config";
import { createAdminLog } from "../../../models/adminLog";

const pendingAnnouncement = new Map<number, string>();
const pendingSender = new Map<number, string>();

export async function handleCallback(
  ctx: CbCtx,
  data: string,
  userId: number,
): Promise<boolean> {
  if (data === "a:ann") {
    adminState.delete(userId);
    pendingAnnouncement.delete(userId);
    pendingSender.delete(userId);
    await ctx.editMessageText(
      "Announcements\n\nBroadcast a message to all group admins via DM.",
      Markup.inlineKeyboard([
        [Markup.button.callback("New Announcement", "a:ann:new")],
        [backButton("a:main")],
      ]),
    );
    return true;
  }

  if (data === "a:ann:new") {
    adminState.set(userId, { type: "AWAITING_ANN" });
    await ctx.editMessageText(
      "Send the announcement message.",
      Markup.inlineKeyboard([[backButton("a:ann")]]),
    );
    return true;
  }

  if (data === "a:ann:confirm") {
    const message = pendingAnnouncement.get(userId);
    if (!message) {
      await ctx.editMessageText(
        "No pending announcement found.",
        Markup.inlineKeyboard([[backButton("a:ann")]]),
      );
      return true;
    }

    pendingAnnouncement.delete(userId);
    const sender = pendingSender.get(userId) ?? String(userId);
    pendingSender.delete(userId);
    const text = `<b>Announcement by ${sender}</b>\n\n${message}`;

    const admins = await ctx.telegram.getChatAdministrators(
      config.mainGroupId,
    );

    let sent = 0;
    let failed = 0;
    for (const admin of admins) {
      if (admin.user.is_bot || admin.user.id === userId) continue;
      try {
        await ctx.telegram.sendMessage(admin.user.id, text, {
          parse_mode: "HTML",
        });
        sent++;
      } catch {
        failed++;
      }
    }

    await createAdminLog(
      "send_announcement",
      userId,
      null,
      message.slice(0, 100),
    );

    const result =
      `Announcement sent to ${sent} admin(s).` +
      (failed > 0
        ? `\n${failed} failed (admin hasn't started a DM with the bot).`
        : "");

    await ctx.editMessageText(
      result,
      Markup.inlineKeyboard([[backButton("a:ann")]]),
    );
    return true;
  }

  if (data === "a:ann:cancel") {
    pendingAnnouncement.delete(userId);
    pendingSender.delete(userId);
    await ctx.editMessageText(
      "Announcement cancelled.",
      Markup.inlineKeyboard([[backButton("a:ann")]]),
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
  if (state.type !== "AWAITING_ANN") return false;

  adminState.delete(userId);
  pendingAnnouncement.set(userId, text);

  const from = ctx.from!;
  const sender = from.username ? `@${from.username}` : from.first_name || "Unknown";
  pendingSender.set(userId, sender);

  await ctx.reply(
    `<b>Preview</b>\n\n<b>Announcement by ${sender}</b>\n\n${text}`,
    {
      parse_mode: "HTML",
      ...Markup.inlineKeyboard([
        [Markup.button.callback("Confirm & Send", "a:ann:confirm")],
        [Markup.button.callback("Cancel", "a:ann:cancel")],
      ]),
    },
  );
  return true;
}
