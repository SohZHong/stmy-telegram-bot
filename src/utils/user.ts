import type { Telegram } from "telegraf";
import { getMember } from "../models/member";
import type { Member } from "../models/member";

export async function resolveUser(
  telegramId: string,
  telegram?: Telegram,
): Promise<string> {
  const member = await getMember(parseInt(telegramId, 10));
  if (member?.username) return `@${member.username}`;
  if (member?.first_name) return member.first_name;

  if (telegram) {
    try {
      const chat = await telegram.getChat(parseInt(telegramId, 10));
      if ("username" in chat && chat.username) return `@${chat.username}`;
      if ("first_name" in chat && chat.first_name) return chat.first_name;
    } catch {
      // User may have blocked the bot or doesn't exist
    }
  }

  return telegramId;
}

export function memberLabel(m: Member): string {
  const name = m.first_name || "Unknown";
  const username = m.username ? ` (@${m.username})` : "";
  return `${name}${username}`;
}
