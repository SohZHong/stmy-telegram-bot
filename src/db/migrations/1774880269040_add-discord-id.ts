import type { MigrationBuilder } from "node-pg-migrate" with {
  "resolution-mode": "import",
};

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.addColumn("members", {
    discord_id: { type: "text", unique: true },
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropColumn("members", "discord_id");
}
