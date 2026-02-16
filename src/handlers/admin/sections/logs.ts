import { Markup } from "telegraf";
import type { CbCtx } from "../shared";
import { PAGE_SIZE, truncate, backButton } from "../shared";
import {
  getLogsPaginated,
  getLogById,
  countLogs,
} from "../../../models/adminLog";
import type { AdminLogAction } from "../../../models/adminLog";

const ACTION_LABELS: Record<
  string,
  { label: string; filter?: AdminLogAction }
> = {
  all: { label: "All" },
  approve: { label: "Approve", filter: "approve_member" },
  ban: { label: "Ban", filter: "ban_member" },
  kick: { label: "Kick", filter: "kick_member" },
  add_wm: { label: "Add WM", filter: "add_welcome_message" },
  edit_wm: { label: "Edit WM", filter: "edit_welcome_message" },
  del_wm: { label: "Del WM", filter: "delete_welcome_message" },
  edit_ig: { label: "Edit IG", filter: "edit_intro_guide" },
};

function formatAction(action: string): string {
  for (const entry of Object.values(ACTION_LABELS)) {
    if (entry.filter === action) return entry.label;
  }
  return action;
}

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
      [
        Markup.button.callback("Add WM", "a:log:list:add_wm:0"),
        Markup.button.callback("Edit WM", "a:log:list:edit_wm:0"),
        Markup.button.callback("Del WM", "a:log:list:del_wm:0"),
      ],
      [Markup.button.callback("Edit IG", "a:log:list:edit_ig:0")],
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
    const filter = ACTION_LABELS[type]?.filter;
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

    const label = ACTION_LABELS[type]?.label ?? "All";
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

    const lines = [
      `ID: ${log.id}`,
      `Action: ${formatAction(log.action)}`,
      `Admin: ${log.admin_telegram_id}`,
    ];
    if (log.target_id) lines.push(`Target: ${log.target_id}`);
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
