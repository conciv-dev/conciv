---
'@conciv/cli': patch
---

`conciv init` installs a ~200-token code-mode entry skill and wires the `@conciv/skills` pack
(claude via the connect plugin's skills directory, other harnesses via an AGENTS.md pointer to
`@tanstack/intent` and `node_modules/@conciv/skills`), replacing the old AGENTS.md section that
hand-listed `conciv tools page/react/server`. Adds a `conciv-self-update` skill and `library_version`
provenance to every skill in the pack.
