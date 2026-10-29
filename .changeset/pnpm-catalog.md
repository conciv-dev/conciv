---
'@conciv/embed': patch
---

Workspace manifests now take every shared dependency from the single pnpm catalog in `pnpm-workspace.yaml`
(published manifests still carry concrete versions), and the catalog is upgraded to the newest releases outside the
48h `minimumReleaseAge` window. Notable upgrades: `@types/node` unified on 26, TypeScript 6 for the Next.js apps,
preact 10 to 11, p-timeout 7 to 8, oxc-parser 0.127 to 0.156, lucide 1.18 to 1.62, `@orpc/*` 1.14 to 1.16.
Held back: the `@tanstack/ai*` family (1.0 is a migration), TypeScript 6 (7 ships no compiler API), vitest 4
(5 changes locator and text-matcher semantics), motion 12, the TanStack router/start set at react-start 1.168.61
(1.169 removed `useSession`), bippy 0.5 and react-grab 0.1.48 (API removals), and oxlint 1.73 (1.90 adds new
failing rules).
