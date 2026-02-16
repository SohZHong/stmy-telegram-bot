import { Markup, Telegraf } from "telegraf";
import { message } from "telegraf/filters";
import { config } from "../config";
import { isAdminById } from "./admin";
import {
  getMember,
  getPendingMembers,
  countPendingMembers,
  searchMembers,
  deleteMember,
  markIntroCompleted,
  getMemberStats,
} from "../models/member";
import type { Member } from "../models/member";
import {
  getAllWelcomeMessages,
  getWelcomeMessage,
  addWelcomeMessage,
  updateWelcomeMessage,
  deleteWelcomeMessage,
  countWelcomeMessages,
} from "../models/welcomeMessage";
import { getSetting, setSetting } from "../models/settings";
import { unmuteUser } from "../permissions";

const PAGE_SIZE = 5;

type AdminAction =
  | { type: "AWAITING_MEMBER_SEARCH" }
  | { type: "AWAITING_BAN_SEARCH" }
  | { type: "AWAITING_WM_ADD" }
  | { type: "AWAITING_WM_EDIT"; messageId: number }
  | { type: "AWAITING_IG_EDIT" };

const adminState = new Map<number, AdminAction>();

function mainMenuKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("Members", "a:mem")],
    [Markup.button.callback("Ban / Kick", "a:ban")],
    [Markup.button.callback("Welcome Messages", "a:wm")],
    [Markup.button.callback("Intro Guide", "a:ig")],
    [Markup.button.callback("Stats", "a:stats")],
  ]);
}

function backButton(callback: string, label = "Back") {
  return Markup.button.callback(`<< ${label}`, callback);
}

function truncate(text: string, max: number): string {
  // Replace newlines with spaces for button text, then trim
  const clean = text.replace(/\n/g, " ").trim();
  const chars = Array.from(clean); // handles multi-byte emoji safely
  if (chars.length <= max) return clean;
  return chars.slice(0, max - 1).join("") + "…";
}

function memberLabel(m: Member): string {
  const name = m.first_name || "Unknown";
  const username = m.username ? ` (@${m.username})` : "";
  return `${name}${username}`;
}

