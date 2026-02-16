import { Markup } from "telegraf";
import type { Context } from "telegraf";
import type { Member } from "../../models/member";

export type CbCtx = Context;
export type TextCtx = Context;

export type AdminAction =
  | { type: "AWAITING_MEMBER_SEARCH" }
  | { type: "AWAITING_BAN_SEARCH" }
  | { type: "AWAITING_WM_ADD" }
  | { type: "AWAITING_WM_EDIT"; messageId: number }
  | { type: "AWAITING_IG_EDIT" };

export const adminState = new Map<number, AdminAction>();

export const PAGE_SIZE = 5;

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
