import { Markup } from "telegraf";
import type { CbCtx, TextCtx, AdminAction } from "../shared";
import { adminState, backButton } from "../shared";
import { getSetting, setSetting } from "../../../models/settings";
import { createAdminLog } from "../../../models/adminLog";

export async function handleCallback(
  ctx: CbCtx,
  data: string,
  userId: number,
): Promise<boolean> {
  if (data === "a:ig") {
    await ctx.editMessageText(
      "Intro Guide\n\nThe intro guide is shown to new members when they start the introduction flow in DM. Use it to tell them what to include in their introduction.",
      Markup.inlineKeyboard([
        [Markup.button.callback("View Current", "a:ig:view")],
        [Markup.button.callback("Edit", "a:ig:edit")],
        [backButton("a:main")],
      ]),
    );
    return true;
  }

  if (data === "a:ig:view") {
    const guide = await getSetting("intro_guide");
    await ctx.editMessageText(
      guide || "(not set)",
      Markup.inlineKeyboard([
        [Markup.button.callback("Edit", "a:ig:edit")],
        [backButton("a:ig")],
      ]),
    );
    return true;
  }

  if (data === "a:ig:edit") {
    adminState.set(userId, { type: "AWAITING_IG_EDIT" });
    await ctx.editMessageText(
      "Send the updated intro guide text.",
      Markup.inlineKeyboard([[backButton("a:ig")]]),
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
  if (state.type !== "AWAITING_IG_EDIT") return false;

  adminState.delete(userId);
  await setSetting("intro_guide", text, userId);
  await createAdminLog("edit_intro_guide", userId, null, text.slice(0, 100));
  await ctx.reply(
    "Intro guide updated!",
    Markup.inlineKeyboard([[backButton("a:ig")]]),
  );
  return true;
}
