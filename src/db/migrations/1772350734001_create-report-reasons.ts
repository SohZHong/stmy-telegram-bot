import type { MigrationBuilder } from "node-pg-migrate" with {
  "resolution-mode": "import",
};

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable("report_reasons", {
    id: { type: "serial", primaryKey: true },
    label: { type: "text", notNull: true, unique: true },
    created_by: { type: "bigint" },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("NOW()"),
    },
  });

  // Seed default report reasons
  pgm.sql(`
    INSERT INTO report_reasons (label) VALUES
      ('Spam or scam'),
      ('Harassment or bullying'),
      ('Inappropriate content'),
      ('Impersonation'),
      ('Other')
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable("report_reasons");
}
