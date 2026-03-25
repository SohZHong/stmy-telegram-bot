import { Markup } from "telegraf";
import type { CbCtx, TextCtx, AdminAction } from "../shared";
import { adminState, PAGE_SIZE, backButton } from "../shared";
import { truncate } from "../../../utils/format";
import {
  getAllWhitelistedDomains,
  getWhitelistedDomain,
  addWhitelistedDomain,
  deleteWhitelistedDomain,
} from "../../../models/whitelistedDomain";
import { createAdminLog } from "../../../models/adminLog";

export async function handleCallback(
  ctx: CbCtx,
  data: string,
  userId: number,
): Promise<boolean> {
  if (data === "a:wd") {
    adminState.delete(userId);
    await ctx.editMessageText(
      "Whitelisted Domains\n\nDomains on this list will not trigger link safety warnings. Subdomains are included automatically (e.g. whitelisting \"example.com\" also covers \"sub.example.com\").",
      Markup.inlineKeyboard([
        [Markup.button.callback("List All", "a:wd:list:0")],
        [Markup.button.callback("Add New", "a:wd:add")],
        [backButton("a:main")],
      ]),
    );
    return true;
  }

  if (data.startsWith("a:wd:list:")) {
    const page = parseInt(data.split(":")[3], 10);
    const allDomains = await getAllWhitelistedDomains();
    const total = allDomains.length;

    if (total === 0) {
      await ctx.editMessageText(
        "No whitelisted domains.",
        Markup.inlineKeyboard([
          [Markup.button.callback("Add New", "a:wd:add")],
          [backButton("a:wd")],
        ]),
      );
      return true;
    }

    const totalPages = Math.ceil(total / PAGE_SIZE);
    const offset = page * PAGE_SIZE;
    const pageDomains = allDomains.slice(offset, offset + PAGE_SIZE);

    const rows = pageDomains.map((d) => [
      Markup.button.callback(truncate(d.domain, 35), `a:wd:v:${d.id}`),
    ]);

    const nav: ReturnType<typeof Markup.button.callback>[] = [];
    if (page > 0)
      nav.push(Markup.button.callback("< Prev", `a:wd:list:${page - 1}`));
    nav.push(Markup.button.callback(`${page + 1}/${totalPages}`, "a:noop"));
    if (page < totalPages - 1)
      nav.push(Markup.button.callback("Next >", `a:wd:list:${page + 1}`));

    rows.push(nav);
    rows.push([backButton("a:wd")]);

    await ctx.editMessageText(
      `Whitelisted Domains (${total})`,
      Markup.inlineKeyboard(rows),
    );
    return true;
  }

  if (data === "a:wd:add") {
    adminState.set(userId, { type: "AWAITING_WD_ADD" });
    await ctx.editMessageText(
      "Send the domain to whitelist (e.g. example.com).\n\nSubdomains are included automatically.",
      Markup.inlineKeyboard([[backButton("a:wd")]]),
    );
    return true;
  }

  if (data.startsWith("a:wd:v:")) {
    const wdId = parseInt(data.split(":")[3], 10);
    const wd = await getWhitelistedDomain(wdId);
    if (!wd) {
      await ctx.editMessageText(
        "Domain not found.",
        Markup.inlineKeyboard([[backButton("a:wd")]]),
      );
      return true;
    }

    await ctx.editMessageText(
      `ID: ${wd.id}\nDomain: ${wd.domain}`,
      Markup.inlineKeyboard([
        [Markup.button.callback("Delete", `a:wd:rm:${wd.id}`)],
        [backButton("a:wd:list:0")],
      ]),
    );
    return true;
  }

  if (data.startsWith("a:wd:rm:")) {
    const wdId = parseInt(data.split(":")[3], 10);
    await ctx.editMessageText(
      "Are you sure you want to remove this whitelisted domain?",
      Markup.inlineKeyboard([
        [Markup.button.callback("Yes, delete", `a:wd:rmc:${wdId}`)],
        [backButton(`a:wd:v:${wdId}`, "Cancel")],
      ]),
    );
    return true;
  }

  if (data.startsWith("a:wd:rmc:")) {
    const wdId = parseInt(data.split(":")[3], 10);
    const wd = await getWhitelistedDomain(wdId);
    await deleteWhitelistedDomain(wdId);
    await createAdminLog("delete_whitelisted_domain", userId, null, `Domain: ${wd?.domain ?? wdId}`);
    await ctx.editMessageText(
      "Domain removed from whitelist.",
      Markup.inlineKeyboard([[backButton("a:wd:list:0")]]),
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
  if (state.type !== "AWAITING_WD_ADD") return false;

  adminState.delete(userId);

  // Clean the domain input
  let domain = text.trim().toLowerCase();
  domain = domain.replace(/^https?:\/\//, "");
  domain = domain.split("/")[0];
  domain = domain.split(":")[0];

  if (!domain || !domain.includes(".")) {
    await ctx.reply(
      "Invalid domain. Please enter a valid domain like example.com.",
      Markup.inlineKeyboard([[backButton("a:wd")]]),
    );
    return true;
  }

  try {
    await addWhitelistedDomain(domain, userId);
    await createAdminLog("add_whitelisted_domain", userId, null, `Domain: ${domain}`);
    await ctx.reply(
      `Domain "${domain}" added to whitelist.`,
      Markup.inlineKeyboard([[backButton("a:wd:list:0")]]),
    );
  } catch {
    await ctx.reply(
      "This domain is already whitelisted.",
      Markup.inlineKeyboard([[backButton("a:wd:list:0")]]),
    );
  }
  return true;
}