export function setup(bot: Telegraf): void {
  // /start admin deep link
  bot.start(async (ctx, next) => {
    if (ctx.chat.type !== "private") return next();
    if (ctx.payload !== "admin") return next();

    const userId = ctx.from.id;
    if (!(await isAdminById(ctx.telegram, userId))) {
      await ctx.reply("You are not an admin of the main group.");
      return;
    }

    adminState.delete(userId);
    await ctx.reply("Admin Menu", mainMenuKeyboard());
  });

  // Callback query router
  bot.on("callback_query", async (ctx, next) => {
    if (!("data" in ctx.callbackQuery)) return next();

    const data = ctx.callbackQuery.data;
    if (!data.startsWith("a:")) return next();

    const userId = ctx.from.id;

    // Admin check on every callback
    if (!(await isAdminById(ctx.telegram, userId))) {
      await ctx.answerCbQuery("You are not an admin.");
      return;
    }

    await ctx.answerCbQuery();

    try {
      // Main menu
      if (data === "a:main") {
        adminState.delete(userId);
        await ctx.editMessageText("Admin Menu", mainMenuKeyboard());
        return;
      }

      // Members submenu
      if (data === "a:mem") {
        adminState.delete(userId);
        await ctx.editMessageText(
          "Members",
          Markup.inlineKeyboard([
            [Markup.button.callback("List Pending", "a:mem:pend:0")],
            [Markup.button.callback("Search", "a:mem:find")],
            [backButton("a:main")],
          ]),
        );
        return;
      }

      //  List pending (paginated)
      if (data.startsWith("a:mem:pend:")) {
        const page = parseInt(data.split(":")[3], 10);
        const offset = page * PAGE_SIZE;
        const [members, total] = await Promise.all([
          getPendingMembers(PAGE_SIZE, offset),
          countPendingMembers(),
        ]);

        if (total === 0) {
          await ctx.editMessageText(
            "No pending members.",
            Markup.inlineKeyboard([[backButton("a:mem")]]),
          );
          return;
        }

        const totalPages = Math.ceil(total / PAGE_SIZE);
        const rows = members.map((m) => [
          Markup.button.callback(
            truncate(memberLabel(m), 40),
            `a:mem:v:${m.telegram_id}`,
          ),
        ]);

        const nav: ReturnType<typeof Markup.button.callback>[] = [];
        if (page > 0)
          nav.push(Markup.button.callback("< Prev", `a:mem:pend:${page - 1}`));
        nav.push(Markup.button.callback(`${page + 1}/${totalPages}`, "a:noop"));
        if (page < totalPages - 1)
          nav.push(Markup.button.callback("Next >", `a:mem:pend:${page + 1}`));

        rows.push(nav);
        rows.push([backButton("a:mem")]);

        await ctx.editMessageText(
          `Pending Members (${total})`,
          Markup.inlineKeyboard(rows),
        );
        return;
      }

      //  Search prompt
      if (data === "a:mem:find") {
        adminState.set(userId, { type: "AWAITING_MEMBER_SEARCH" });
        await ctx.editMessageText(
          "Send a username, name, or Telegram ID to search.",
          Markup.inlineKeyboard([[backButton("a:mem")]]),
        );
        return;
      }

      //  View member
      if (data.startsWith("a:mem:v:")) {
        const telegramId = parseInt(data.split(":")[3], 10);
        const member = await getMember(telegramId);
        if (!member) {
          await ctx.editMessageText(
            "Member not found.",
            Markup.inlineKeyboard([[backButton("a:mem")]]),
          );
          return;
        }

        const status = member.intro_completed ? "Completed" : "Pending";
        const text = [
          `Name: ${member.first_name || "N/A"}`,
          `Username: ${member.username ? "@" + member.username : "N/A"}`,
          `Telegram ID: ${member.telegram_id}`,
          `Intro: ${status}`,
          `Joined: ${member.joined_at.toISOString().split("T")[0]}`,
        ].join("\n");

        const buttons: ReturnType<typeof Markup.button.callback>[][] = [];
        if (!member.intro_completed) {
          buttons.push([
            Markup.button.callback(
              "Approve (mark done + unmute)",
              `a:mem:apr:${member.telegram_id}`,
            ),
          ]);
        }
        buttons.push([backButton("a:mem")]);

        await ctx.editMessageText(text, Markup.inlineKeyboard(buttons));
        return;
      }

      //  Approve member
      if (data.startsWith("a:mem:apr:")) {
        const telegramId = parseInt(data.split(":")[3], 10);
        await markIntroCompleted(telegramId);
        try {
          await unmuteUser(ctx.telegram, telegramId);
        } catch {
          // May lack permission
        }
        await ctx.editMessageText(
          `Member ${telegramId} approved and unmuted.`,
          Markup.inlineKeyboard([[backButton("a:mem")]]),
        );
        return;
      }

      // === Ban / Kick submenu ===
      if (data === "a:ban") {
        adminState.set(userId, { type: "AWAITING_BAN_SEARCH" });
        await ctx.editMessageText(
          "Send a username, name, or Telegram ID to find the member.",
          Markup.inlineKeyboard([[backButton("a:main")]]),
        );
        return;
      }

      //  View ban options
      if (data.startsWith("a:ban:v:")) {
        const telegramId = parseInt(data.split(":")[3], 10);
        const member = await getMember(telegramId);
        if (!member) {
          await ctx.editMessageText(
            "Member not found.",
            Markup.inlineKeyboard([[backButton("a:main")]]),
          );
          return;
        }

        const text = `${memberLabel(member)}\nID: ${member.telegram_id}`;
        await ctx.editMessageText(
          text,
          Markup.inlineKeyboard([
            [
              Markup.button.callback(
                "Ban + Wipe Messages",
                `a:ban:ban:${member.telegram_id}`,
              ),
            ],
            [
              Markup.button.callback(
                "Kick",
                `a:ban:kick:${member.telegram_id}`,
              ),
            ],
            [backButton("a:main")],
          ]),
        );
        return;
      }

      //  Execute ban
      if (data.startsWith("a:ban:ban:")) {
        const telegramId = parseInt(data.split(":")[3], 10);
        try {
          await ctx.telegram.banChatMember(
            config.mainGroupId,
            telegramId,
            undefined,
            { revoke_messages: true },
          );
          await deleteMember(telegramId);
          await ctx.editMessageText(
            `User ${telegramId} banned and messages wiped.`,
            Markup.inlineKeyboard([[backButton("a:main")]]),
          );
        } catch (err) {
          await ctx.editMessageText(
            `Failed to ban: ${(err as Error).message}`,
            Markup.inlineKeyboard([[backButton("a:main")]]),
          );
        }
        return;
      }

      //  Execute kick (ban + unban)
      if (data.startsWith("a:ban:kick:")) {
        const telegramId = parseInt(data.split(":")[3], 10);
        try {
          await ctx.telegram.banChatMember(config.mainGroupId, telegramId);
          await ctx.telegram.unbanChatMember(config.mainGroupId, telegramId);
          await deleteMember(telegramId);
          await ctx.editMessageText(
            `User ${telegramId} kicked.`,
            Markup.inlineKeyboard([[backButton("a:main")]]),
          );
        } catch (err) {
          await ctx.editMessageText(
            `Failed to kick: ${(err as Error).message}`,
            Markup.inlineKeyboard([[backButton("a:main")]]),
          );
        }
        return;
      }

      // === Welcome Messages submenu ===
      if (data === "a:wm") {
        adminState.delete(userId);
        await ctx.editMessageText(
          "Welcome Messages",
          Markup.inlineKeyboard([
            [Markup.button.callback("List All", "a:wm:list:0")],
            [Markup.button.callback("Add New", "a:wm:add")],
            [backButton("a:main")],
          ]),
        );
        return;
      }

      //  List welcome messages (paginated)
      if (data.startsWith("a:wm:list:")) {
        const page = parseInt(data.split(":")[3], 10);
        const allMessages = await getAllWelcomeMessages();
        const total = allMessages.length;

        if (total === 0) {
          await ctx.editMessageText(
            "No welcome messages.",
            Markup.inlineKeyboard([
              [Markup.button.callback("Add New", "a:wm:add")],
              [backButton("a:wm")],
            ]),
          );
          return;
        }

        const totalPages = Math.ceil(total / PAGE_SIZE);
        const offset = page * PAGE_SIZE;
        const pageMessages = allMessages.slice(offset, offset + PAGE_SIZE);

        const rows = pageMessages.map((wm) => [
          Markup.button.callback(truncate(wm.message, 35), `a:wm:v:${wm.id}`),
        ]);

        const nav: ReturnType<typeof Markup.button.callback>[] = [];
        if (page > 0)
          nav.push(Markup.button.callback("< Prev", `a:wm:list:${page - 1}`));
        nav.push(Markup.button.callback(`${page + 1}/${totalPages}`, "a:noop"));
        if (page < totalPages - 1)
          nav.push(Markup.button.callback("Next >", `a:wm:list:${page + 1}`));

        rows.push(nav);
        rows.push([backButton("a:wm")]);

        await ctx.editMessageText(
          `Welcome Messages (${total})`,
          Markup.inlineKeyboard(rows),
        );
        return;
      }

      //  Add welcome message prompt
      if (data === "a:wm:add") {
        adminState.set(userId, { type: "AWAITING_WM_ADD" });
        await ctx.editMessageText(
          "Send the new welcome message text.\nUse {name} as a placeholder for the member's name.",
          Markup.inlineKeyboard([[backButton("a:wm")]]),
        );
        return;
      }

      //  View welcome message
      if (data.startsWith("a:wm:v:")) {
        const wmId = parseInt(data.split(":")[3], 10);
        const wm = await getWelcomeMessage(wmId);
        if (!wm) {
          await ctx.editMessageText(
            "Welcome message not found.",
            Markup.inlineKeyboard([[backButton("a:wm")]]),
          );
          return;
        }

        await ctx.editMessageText(
          `ID: ${wm.id}\n\n${wm.message}`,
          Markup.inlineKeyboard([
            [Markup.button.callback("Edit", `a:wm:ed:${wm.id}`)],
            [Markup.button.callback("Delete", `a:wm:rm:${wm.id}`)],
            [backButton("a:wm:list:0")],
          ]),
        );
        return;
      }

      //  Edit welcome message prompt
      if (data.startsWith("a:wm:ed:")) {
        const wmId = parseInt(data.split(":")[3], 10);
        adminState.set(userId, { type: "AWAITING_WM_EDIT", messageId: wmId });
        await ctx.editMessageText(
          "Send the updated welcome message text.\nUse {name} as a placeholder.",
          Markup.inlineKeyboard([[backButton(`a:wm:v:${wmId}`)]]),
        );
        return;
      }

      //  Delete confirmation
      if (data.startsWith("a:wm:rm:")) {
        const wmId = parseInt(data.split(":")[3], 10);
        await ctx.editMessageText(
          "Are you sure you want to delete this welcome message?",
          Markup.inlineKeyboard([
            [Markup.button.callback("Yes, delete", `a:wm:rmc:${wmId}`)],
            [backButton(`a:wm:v:${wmId}`, "Cancel")],
          ]),
        );
        return;
      }

      //  Execute delete
      if (data.startsWith("a:wm:rmc:")) {
        const wmId = parseInt(data.split(":")[3], 10);
        await deleteWelcomeMessage(wmId);
        await ctx.editMessageText(
          "Welcome message deleted.",
          Markup.inlineKeyboard([[backButton("a:wm:list:0")]]),
        );
        return;
      }

      // Intro Guide submenu
      if (data === "a:ig") {
        await ctx.editMessageText(
          "Intro Guide",
          Markup.inlineKeyboard([
            [Markup.button.callback("View Current", "a:ig:view")],
            [Markup.button.callback("Edit", "a:ig:edit")],
            [backButton("a:main")],
          ]),
        );
        return;
      }

      // View intro guide
      if (data === "a:ig:view") {
        const guide = await getSetting("intro_guide");
        await ctx.editMessageText(
          guide || "(not set)",
          Markup.inlineKeyboard([
            [Markup.button.callback("Edit", "a:ig:edit")],
            [backButton("a:ig")],
          ]),
        );
        return;
      }

      // Edit intro guide prompt
      if (data === "a:ig:edit") {
        adminState.set(userId, { type: "AWAITING_IG_EDIT" });
        await ctx.editMessageText(
          "Send the updated intro guide text.",
          Markup.inlineKeyboard([[backButton("a:ig")]]),
        );
        return;
      }

      // Stats
      if (data === "a:stats") {
        const [stats, wmCount] = await Promise.all([
          getMemberStats(),
          countWelcomeMessages(),
        ]);

        const text = [
          "Stats",
          "",
          `Total members: ${stats.total}`,
          `Pending intros: ${stats.pending}`,
          `Completed intros: ${stats.completed}`,
          `Completed today: ${stats.completed_today}`,
          `Completed this week: ${stats.completed_this_week}`,
          `Welcome messages: ${wmCount}`,
        ].join("\n");

        await ctx.editMessageText(
          text,
          Markup.inlineKeyboard([[backButton("a:main")]]),
        );
        return;
      }

      // Noop for pagination label
      if (data === "a:noop") return;
    } catch (err) {
      console.error(`Admin menu error:`, (err as Error).message);
      try {
        await ctx.editMessageText(
          `Error: ${(err as Error).message}`,
          Markup.inlineKeyboard([[backButton("a:main")]]),
        );
      } catch {
        // editMessageText may fail if message hasn't changed
      }
    }
  });

  // Text input handler
  bot.on(message("text"), async (ctx, next) => {
    if (ctx.chat.type !== "private") return next();

    const userId = ctx.from.id;
    const state = adminState.get(userId);
    if (!state) return next();

    // Re-verify admin
    if (!(await isAdminById(ctx.telegram, userId))) {
      adminState.delete(userId);
      return next();
    }

    const text = ctx.message.text;

    try {
      switch (state.type) {
        case "AWAITING_MEMBER_SEARCH": {
          adminState.delete(userId);
          const results = await searchMembers(text);
          if (results.length === 0) {
            await ctx.reply(
              "No members found.",
              Markup.inlineKeyboard([[backButton("a:mem")]]),
            );
            return;
          }

          const rows = results.map((m) => [
            Markup.button.callback(
              truncate(memberLabel(m), 40),
              `a:mem:v:${m.telegram_id}`,
            ),
          ]);
          rows.push([backButton("a:mem")]);

          await ctx.reply(
            `Found ${results.length} member(s)`,
            Markup.inlineKeyboard(rows),
          );
          return;
        }

        case "AWAITING_BAN_SEARCH": {
          adminState.delete(userId);
          const results = await searchMembers(text);
          if (results.length === 0) {
            await ctx.reply(
              "No members found.",
              Markup.inlineKeyboard([[backButton("a:main")]]),
            );
            return;
          }

          const rows = results.map((m) => [
            Markup.button.callback(
              truncate(memberLabel(m), 40),
              `a:ban:v:${m.telegram_id}`,
            ),
          ]);
          rows.push([backButton("a:main")]);

          await ctx.reply(
            `Found ${results.length} member(s)`,
            Markup.inlineKeyboard(rows),
          );
          return;
        }

        case "AWAITING_WM_ADD": {
          adminState.delete(userId);
          await addWelcomeMessage(text, userId);
          await ctx.reply(
            "Welcome message added!",
            Markup.inlineKeyboard([[backButton("a:wm:list:0")]]),
          );
          return;
        }

        case "AWAITING_WM_EDIT": {
          const { messageId } = state;
          adminState.delete(userId);
          await updateWelcomeMessage(messageId, text);
          await ctx.reply(
            "Welcome message updated!",
            Markup.inlineKeyboard([[backButton(`a:wm:v:${messageId}`)]]),
          );
          return;
        }

        case "AWAITING_IG_EDIT": {
          adminState.delete(userId);
          await setSetting("intro_guide", text, userId);
          await ctx.reply(
            "Intro guide updated!",
            Markup.inlineKeyboard([[backButton("a:ig")]]),
          );
          return;
        }
      }
    } catch (err) {
      console.error(`Admin menu text handler error:`, (err as Error).message);
      adminState.delete(userId);
      await ctx.reply(
        `Error: ${(err as Error).message}`,
        Markup.inlineKeyboard([[backButton("a:main")]]),
      );
    }
  });
}
