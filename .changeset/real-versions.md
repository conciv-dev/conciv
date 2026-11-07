---
'@conciv/app': patch
'@conciv/cli': patch
'@conciv/core': patch
'@conciv/contract': patch
'@conciv/extension': patch
'@conciv/extension-design': patch
'@conciv/harness-init': patch
'@conciv/protocol': patch
---

Packages now report their real release version, for future migrations; a version difference never breaks anything. `conciv` carries it as its `meta.version`, the Claude Code connect plugin is stamped with it instead of `0.0.0`, and every engine response carries an `x-conciv-version` header. Node rpc clients send their own version in the same header; browser requests send no new header, so a newer widget still reaches an older engine. When the engine is older than the widget (or predates versions), the panel shows a notice asking to update the @conciv packages. `conciv init` now also runs `claude plugin update`, so an install recorded at an earlier release moves onto the current one.
