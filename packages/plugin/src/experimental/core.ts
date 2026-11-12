/**
 * Undoes a registration, or tears something down. Every `add` and `on` returns one, and so does a window's
 * `provide`; `onCleanup` and a setup's return value take one.
 * Calling it early withdraws at once; a second call does nothing. When the host runs it, a throw or a rejection is
 * logged and the other cleanups still run; main's `Scope` waits for a returned promise until its deadline.
 */
export type Cleanup = () => void | Promise<void>
