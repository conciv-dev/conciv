export const migrationSql: Record<string, string> = {
  '20260709205617_red_betty_ross': `CREATE TABLE \`drafts\` (
	\`session_id\` text PRIMARY KEY,
	\`text\` text NOT NULL,
	\`selection_start\` integer NOT NULL,
	\`selection_end\` integer NOT NULL,
	\`grabs\` text NOT NULL,
	\`updated_at\` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE \`markers\` (
	\`id\` text PRIMARY KEY,
	\`session_id\` text NOT NULL,
	\`after_turn\` integer NOT NULL,
	\`kind\` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE \`sessions\` (
	\`id\` text PRIMARY KEY,
	\`harness_session_id\` text,
	\`harness_kind\` text NOT NULL,
	\`origin\` text NOT NULL,
	\`title\` text,
	\`model\` text,
	\`usage\` text,
	\`cwd\` text NOT NULL,
	\`created_at\` integer NOT NULL,
	\`updated_at\` integer NOT NULL
);
`,
  '20260710215510_fat_jack_flag': `CREATE TABLE \`replies\` (
	\`session_id\` text NOT NULL,
	\`key\` text NOT NULL,
	\`value\` text,
	\`created_at\` integer NOT NULL,
	CONSTRAINT \`replies_pk\` PRIMARY KEY(\`session_id\`, \`key\`)
);
--> statement-breakpoint
CREATE TABLE \`run_messages\` (
	\`session_id\` text PRIMARY KEY,
	\`messages\` text NOT NULL,
	\`updated_at\` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE \`runs\` (
	\`session_id\` text PRIMARY KEY,
	\`status\` text DEFAULT 'idle' NOT NULL,
	\`run_epoch\` integer DEFAULT 0 NOT NULL,
	\`last_error\` text,
	\`updated_at\` integer NOT NULL
);
`,
  '20260710230001_navigation': `CREATE TABLE \`navigation\` (
	\`id\` text PRIMARY KEY DEFAULT 'navigation',
	\`entries\` text NOT NULL,
	\`index\` integer NOT NULL,
	\`updated_at\` integer NOT NULL
);
`,
  '20260717003543_image_history': `CREATE TABLE \`image_history\` (
	\`session_id\` text PRIMARY KEY,
	\`messages\` text NOT NULL,
	\`updated_at\` integer NOT NULL
);
`,
  '20260719075458_nasty_skrulls': `ALTER TABLE \`runs\` ADD \`last_error_epoch\` integer;`,
  '20260730123834_transcript_cwd': `ALTER TABLE \`sessions\` ADD \`transcript_cwd\` text;--> statement-breakpoint
ALTER TABLE \`sessions\` ADD \`attached_pid\` integer;--> statement-breakpoint
ALTER TABLE \`sessions\` ADD \`attached_at\` integer;--> statement-breakpoint
UPDATE \`sessions\` SET \`harness_session_id\` = NULL WHERE \`harness_session_id\` IS NOT NULL AND rowid NOT IN (SELECT MAX(s.rowid) FROM \`sessions\` AS s WHERE s.\`harness_session_id\` IS NOT NULL AND s.\`updated_at\` = (SELECT MAX(t.\`updated_at\`) FROM \`sessions\` AS t WHERE t.\`harness_session_id\` = s.\`harness_session_id\`) GROUP BY s.\`harness_session_id\`);--> statement-breakpoint
CREATE UNIQUE INDEX \`sessions_harness_session_id_unique\` ON \`sessions\` (\`harness_session_id\`);`,
  '20260803083012_tombstone_native_key': `ALTER TABLE \`sessions\` ADD \`deleted_at\` integer;--> statement-breakpoint
DROP INDEX IF EXISTS \`sessions_harness_session_id_unique\`;--> statement-breakpoint
CREATE UNIQUE INDEX \`sessions_native_key_unique\` ON \`sessions\` (\`harness_kind\`,\`cwd\`,\`harness_session_id\`);`,
}
