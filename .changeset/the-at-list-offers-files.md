---
'@conciv/protocol': patch
'@conciv/backend': patch
'@conciv/backend-plugin-api': patch
'@conciv/backend-app-api': patch
'@conciv/app': patch
---

Typing `@` and part of a path in the composer lists the project's files and folders, each row showing its bare path with a File or Folder icon, after the skills, agents and sessions, as opencode's composer does; a picked one inserts `@<path>`, and every search asks the engine afresh, so a query typed again is never answered from an old listing. The engine answers through the new `fs.find` call: the plugin host searches with fff when the project is under version control and with a ripgrep index otherwise, downloading a pinned, SHA-256 checked ripgrep into the engine's cache folder when none is on the PATH.
