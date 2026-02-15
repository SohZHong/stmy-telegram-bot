import { Telegraf } from 'telegraf';
import { config } from '../config.js';
import { getMember, markIntroCompleted } from '../db/database.js';

const UNMUTED_PERMISSIONS = {
  can_send_messages: true,
  can_send_audios: true,
  can_send_documents: true,
  can_send_photos: true,
  can_send_videos: true,
  can_send_video_notes: true,
  can_send_voice_notes: true,
  can_send_polls: true,
  can_send_other_messages: true,
  can_add_web_page_previews: true,
  can_invite_users: true,
} as const;

export function setup(bot: Telegraf): void {
  bot.on('message', async (ctx, next) => {
    const isIntroTopic =
      ctx.chat.id === config.mainGroupId &&
      'message_thread_id' in ctx.message &&
      ctx.message.message_thread_id === config.introTopicId;
    if (!isIntroTopic) return next();
    if (!('text' in ctx.message)) return next();

    const userId = ctx.from.id;
    if (ctx.from.is_bot) return next();

    try {
      const member = await getMember(userId);

      if (!member || member.intro_completed) return next();

      await markIntroCompleted(userId);

      await ctx.telegram.restrictChatMember(config.mainGroupId, userId, {
        permissions: UNMUTED_PERMISSIONS,
      });

      const name = ctx.from.first_name || ctx.from.username || 'there';
      await ctx.reply(
        `Thanks for introducing yourself, ${name}! You're now unmuted in the main group. 🎉`
      );
    } catch (err) {
      console.error(`Error checking intro for user ${userId}:`, (err as Error).message);
    }

    return next();
  });
}
