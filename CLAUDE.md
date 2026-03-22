# CLAUDE.md — Superteam MY Telegram Bot

## Project Structure

```
src/
├── index.ts              — Entry point, handler registration (ORDER MATTERS)
├── config.ts             — Env var validation, single exported `config` object
├── errors.ts             — Error handling utilities
├── permissions.ts        — Mute/unmute, postToClosedTopic helper
├── services/             — External service integrations
│   └── llm.ts            — OpenAI wrapper
├── db/
│   ├── database.ts       — pg.Pool singleton
│   ├── migrate.ts        — Migration runner
│   └── migrations/       — Timestamped migration files
├── models/               — Data access layer (queries + interfaces)
├── handlers/             — Event/command handlers
│   ├── admin/
│   │   ├── index.ts      — Re-exports
│   │   ├── auth.ts       — Permission checks
│   │   ├── commands.ts   — Group-level admin commands
│   │   ├── menu.ts       — DM admin panel router
│   │   ├── shared.ts     — Shared state, types, constants
│   │   └── sections/     — One file per admin menu section
│   └── *.ts              — Other handlers
└── utils/                — Pure helper functions
```

## Conventions

- **Naming:** camelCase vars/functions, PascalCase types/interfaces, SCREAMING_SNAKE constants
- **Handlers:** Export `function setup(bot: Telegraf): void`; admin sections export `handleCallback` + optional `handleText`
- **State:** `Map<number, T>` keyed by userId with discriminated union types (`{ type: "AWAITING_..." }`)
- **Callbacks:** Namespaced prefixes — `a:` admin menu, `r:` reports, `ns:` NS flow, `dellink_` link safeguard
- **DB queries:** Parameterized `$1, $2` always; `pool.query<T>()` with typed results; functions return `Promise<T>`
- **Error handling:** `catch { // comment }` for expected failures; `(err as Error).message` for logging; never crash on non-critical ops
- **Config:** Required vars validated at startup with `process.exit(1)`; optional vars use `|| ""` or ternary
- **Imports:** Named imports; group by: framework → config → models → handlers → utils
- **Formatting:** HTML parse mode for styled messages; escape user input with `escapeHtml()`; multi-line text via array `.join("\n")`
- **Topic posting:** Use `postToClosedTopic()` from `permissions.ts` for closed forum topics

## Build & Run

```bash
npm run build     # TypeScript compile
npm run dev       # Dev mode with tsx --watch
npm run start     # Production
npm run migrate   # Run DB migrations
```

## Handler Registration Order

Telegraf processes handlers sequentially — first match wins. The order in `index.ts` is **intentional**:

```
setupAdmin          — Group admin commands (backward compat)
setupAdminMenu      — /start admin deep link (MUST precede introFlow)
setupReportFlow     — /start report deep link (MUST precede introFlow)
setupIntroFlow      — /start intro deep link (catches remaining /start payloads)
setupGroupCommands  — /setup, /testjoin
setupNewMember      — Join events (posts welcome button)
setupMessageGuard   — Blocks non-introduced users
setupLinkSafeguard  — Link warnings + admin delete
setupMessageTracker — Passive message buffering (no blocking)
setupContactQuery   — AI auto-reply (last — most expensive, runs on every group message)
```

**Why order matters:** `/start admin`, `/start report`, and `/start intro` all respond to `/start` in private chats. The first handler that matches the payload wins. If introFlow were registered before adminMenu, it would swallow `/start admin`.

## Callback Prefix Registry

Every callback query uses a namespaced prefix to avoid collisions. Check this list before adding new callbacks:

| Prefix | Owner | Examples |
|--------|-------|---------|
| `a:` | Admin menu + sections | `a:mem`, `a:ban`, `a:ai:sum`, `a:mem:v:ID` |
| `a:noop` | Admin menu | Pagination label (no action) |
| `r:` | Report flow | `r:sel:ID`, `r:reason:ID`, `r:confirm` |
| `ns:` | Intro flow (user) | `ns:yes`, `ns:no` |
| `nsv:` | Intro flow (admin verify) | `nsv:yes:USERID`, `nsv:no:USERID` |
| `dellink_` | Link safeguard | `dellink_CHATID_MSGID` |

**Pattern:** Use `data.startsWith("prefix")` to detect, then `data.split(":")` or `data.split("_")` to extract IDs.

## Adding a New Admin Section

1. Create `src/handlers/admin/sections/mySection.ts`:
   ```typescript
   export async function handleCallback(ctx: CbCtx, data: string, userId: number): Promise<boolean> {
     if (data === "a:mysec") { /* render section */ return true; }
     return false;  // Not handled — let other sections try
   }
   // Optional: export async function handleText(ctx, text, state, userId): Promise<boolean>
   ```
