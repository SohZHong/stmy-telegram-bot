import type { MigrationBuilder } from "node-pg-migrate" with {
  "resolution-mode": "import",
};

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable("admin_logs", {
    id: { type: "serial", primaryKey: true },
    action: { type: "text", notNull: true },
    admin_telegram_id: { type: "bigint", notNull: true },
    target_id: { type: "bigint" },
    details: { type: "text" },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("NOW()"),
    },
  });

  pgm.createIndex("admin_logs", "action");
  pgm.createIndex("admin_logs", "created_at");
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable("admin_logs");
}
