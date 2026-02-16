import type { MigrationBuilder } from "node-pg-migrate" with {
  "resolution-mode": "import",
};

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable("welcome_messages", {
    id: { type: "serial", primaryKey: true },
    message: { type: "text", notNull: true },
    created_by: { type: "bigint" },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("NOW()"),
    },
    updated_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("NOW()"),
    },
  });

  // Migrate existing welcome_message from settings into the new table
  pgm.sql(`
    INSERT INTO welcome_messages (message, created_by)
    SELECT value, updated_by
    FROM settings
    WHERE key = 'welcome_message'
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable("welcome_messages");
}