2. Add state to `AdminAction` union in `shared.ts`: `| { type: "AWAITING_MY_INPUT" }`
3. Import in `menu.ts` and add to `sections[]` array
4. Add button in `mainMenuKeyboard()` with callback `a:mysec`
5. Register prefix in the callback registry above

## State Management (Multi-Step DM Flows)

Three independent state maps exist, each keyed by `userId`:

| Map | File | Purpose |
|-----|------|---------|
| `adminState` | `admin/shared.ts` | Admin menu multi-step flows |
| `reportState` | `reportFlow.ts` | Report submission flow |
| `introState` | `introFlow.ts` | Introduction collection flow |

**Lifecycle:**
1. Button press → handler sets state: `adminState.set(userId, { type: "AWAITING_..." })`
2. User sends text → `menu.ts` checks `adminState.get(userId)`, delegates to sections
3. Section processes input, then either transitions state or clears it: `adminState.delete(userId)`

States are user-scoped — multiple admins can use the menu simultaneously.

## New Member Lifecycle (Mute/Unmute)

```
Member joins group
  → newMember.ts: delete service message, muteUser(), post welcome button, store welcome msg ID

Member clicks "Start Introduction" → DM with /start intro
  → introFlow.ts: collect intro text, validate (blocked words, length, LLM if configured)
  → Ask NS long-termer question (yes/no buttons)
  → finalizeIntro(): post to intro topic (via postToClosedTopic), markIntroCompleted(), unmuteUser()
  → If claimed NS: notify admins (or ns_designated_admin) with approve/reject buttons (nsv:yes/nsv:no)
  → Delete welcome message from Welcome topic

Pre-existing member posts (not in DB)
  → messageGuard.ts: auto-register + mark as introduced (grandfathered in)

Admin manually approves
  → members section: markIntroCompleted() + unmuteUser()

Admin resets intro
  → members section: resetIntroStatus() + muteUser() (member must re-introduce)
```

## LLM Graceful Degradation

All LLM features are optional. When `OPENAI_API_KEY` is empty:

| Feature | Behavior |
|---------|----------|
| Intro LLM validation | Skipped — `if (config.openaiApiKey)` guard. Basic checks (length, blocked words, repeating chars) still apply |
| Contact auto-reply | Handler returns `next()` immediately — no response posted |
| AI Insights (admin) | Buttons still visible but calls will error with "OPENAI_API_KEY not configured" message shown to admin |

**Pattern for new LLM features:** Gate with `if (!config.openaiApiKey) return next()` in handlers, or let `getClient()` throw and catch upstream.

## Migrations

**Naming:** `TIMESTAMP_description.ts` (timestamp is UNIX ms, auto-generated)

```bash
npm run migrate:create -- my-description    # Creates timestamped file
npm run migrate                             # Runs pending migrations
```

**Convention:** `create-*` for new tables, `add-*` for column additions. Each file exports `up(pgm)` and optionally `down(pgm)`.

## Gotchas

- **Topic filters:** `messageGuard` skips intro + welcome topics. `linkSafeguard` skips admin topic. New message handlers in the main group should consider which topics they apply to.
- **No circular imports:** Handlers import from models/services/shared, never from each other (except `introFlow` importing `welcomeMessageIds` from `newMember` — the one allowed cross-handler import).
- **Startup posts:** `ensureAdminGuide` and `ensureReportPost` are wrapped in try-catch and skipped when `mainGroupId` is 0. New startup posts should follow this pattern.
- **Service messages:** `messageGuard` explicitly skips `new_chat_members` / `left_chat_member` to avoid processing join/leave events as regular messages. New group message handlers should do the same if they delete or act on messages.

## Delegation Pattern

Three features support delegating notifications to a specific admin instead of all admins. Each uses a `settings` DB row:

| Setting Key | Feature | Checked by |
|-------------|---------|------------|
| `ns_designated_admin` | NS long-termer verification | `introFlow.ts` → `notifyNsVerification()` |
| `link_designated_admin` | Link alert delete buttons | `linkSafeguard.ts` → `notifyLinkAdmins()` |
| `report_designated_admin` | Report notifications | `reportFlow.ts` → `notifyAdmins()` |

**Pattern:** Check `getSetting(key)`. If set and not `"0"`, send to that admin only. Otherwise, call `getChatAdministrators()` and send to all non-bot admins. All three are configurable from the Delegation admin menu section (`a:dlg:*` callbacks).

When displaying a designated admin, always use `resolveUser(id, telegram)` to show `@username` or first name instead of raw IDs.
