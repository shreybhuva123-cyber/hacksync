# CodeSync Subsystem Architecture

The CodeSync subsystem is the core file synchronization engine in HackSync, responsible for maintaining consistent state between local workspaces and remote code nodes.

## Architecture

At its core, CodeSync operates as a deterministic state machine managing the lifecycle of files during synchronization.

### State Machine
The state machine is defined by 7 distinct states:
- `LOCAL_ONLY`: File exists locally but has not been tracked or synced.
- `PENDING_SYNC`: File is queued for synchronization.
- `SYNCING`: Active synchronization is in progress.
- `SYNCED`: File is up-to-date with the remote state.
- `SYNC_FAILED`: An error occurred during synchronization.
- `CONFLICT`: A version conflict exists that requires resolution.
- `RESOLVED`: A conflict has been resolved, pending sync.

Valid transitions are strictly enforced by `VALID_CODESYNC_TRANSITIONS` defined in `src/lib/hacksync/types.ts`.
The state machine logic is encapsulated in the `CodeSyncStateMachine` class located in `src/lib/services/codesync.service.ts`.

### Merge Engine
When concurrent modifications occur, the subsystem relies on a three-way merge engine implemented in `src/lib/hacksync/merge-engine.ts`.
It handles three primary conflict types:
- **Modify/Modify**: Both local and remote have changed since the common ancestor.
- **Delete/Modify**: One side deleted the file while the other modified it.
- **Create Collision**: Both sides created a file with the same name.

### Versioning and Concurrency
- **Version History**: Maintained using the `FileVersion` type, tracking the lineage of changes.
- **Concurrency Control**: Synchronized access is ensured via a mutex lock mechanism, preventing race conditions during concurrent sync operations.

## Known Limitations
- Single-file delete and rename operations are not fully wired in the current implementation.
- There is currently no automatic retry or exponential backoff loop for network failures during synchronization.
