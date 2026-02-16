import { Markup } from "telegraf";
import type { CbCtx } from "../shared";
import { backButton } from "../shared";
import { getMemberStats } from "../../../models/member";
import { countWelcomeMessages } from "../../../models/welcomeMessage";

export async function handleCallback(
  ctx: CbCtx,
  data: string,
  _userId: number,
): Promise<boolean> {
  if (data !== "a:stats") return false;

  const [stats, wmCount] = await Promise.all([
    getMemberStats(),
    countWelcomeMessages(),
  ]);

  const text = [
    "Stats",
    "",
    `Total members: ${stats.total}`,
    `Pending intros: ${stats.pending}`,
    `Completed intros: ${stats.completed}`,
    `Completed today: ${stats.completed_today}`,
    `Completed this week: ${stats.completed_this_week}`,
    `Welcome messages: ${wmCount}`,
  ].join("\n");

  await ctx.editMessageText(
    text,
    Markup.inlineKeyboard([[backButton("a:main")]]),
  );
  return true;
}
