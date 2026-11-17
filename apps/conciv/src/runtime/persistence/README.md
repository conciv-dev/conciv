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
- The draft database closes itself when another tab opens it at a newer version (`drafts.ts`, the `versionchange`
  listener). The source keeps it open, so one old tab blocks every newer one for as long as it lives. After the close,
  the old tab stays closed: each later write or blob put fails, is logged, and the composer keeps what is on screen.
- An attached image is put in the draft database only when the composer accepted it (`pane/pane-attachments.ts`,
  the check on the pending attachment's status). An image the composer refused, such as one over its send limit,
  keeps its chip and gets no local copy. The source's composer refuses nothing at attach time, so it never needs this.
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
