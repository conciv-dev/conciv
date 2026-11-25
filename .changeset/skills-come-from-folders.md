---
'@conciv/backend-app-api': patch
'@conciv/backend': patch
---

Skills placed in the project's `conciv/skills/` folder, or in the `skills/` folder of conciv's home, are now offered to the agent. A skill is a folder holding a `SKILL.md` (with `name` and `description` frontmatter), or a single `.md` file at the top of the folder. Adding, editing or removing one takes effect in the running engine without a restart. Skills in `.claude/skills` and `.agents/skills` are left to the agent CLI, which already loads them.
