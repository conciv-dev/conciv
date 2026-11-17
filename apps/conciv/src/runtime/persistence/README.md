# Persistence

The widget's persisted stores. Most files are copied from opencode (at commit `a1aa513`; every opencode path below is
relative to `packages/app/src/runtime/persistence/`). Names and shapes are opencode's, except for the lines under
"Differences from opencode".

## Files

- `persist.ts`, `persist-machine.ts`, `equality.ts`: copied from opencode's files of the same names. `persistStore`
  keeps a Solid store in a storage, with the source's 100 ms write batch, the flush when the page is hidden or left,
  and the skip of an unchanged value.
- `schema.ts`, `storage.ts`: from opencode's files of the same names. `persisted`, `Persist` and `removePersisted` are
  the store layer that plugin stores use.
- `drafts.ts`, `drafts-machine.ts`: copied from opencode's files of the same names. `createBrowserDraftStore` keeps
  composer drafts in the IndexedDB database `conciv-drafts`, with the stores `documents` and `blobs`; images are kept
  as blobs under the SHA-256 of their bytes, and a blob no document points to is removed when the database opens.
- `settings-storage.ts`: conciv's own. It reads and writes engine settings through the RPC client as an async storage.

## Differences from opencode

- The draft write transaction commits as soon as its document is put (`drafts.ts`, `transaction.commit()` in the
  driver's `set`). The source waits for the auto-commit, which needs a round trip an unloading page never gets: the
  put that the `pagehide` flush issues was lost on a reload in Chromium and in Firefox, and the reloaded page read the
  write before it. A write whose blobs are looked up first still needs those lookups to answer before it commits.
- `persistStore` takes a `writeLeaving` writer beside `write` (`persist.ts`): the flush when the page is hidden or
  left (`flushPersisted`, on `visibilitychange` to hidden and on `pagehide`) uses it, the 100 ms batch and the flush
  when the owner is disposed use `write`. The source has one writer. conciv's draft writer queues each write on the
  app's one draft write chain, and a write queued behind a write still in flight never opened its transaction before
  the page was gone: the `pagehide` flush has to open its transaction in the `pagehide` task, so its writer skips the
  chain (`pane/README.md`).
- The draft database closes itself when another tab opens it at a newer version (`drafts.ts`, the `versionchange`
  listener). The source keeps it open, so one old tab blocks every newer one for as long as it lives. After the close,
  the old tab stays closed: each later write or blob put fails, is logged, and the composer keeps what is on screen.
- An attached image is put in the draft database only when the composer accepted it (`pane/pane-attachments.ts`,
  the check on the pending attachment's status). An image the composer refused, such as one over its send limit,
  keeps its chip and gets no local copy. The source's composer refuses nothing at attach time, so it never needs this.
- The draft store lists its document keys (`DraftStore.keys`, the driver's `keys`: `getAllKeys` on `documents`, in key
  order). The source has no such call; conciv uses it once per start to remove the local drafts of sessions the engine
  no longer has (`data/app-data.ts` `forgetGoneDrafts`).
- The draft store takes a `writable` check (`createBrowserDraftStore({writable})`), asked right after the database
  opens and before each write transaction is made (the driver's `set`, `putBlob` and `remove`); a write it refuses
  rejects. The source has no such check; conciv refuses writes while the engine does not trust this browser, so no
  write lands after `clear` empties the store (`pane/README.md`).
- The draft store empties itself (`DraftStore.clear`, the driver's `clear`: one `readwrite` transaction that clears
  `documents` and `blobs`, then the in-memory text chunk caches). The source has no such call; conciv uses it when
  this browser stops being trusted by the engine (`data/app-data.ts` `forgetLocalDrafts`).
- A blob put or a document removal settles when its transaction aborts (`drafts.ts` `write`, the `abort` listener,
  which rejects): an abort without an error event, such as a quota failure at commit after the request succeeded,
  left the attachment chip pending and the app's one draft write chain stalled. The source has the same gap at
  `drafts.ts:574-584`. No test covers it: the store never exposes its transaction, so an abort at commit cannot be
  made in a test without a mock.
- A draft database that does not open is logged once (`drafts.ts`, the catch on `db`). In the source that failure is
  an unhandled rejection whenever nothing reads the store first.
- A stored draft document is checked with zod, not Effect Schema, because the app checks untrusted input with zod and
  has no `effect` dependency. A document that fails the check is logged and read as absent.
- Every `media:` piece of the source's `drafts.ts` is left out (the media loaders, `setMediaBlobLoader`,
  `pinMediaBlob`, `createLegacyBlobReference` and the media branches of `resolveBlobUrl`, `encode` and `blobDataUrl`):
  they read the source's server media store, which conciv does not have.
- `schema.ts` and `storage.ts` validate with Standard Schema, not Effect Schema, so the source's
  `Persistence.struct`, `array`, `record`, `optional`, `fallback`, `migrate` and `legacy` helpers are not here; a
  store schema is any Standard Schema, and `assertStoreDefinition` and `assertStoreWrite` check it. The source's
  local storage notice and `draftPersistedKeys` are not here either.
