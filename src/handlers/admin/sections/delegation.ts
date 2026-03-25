import { Markup } from "telegraf";
import { config } from "../../../config";
import { getSetting, setSetting } from "../../../models/settings";
import { resolveUser } from "../../../utils/user";
import { escapeHtml, truncate } from "../../../utils/format";
import { backButton } from "../shared";
import type { CbCtx } from "../shared";

const SETTINGS = [
  { key: "ns_designated_admin", label: "NS Verification", callback: "a:dlg:ns" },
  { key: "link_designated_admin", label: "Link Alerts", callback: "a:dlg:link" },
  { key: "report_designated_admin", label: "Reports", callback: "a:dlg:rpt" },
] as const;

async function resolveAdmin(
  val: string | null,
  telegram: import("telegraf").Telegram,
): Promise<string> {
  if (!val || val === "0") return "All admins";
  const label = await resolveUser(val, telegram);
  return escapeHtml(label);
}

async function renderOverview(ctx: CbCtx): Promise<void> {
  const [ns, link, rpt] = await Promise.all(
    SETTINGS.map((s) => getSetting(s.key)),
  );

  const [nsLabel, linkLabel, rptLabel] = await Promise.all([
    resolveAdmin(ns, ctx.telegram),
    resolveAdmin(link, ctx.telegram),
    resolveAdmin(rpt, ctx.telegram),
  ]);

  const lines = [
    "<b>Delegation Settings</b>",
    "",
    "Choose which admin receives notifications for each feature. Default: all admins.",
    "",
    `<b>NS Verification:</b> ${nsLabel}`,
    `<b>Link Alerts:</b> ${linkLabel}`,
    `<b>Reports:</b> ${rptLabel}`,
  ];

  await ctx.editMessageText(lines.join("\n"), {
    parse_mode: "HTML",
    ...Markup.inlineKeyboard([
      [Markup.button.callback("NS Verification", "a:dlg:ns")],
      [Markup.button.callback("Link Alerts", "a:dlg:link")],
      [Markup.button.callback("Reports", "a:dlg:rpt")],
      [backButton("a:main")],
    ]),
  });
}

async function renderAdminPicker(
  ctx: CbCtx,
  settingKey: string,
  callbackPrefix: string,
  label: string,
): Promise<void> {
  const admins = await ctx.telegram.getChatAdministrators(config.mainGroupId);

  const rows: ReturnType<typeof Markup.button.callback>[][] = [];
  for (const admin of admins) {
    if (admin.user.is_bot) continue;
    const name = admin.user.username
      ? `@${admin.user.username}`
      : admin.user.first_name || String(admin.user.id);
    rows.push([
      Markup.button.callback(
        truncate(name, 35),
        `${callbackPrefix}:${admin.user.id}`,
      ),
    ]);
  }
  rows.push([
    Markup.button.callback("Clear (notify all admins)", `${callbackPrefix}:0`),
  ]);
  rows.push([backButton("a:dlg")]);

  await ctx.editMessageText(
    `Select the admin to receive <b>${escapeHtml(label)}</b> notifications, or clear to notify all admins.`,
    { parse_mode: "HTML", ...Markup.inlineKeyboard(rows) },
  );
}

async function handleSelection(
  ctx: CbCtx,
  settingKey: string,
  targetId: number,
  userId: number,
): Promise<void> {
  if (targetId === 0) {
    await setSetting(settingKey, "0", userId);
    await ctx.editMessageText(
      "Designated admin cleared. All admins will be notified.",
      Markup.inlineKeyboard([[backButton("a:dlg")]]),
    );
  } else {
    await setSetting(settingKey, String(targetId), userId);
    const label = await resolveUser(String(targetId), ctx.telegram);
    await ctx.editMessageText(
      `Designated admin set to ${escapeHtml(label)} (${targetId}).`,
      {
        parse_mode: "HTML",
        ...Markup.inlineKeyboard([[backButton("a:dlg")]]),
      },
    );
  }
}

export async function handleCallback(
  ctx: CbCtx,
  data: string,
  userId: number,
): Promise<boolean> {
  if (data === "a:dlg") {
    await renderOverview(ctx);
    return true;
  }

  // Admin pickers
  if (data === "a:dlg:ns") {
    await renderAdminPicker(ctx, "ns_designated_admin", "a:dlg:ns", "NS Verification");
    return true;
  }
  if (data === "a:dlg:link") {
    await renderAdminPicker(ctx, "link_designated_admin", "a:dlg:link", "Link Alerts");
    return true;
  }
  if (data === "a:dlg:rpt") {
    await renderAdminPicker(ctx, "report_designated_admin", "a:dlg:rpt", "Reports");
    return true;
  }

  // Selections: a:dlg:ns:ID, a:dlg:link:ID, a:dlg:rpt:ID
  if (data.startsWith("a:dlg:ns:")) {
    const targetId = parseInt(data.split(":")[3], 10);
    await handleSelection(ctx, "ns_designated_admin", targetId, userId);
    return true;
  }
  if (data.startsWith("a:dlg:link:")) {
    const targetId = parseInt(data.split(":")[3], 10);
    await handleSelection(ctx, "link_designated_admin", targetId, userId);
    return true;
  }
  if (data.startsWith("a:dlg:rpt:")) {
    const targetId = parseInt(data.split(":")[3], 10);
    await handleSelection(ctx, "report_designated_admin", targetId, userId);
    return true;
  }

  return false;
}
