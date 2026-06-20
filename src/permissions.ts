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
  try {
    await telegram.reopenForumTopic(config.mainGroupId, topicId);
  } catch {
    // Topic may already be open
  }
  try {
    return await sendFn();
  } finally {
    try {
      await telegram.closeForumTopic(config.mainGroupId, topicId);
    } catch {
      // Topic may already be closed
    }
  }
}

// Posts into a forum topic without disturbing its open/closed state when
// possible. The intro topic is kept closed so only the bot/admins post there,
// and an admin bot can post directly into a closed topic — so we try a direct
// send first. This avoids the "reopened/closed the topic" service-message spam
// that the reopen→post→close dance generates. Only if the direct send fails
// (e.g. the bot can't post while the topic is closed) do we fall back to
// postToClosedTopic.
export async function postToForumTopic<T>(
  telegram: Telegram,
  topicId: number,
  sendFn: () => Promise<T>,
): Promise<T> {
  try {
    return await sendFn();
  } catch {
    return await postToClosedTopic(telegram, topicId, sendFn);
  }
}
