import type { MigrationBuilder } from "node-pg-migrate" with {
  "resolution-mode": "import",
};

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    INSERT INTO settings (key, value) VALUES
      ('welcome_message', $$Welcome to Superteam MY, {name}! 🎉

You're currently muted until you introduce yourself in our intro group. Check the pinned intro guide below!$$),
      ('intro_guide', $$Please introduce yourself with:

1. **Who you are** – Name, background, what you do
2. **Where you're based** – City/country
3. **A fun fact** – Something interesting about you
4. **How you want to contribute** – What excites you about Superteam MY$$)
    ON CONFLICT DO NOTHING
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(
    `DELETE FROM settings WHERE key IN ('welcome_message', 'intro_guide')`,
  );
}
