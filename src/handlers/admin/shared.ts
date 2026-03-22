import { Markup } from "telegraf";
import type { Context } from "telegraf";
import type { AdminLogAction } from "../../models/adminLog";

export type CbCtx = Context;
export type TextCtx = Context;

export type AdminAction =
  | { type: "AWAITING_MEMBER_SEARCH" }
  | { type: "AWAITING_BAN_SEARCH" }
  | { type: "AWAITING_WM_ADD" }
  | { type: "AWAITING_WM_EDIT"; messageId: number }
  | { type: "AWAITING_IG_EDIT" }
  | { type: "AWAITING_BW_ADD" }
  | { type: "AWAITING_BW_EDIT"; wordId: number }
  | { type: "AWAITING_AG_EDIT" }
  | { type: "AWAITING_ANN" }
  | { type: "AWAITING_RR_ADD" }
  | { type: "AWAITING_RR_EDIT"; reasonId: number }
  | { type: "AWAITING_RPT_ALERT" }
  | { type: "AWAITING_RPT_AUTOBAN" }
  | { type: "AWAITING_RPT_ADMIN" }
  | { type: "AWAITING_RPT_COOLDOWN" }
  | { type: "AWAITING_MAI_Q" }
  | { type: "AWAITING_WD_ADD" };

// Log display utility
export const ACTION_ALIASES: Record<string, AdminLogAction> = {
  approve: "approve_member",
  ban: "ban_member",
  kick: "kick_member",
  add_wm: "add_welcome_message",
  edit_wm: "edit_welcome_message",
  del_wm: "delete_welcome_message",
  edit_ig: "edit_intro_guide",
  reset: "reset_intro",
  edit_ag: "edit_admin_guide",
  add_bw: "add_blocked_word",
  edit_bw: "edit_blocked_word",
  del_bw: "delete_blocked_word",
  announce: "send_announcement",
  report: "submit_report",
  autoban_rpt: "autoban_report",
  dismiss_rpt: "dismiss_report",
  add_rr: "add_report_reason",
  edit_rr: "edit_report_reason",
  del_rr: "delete_report_reason",
  add_wd: "add_whitelisted_domain",
  del_wd: "delete_whitelisted_domain",
  del_mem: "delete_member",
};

const ACTION_LABELS: Record<string, string> = {
  approve_member: "Approve",
  ban_member: "Ban",
  kick_member: "Kick",
  add_welcome_message: "Add WM",
  edit_welcome_message: "Edit WM",
  delete_welcome_message: "Del WM",
  edit_intro_guide: "Edit IG",
  edit_admin_guide: "Edit AG",
  reset_intro: "Reset Intro",
  add_blocked_word: "Add BW",
  edit_blocked_word: "Edit BW",
  delete_blocked_word: "Del BW",
  send_announcement: "Announce",
  submit_report: "Report",
  autoban_report: "Auto-ban (Report)",
  dismiss_report: "Dismiss Report",
  add_report_reason: "Add RR",
  edit_report_reason: "Edit RR",
  delete_report_reason: "Del RR",
  add_whitelisted_domain: "Add WD",
  delete_whitelisted_domain: "Del WD",
  delete_member: "Del Member",
};

export const adminState = new Map<number, AdminAction>();

export const PAGE_SIZE = 5;

