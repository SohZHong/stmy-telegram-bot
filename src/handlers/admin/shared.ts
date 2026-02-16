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
  | { type: "AWAITING_BW_EDIT"; wordId: number };

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
  add_bw: "add_blocked_word",
  edit_bw: "edit_blocked_word",
  del_bw: "delete_blocked_word",
};

const ACTION_LABELS: Record<string, string> = {
  approve_member: "Approve",
  ban_member: "Ban",
  kick_member: "Kick",
  add_welcome_message: "Add WM",
  edit_welcome_message: "Edit WM",
  delete_welcome_message: "Del WM",
  edit_intro_guide: "Edit IG",
  reset_intro: "Reset Intro",
  add_blocked_word: "Add BW",
  edit_blocked_word: "Edit BW",
  delete_blocked_word: "Del BW",
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
  "• <b>Stats</b> — Member counts and intro completion stats",
  "• <b>Blocked Words</b> — Manage words blocked from intro submissions",
  "• <b>Logs</b> — Browse admin action logs with filters and pagination",
  "",
  "<b>Group Commands</b>",
  "/help — Show help",
  "/setintroguide &lt;msg&gt; — Set the intro guide",
  "/viewintroguide — View current intro guide",
  "/logs [type] [count] — View recent admin logs",
  "/logs [type] [start] [end] — View logs by date range",
  "/posthelp — Post a pinnable help message",
  "",
  "<b>Log type aliases:</b> approve, ban, kick, reset, add_wm, edit_wm, del_wm, edit_ig, add_bw, edit_bw, del_bw",
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
  "/posthelp  —  Post a pinnable help message to the current chat",
  "",
  "<b>Admin menu (DM only)</b>",
  "Send <code>/start admin</code> to the bot in DM to open the admin panel.",
  "Manage members, bans, welcome messages, intro guide, stats, and logs.",
].join("\n");

export const POSTHELP_TEXT =
  "<b>Superteam MY Bot — Admin Help</b>\n\n" +
  "<b>DM Admin Menu</b>\n" +
  "Send <code>/start admin</code> to the bot in DM to open the admin panel.\n\n" +
  ADMIN_HELP_BODY;

export function backButton(callback: string, label = "Back") {
  return Markup.button.callback(`<< ${label}`, callback);
}

export function formatAction(action: string): string {
  return ACTION_LABELS[action] ?? action;
}
