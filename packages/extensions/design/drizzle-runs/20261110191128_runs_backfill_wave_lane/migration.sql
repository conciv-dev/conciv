WITH `dirs` AS (
	SELECT `run_id`, CASE WHEN substr(`source_path`, -6) = '/state' THEN substr(`source_path`, 1, length(`source_path`) - 6) ELSE `source_path` END AS `dir`
	FROM `design_runs`
	WHERE `source_path` IS NOT NULL AND `wave` IS NULL AND `lane` IS NULL
), `names` AS (
	SELECT `run_id`, substr(`dir`, length(rtrim(`dir`, replace(`dir`, '/', ''))) + 1) AS `name` FROM `dirs`
)
UPDATE `design_runs`
SET `wave` = substr(`names`.`name`, 1, instr(`names`.`name`, '-') - 1), `lane` = substr(`names`.`name`, instr(`names`.`name`, '-') + 1)
FROM `names`
WHERE `design_runs`.`run_id` = `names`.`run_id` AND instr(`names`.`name`, '-') > 1;
