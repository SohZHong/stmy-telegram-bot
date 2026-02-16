import { Markup } from "telegraf";
import type { CbCtx, TextCtx, AdminAction } from "../shared";
import { adminState, PAGE_SIZE, truncate, backButton } from "../shared";
import {
  getAllWelcomeMessages,
  getWelcomeMessage,
  addWelcomeMessage,
  updateWelcomeMessage,
  deleteWelcomeMessage,
} from "../../../models/welcomeMessage";
import { createAdminLog } from "../../../models/adminLog";

export async function handleCallback(
  ctx: CbCtx,
  data: string,
  userId: number,
): Promise<boolean> {
  if (data === "a:wm") {
    adminState.delete(userId);
    await ctx.editMessageText(
      "Welcome Messages",
      Markup.inlineKeyboard([
        [Markup.button.callback("List All", "a:wm:list:0")],
        [Markup.button.callback("Add New", "a:wm:add")],
        [backButton("a:main")],
      ]),
    );
    return true;
  }

  if (data.startsWith("a:wm:list:")) {
    const page = parseInt(data.split(":")[3], 10);
    const allMessages = await getAllWelcomeMessages();
    const total = allMessages.length;

    if (total === 0) {
      await ctx.editMessageText(
        "No welcome messages.",
        Markup.inlineKeyboard([
          [Markup.button.callback("Add New", "a:wm:add")],
          [backButton("a:wm")],
        ]),
      );
      return true;
    }

    const totalPages = Math.ceil(total / PAGE_SIZE);
    const offset = page * PAGE_SIZE;
    const pageMessages = allMessages.slice(offset, offset + PAGE_SIZE);

    const rows = pageMessages.map((wm) => [
      Markup.button.callback(truncate(wm.message, 35), `a:wm:v:${wm.id}`),
    ]);

    const nav: ReturnType<typeof Markup.button.callback>[] = [];
    if (page > 0)
      nav.push(Markup.button.callback("< Prev", `a:wm:list:${page - 1}`));
    nav.push(Markup.button.callback(`${page + 1}/${totalPages}`, "a:noop"));
    if (page < totalPages - 1)
      nav.push(Markup.button.callback("Next >", `a:wm:list:${page + 1}`));

    rows.push(nav);
    rows.push([backButton("a:wm")]);

    await ctx.editMessageText(
      `Welcome Messages (${total})`,
      Markup.inlineKeyboard(rows),
    );
    return true;
  }

  if (data === "a:wm:add") {
    adminState.set(userId, { type: "AWAITING_WM_ADD" });
    await ctx.editMessageText(
      "Send the new welcome message text.\nUse {name} as a placeholder for the member's name.",
      Markup.inlineKeyboard([[backButton("a:wm")]]),
    );
    return true;
  }

  if (data.startsWith("a:wm:v:")) {
    const wmId = parseInt(data.split(":")[3], 10);
    const wm = await getWelcomeMessage(wmId);
    if (!wm) {
      await ctx.editMessageText(
        "Welcome message not found.",
        Markup.inlineKeyboard([[backButton("a:wm")]]),
      );
      return true;
    }

    await ctx.editMessageText(
      `ID: ${wm.id}\n\n${wm.message}`,
      Markup.inlineKeyboard([
        [Markup.button.callback("Edit", `a:wm:ed:${wm.id}`)],
        [Markup.button.callback("Delete", `a:wm:rm:${wm.id}`)],
        [backButton("a:wm:list:0")],
      ]),
    );
    return true;
  }

  if (data.startsWith("a:wm:ed:")) {
    const wmId = parseInt(data.split(":")[3], 10);
    adminState.set(userId, { type: "AWAITING_WM_EDIT", messageId: wmId });
    await ctx.editMessageText(
      "Send the updated welcome message text.\nUse {name} as a placeholder.",
      Markup.inlineKeyboard([[backButton(`a:wm:v:${wmId}`)]]),
    );
    return true;
  }

  if (data.startsWith("a:wm:rm:")) {
    const wmId = parseInt(data.split(":")[3], 10);
    await ctx.editMessageText(
      "Are you sure you want to delete this welcome message?",
      Markup.inlineKeyboard([
        [Markup.button.callback("Yes, delete", `a:wm:rmc:${wmId}`)],
        [backButton(`a:wm:v:${wmId}`, "Cancel")],
      ]),
    );
    return true;
  }

  if (data.startsWith("a:wm:rmc:")) {
    const wmId = parseInt(data.split(":")[3], 10);
    await deleteWelcomeMessage(wmId);
    await createAdminLog("delete_welcome_message", userId, null, `WM #${wmId}`);
    await ctx.editMessageText(
      "Welcome message deleted.",
      Markup.inlineKeyboard([[backButton("a:wm:list:0")]]),
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
  if (state.type === "AWAITING_WM_ADD") {
    adminState.delete(userId);
    const wm = await addWelcomeMessage(text, userId);
    await createAdminLog(
      "add_welcome_message",
      userId,
      null,
      `WM #${wm.id}: ${text.slice(0, 50)}`,
    );
    await ctx.reply(
      "Welcome message added!",
      Markup.inlineKeyboard([[backButton("a:wm:list:0")]]),
    );
    return true;
  }

  if (state.type === "AWAITING_WM_EDIT") {
    const { messageId } = state;
    adminState.delete(userId);
    await updateWelcomeMessage(messageId, text);
    await createAdminLog(
      "edit_welcome_message",
      userId,
      null,
      `WM #${messageId}: ${text.slice(0, 50)}`,
    );
    await ctx.reply(
      "Welcome message updated!",
      Markup.inlineKeyboard([[backButton(`a:wm:v:${messageId}`)]]),
    );
    return true;
  }

  return false;
}
