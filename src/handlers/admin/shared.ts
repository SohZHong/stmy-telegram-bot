import { Markup } from "telegraf";
import type { Context } from "telegraf";
import type { Member } from "../../models/member";
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
  "<b>Log type aliases:</b> approve, ban, kick, add_wm, edit_wm, del_wm, edit_ig, add_bw, edit_bw, del_bw",
].join("\n");

export function truncate(text: string, max: number): string {
  const clean = text.replace(/\n/g, " ").trim();
  const chars = Array.from(clean);
  if (chars.length <= max) return clean;
  return chars.slice(0, max - 1).join("") + "…";
}

export function backButton(callback: string, label = "Back") {
  return Markup.button.callback(`<< ${label}`, callback);
}

export function memberLabel(m: Member): string {
  const name = m.first_name || "Unknown";
  const username = m.username ? ` (@${m.username})` : "";
  return `${name}${username}`;
}

export function formatAction(action: string): string {
  return ACTION_LABELS[action] ?? action;
}
