import { config } from "./config";
import { Telegram } from "telegraf";

const FULL_PERMISSIONS = {
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

const MUTED_PERMISSIONS = Object.fromEntries(
  Object.keys(FULL_PERMISSIONS).map((key) => [key, false]),
) as { [K in keyof typeof FULL_PERMISSIONS]: false };

export async function muteUser(
  telegram: Telegram,
  userId: number,
): Promise<void> {
  await telegram.restrictChatMember(config.mainGroupId, userId, {
    permissions: MUTED_PERMISSIONS,
  });
}

export async function unmuteUser(
  telegram: Telegram,
  userId: number,
): Promise<void> {
  await telegram.restrictChatMember(config.mainGroupId, userId, {
    permissions: FULL_PERMISSIONS,
  });
}

export async function postToClosedTopic<T>(
  telegram: Telegram,
  topicId: number,
  sendFn: () => Promise<T>,
): Promise<T> {
  await telegram.reopenForumTopic(config.mainGroupId, topicId);
  try {
    return await sendFn();
  } finally {
    await telegram.closeForumTopic(config.mainGroupId, topicId);
  }
}
