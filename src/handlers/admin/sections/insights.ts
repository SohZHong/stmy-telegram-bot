import { Markup } from "telegraf";
import { messageBuffer } from "../../messageTracker";
import { summarizeMessages, answerMembersQuestion } from "../../../services/llm";
import { config } from "../../../config";
import { adminState, backButton } from "../shared";
import type { CbCtx, TextCtx, AdminAction } from "../shared";
import { pool } from "../../../db/database";

function insightsKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("📊 Chat Summary", "a:ai:sum")],
    [Markup.button.callback("📈 Activity", "a:ai:act")],
    [Markup.button.callback("👥 Members AI", "a:ai:mai")],
    [backButton("a:main")],
  ]);
}

export async function handleCallback(
  ctx: CbCtx,
  data: string,
  userId: number,
): Promise<boolean> {
  if (data === "a:ai") {
    adminState.delete(userId);
    await ctx.editMessageText("AI Insights", insightsKeyboard());
    return true;
  }

  if (data === "a:ai:sum") {
    if (!config.openaiApiKey) {
      await ctx.editMessageText(
        "OPENAI_API_KEY not configured.",
        Markup.inlineKeyboard([[backButton("a:ai")]]),
      );
      return true;
    }

    // General topic messages (threadId undefined or 1)
    const generalMsgs = messageBuffer.filter(
      (m) => m.threadId == null || m.threadId === 1,
    );
    if (generalMsgs.length === 0) {
      await ctx.editMessageText(
        "📭 No messages tracked yet.\n\nThe bot only tracks messages received since it started running.",
        Markup.inlineKeyboard([[backButton("a:ai")]]),
      );
      return true;
    }

    const last100 = generalMsgs.slice(-100);
    await ctx.editMessageText(
      `⏳ Summarizing ${last100.length} messages from General...`,
    );

    try {
      const summary = await summarizeMessages(
        last100.map((m) => ({ displayName: m.displayName, text: m.text })),
      );
      await ctx.editMessageText(
        `📊 Chat Summary (${last100.length} messages)\n━━━━━━━━━━━━━━━━━━━━\n\n${summary}`,
        Markup.inlineKeyboard([[backButton("a:ai")]]),
      );
    } catch (err) {
      await ctx.editMessageText(
        `Error: ${(err as Error).message}`,
        Markup.inlineKeyboard([[backButton("a:ai")]]),
      );
    }
    return true;
  }

  if (data === "a:ai:act") {
    if (messageBuffer.length === 0) {
      await ctx.editMessageText(
        "📭 No messages tracked yet.",
        Markup.inlineKeyboard([[backButton("a:ai")]]),
      );
      return true;
    }

    const counter = new Map<number, number>();
    const nameMap = new Map<number, string>();
    for (const m of messageBuffer) {
      counter.set(m.userId, (counter.get(m.userId) ?? 0) + 1);
      nameMap.set(
        m.userId,
        m.username ? `@${m.username}` : m.displayName,
      );
    }

    const sorted = Array.from(counter.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
    const medals = ["🥇", "🥈", "🥉"];
    const lines = sorted.map(([uid, count], i) => {
      const prefix = i < 3 ? medals[i] : `  ${i + 1}.`;
      return `${prefix} ${nameMap.get(uid)} — ${count} msgs`;
    });

    const total = Array.from(counter.values()).reduce((a, b) => a + b, 0);
    await ctx.editMessageText(
      `📈 Activity Leaderboard\n━━━━━━━━━━━━━━━━━━━━\n\n${lines.join("\n")}\n\n📊 Total: ${total} messages tracked`,
      Markup.inlineKeyboard([[backButton("a:ai")]]),
    );
    return true;
  }

  if (data === "a:ai:mai") {
    if (!config.openaiApiKey) {
      await ctx.editMessageText(
        "OPENAI_API_KEY not configured.",
        Markup.inlineKeyboard([[backButton("a:ai")]]),
      );
      return true;
    }

    const { rows } = await pool.query<{ count: string }>(
      "SELECT COUNT(*) as count FROM members",
    );
    const count = parseInt(rows[0].count, 10);

    if (count === 0) {
      await ctx.editMessageText(
        "📭 No members in the database yet.",
        Markup.inlineKeyboard([[backButton("a:ai")]]),
      );
      return true;
    }

    adminState.set(userId, { type: "AWAITING_MAI_Q" });
    await ctx.editMessageText(
      `👥 There are *${count}* registered members.\n\n💬 What would you like to know about them?\nType your question below:`,
      { parse_mode: "Markdown" },
    );
    return true;
  }

  return false;
}

export async function handleText(
  ctx: TextCtx,
  text: string,
  state: AdminAction,
  userId: number,
): Promise<boolean> {
  if (state.type !== "AWAITING_MAI_Q") return false;

  adminState.delete(userId);

  try {
    const { rows: members } = await pool.query("SELECT * FROM members");
    await ctx.reply("⏳ Analyzing member data...");
    const answer = await answerMembersQuestion(text, members);
    await ctx.reply(
      `👥 ${answer}`,
      Markup.inlineKeyboard([[backButton("a:ai")]]),
    );
  } catch (err) {
    await ctx.reply(
      `Error: ${(err as Error).message}`,
      Markup.inlineKeyboard([[backButton("a:ai")]]),
    );
  }

  return true;
}
