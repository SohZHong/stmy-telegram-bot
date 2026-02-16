import { Context, Telegram } from "telegraf";
import { config } from "../../config";

export async function isAdmin(ctx: Context): Promise<boolean> {
  if (!ctx.from) return false;
  return isAdminById(ctx.telegram, ctx.from.id);
}

export async function isAdminById(
  telegram: Telegram,
  userId: number,
): Promise<boolean> {
  try {
    const chatMember = await telegram.getChatMember(
      config.mainGroupId,
      userId,
    );
    return (
      chatMember.status === "administrator" || chatMember.status === "creator"
    );
  } catch {
    return false;
  }
}
