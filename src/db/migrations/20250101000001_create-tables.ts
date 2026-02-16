import type { MigrationBuilder } from "node-pg-migrate" with {
  "resolution-mode": "import",
};

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable(
    "members",
    {
      id: { type: "serial", unique: true },
      telegram_id: { type: "bigint", primaryKey: true },
      username: { type: "text" },
      first_name: { type: "text" },
      group_id: { type: "bigint", notNull: true },
      intro_completed: { type: "boolean", notNull: true, default: false },
      joined_at: {
        type: "timestamptz",
        notNull: true,
        default: pgm.func("NOW()"),
      },
      intro_completed_at: { type: "timestamptz" },
    },
    { ifNotExists: true },
  );

  pgm.createTable(
    "settings",
    {
      id: { type: "serial", unique: true },
      key: { type: "text", primaryKey: true },
      value: { type: "text", notNull: true },
      updated_by: { type: "bigint" },
      updated_at: {
        type: "timestamptz",
        notNull: true,
        default: pgm.func("NOW()"),
      },
    },
    { ifNotExists: true },
  );
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable("settings");
  pgm.dropTable("members");
}
