import "dotenv/config";

const required = [
  "BOT_TOKEN",
  "MAIN_GROUP_ID",
  "INTRO_TOPIC_ID",
  "WELCOME_TOPIC_ID",
  "ADMIN_TOPIC_ID",
  "DATABASE_URL",
] as const;

for (const key of required) {
  if (!process.env[key]) {
    console.error(`Missing required environment variable: ${key}`);
    process.exit(1);
  }
}

export const config = {
  botToken: process.env.BOT_TOKEN!,
  mainGroupId: Number(process.env.MAIN_GROUP_ID),
  introTopicId: Number(process.env.INTRO_TOPIC_ID),
  welcomeTopicId: Number(process.env.WELCOME_TOPIC_ID),
  adminTopicId: Number(process.env.ADMIN_TOPIC_ID),
  announcementsTopicId: process.env.ANNOUNCEMENTS_TOPIC_ID
    ? Number(process.env.ANNOUNCEMENTS_TOPIC_ID)
    : null,
  databaseUrl: process.env.DATABASE_URL!,
};