// Help text
export const ADMIN_HELP_BODY = [
  "<b>Menu Sections</b>",
  "• <b>Members</b> — List pending, search, approve (mark intro done + unmute)",
  "• <b>Ban / Kick</b> — Search for a member, then ban (with message wipe) or kick",
  "• <b>Welcome Messages</b> — List, add, edit, delete welcome message templates",
  "• <b>Intro Guide</b> — View and edit the intro guide",
  "• <b>Admin Guide</b> — View and edit the admin getting-started guide",
  "• <b>Stats</b> — Member counts and intro completion stats",
  "• <b>Blocked Words</b> — Manage words blocked from intro submissions",
  "• <b>Reports</b> — View reports, manage report reasons, and configure thresholds",
  "• <b>AI Insights</b> — Chat summary, activity leaderboard, member AI queries",
  "• <b>Delegation</b> — Assign a specific admin for NS verification, link alerts, and report notifications",
  "• <b>Logs</b> — Browse admin action logs with filters and pagination",
  "",
  "<b>Group Commands</b>",
  "/help — Show help",
  "/setintroguide &lt;msg&gt; — Set the intro guide",
  "/viewintroguide — View current intro guide",
  "/logs [type] [count] — View recent admin logs",
  "/logs [type] [start] [end] — View logs by date range",
  "/announce &lt;msg&gt; — Broadcast announcement to all admins via DM",
  "/announce preview &lt;msg&gt; — Preview announcement (sent only to you)",
  "/adminguide — Post a guide for admins to get started with the bot",
  "/posthelp — Post a pinnable help message",
  "/postreport — Post a 'Report a Member' message with deep link button",
  "",
  "<b>Log type aliases:</b> approve, ban, kick, reset, add_wm, edit_wm, del_wm, edit_ig, edit_ag, add_bw, edit_bw, del_bw, announce, report, autoban_rpt, dismiss_rpt, add_rr, edit_rr, del_rr",
].join("\n");

export const HELP_TEXT = [
  "<b>Superteam MY Bot</b>",
  "",
  "<b>General</b>",
  "/help  —  Show this message",
  "",
  "<b>Admin only</b>",
  "/setintroguide <code>&lt;msg&gt;</code>  —  Set the intro guide",
  "/viewintroguide  —  View the current intro guide",
  "/logs <code>[type] [count]</code>  —  View recent admin logs",
  "/logs <code>[type] [start] [end]</code>  —  View logs by date range",
  "/announce <code>&lt;msg&gt;</code>  —  Broadcast to all admins via DM",
  "/adminguide  —  Post admin getting-started guide",
  "/posthelp  —  Post a pinnable help message to the current chat",
  "/postreport  —  Post a 'Report a Member' button",
  "",
  "<b>Admin menu (DM only)</b>",
  "Send <code>/start admin</code> to the bot in DM to open the admin panel.",
  "Manage members, bans, welcome messages, intro guide, stats, AI insights, and logs.",
  "",
  "<b>Automatic features</b>",
  "• Link safeguard — warns on links in group, notifies admins with delete button",
  "• Contact auto-reply — AI answers \"who to contact\" questions (requires OPENAI_API_KEY)",
].join("\n");

export const POSTHELP_TEXT =
  "<b>Superteam MY Bot — Admin Help</b>\n\n" +
  "<b>DM Admin Menu</b>\n" +
  "Send <code>/start admin</code> to the bot in DM to open the admin panel.\n\n" +
  ADMIN_HELP_BODY;

export const DEFAULT_ADMIN_GUIDE = [
  "<b>Admin Guide</b>",
  "",
  "To get started with the admin panel:",
  '1. Open a DM with <a href="https://t.me/{botUsername}">@{botUsername}</a>',
  '2. Send <code>/start admin</code> or click "Start" then send the command',
  "3. You'll see the admin menu with all management options",
  "",
  "<b>Why DM the bot?</b>",
  "The admin panel runs in DM to keep the group clean. Starting a DM also lets you receive bot announcements and notifications.",
  "",
  '<b>Quick link:</b> <a href="https://t.me/{botUsername}?start=admin">Open Admin Panel</a>',
].join("\n");

export function renderAdminGuide(
  template: string,
  botUsername: string,
): string {
  return template.replace(/\{botUsername\}/g, botUsername);
}

export function backButton(callback: string, label = "Back") {
  return Markup.button.callback(`<< ${label}`, callback);
}

export function formatAction(action: string): string {
  return ACTION_LABELS[action] ?? action;
}
