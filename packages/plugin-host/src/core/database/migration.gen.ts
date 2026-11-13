import type {MigrationMeta} from 'drizzle-orm/migrator'

export const migrations: MigrationMeta[] = [
  {
    "sql": [
      "CREATE TABLE `event_sequence` (\n\t`aggregate_id` text PRIMARY KEY,\n\t`seq` integer NOT NULL,\n\t`owner_id` text\n);\n",
      "\nCREATE TABLE `event` (\n\t`id` text PRIMARY KEY,\n\t`aggregate_id` text NOT NULL,\n\t`seq` integer NOT NULL,\n\t`created` integer DEFAULT 0 NOT NULL,\n\t`type` text NOT NULL,\n\t`data` text NOT NULL,\n\tCONSTRAINT `fk_event_aggregate_id_event_sequence_aggregate_id_fk` FOREIGN KEY (`aggregate_id`) REFERENCES `event_sequence`(`aggregate_id`) ON DELETE CASCADE\n);\n",
      "\nCREATE UNIQUE INDEX `event_aggregate_seq_idx` ON `event` (`aggregate_id`,`seq`);",
      "\nCREATE INDEX `event_aggregate_type_seq_idx` ON `event` (`aggregate_id`,`type`,`seq`);"
    ],
    "bps": true,
    "folderMillis": 1794582245000,
    "hash": "d4e53e4a22f51e553de05f2fe5d1c349db466101b4510f9e55e55cfd8d4a2c0d",
    "name": "20261113150405_event_log"
  }
]
