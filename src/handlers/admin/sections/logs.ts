import { Markup } from "telegraf";
import type { CbCtx } from "../shared";
import {
  PAGE_SIZE,
  backButton,
  ACTION_ALIASES,
  formatAction,
} from "../shared";
import { truncate } from "../../../utils/format";
import { resolveUser } from "../../../utils/user";
import { getLogsPaginated, getLogById, countLogs } from "../../../models/adminLog";

function formatLogLine(log: {
  id: number;
  action: string;
  created_at: Date;
}): string {
  const date = log.created_at.toISOString().split("T")[0];
  return `[${date}] ${formatAction(log.action)}`;
}

export async function handleCallback(
  ctx: CbCtx,
  data: string,
  _userId: number,
): Promise<boolean> {
  // Filter selection menu
  if (data === "a:log") {
    const rows = [
      [Markup.button.callback("All Logs", "a:log:list:all:0")],
      [
        Markup.button.callback("Approve", "a:log:list:approve:0"),
        Markup.button.callback("Ban", "a:log:list:ban:0"),
        Markup.button.callback("Kick", "a:log:list:kick:0"),
      ],
      [Markup.button.callback("Reset Intro", "a:log:list:reset:0")],
      [
        Markup.button.callback("Add WM", "a:log:list:add_wm:0"),
        Markup.button.callback("Edit WM", "a:log:list:edit_wm:0"),
        Markup.button.callback("Del WM", "a:log:list:del_wm:0"),
      ],
      [
        Markup.button.callback("Edit IG", "a:log:list:edit_ig:0"),
        Markup.button.callback("Edit AG", "a:log:list:edit_ag:0"),
      ],
      [
        Markup.button.callback("Add BW", "a:log:list:add_bw:0"),
        Markup.button.callback("Edit BW", "a:log:list:edit_bw:0"),
        Markup.button.callback("Del BW", "a:log:list:del_bw:0"),
      ],
      [Markup.button.callback("Announce", "a:log:list:announce:0")],
      [backButton("a:main")],
    ];
    await ctx.editMessageText(
      "Logs — select filter",
      Markup.inlineKeyboard(rows),
    );
    return true;
  }

  // Paginated list: a:log:list:TYPE:PAGE
  if (data.startsWith("a:log:list:")) {
    const parts = data.split(":");
    const type = parts[3];
    const page = parseInt(parts[4], 10);
    const filter = ACTION_ALIASES[type];
    const offset = page * PAGE_SIZE;

    const [logs, total] = await Promise.all([
      getLogsPaginated(PAGE_SIZE, offset, filter),
      countLogs(filter),
    ]);

    if (total === 0) {
      await ctx.editMessageText(
        "No logs found.",
        Markup.inlineKeyboard([[backButton("a:log")]]),
      );
      return true;
    }

    const totalPages = Math.ceil(total / PAGE_SIZE);
    const rows = logs.map((log) => [
      Markup.button.callback(
        truncate(formatLogLine(log), 40),
        `a:log:v:${log.id}`,
      ),
    ]);

    const nav: ReturnType<typeof Markup.button.callback>[] = [];
    if (page > 0)
      nav.push(
        Markup.button.callback("< Prev", `a:log:list:${type}:${page - 1}`),
      );
    nav.push(Markup.button.callback(`${page + 1}/${totalPages}`, "a:noop"));
    if (page < totalPages - 1)
      nav.push(
        Markup.button.callback("Next >", `a:log:list:${type}:${page + 1}`),
      );

    rows.push(nav);
    rows.push([backButton("a:log")]);

    const label = filter ? formatAction(filter) : "All";
    await ctx.editMessageText(
      `Logs — ${label} (${total})`,
      Markup.inlineKeyboard(rows),
    );
    return true;
  }

  // View single log: a:log:v:ID
  if (data.startsWith("a:log:v:")) {
    const logId = parseInt(data.split(":")[3], 10);
    const log = await getLogById(logId);
    if (!log) {
      await ctx.editMessageText(
        "Log not found.",
        Markup.inlineKeyboard([[backButton("a:log")]]),
      );
      return true;
    }

    const adminLabel = await resolveUser(log.admin_telegram_id, ctx.telegram);

    const lines = [
      `ID: ${log.id}`,
      `Action: ${formatAction(log.action)}`,
      `Admin: ${adminLabel}`,
    ];
    if (log.target_id) {
      const targetLabel = await resolveUser(log.target_id, ctx.telegram);
      lines.push(`Target: ${targetLabel}`);
    }
    if (log.details) lines.push(`Details: ${log.details}`);
    lines.push(
      `Date: ${log.created_at.toISOString().replace("T", " ").split(".")[0]}`,
    );

    await ctx.editMessageText(
      lines.join("\n"),
      Markup.inlineKeyboard([[backButton("a:log")]]),
    );
    return true;
  }

  return false;
}
