import type { MigrationBuilder } from "node-pg-migrate" with {
  "resolution-mode": "import",
};

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable("reports", {
    id: { type: "serial", primaryKey: true },
    reporter_telegram_id: { type: "bigint", notNull: true },
    reported_telegram_id: { type: "bigint", notNull: true },
    reason_id: {
      type: "integer",
      notNull: true,
      references: "report_reasons",
      onDelete: "RESTRICT",
    },
    details: { type: "text" },
    status: { type: "text", notNull: true, default: "'pending'" },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("NOW()"),
    },
  });

  pgm.createIndex("reports", "reported_telegram_id");
  pgm.createIndex("reports", "reporter_telegram_id");
  pgm.createIndex("reports", "status");
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable("reports");
}
