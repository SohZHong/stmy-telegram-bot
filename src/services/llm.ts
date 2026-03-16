import OpenAI from "openai";
import { config } from "../config";

const MODEL = "gpt-5-mini";

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
    model: MODEL,
    messages: [
      {
        role: "user",
        content: `You are a strict verification assistant for a community group. A new member was asked to introduce themselves with this format:

• Who are you & what do you do?
• Where are you based?
• One fun fact about you
• How are you looking to contribute to Superteam MY?

They submitted this introduction:

"${text}"

Determine if this introduction is legitimate. It is NOT valid if:
- It contains random gibberish or keyboard smashing
- It is dismissive or low-effort (e.g. "idk", "whatever", "i am handsome", "hi i'm X")
- It is trolling or spam
- It does NOT meaningfully answer at least 2-3 of the required questions above
- It is too short or vague to actually tell the community about the person

A valid introduction should genuinely answer the intro format questions — who they are, what they do, where they're based, and/or how they want to contribute. One-liners or jokes without substance should be rejected.

Respond in JSON format:
{"valid": true/false, "reason": "brief explanation"}`,
      },
    ],
    response_format: { type: "json_object" },
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
    model: MODEL,
    messages: [
      {
        role: "user",
        content: `Here are the latest messages from a community group chat. Summarize the key topics and discussions happening. Be concise — use bullet points. Group related messages into themes.

Messages:
${formatted}

Provide a clear summary of what's being discussed right now.`,
      },
    ],
  });

  return response.choices[0].message.content?.trim() ?? "";
}

export async function isContactQuery(messageText: string): Promise<boolean> {
  const c = getClient();
  const response = await c.chat.completions.create({
    model: MODEL,
    messages: [
      {
        role: "user",
        content: `Is this message asking about who to contact, who to reach out to, who is in charge, or who is the point of contact for anything related to the community or organization?

Examples that should be "yes":
- "who should I contact at superteam?"
- "who is in charge here?"
- "who do I reach out to?"
- "who is the poc?"
- "who can I talk to about this?"

Message: "${messageText}"

Respond with ONLY "yes" or "no".`,
      },
    ],
    max_completion_tokens: 5,
  });

  return response.choices[0].message.content?.trim().toLowerCase() === "yes";
}

export async function detectNsLongtimer(text: string): Promise<boolean> {
  const c = getClient();
  const response = await c.chat.completions.create({
    model: MODEL,
    messages: [
      {
        role: "user",
        content: `You are analyzing a new member's introduction for the Superteam MY community.

Determine if this person is an NS (Network State / Superteam) long-termer — someone who has been part of Superteam, the Solana ecosystem, or the broader Network State community for a long time (not a newcomer/lurker).

Signs they are a long-termer:
- They mention being part of Superteam, NS, or similar communities for months/years
- They reference past contributions, projects, or roles in the ecosystem
- They mention being an existing/returning member
- They have deep familiarity with the community or ecosystem

Introduction: "${text}"

Respond with ONLY "yes" or "no".`,
      },
    ],
    max_completion_tokens: 5,
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
    model: MODEL,
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
  });

  return response.choices[0].message.content?.trim() ?? "";
}
