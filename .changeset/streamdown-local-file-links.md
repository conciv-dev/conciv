---
'@conciv/solid-streamdown': patch
---

`Streamdown` takes two optional props for links to local files. `openLocalFile(path)` turns a markdown link to a file on disk (`[app](src/app.ts:42)`, `./notes.md`, `file:///tmp/a.txt`) into a link that calls it with the path, here `src/app.ts#L42`, instead of a blocked link. `localFileExists(path)` is asked about inline code that looks like a path, such as `` `src/app.ts` ``; when it answers yes, a click on that code opens the file too. Without either prop, markdown renders exactly as before.
