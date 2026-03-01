import type { MigrationBuilder } from "node-pg-migrate" with {
  "resolution-mode": "import",
};

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable("settings", {
    id: { type: "serial", unique: true },
    key: { type: "text", primaryKey: true },
    value: { type: "text", notNull: true },
    updated_by: { type: "bigint" },
    updated_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("NOW()"),
    },
  });

  // Seed default intro guide
  pgm.sql(`
    INSERT INTO settings (key, value)
    VALUES ('intro_guide', '👋 Welcome to Superteam MY!

To get started, please introduce yourself in this format 👇

This helps everyone get context and makes collaboration easier.

Intro format:

• Who are you & what do you do?
• Where are you based?
• One fun fact about you
• How are you looking to contribute to Superteam MY?

No pressure to be perfect — just be you!')
    ON CONFLICT (key) DO NOTHING
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable("settings");
}
