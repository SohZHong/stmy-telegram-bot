import { Markup } from "telegraf";
import type { CbCtx, TextCtx, AdminAction } from "../shared";
import { adminState, PAGE_SIZE, backButton } from "../shared";
import { truncate } from "../../../utils/format";
import {
  getAllBlockedWords,
  getBlockedWord,
  addBlockedWord,
  updateBlockedWord,
  deleteBlockedWord,
} from "../../../models/blockedWord";
import { createAdminLog } from "../../../models/adminLog";

export async function handleCallback(
  ctx: CbCtx,
  data: string,
  userId: number,
): Promise<boolean> {
  if (data === "a:bw") {
    adminState.delete(userId);
    await ctx.editMessageText(
      "Blocked Words\n\nWords or phrases that are automatically rejected from member introductions. Matched case-insensitively on word boundaries.",
      Markup.inlineKeyboard([
        [Markup.button.callback("List All", "a:bw:list:0")],
        [Markup.button.callback("Add New", "a:bw:add")],
        [backButton("a:main")],
      ]),
    );
    return true;
  }

  if (data.startsWith("a:bw:list:")) {
    const page = parseInt(data.split(":")[3], 10);
    const allWords = await getAllBlockedWords();
    const total = allWords.length;

    if (total === 0) {
      await ctx.editMessageText(
        "No blocked words.",
        Markup.inlineKeyboard([
          [Markup.button.callback("Add New", "a:bw:add")],
          [backButton("a:bw")],
        ]),
      );
      return true;
    }

    const totalPages = Math.ceil(total / PAGE_SIZE);
    const offset = page * PAGE_SIZE;
    const pageWords = allWords.slice(offset, offset + PAGE_SIZE);

    const rows = pageWords.map((bw) => [
      Markup.button.callback(truncate(bw.word, 35), `a:bw:v:${bw.id}`),
    ]);

    const nav: ReturnType<typeof Markup.button.callback>[] = [];
    if (page > 0)
      nav.push(Markup.button.callback("< Prev", `a:bw:list:${page - 1}`));
    nav.push(Markup.button.callback(`${page + 1}/${totalPages}`, "a:noop"));
    if (page < totalPages - 1)
      nav.push(Markup.button.callback("Next >", `a:bw:list:${page + 1}`));

    rows.push(nav);
    rows.push([backButton("a:bw")]);

    await ctx.editMessageText(
      `Blocked Words (${total})`,
      Markup.inlineKeyboard(rows),
    );
    return true;
  }

  if (data === "a:bw:add") {
    adminState.set(userId, { type: "AWAITING_BW_ADD" });
    await ctx.editMessageText(
      "Send the word or phrase to block.",
      Markup.inlineKeyboard([[backButton("a:bw")]]),
    );
    return true;
  }

  if (data.startsWith("a:bw:v:")) {
    const bwId = parseInt(data.split(":")[3], 10);
    const bw = await getBlockedWord(bwId);
    if (!bw) {
      await ctx.editMessageText(
        "Blocked word not found.",
        Markup.inlineKeyboard([[backButton("a:bw")]]),
      );
      return true;
    }

    await ctx.editMessageText(
      `ID: ${bw.id}\n\n${bw.word}`,
      Markup.inlineKeyboard([
        [Markup.button.callback("Edit", `a:bw:ed:${bw.id}`)],
        [Markup.button.callback("Delete", `a:bw:rm:${bw.id}`)],
        [backButton("a:bw:list:0")],
      ]),
    );
    return true;
  }

  if (data.startsWith("a:bw:ed:")) {
    const bwId = parseInt(data.split(":")[3], 10);
    adminState.set(userId, { type: "AWAITING_BW_EDIT", wordId: bwId });
    await ctx.editMessageText(
      "Send the updated word or phrase.",
      Markup.inlineKeyboard([[backButton(`a:bw:v:${bwId}`)]]),
    );
    return true;
  }

  if (data.startsWith("a:bw:rm:")) {
    const bwId = parseInt(data.split(":")[3], 10);
    await ctx.editMessageText(
      "Are you sure you want to delete this blocked word?",
      Markup.inlineKeyboard([
        [Markup.button.callback("Yes, delete", `a:bw:rmc:${bwId}`)],
        [backButton(`a:bw:v:${bwId}`, "Cancel")],
      ]),
    );
    return true;
  }

  if (data.startsWith("a:bw:rmc:")) {
    const bwId = parseInt(data.split(":")[3], 10);
    await deleteBlockedWord(bwId);
    await createAdminLog("delete_blocked_word", userId, null, `BW #${bwId}`);
    await ctx.editMessageText(
      "Blocked word deleted.",
      Markup.inlineKeyboard([[backButton("a:bw:list:0")]]),
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
  if (state.type === "AWAITING_BW_ADD") {
    adminState.delete(userId);
    const bw = await addBlockedWord(text, userId);
    await createAdminLog(
      "add_blocked_word",
      userId,
      null,
      `BW #${bw.id}: ${text.slice(0, 50)}`,
    );
    await ctx.reply(
      "Blocked word added!",
      Markup.inlineKeyboard([[backButton("a:bw:list:0")]]),
    );
    return true;
  }

  if (state.type === "AWAITING_BW_EDIT") {
    const { wordId } = state;
    adminState.delete(userId);
    await updateBlockedWord(wordId, text);
    await createAdminLog(
      "edit_blocked_word",
      userId,
      null,
      `BW #${wordId}: ${text.slice(0, 50)}`,
    );
    await ctx.reply(
      "Blocked word updated!",
      Markup.inlineKeyboard([[backButton(`a:bw:v:${wordId}`)]]),
    );
    return true;
  }

  return false;
}
