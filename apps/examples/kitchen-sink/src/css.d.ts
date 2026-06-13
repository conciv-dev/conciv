// vite resolves bare `.css` imports as side-effecting style injection; declare the module so
// tsc accepts the import.
declare module '*.css' {}
