import { Markup } from "telegraf";
import type { CbCtx, TextCtx, AdminAction } from "../shared";
import { adminState, backButton, DEFAULT_ADMIN_GUIDE } from "../shared";
import { getSetting, setSetting } from "../../../models/settings";
import { createAdminLog } from "../../../models/adminLog";

export async function handleCallback(
  ctx: CbCtx,
  data: string,
  userId: number,
): Promise<boolean> {
  if (data === "a:ag") {
    await ctx.editMessageText(
      "Admin Guide\n\nThe admin guide is posted and pinned in the admin topic via /adminguide. Edit the template here, then re-run the command to update.",
      Markup.inlineKeyboard([
        [Markup.button.callback("View Current", "a:ag:view")],
        [Markup.button.callback("Edit", "a:ag:edit")],
        [backButton("a:main")],
      ]),
    );
    return true;
  }

  if (data === "a:ag:view") {
    const guide = await getSetting("admin_guide");
    await ctx.editMessageText(
      guide || DEFAULT_ADMIN_GUIDE,
      Markup.inlineKeyboard([
        [Markup.button.callback("Edit", "a:ag:edit")],
        [backButton("a:ag")],
      ]),
    );
    return true;
  }

  if (data === "a:ag:edit") {
    adminState.set(userId, { type: "AWAITING_AG_EDIT" });
    await ctx.editMessageText(
      "Send the updated admin guide text.\nUse {botUsername} as a placeholder for the bot's username.",
      Markup.inlineKeyboard([[backButton("a:ag")]]),
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
  if (state.type !== "AWAITING_AG_EDIT") return false;

  adminState.delete(userId);
  await setSetting("admin_guide", text, userId);
  await createAdminLog("edit_admin_guide", userId, null, text.slice(0, 100));
  await ctx.reply(
    "Admin guide updated! Run /adminguide in the group to re-post and re-pin it.",
    Markup.inlineKeyboard([[backButton("a:ag")]]),
  );
  return true;
}
