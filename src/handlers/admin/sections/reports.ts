import { Markup } from "telegraf";
import type { CbCtx, TextCtx, AdminAction } from "../shared";
import { adminState, PAGE_SIZE, backButton } from "../shared";
import { truncate, escapeHtml } from "../../../utils/format";
import { resolveUser } from "../../../utils/user";
import {
  getAllReportReasons,
  getReportReason,
  addReportReason,
  updateReportReason,
  deleteReportReason,
} from "../../../models/reportReason";
import {
  getMostReportedUsers,
  getReportsAgainst,
  getReportById,
  updateReportStatus,
  bulkUpdateReportStatus,
  countPendingReportsAgainst,
} from "../../../models/report";
import { getSetting, setSetting } from "../../../models/settings";
import { createAdminLog } from "../../../models/adminLog";
import { deleteMember } from "../../../models/member";
import { config } from "../../../config";
import { isAdminById } from "../auth";

export async function handleCallback(
  ctx: CbCtx,
  data: string,
  userId: number,
): Promise<boolean> {
  // Main reports menu
  if (data === "a:rpt") {
    adminState.delete(userId);
    await ctx.editMessageText(
      "Reports\n\nManage user reports. Configure the reasons members can choose from, review pending reports, and set alert/auto-ban thresholds.",
      Markup.inlineKeyboard([
        [Markup.button.callback("Report Reasons", "a:rpt:reasons")],
        [Markup.button.callback("View Reports", "a:rpt:view")],
        [Markup.button.callback("Settings", "a:rpt:cfg")],
        [backButton("a:main")],
      ]),
    );
    return true;
  }

  // Report Reasons CRUD

  if (data === "a:rpt:reasons") {
    adminState.delete(userId);
    await ctx.editMessageText(
      "Report Reasons",
      Markup.inlineKeyboard([
        [Markup.button.callback("List All", "a:rpt:reasons:list:0")],
        [Markup.button.callback("Add New", "a:rpt:reasons:add")],
        [backButton("a:rpt")],
      ]),
    );
    return true;
  }

  if (data.startsWith("a:rpt:reasons:list:")) {
    const page = parseInt(data.split(":")[4], 10);
    const allReasons = await getAllReportReasons();
    const total = allReasons.length;

    if (total === 0) {
      await ctx.editMessageText(
        "No report reasons.",
        Markup.inlineKeyboard([
          [Markup.button.callback("Add New", "a:rpt:reasons:add")],
          [backButton("a:rpt:reasons")],
        ]),
      );
      return true;
    }

    const totalPages = Math.ceil(total / PAGE_SIZE);
    const offset = page * PAGE_SIZE;
    const pageReasons = allReasons.slice(offset, offset + PAGE_SIZE);

    const rows = pageReasons.map((r) => [
      Markup.button.callback(truncate(r.label, 35), `a:rpt:reasons:v:${r.id}`),
    ]);

    const nav: ReturnType<typeof Markup.button.callback>[] = [];
    if (page > 0)
      nav.push(
        Markup.button.callback("< Prev", `a:rpt:reasons:list:${page - 1}`),
      );
    nav.push(Markup.button.callback(`${page + 1}/${totalPages}`, "a:noop"));
    if (page < totalPages - 1)
      nav.push(
        Markup.button.callback("Next >", `a:rpt:reasons:list:${page + 1}`),
      );

    rows.push(nav);
    rows.push([backButton("a:rpt:reasons")]);

    await ctx.editMessageText(
      `Report Reasons (${total})`,
      Markup.inlineKeyboard(rows),
    );
    return true;
  }

  if (data === "a:rpt:reasons:add") {
    adminState.set(userId, { type: "AWAITING_RR_ADD" });
    await ctx.editMessageText(
      "Send the label for the new report reason.",
      Markup.inlineKeyboard([[backButton("a:rpt:reasons")]]),
    );
    return true;
  }

  if (data.startsWith("a:rpt:reasons:v:")) {
    const rrId = parseInt(data.split(":")[4], 10);
    const rr = await getReportReason(rrId);
    if (!rr) {
      await ctx.editMessageText(
        "Report reason not found.",
        Markup.inlineKeyboard([[backButton("a:rpt:reasons")]]),
      );
      return true;
    }

    await ctx.editMessageText(
      `ID: ${rr.id}\n\n${rr.label}`,
      Markup.inlineKeyboard([
        [Markup.button.callback("Edit", `a:rpt:reasons:ed:${rr.id}`)],
        [Markup.button.callback("Delete", `a:rpt:reasons:rm:${rr.id}`)],
        [backButton("a:rpt:reasons:list:0")],
      ]),
    );
    return true;
  }

  if (data.startsWith("a:rpt:reasons:ed:")) {
    const rrId = parseInt(data.split(":")[4], 10);
    adminState.set(userId, { type: "AWAITING_RR_EDIT", reasonId: rrId });
    await ctx.editMessageText(
      "Send the updated label.",
      Markup.inlineKeyboard([[backButton(`a:rpt:reasons:v:${rrId}`)]]),
    );
    return true;
  }

  if (data.startsWith("a:rpt:reasons:rm:")) {
    const rrId = parseInt(data.split(":")[4], 10);
    await ctx.editMessageText(
      "Are you sure you want to delete this report reason?\n\nNote: Deletion will fail if reports already use this reason.",
      Markup.inlineKeyboard([
        [Markup.button.callback("Yes, delete", `a:rpt:reasons:rmc:${rrId}`)],
        [backButton(`a:rpt:reasons:v:${rrId}`, "Cancel")],
      ]),
    );
    return true;
  }

  if (data.startsWith("a:rpt:reasons:rmc:")) {
    const rrId = parseInt(data.split(":")[4], 10);
    try {
      await deleteReportReason(rrId);
      await createAdminLog("delete_report_reason", userId, null, `RR #${rrId}`);
      await ctx.editMessageText(
        "Report reason deleted.",
        Markup.inlineKeyboard([[backButton("a:rpt:reasons:list:0")]]),
      );
    } catch {
      await ctx.editMessageText(
        "Cannot delete this reason — it is referenced by existing reports.",
        Markup.inlineKeyboard([[backButton("a:rpt:reasons:list:0")]]),
      );
    }
    return true;
  }

  // View Reports

  if (data === "a:rpt:view") {
    const users = await getMostReportedUsers(10);
    if (users.length === 0) {
      await ctx.editMessageText(
        "No pending reports.",
        Markup.inlineKeyboard([[backButton("a:rpt")]]),
      );
      return true;
    }

    const rows: ReturnType<typeof Markup.button.callback>[][] = [];
    for (const u of users) {
      const label = await resolveUser(u.reported_telegram_id, ctx.telegram);
      rows.push([
        Markup.button.callback(
          truncate(`${label} (${u.count})`, 40),
          `a:rpt:view:u:${u.reported_telegram_id}:0`,
        ),
      ]);
    }
    rows.push([backButton("a:rpt")]);

    await ctx.editMessageText(
      "Most Reported Users (pending)",
      Markup.inlineKeyboard(rows),
    );
    return true;
  }

  // Reports against a user: a:rpt:view:u:ID:PAGE
  if (data.startsWith("a:rpt:view:u:")) {
    const parts = data.split(":");
    const targetId = parseInt(parts[4], 10);
    const page = parseInt(parts[5], 10);
    const offset = page * PAGE_SIZE;

    const [reports, total] = await Promise.all([
      getReportsAgainst(targetId, PAGE_SIZE, offset),
      countPendingReportsAgainst(targetId),
    ]);

    const targetLabel = await resolveUser(String(targetId), ctx.telegram);

    if (reports.length === 0) {
      await ctx.editMessageText(
        `No reports against ${escapeHtml(targetLabel)}.`,
        {
          parse_mode: "HTML",
          ...Markup.inlineKeyboard([[backButton("a:rpt:view")]]),
        },
      );
      return true;
    }

    const totalPages = Math.ceil(total / PAGE_SIZE);
    const rows = reports.map((r) => {
      const date = r.created_at.toISOString().split("T")[0];
      return [
        Markup.button.callback(
          truncate(`[${date}] #${r.id} (${r.status})`, 40),
          `a:rpt:view:r:${r.id}`,
        ),
      ];
    });

    const nav: ReturnType<typeof Markup.button.callback>[] = [];
    if (page > 0)
      nav.push(
        Markup.button.callback(
          "< Prev",
          `a:rpt:view:u:${targetId}:${page - 1}`,
        ),
      );
    nav.push(Markup.button.callback(`${page + 1}/${totalPages}`, "a:noop"));
    if (page < totalPages - 1)
      nav.push(
        Markup.button.callback(
          "Next >",
          `a:rpt:view:u:${targetId}:${page + 1}`,
        ),
      );

    if (nav.length > 0) rows.push(nav);

    rows.push([
      Markup.button.callback(
        "Dismiss All",
        `a:rpt:view:dismiss_all:${targetId}`,
      ),
    ]);
    rows.push([
      Markup.button.callback("Ban User", `a:rpt:view:ban:${targetId}`),
    ]);
    rows.push([backButton("a:rpt:view")]);

    await ctx.editMessageText(
      `Reports against ${escapeHtml(targetLabel)} (${total} pending)`,
      {
        parse_mode: "HTML",
        ...Markup.inlineKeyboard(rows),
      },
    );
    return true;
  }

  // Single report detail: a:rpt:view:r:ID
  if (/^a:rpt:view:r:\d+$/.test(data)) {
    const reportId = parseInt(data.split(":")[4], 10);
    const report = await getReportById(reportId);
    if (!report) {
      await ctx.editMessageText(
        "Report not found.",
        Markup.inlineKeyboard([[backButton("a:rpt:view")]]),
      );
      return true;
    }

    const reporterLabel = await resolveUser(
      report.reporter_telegram_id,
      ctx.telegram,
    );
    const reportedLabel = await resolveUser(
      report.reported_telegram_id,
      ctx.telegram,
    );
    const reason = await getReportReason(report.reason_id);

    const lines = [
      `<b>Report #${report.id}</b>`,
      "",
      `<b>Reporter:</b> ${escapeHtml(reporterLabel)}`,
      `<b>Reported:</b> ${escapeHtml(reportedLabel)}`,
      `<b>Reason:</b> ${escapeHtml(reason?.label ?? "Unknown")}`,
      `<b>Status:</b> ${report.status}`,
    ];
    if (report.details) {
      lines.push(`<b>Details:</b> ${escapeHtml(report.details)}`);
    }
    lines.push(
      `<b>Date:</b> ${report.created_at.toISOString().replace("T", " ").split(".")[0]}`,
    );

    const buttons: ReturnType<typeof Markup.button.callback>[][] = [];
    if (report.status === "pending") {
      buttons.push([
        Markup.button.callback("Dismiss", `a:rpt:view:dismiss:${report.id}`),
      ]);
    }
    buttons.push([backButton(`a:rpt:view:u:${report.reported_telegram_id}:0`)]);

    await ctx.editMessageText(lines.join("\n"), {
      parse_mode: "HTML",
      ...Markup.inlineKeyboard(buttons),
    });
    return true;
  }

  // Dismiss single report: a:rpt:view:dismiss:ID
  if (
    data.startsWith("a:rpt:view:dismiss:") &&
    !data.startsWith("a:rpt:view:dismiss_all:")
  ) {
    const reportId = parseInt(data.split(":")[4], 10);
    await updateReportStatus(reportId, "dismissed");
    await createAdminLog("dismiss_report", userId, null, `Report #${reportId}`);
    await ctx.editMessageText(
      "Report dismissed.",
      Markup.inlineKeyboard([[backButton("a:rpt:view")]]),
    );
    return true;
  }

  // Dismiss all reports against user: a:rpt:view:dismiss_all:ID
  if (data.startsWith("a:rpt:view:dismiss_all:")) {
    const targetId = parseInt(data.split(":")[4], 10);
    const count = await bulkUpdateReportStatus(targetId, "dismissed");
    await createAdminLog(
      "dismiss_report",
      userId,
      targetId,
      `Dismissed ${count} report(s)`,
    );
    await ctx.editMessageText(
      `${count} report(s) dismissed.`,
      Markup.inlineKeyboard([[backButton("a:rpt:view")]]),
    );
    return true;
  }

  // Ban user from reports: a:rpt:view:ban:ID
  if (data.startsWith("a:rpt:view:ban:")) {
    const targetId = parseInt(data.split(":")[4], 10);
    if (await isAdminById(ctx.telegram, targetId)) {
      await ctx.editMessageText(
        "This user is a group admin and cannot be banned.",
        Markup.inlineKeyboard([[backButton("a:rpt:view")]]),
      );
      return true;
    }
    try {
      await ctx.telegram.banChatMember(
        config.mainGroupId,
        targetId,
        undefined,
        { revoke_messages: true },
      );
      await deleteMember(targetId);
      await bulkUpdateReportStatus(targetId, "reviewed");
      await createAdminLog("autoban_report", userId, targetId);
      await ctx.editMessageText(
        `User ${targetId} banned and all reports marked as reviewed.`,
        Markup.inlineKeyboard([[backButton("a:rpt:view")]]),
      );
    } catch (err) {
      await ctx.editMessageText(
        `Failed to ban: ${(err as Error).message}`,
        Markup.inlineKeyboard([[backButton("a:rpt:view")]]),
      );
    }
    return true;
  }

  // Settings

  if (data === "a:rpt:cfg") {
    const [alert, autoban, admin, cooldown] = await Promise.all([
      getSetting("report_threshold_alert"),
      getSetting("report_threshold_autoban"),
      getSetting("report_designated_admin"),
      getSetting("report_cooldown_hours"),
    ]);

    const lines = [
      "<b>Report Settings</b>",
      "",
      `<b>Alert Threshold:</b> ${alert ?? "3"} pending reports`,
      `<b>Auto-ban Threshold:</b> ${autoban ?? "0"} (${(autoban ?? "0") === "0" ? "disabled" : "enabled"})`,
      `<b>Designated Admin:</b> ${admin && admin !== "0" ? admin : "All admins"}`,
      `<b>Cooldown:</b> ${cooldown ?? "24"} hours`,
    ];

    await ctx.editMessageText(lines.join("\n"), {
      parse_mode: "HTML",
      ...Markup.inlineKeyboard([
        [Markup.button.callback("Alert Threshold", "a:rpt:cfg:alert")],
        [Markup.button.callback("Auto-ban Threshold", "a:rpt:cfg:autoban")],
        [Markup.button.callback("Designated Admin", "a:rpt:cfg:admin")],
        [Markup.button.callback("Cooldown Hours", "a:rpt:cfg:cooldown")],
        [backButton("a:rpt")],
      ]),
    });
    return true;
  }

  if (data === "a:rpt:cfg:alert") {
    adminState.set(userId, { type: "AWAITING_RPT_ALERT" });
    await ctx.editMessageText(
      "Enter the number of pending reports to trigger an admin alert (e.g. 3).",
      Markup.inlineKeyboard([[backButton("a:rpt:cfg")]]),
    );
    return true;
  }

  if (data === "a:rpt:cfg:autoban") {
    adminState.set(userId, { type: "AWAITING_RPT_AUTOBAN" });
    await ctx.editMessageText(
      "Enter the number of pending reports to trigger auto-ban (0 = disabled).",
      Markup.inlineKeyboard([[backButton("a:rpt:cfg")]]),
    );
    return true;
  }

  if (data === "a:rpt:cfg:admin") {
    const admins = await ctx.telegram.getChatAdministrators(
      config.mainGroupId,
    );

    const rows: ReturnType<typeof Markup.button.callback>[][] = [];
    for (const admin of admins) {
      if (admin.user.is_bot) continue;
      const name = admin.user.username
        ? `@${admin.user.username}`
        : admin.user.first_name || String(admin.user.id);
      rows.push([
        Markup.button.callback(
          truncate(name, 35),
          `a:rpt:cfg:admin:${admin.user.id}`,
        ),
      ]);
    }
    rows.push([
      Markup.button.callback("Clear (notify all admins)", "a:rpt:cfg:admin:0"),
    ]);
    rows.push([backButton("a:rpt:cfg")]);

    await ctx.editMessageText(
      "Select the admin to receive report notifications, or clear to notify all admins.",
      Markup.inlineKeyboard(rows),
    );
    return true;
  }

  if (data.startsWith("a:rpt:cfg:admin:")) {
    const targetId = parseInt(data.split(":")[4], 10);
    if (targetId === 0) {
      await setSetting("report_designated_admin", "0", userId);
      await ctx.editMessageText(
        "Designated admin cleared. All admins will be notified.",
        Markup.inlineKeyboard([[backButton("a:rpt:cfg")]]),
      );
    } else {
      await setSetting("report_designated_admin", String(targetId), userId);
      const label = await resolveUser(String(targetId), ctx.telegram);
      await ctx.editMessageText(
        `Designated admin set to ${escapeHtml(label)} (${targetId}).`,
        {
          parse_mode: "HTML",
          ...Markup.inlineKeyboard([[backButton("a:rpt:cfg")]]),
        },
      );
    }
    return true;
  }

  if (data === "a:rpt:cfg:cooldown") {
    adminState.set(userId, { type: "AWAITING_RPT_COOLDOWN" });
    await ctx.editMessageText(
      "Enter the cooldown in hours between reports from the same user for the same target (e.g. 24).",
      Markup.inlineKeyboard([[backButton("a:rpt:cfg")]]),
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
  // Report Reasons
  if (state.type === "AWAITING_RR_ADD") {
    adminState.delete(userId);
    const rr = await addReportReason(text, userId);
    await createAdminLog(
      "add_report_reason",
      userId,
      null,
      `RR #${rr.id}: ${text.slice(0, 50)}`,
    );
    await ctx.reply(
      "Report reason added!",
      Markup.inlineKeyboard([[backButton("a:rpt:reasons:list:0")]]),
    );
    return true;
  }

  if (state.type === "AWAITING_RR_EDIT") {
    const { reasonId } = state;
    adminState.delete(userId);
    await updateReportReason(reasonId, text);
    await createAdminLog(
      "edit_report_reason",
      userId,
      null,
      `RR #${reasonId}: ${text.slice(0, 50)}`,
    );
    await ctx.reply(
      "Report reason updated!",
      Markup.inlineKeyboard([[backButton(`a:rpt:reasons:v:${reasonId}`)]]),
    );
    return true;
  }

  // Settings
  if (state.type === "AWAITING_RPT_ALERT") {
    adminState.delete(userId);
    const val = parseInt(text, 10);
    if (isNaN(val) || val < 1) {
      await ctx.reply(
        "Please enter a positive number.",
        Markup.inlineKeyboard([[backButton("a:rpt:cfg")]]),
      );
      return true;
    }
    await setSetting("report_threshold_alert", String(val), userId);
    await ctx.reply(
      `Alert threshold set to ${val}.`,
      Markup.inlineKeyboard([[backButton("a:rpt:cfg")]]),
    );
    return true;
  }

  if (state.type === "AWAITING_RPT_AUTOBAN") {
    adminState.delete(userId);
    const val = parseInt(text, 10);
    if (isNaN(val) || val < 0) {
      await ctx.reply(
        "Please enter a non-negative number (0 = disabled).",
        Markup.inlineKeyboard([[backButton("a:rpt:cfg")]]),
      );
      return true;
    }
    await setSetting("report_threshold_autoban", String(val), userId);
    await ctx.reply(
      val === 0 ? "Auto-ban disabled." : `Auto-ban threshold set to ${val}.`,
      Markup.inlineKeyboard([[backButton("a:rpt:cfg")]]),
    );
    return true;
  }

  if (state.type === "AWAITING_RPT_ADMIN") {
    adminState.delete(userId);
    const val = parseInt(text, 10);
    if (isNaN(val) || val < 0) {
      await ctx.reply(
        "Please enter a valid Telegram ID (0 = notify all admins).",
        Markup.inlineKeyboard([[backButton("a:rpt:cfg")]]),
      );
      return true;
    }
    if (val === 0) {
      await setSetting("report_designated_admin", "0", userId);
      await ctx.reply(
        "Designated admin cleared. All admins will be notified.",
        Markup.inlineKeyboard([[backButton("a:rpt:cfg")]]),
      );
    } else {
      await setSetting("report_designated_admin", String(val), userId);
      await ctx.reply(
        `Designated admin set to ${val}.`,
        Markup.inlineKeyboard([[backButton("a:rpt:cfg")]]),
      );
    }
    return true;
  }

  if (state.type === "AWAITING_RPT_COOLDOWN") {
    adminState.delete(userId);
    const val = parseInt(text, 10);
    if (isNaN(val) || val < 0) {
      await ctx.reply(
        "Please enter a non-negative number of hours.",
        Markup.inlineKeyboard([[backButton("a:rpt:cfg")]]),
      );
      return true;
    }
    await setSetting("report_cooldown_hours", String(val), userId);
    await ctx.reply(
      `Cooldown set to ${val} hours.`,
      Markup.inlineKeyboard([[backButton("a:rpt:cfg")]]),
    );
    return true;
  }

  return false;
}
