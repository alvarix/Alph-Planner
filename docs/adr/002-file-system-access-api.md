# ADR 002: File System Access API for Local File I/O

## Status

Accepted

## Context

For the app to read and write the user's local `.md` files from a browser, a mechanism is needed to access the local file system. Options considered:

1. **File System Access API** — browser-native API for reading/writing local files with user permission
2. **Electron / Tauri** — desktop wrapper with native file system access
3. **Local server (Node.js)** — companion process that exposes a REST API over localhost
4. **File upload/download model** — user manually imports/exports files

## Decision

Use the **File System Access API** (FSA). The user grants permission once via a native folder picker. The `FileSystemDirectoryHandle` is persisted in IndexedDB, allowing silent re-use across sessions (with a one-click re-grant after browser restart on some platforms).

## Consequences

**Positive:**
- No installation required — runs as a web app or installed PWA
- No Electron/Tauri build tooling or platform-specific packaging
- Native OS folder picker (consistent with user expectations)
- Handle survives page reload via IndexedDB — most sessions require no user action after initial setup

**Negative:**
- **Chromium-only** — Safari and Firefox do not support the File System Access API. This permanently excludes those users.
- Permission re-grant may be required after browser restart (platform-dependent behavior)
- Cannot watch for file changes — must poll on focus instead of using `FileSystemObserver`
- Cannot be used in a sandboxed iframe or cross-origin context

## Tradeoffs

- A local Node.js server companion would support all browsers but requires installation and background process management — higher friction for the target user (solo, technical, macOS)
- Electron would provide full file system access but adds ~150MB to the install size and requires OS-level packaging and code signing
- The Chromium-only constraint is accepted: the primary user persona uses Chrome or Arc on macOS

## Implementation Notes

- `lib/fs/folder.ts` — state machine for folder selection and permission management
- `lib/fs/handle-store.ts` — IndexedDB persistence of `FileSystemDirectoryHandle`
- `lib/fs/files.ts` — all file I/O operations (read, write, list, detect conflicts)
- Permission re-grant always requires a user gesture (browser security requirement — cannot be automated)
