---
'@conciv/core': patch
'@conciv/contract': patch
'@conciv/app': patch
'@conciv/harness-testkit': patch
'@conciv/extension-testkit': patch
---

Session search can cover every project. The picker's search area gains an "All projects" switch; a hit from another project shows that project's folder, and selecting it copies the command that resumes it there instead of opening it here. The search term and the switch live in the URL, so closing the picker or reloading keeps them. `sessions.search` takes `everywhere`, and each hit carries `cwd` and `resume`.
