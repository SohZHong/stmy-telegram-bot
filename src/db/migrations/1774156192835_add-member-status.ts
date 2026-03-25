import type { MigrationBuilder } from "node-pg-migrate" with {
  "resolution-mode": "import",
};

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.addColumn("members", {
    status: { type: "text", notNull: true, default: "lurker" },
  });

  // Existing NS long-timers should be contributors
  pgm.sql(`UPDATE members SET status = 'contributor' WHERE is_ns_longtimer = TRUE`);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropColumn("members", "status");
}
