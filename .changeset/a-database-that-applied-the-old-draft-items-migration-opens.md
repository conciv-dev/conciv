---
'@conciv/db': patch
---

A project database that applied the draft items migration under its first folder name opens again. drizzle matches applied migrations by folder name only, so it ran the renamed migration a second time and the engine failed to start with a duplicate `items` column. The applied row now takes the new name before the migrations run.
