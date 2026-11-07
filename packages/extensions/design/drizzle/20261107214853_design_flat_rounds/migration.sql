CREATE TABLE `design_candidates` (
	`seq` integer PRIMARY KEY AUTOINCREMENT,
	`target_id` text NOT NULL,
	`run_id` integer,
	`round` integer NOT NULL,
	`node` text NOT NULL,
	`selector` text NOT NULL,
	`score` real NOT NULL
);
--> statement-breakpoint
CREATE TABLE `design_missing` (
	`seq` integer PRIMARY KEY AUTOINCREMENT,
	`target_id` text NOT NULL,
	`run_id` integer,
	`round` integer NOT NULL,
	`node` text NOT NULL,
	`kind` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `design_regions` (
	`seq` integer PRIMARY KEY AUTOINCREMENT,
	`target_id` text NOT NULL,
	`run_id` integer,
	`round` integer NOT NULL,
	`x` real NOT NULL,
	`y` real NOT NULL,
	`width` real NOT NULL,
	`height` real NOT NULL,
	`id` text,
	`node` text,
	`name` text,
	`source` text,
	`overlap` real,
	`truncated` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `design_widths` (
	`seq` integer PRIMARY KEY AUTOINCREMENT,
	`target_id` text NOT NULL,
	`run_id` integer,
	`round` integer NOT NULL,
	`width` real NOT NULL,
	`from` text NOT NULL,
	`root_height` real NOT NULL,
	`overflow_x` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `design_rounds` ADD `much` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `design_rounds` ADD `noticeably` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `design_rounds` ADD `slightly` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `design_rounds` ADD `pins` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `design_rounds` ADD `other` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `design_rounds` ADD `rows_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `design_rounds` ADD `nodes` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `design_rounds` ADD `mapped` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `design_rounds` ADD `rendered` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `design_rounds` ADD `revoted` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `design_rounds` ADD `pixel_before` real;--> statement-breakpoint
ALTER TABLE `design_rounds` ADD `closed` integer;--> statement-breakpoint
ALTER TABLE `design_rounds` ADD `opened` integer;--> statement-breakpoint
ALTER TABLE `design_rounds` ADD `kept` integer;--> statement-breakpoint
ALTER TABLE `design_rounds` ADD `gained` integer;--> statement-breakpoint
ALTER TABLE `design_rounds` ADD `lost` integer;--> statement-breakpoint
ALTER TABLE `design_rounds` ADD `changed_ratio` real;--> statement-breakpoint
ALTER TABLE `design_rounds` ADD `changed_regions` integer;--> statement-breakpoint
ALTER TABLE `design_rounds` ADD `note` text;--> statement-breakpoint
UPDATE `design_rounds` SET `much` = coalesce(json_extract(`counts`, '$.much'), 0), `noticeably` = coalesce(json_extract(`counts`, '$.noticeably'), 0), `slightly` = coalesce(json_extract(`counts`, '$.slightly'), 0), `pins` = coalesce(json_extract(`counts`, '$.pins'), 0), `other` = coalesce(json_extract(`counts`, '$.other'), 0), `rows_count` = coalesce(json_extract(`counts`, '$.rows'), 0), `nodes` = coalesce(json_extract(`coverage`, '$.nodes'), 0), `mapped` = coalesce(json_extract(`coverage`, '$.mapped'), 0), `rendered` = coalesce(json_extract(`coverage`, '$.rendered'), 0), `revoted` = coalesce(json_extract(`coverage`, '$.revoted'), 0);--> statement-breakpoint
INSERT INTO `design_missing`(`target_id`, `run_id`, `round`, `node`, `kind`) SELECT r.`target_id`, r.`run_id`, r.`round`, j.`value`, 'missing' FROM `design_rounds` r, json_each(r.`coverage`, '$.missing') j ORDER BY r.`seq`, j.`key`;--> statement-breakpoint
INSERT INTO `design_missing`(`target_id`, `run_id`, `round`, `node`, `kind`) SELECT r.`target_id`, r.`run_id`, r.`round`, j.`value`, 'not_rendered' FROM `design_rounds` r, json_each(r.`coverage`, '$.notRendered') j ORDER BY r.`seq`, j.`key`;--> statement-breakpoint
INSERT INTO `design_missing`(`target_id`, `run_id`, `round`, `node`, `kind`) SELECT r.`target_id`, r.`run_id`, r.`round`, j.`value`, 'dupe' FROM `design_rounds` r, json_each(r.`coverage`, '$.dupes') j ORDER BY r.`seq`, j.`key`;--> statement-breakpoint
INSERT INTO `design_candidates`(`target_id`, `run_id`, `round`, `node`, `selector`, `score`) SELECT r.`target_id`, r.`run_id`, r.`round`, json_extract(c.`value`, '$.node'), json_extract(d.`value`, '$.selector'), json_extract(d.`value`, '$.score') FROM `design_rounds` r, json_each(r.`coverage`, '$.candidates') c, json_each(c.`value`, '$.candidates') d ORDER BY r.`seq`, c.`key`, d.`key`;--> statement-breakpoint
INSERT INTO `design_widths`(`target_id`, `run_id`, `round`, `width`, `from`, `root_height`, `overflow_x`) SELECT r.`target_id`, r.`run_id`, r.`round`, json_extract(w.`value`, '$.width'), f.`value`, coalesce((SELECT json_extract(x.`value`, '$.rootHeight') FROM json_each(r.`reflow`, '$.results') x WHERE json_extract(x.`value`, '$.width') = json_extract(w.`value`, '$.width')), 0), coalesce((SELECT json_extract(x.`value`, '$.overflowX') FROM json_each(r.`reflow`, '$.results') x WHERE json_extract(x.`value`, '$.width') = json_extract(w.`value`, '$.width')), 0) FROM `design_rounds` r, json_each(r.`reflow`, '$.widths') w, json_each(w.`value`, '$.from') f ORDER BY r.`seq`, w.`key`, f.`key`;--> statement-breakpoint
ALTER TABLE `design_rounds` ADD `reflow_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE `design_rounds` SET `reflow_count` = coalesce(json_extract(`counts`, '$.reflow'), 0);--> statement-breakpoint
ALTER TABLE `design_rounds` DROP COLUMN `counts`;--> statement-breakpoint
ALTER TABLE `design_rounds` DROP COLUMN `coverage`;--> statement-breakpoint
ALTER TABLE `design_rounds` DROP COLUMN `reflow`;--> statement-breakpoint
ALTER TABLE `design_rounds` RENAME COLUMN `reflow_count` TO `reflow`;