import {DatabaseSync} from 'node:sqlite'
import {drizzle} from 'drizzle-orm/node-sqlite'
import {defineAIPersistence} from '@tanstack/ai-persistence'
import {runPersistenceConformance} from '@tanstack/ai-persistence/testkit'
import {drizzleChatStores} from '@conciv/ai/server'

const CHAT_TABLES = `CREATE TABLE \`chat_runs\` (
	\`run_id\` text PRIMARY KEY,
	\`thread_id\` text NOT NULL,
	\`status\` text NOT NULL,
	\`started_at\` integer NOT NULL,
	\`finished_at\` integer,
	\`error\` text,
	\`error_code\` text,
	\`usage_json\` text,
	\`sandbox_key\` text,
	\`detached_since\` integer,
	\`cancel_requested\` integer,
	\`driver_epoch\` integer
);
CREATE INDEX \`chat_runs_status_detached\` ON \`chat_runs\` (\`status\`,\`detached_since\`);
CREATE INDEX \`chat_runs_thread_started\` ON \`chat_runs\` (\`thread_id\`,\`started_at\`);
CREATE TABLE \`chat_metadata\` (
	\`namespace\` text NOT NULL,
	\`key\` text NOT NULL,
	\`value_json\` text NOT NULL,
	CONSTRAINT \`chat_metadata_pk\` PRIMARY KEY(\`namespace\`, \`key\`)
);
CREATE TABLE \`chat_threads\` (
	\`thread_id\` text PRIMARY KEY,
	\`messages_json\` text NOT NULL,
	\`updated_at\` integer NOT NULL
);`

function chatDb() {
  const client = new DatabaseSync(':memory:')
  client.exec(CHAT_TABLES)
  return drizzle({client})
}

runPersistenceConformance(
  'conciv drizzle chat stores',
  () => defineAIPersistence({stores: drizzleChatStores(chatDb())}),
  {
    skip: ['interrupts', 'activities', 'generationRuns', 'artifacts', 'blobs', 'log', 'sessions'],
    checks: ['messages.metadata', 'runs.listByThread.state'],
  },
)
