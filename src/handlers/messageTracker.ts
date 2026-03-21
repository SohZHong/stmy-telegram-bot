import { Telegraf } from "telegraf";
import { config } from "../config";

export interface TrackedMessage {
  userId: number;
  displayName: string;
  username: string;
  text: string;
  threadId: number | undefined;
  timestamp: string;
}

const MAX_BUFFER = 500;
export const messageBuffer: TrackedMessage[] = [];

export function setup(bot: Telegraf): void {
  bot.on("message", async (ctx, next) => {
    if (ctx.chat.type !== "supergroup" && ctx.chat.type !== "group")
      return next();
    if (ctx.chat.id !== config.mainGroupId) return next();
    if (!("text" in ctx.message) || !ctx.message.text) return next();
    if (ctx.from.is_bot) return next();

    messageBuffer.push({
      userId: ctx.from.id,
      displayName: ctx.from.first_name || "Unknown",
      username: ctx.from.username || "",
      text: ctx.message.text,
      threadId:
        "message_thread_id" in ctx.message
          ? ctx.message.message_thread_id
          : undefined,
      timestamp: new Date().toISOString(),
    });

    if (messageBuffer.length > MAX_BUFFER) {
      messageBuffer.splice(0, messageBuffer.length - MAX_BUFFER);
    }

    return next();
  });
}
