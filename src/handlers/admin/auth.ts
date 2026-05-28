import { Context, Telegram } from "telegraf";
import { config } from "../../config";

// 60s TTL is short enough that promotion/demotion is picked up quickly,
// long enough to amortize the Telegram API cost across bursts of activity.
const ADMIN_CACHE_TTL_MS = 60_000;
const adminCache = new Map<number, { isAdmin: boolean; expiresAt: number }>();

export async function isAdmin(ctx: Context): Promise<boolean> {
  if (!ctx.from) return false;
  return isAdminById(ctx.telegram, ctx.from.id);
}

export async function isAdminById(
  telegram: Telegram,
  userId: number,
): Promise<boolean> {
  const now = Date.now();
  const cached = adminCache.get(userId);
  if (cached && cached.expiresAt > now) {
    return cached.isAdmin;
  }
  try {
    const chatMember = await telegram.getChatMember(
      config.mainGroupId,
      userId,
    );
    const isAdmin =
      chatMember.status === "administrator" ||
      chatMember.status === "creator";
    adminCache.set(userId, { isAdmin, expiresAt: now + ADMIN_CACHE_TTL_MS });
    return isAdmin;
  } catch (err) {
    console.error(`isAdminById failed for user ${userId}:`, (err as Error).message);
    return false;
  }
}
