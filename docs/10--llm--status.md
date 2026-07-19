# 10 — Status

**Task:** Folder re-prompt loop fix  
**Status:** Complete  
**Completed:** 2026-07-19

## What was done

- [x] Created comprehensive bug documentation in `docs/bugs/01--folder-reprompt-loop.md`
- [x] Added `FolderErrorReason` type to `folder.ts` with 5 discriminant values
- [x] Added `errorReason` field to `FolderState.needs-permission` and `FolderState.error`
- [x] Added retry logic to `readFile()` for `locked` errors (2 retries, 800ms apart)
- [x] Added `classifyFolderError()` helper to `files.ts`
- [x] Broke the re-prompt loop in `refresh()`: `ready` state preserved for locked/io errors; only transitions to `needs-permission` after 3 consecutive failures
- [x] Added `refreshFailCount` and `lastRefreshError` to `AppState`
- [x] Added `forgetAndResetFolder()` action — clears handle and resets all state
- [x] Added recovery UI to `FolderPicker.svelte`:
  - Context-sensitive recovery hint based on `errorReason`
  - "Re-grant access" (primary), "Retry" (secondary), "Forget folder & start fresh" (danger) buttons
  - Busy guard on all async operations
- [x] Expanded README troubleshooting with 5 ordered fix procedures
- [x] Wrote 10 new unit tests (123 total, all passing)
- [x] `pnpm check` — 0 errors, 16 pre-existing warnings
- [x] `pnpm build` — succeeds

## Test results

```
 Test Files  5 passed (5)
      Tests  123 passed (123)
```

## Files changed

| File | Change |
| --- | --- |
| `src/lib/fs/folder.ts` | Added `FolderErrorReason` type, `errorReason` to state types |
| `src/lib/fs/files.ts` | Added `readFile` retry, `classifyFolderError` helper |
| `src/lib/fs/files.test.ts` | 10 new tests |
| `src/lib/state.svelte.ts` | Retry counting, error classification, `forgetAndResetFolder` |
| `src/lib/components/FolderPicker.svelte` | Recovery UI with 3 actions + guidance |
| `src/routes/+page.svelte` | Import `forgetAndResetFolder` |
| `docs/10--usr--spec.md` | Task spec |
| `docs/10--llm--spec.md` | Response spec |
| `docs/bugs/01--folder-reprompt-loop.md` | Comprehensive bug doc |
| `README.md` | Expanded troubleshooting |
| `CHANGELOG.md` | v1.6.2 entry |
