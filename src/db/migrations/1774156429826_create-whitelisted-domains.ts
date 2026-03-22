import type { MigrationBuilder } from "node-pg-migrate" with {
  "resolution-mode": "import",
};

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable("whitelisted_domains", {
    id: { type: "serial", primaryKey: true },
    domain: { type: "text", notNull: true, unique: true },
    created_by: { type: "bigint" },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("NOW()"),
    },
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable("whitelisted_domains");
}
