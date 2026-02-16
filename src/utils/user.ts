import { getMember } from "../models/member";
import type { Member } from "../models/member";

export async function resolveUser(telegramId: string): Promise<string> {
  const member = await getMember(parseInt(telegramId, 10));
  if (member?.username) return `@${member.username}`;
  if (member?.first_name) return member.first_name;
  return telegramId;
}

export function memberLabel(m: Member): string {
  const name = m.first_name || "Unknown";
  const username = m.username ? ` (@${m.username})` : "";
  return `${name}${username}`;
}
