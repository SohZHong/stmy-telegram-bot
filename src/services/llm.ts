import OpenAI from "openai";
import { config } from "../config";

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!client) {
    if (!config.openaiApiKey) throw new Error("OPENAI_API_KEY not configured");
    client = new OpenAI({ apiKey: config.openaiApiKey });
  }
  return client;
}

export async function validateIntro(
  text: string,
): Promise<{ valid: boolean; reason: string }> {
  const c = getClient();
  const response = await c.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "user",
        content: `You are a verification assistant for a community group. A new member submitted this introduction:

"${text}"

Determine if this introduction is legitimate. It is NOT legitimate if it is:
- Random gibberish (e.g. "asdfhjkl", "uoashfoa")
- Completely dismissive (e.g. "idk", "whatever", "no", "n/a", "test")
- Obviously trolling or spam
- Has no meaningful content about the person

It IS legitimate even if brief, as long as it actually introduces the person.

Respond in JSON format:
{"valid": true/false, "reason": "brief explanation"}`,
      },
    ],
    response_format: { type: "json_object" },
    temperature: 0.1,
  });

  const result = JSON.parse(response.choices[0].message.content ?? "{}");
  return { valid: result.valid ?? true, reason: result.reason ?? "" };
}

export async function summarizeMessages(
  messages: { displayName: string; text: string }[],
): Promise<string> {
  const c = getClient();
  const formatted = messages
    .map((m) => `[${m.displayName}]: ${m.text}`)
    .join("\n");

  const response = await c.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "user",
        content: `Here are the latest messages from a community group chat. Summarize the key topics and discussions happening. Be concise — use bullet points. Group related messages into themes.

Messages:
${formatted}

Provide a clear summary of what's being discussed right now.`,
      },
    ],
    temperature: 0.3,
  });

  return response.choices[0].message.content?.trim() ?? "";
}

export async function isContactQuery(messageText: string): Promise<boolean> {
  const c = getClient();
  const response = await c.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "user",
        content: `Determine if this message is asking about who to contact, who is in charge, who is the point of contact, who to reach out to, or who is responsible for the community/organization (Superteam MY or STMY).

Message: "${messageText}"

Respond with ONLY "yes" or "no".`,
      },
    ],
    temperature: 0,
    max_tokens: 5,
  });

  return response.choices[0].message.content?.trim().toLowerCase() === "yes";
}

export async function answerMembersQuestion(
  question: string,
  members: Record<string, unknown>[],
): Promise<string> {
  const c = getClient();
  const membersInfo = JSON.stringify(members, null, 2);

  const response = await c.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "user",
        content: `You are an analytics assistant for the Superteam MY community. Here is the member database:

${membersInfo}

Each member has: telegram_id, username, first_name, intro_completed, joined_at, intro_completed_at.

The admin is asking: "${question}"

Answer the question based on the member data. Be concise and useful. If the question asks for counts, breakdowns, or patterns, provide them. If the data doesn't contain enough info to answer, say so.`,
      },
    ],
    temperature: 0.3,
  });

  return response.choices[0].message.content?.trim() ?? "";
}
