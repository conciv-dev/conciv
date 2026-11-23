---
'@conciv/core': patch
---

Opening the sessions panel no longer walks every past session on the machine at once. That walk waits for the first search across all projects, as it did before, and the search index now checks each CLI's sessions one after another, giving other engine calls a turn between them.
