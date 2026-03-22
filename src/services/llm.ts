import OpenAI from "openai";
import { config } from "../config";
import type { Member } from "../models/member";

const MODEL = "gpt-4o-mini";

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

export async function generateIntro(
  rawText: string,
  name: string,
): Promise<string> {
  const c = getClient();
  const response = await c.chat.completions.create({
    model: MODEL,
    messages: [
      {
        role: "user",
        content: `You are writing a welcome introduction for a new member joining the Superteam MY community.

The member's name is: ${name}

They submitted this raw introduction:
"${rawText}"

Rewrite it into a polished, structured welcome intro following this format. Vary the tone, wording, and emoji usage each time so it feels fresh and human — sometimes enthusiastic, sometimes chill, sometimes witty. Mix it up.

Structure:
Hey everyone! Let's welcome [Name] 👋

[1-2 sentences about who they are and what they do, written naturally]

📍 Based in [location if mentioned]

🧑‍🎓 Fun fact: [their fun fact if mentioned]

🤝 Looking to contribute by:
• [break their contribution into bullet points if multiple ideas, or single bullet if one thing]

[Short friendly closing line encouraging people to connect]

Rules:
- Use their actual name, no brackets or placeholders in the output
- Vary your opening greeting, emoji choices, and closing line
- If they didn't mention a particular field (location, fun fact, contribution), skip that section entirely — do NOT make things up
- Keep it warm and community-oriented
- Do NOT wrap in quotes or add meta-commentary
- Output plain text (no HTML or Markdown formatting)`,
      },
    ],
    temperature: 0.9,
  });

  return response.choices[0].message.content?.trim() ?? rawText;
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

export async function answerContactQuery(
  messageText: string,
  picHandles: string,
): Promise<string | null> {
  const c = getClient();
  const response = await c.chat.completions.create({
    model: "gpt-4.1-nano",
    messages: [
      {
        role: "system",
        content: `You are a helpful assistant for the Superteam MY community Telegram group.
Answer questions about the community concisely and helpfully.

Key contacts: ${picHandles || "not configured"}

Rules:
- Keep answers short (2-4 sentences max)
- If the question is about who to contact, mention the key contacts above
- Be friendly and welcoming
- Don't make up information
- If the question is NOT about the community, contacts, or Superteam, respond with exactly "SKIP"
- If you don't know the answer, respond with exactly "SKIP"`,
      },
      {
        role: "user",
        content: messageText,
      },
    ],
  });

  const answer = response.choices[0].message.content?.trim();
  if (!answer || answer === "SKIP") return null;
  return answer;
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
  members: Member[],
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
