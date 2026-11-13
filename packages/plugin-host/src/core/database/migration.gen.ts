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
  },
  {
    "sql": [
      "CREATE TABLE `kv` (\n\t`key` text PRIMARY KEY,\n\t`value` text NOT NULL,\n\t`time_created` integer NOT NULL,\n\t`time_updated` integer NOT NULL\n);\n",
      "\nCREATE TABLE `permission` (\n\t`id` text PRIMARY KEY,\n\t`project_id` text NOT NULL,\n\t`action` text NOT NULL,\n\t`resource` text NOT NULL,\n\t`time_created` integer NOT NULL,\n\t`time_updated` integer NOT NULL\n);\n",
      "\nCREATE UNIQUE INDEX `permission_project_action_resource_idx` ON `permission` (`project_id`,`action`,`resource`);"
    ],
    "bps": true,
    "folderMillis": 1794584551000,
    "hash": "05fda993ffea46c8fd3ce162ac54dc16dddf1509b19c17d0d96625c2d5254ae7",
    "name": "20261113154231_kv_permission"
  }
]
