---
'@conciv/plugin': patch
---

The shared TypeScript library moves to ES2025, so the SDK calls Promise.try as its source does. The browser part now needs `Promise.try`: Chrome and Edge 128, Firefox 134, Safari and iOS Safari 18.2 (Node 23.0.0 for tooling that evaluates it).
