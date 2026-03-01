import { Markup } from "telegraf";
import type { CbCtx } from "../shared";
import { backButton } from "../shared";
import { getMemberStats } from "../../../models/member";
import { countWelcomeMessages } from "../../../models/welcomeMessage";
import { countLogs } from "../../../models/adminLog";
import { countAllPendingReports } from "../../../models/report";
import { countReportReasons } from "../../../models/reportReason";
import { countBlockedWords } from "../../../models/blockedWord";

export async function handleCallback(
  ctx: CbCtx,
  data: string,
  _userId: number,
): Promise<boolean> {
  if (data !== "a:stats") return false;

  const [
    stats,
    wmCount,
    bwCount,
    rrCount,
    pendingReports,
    totalReports,
    bans,
    kicks,
    autobans,
    approvals,
  ] = await Promise.all([
    getMemberStats(),
    countWelcomeMessages(),
    countBlockedWords(),
    countReportReasons(),
    countAllPendingReports(),
    countLogs("submit_report"),
    countLogs("ban_member"),
    countLogs("kick_member"),
    countLogs("autoban_report"),
    countLogs("approve_member"),
  ]);

  const text = [
    "Stats",
    "",
    "Members",
    `  Total: ${stats.total}`,
    `  Pending intros: ${stats.pending}`,
    `  Completed intros: ${stats.completed}`,
    `  Completed today: ${stats.completed_today}`,
    `  Completed this week: ${stats.completed_this_week}`,
    "",
    "Moderation",
    `  Bans: ${bans}`,
    `  Kicks: ${kicks}`,
    `  Auto-bans (reports): ${autobans}`,
    `  Approvals: ${approvals}`,
    "",
    "Reports",
    `  Pending: ${pendingReports}`,
    `  Total submitted: ${totalReports}`,
    "",
    "Configuration",
    `  Welcome messages: ${wmCount}`,
    `  Blocked words: ${bwCount}`,
    `  Report reasons: ${rrCount}`,
  ].join("\n");

  await ctx.editMessageText(
    text,
    Markup.inlineKeyboard([[backButton("a:main")]]),
  );
  return true;
}
