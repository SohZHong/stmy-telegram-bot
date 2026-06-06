import { Telegraf } from "telegraf";
import { config } from "../config";
import { getMember, upsertMember } from "../models/member";
import { muteUser } from "../permissions";
import {
  buildIntroWelcome,
  markDmedViaJoinRequest,
  welcomeMessageIds,
} from "./newMember";

export function setup(bot: Telegraf): void {
  bot.on("chat_join_request", async (ctx) => {
    const req = ctx.chatJoinRequest;
    if (req.chat.id !== config.mainGroupId) return;

    const user = req.from;
    const userId = user.id;

    if (user.is_bot) {
      try {
        await ctx.telegram.declineChatJoinRequest(req.chat.id, userId);
      } catch (err) {
        console.error(
          `declineChatJoinRequest failed for bot ${userId}:`,
          (err as Error).message,
        );
      }
      return;
    }

    try {
      const existing = await getMember(userId);

      // Returning intro-completed member: just approve. handleNewMember will
      // post the "Welcome back" message when new_chat_members fires.
      if (existing?.intro_completed) {
        try {
          await ctx.telegram.approveChatJoinRequest(req.chat.id, userId);
        } catch (err) {
          console.error(
            `approveChatJoinRequest failed for returning member ${userId}:`,
            (err as Error).message,
          );
        }
        return;
      }

      // Try DM via user_chat_id (the 5-minute window opened by the join request).
      let dmMsgId: number | null = null;
      try {
        const { text, keyboard } = await buildIntroWelcome(user);
        const sent = await ctx.telegram.sendMessage(req.user_chat_id, text, {
          parse_mode: "Markdown",
          ...keyboard,
        });
        dmMsgId = sent.message_id;
      } catch (err) {
        console.error(
          `Failed to DM new joiner ${userId} via user_chat_id, falling back to public welcome:`,
          (err as Error).message,
        );
      }

      try {
        await ctx.telegram.approveChatJoinRequest(req.chat.id, userId);
      } catch (err) {
        console.error(
          `approveChatJoinRequest failed for ${userId}:`,
          (err as Error).message,
        );
        return;
      }

      // Only commit upsert/mute/suppression after BOTH the DM and the approval
      // succeeded. If the DM failed, leaving the DB untouched lets handleNewMember
      // run the public-welcome path cleanly when new_chat_members fires.
      // If approval failed, returning above kept welcomeMessageIds empty so a
      // user who clicks the dangling DM button hits a graceful "I don't have you
      // in my records" reply from introFlow.
      if (dmMsgId !== null) {
        if (!existing) {
          await upsertMember(userId, user.username, user.first_name, req.chat.id);
        }
        welcomeMessageIds.set(userId, {
          chatId: req.user_chat_id,
          messageId: dmMsgId,
        });
        markDmedViaJoinRequest(userId);
        try {
          await muteUser(ctx.telegram, userId);
        } catch {
          // may lack restrict-members permission
        }
      }
    } catch (err) {
      console.error(
        `Error handling chat_join_request for ${userId}:`,
        (err as Error).message,
      );
    }
  });
}
