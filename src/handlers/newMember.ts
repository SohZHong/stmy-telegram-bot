import { Telegraf } from "telegraf";
import { config } from "../config";
import { getMember, upsertMember } from "../models/member";
import { getSetting } from "../models/settings";

const MUTED_PERMISSIONS = {
  can_send_messages: false,
  can_send_audios: false,
  can_send_documents: false,
  can_send_photos: false,
  can_send_videos: false,
  can_send_video_notes: false,
  can_send_voice_notes: false,
  can_send_polls: false,
  can_send_other_messages: false,
  can_add_web_page_previews: false,
  can_invite_users: false,
} as const;

export function setup(bot: Telegraf): void {
  bot.on("new_chat_members", async (ctx) => {
    if (ctx.chat.id !== config.mainGroupId) return;

    for (const member of ctx.message.new_chat_members) {
      if (member.is_bot) continue;

      try {
        const existing = await getMember(member.id);

        if (existing?.intro_completed) {
          continue;
        }

        await upsertMember(
          member.id,
          member.username,
          member.first_name,
          ctx.chat.id,
        );

        await ctx.telegram.restrictChatMember(config.mainGroupId, member.id, {
          permissions: MUTED_PERMISSIONS,
        });

        const welcomeMsg = await getSetting("welcome_message");
        const introGuide = await getSetting("intro_guide");
        const name = member.first_name || member.username || "there";
        const text =
          (welcomeMsg ?? "").replace(/\{name\}/g, name) +
          "\n\n" +
          (introGuide ?? "");

        await ctx.reply(text, { parse_mode: "Markdown" });
      } catch (err) {
        console.error(
          `Error handling new member ${member.id}:`,
          (err as Error).message,
        );
      }
    }
  });
}
