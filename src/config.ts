import 'dotenv/config';

const required = ['BOT_TOKEN', 'MAIN_GROUP_ID', 'INTRO_TOPIC_ID', 'DATABASE_URL'] as const;

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
  databaseUrl: process.env.DATABASE_URL!,
};
