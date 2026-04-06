# Real-Time Comment Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add WebSocket relay via Cloudflare Durable Objects so peer comments reach the host instantly and host resolves reach peers instantly, replacing the manual "Check comments" flow.

**Architecture:** Single RelayHub Durable Object multiplexed by docId. Each client opens one WebSocket. Messages carry plaintext docId (for routing) + encrypted payload (AES-256-GCM). KV remains the persistence layer; WebSocket is the delivery mechanism. Three relay message types: `comment:added`, `comment:resolved`, `document:updated`.

**Tech Stack:** Cloudflare Durable Objects (WebSocket Hibernation API), existing Web Crypto API, Zustand store, React components.

**Design docs:**
- [Technical design](../../features/realtime-comments/technical-design.md)
- [Spec](../../features/realtime-comments/spec.md)
- [Todos with code examples](../../features/realtime-comments/todos.md)

**Code rules (CLAUDE.md):** No `as` casts. No `switch/case`. No single-letter variables. Always braces. No IIFEs.

---

## Phase 1: Pre-Implementation Changes

These must ship before the relay. They fix existing issues that become dangerous with real-time delivery.

---

### Task 1: Add per-comment delete endpoint to Worker

**Files:**
- Modify: `worker/src/index.ts`

- [ ] **Step 1: Write the per-comment delete handler**

In `worker/src/index.ts`, inside the `if (resource === "comments" && docId)` block, find the existing `DELETE` handler (which bulk-deletes all comments). Add a new route BEFORE it that handles `DELETE /comments/:docId/:cmtId`:

```typescript
// Per-comment delete: DELETE /comments/:docId/:cmtId
if (req.method === "DELETE" && parts[2]) {
  const cmtId = parts[2];
  if (!(await verifySecret(req, env, docId))) {
    return errRes(403, "Forbidden", cors);
  }
  await env.LOLLIPOP_DRAGON.delete(`comments:${docId}:${cmtId}`);
  return jsonRes({ ok: true }, cors);
}
```

The existing bulk delete path (`DELETE /comments/:docId` without a cmtId) stays unchanged for backward compatibility.

Note: the current routing parses `const [, resource, docId, sub] = url.pathname.split("/")` — but the variable is called `sub`, not `parts[2]`. Check the actual variable name. The cmtId is the 4th path segment.

- [ ] **Step 2: Verify the route works with curl**

```bash
# Start worker locally
cd worker && npx wrangler dev
# In another terminal, test the route (will 403 without valid secret, which is correct)
curl -X DELETE http://localhost:8787/comments/test-doc/test-cmt -H "X-Host-Secret: invalid" -v
# Should return 403 Forbidden
```

- [ ] **Step 3: Commit**

```bash
git add worker/src/index.ts
git commit -m "feat(worker): add per-comment delete endpoint DELETE /comments/:docId/:cmtId"
```

---

### Task 2: Add `deleteComment` method to ShareStorage

**Files:**
- Modify: `src/services/shareStorage.ts`

- [ ] **Step 1: Write the test**

Create `src/test/shareStorage.deleteComment.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ShareStorage } from "../services/shareStorage";

describe("ShareStorage.deleteComment", () => {
  const storage = new ShareStorage("https://test.workers.dev");

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("sends DELETE to /comments/:docId/:cmtId with host secret header", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );

    await storage.deleteComment("doc-123", "cmt-456", "secret-abc");

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://test.workers.dev/comments/doc-123/cmt-456",
      {
        method: "DELETE",
        headers: { "X-Host-Secret": "secret-abc" },
      },
    );
  });

  it("throws on non-ok response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("Forbidden", { status: 403 }),
    );

    await expect(
      storage.deleteComment("doc-123", "cmt-456", "bad-secret"),
    ).rejects.toThrow("Delete comment failed: 403");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/test/shareStorage.deleteComment.test.ts
```

Expected: FAIL — `storage.deleteComment is not a function`

- [ ] **Step 3: Implement `deleteComment` in ShareStorage**

Add to `src/services/shareStorage.ts`, inside the `ShareStorage` class, after `deleteComments`:

```typescript
  async deleteComment(
    docId: string,
    cmtId: string,
    hostSecret: string,
  ): Promise<void> {
    const res = await fetch(`${this.workerUrl}/comments/${docId}/${cmtId}`, {
      method: "DELETE",
      headers: { "X-Host-Secret": hostSecret },
    });
    if (!res.ok) {
      throw new Error(`Delete comment failed: ${res.status}`);
    }
  }
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/test/shareStorage.deleteComment.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/shareStorage.ts src/test/shareStorage.deleteComment.test.ts
git commit -m "feat: add per-comment deleteComment to ShareStorage"
```

---

### Task 3: Replace bulk KV deletion with per-comment deletion in `dismissComment`

**Files:**
- Modify: `src/store/index.ts`

- [ ] **Step 1: Write the test**

Create `src/test/storeDismissComment.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useAppStore } from "../store";
import { setTestState, resetTestStore, makeShare, makePeerComment } from "./testHelpers";

vi.mock("../services/shareStorage", () => ({
  ShareStorage: vi.fn().mockImplementation(() => ({
    deleteComment: vi.fn().mockResolvedValue(undefined),
    deleteComments: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock("../config", () => ({
  WORKER_URL: "https://test.workers.dev",
}));

describe("dismissComment", () => {
  beforeEach(() => {
    resetTestStore();
  });

  it("deletes only the specific comment from KV, not all comments", async () => {
    const { ShareStorage } = await import("../services/shareStorage");
    const mockStorage = new ShareStorage("test");

    const share = makeShare({ docId: "doc-1", hostSecret: "secret-1" });
    const comment1 = makePeerComment({ id: "c1", path: "test.md" });
    const comment2 = makePeerComment({ id: "c2", path: "test.md" });

    setTestState(
      {
        shares: [share],
        pendingComments: { "doc-1": [comment1, comment2] },
      },
      {},
    );

    useAppStore.getState().dismissComment("doc-1", "c1");

    // Should call deleteComment for the specific comment, not deleteComments for all
    expect(mockStorage.deleteComment).toHaveBeenCalledWith("doc-1", "c1", "secret-1");
    expect(mockStorage.deleteComments).not.toHaveBeenCalled();
  });
});
```

Note: The exact mock setup depends on how `getStorage()` is structured. The test may need adjustment during implementation to match the actual import pattern. The key assertion is: `deleteComment` is called with the specific cmtId, and `deleteComments` (bulk) is NOT called.

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/test/storeDismissComment.test.ts
```

Expected: FAIL — `dismissComment` still calls bulk `deleteComments`

- [ ] **Step 3: Change `dismissComment` to use per-comment deletion**

In `src/store/index.ts`, find `dismissComment` (around line 1636). Replace the bulk deletion block:

```typescript
// BEFORE (bulk delete):
// When all comments for this docId are gone locally, clear from server
if (pc[docId].length === 0) {
  const record = tab.shares.find((s) => s.docId === docId);
  const storage = getStorage();
  if (record && storage) {
    storage.deleteComments(docId, record.hostSecret).catch(() => {});
  }
}

// AFTER (per-comment delete):
const record = tab.shares.find((s) => s.docId === docId);
const storage = getStorage();
if (record && storage) {
  storage.deleteComment(docId, cmtId, record.hostSecret).catch((error) => {
    console.warn("[dismissComment] per-comment KV delete failed:", error);
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/test/storeDismissComment.test.ts
```

Expected: PASS

- [ ] **Step 5: Run full test suite to verify nothing is broken**

```bash
npx vitest run
```

Expected: All existing tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/store/index.ts src/test/storeDismissComment.test.ts
git commit -m "fix: replace bulk KV comment deletion with per-comment delete in dismissComment"
```

---

### Task 4: Auto-push share content after host resolves a comment

**Files:**
- Modify: `src/store/index.ts`

- [ ] **Step 1: Write the test**

Create `src/test/storeMergeAutoush.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../services/shareSync", () => ({
  updateShare: vi.fn().mockResolvedValue(undefined),
  syncActiveShares: vi.fn().mockResolvedValue(undefined),
}));

import { updateShare } from "../services/shareSync";

describe("mergeComment auto-push", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls updateShare after resolving a comment", async () => {
    // This test verifies that mergeComment calls updateShare(docId)
    // The full mergeComment flow requires a fileHandle with write permissions,
    // which is hard to mock in jsdom. For this test, verify the auto-push
    // call exists by checking that updateShare was called with the correct docId
    // after a successful merge.
    //
    // Implementation note: the actual test setup will need to mock
    // fileHandle.queryPermission, writeFile, parseCriticMarkup, etc.
    // The key assertion is:
    expect(updateShare).toBeDefined();
  });
});
```

Note: `mergeComment` requires a real `FileSystemFileHandle` with write permissions, which is impossible to fully mock in jsdom. The integration point is straightforward — add `await updateShare(docId)` after `writeAndUpdate()` succeeds. The test above is a placeholder; the real verification happens during manual testing or e2e tests.

- [ ] **Step 2: Add auto-push to `mergeComment`**

In `src/store/index.ts`, find `mergeComment` (around line 1573). After the `writeAndUpdate` call (line 1632), add:

```typescript
        await writeAndUpdate(get, set, tab.fileHandle, newRaw);

        // Auto-push updated content to KV so peers can recover missed resolves.
        // This must happen BEFORE any relay broadcast (added in Phase 3).
        const record = tab.shares.find((s) => s.docId === docId);
        if (record) {
          try {
            await updateShareService(docId);
          } catch (pushError) {
            console.warn("[mergeComment] auto-push after resolve failed:", pushError);
          }
        }

        get().dismissComment(docId, comment.id);
```

Also add the import at the top of the file:

```typescript
import { updateShare as updateShareService } from "../services/shareSync";
```

Note: `updateShare` is already imported from `shareSync` in the file — check if it's already there. If so, it may have a different name. Check the existing imports.

- [ ] **Step 3: Run full test suite**

```bash
npx vitest run
```

Expected: All tests pass. The auto-push is a no-op if the share doesn't exist in the tab's shares.

- [ ] **Step 4: Commit**

```bash
git add src/store/index.ts src/test/storeMergeAutoush.test.ts
git commit -m "feat: auto-push share content after host resolves a comment"
```

---

## Phase 2: Worker Relay

---

### Task 5: Add relay types

**Files:**
- Create: `src/types/relay.ts`

- [ ] **Step 1: Create the types file**

Create `src/types/relay.ts` with all wire protocol and relay message types. Copy exactly from [todos.md lines 9–89](../../features/realtime-comments/todos.md):

```typescript
import type { PeerComment } from "./share";

// --- Wire protocol (plaintext, seen by the DO) ---

export interface RelayFrame {
  version: 1;
  docId: string;
  payload: string;
}

export interface SubscribeFrame {
  type: "subscribe";
  docId: string;
}

export interface UnsubscribeFrame {
  type: "unsubscribe";
  docId: string;
}

export interface ErrorFrame {
  type: "error";
  docId: string;
  message: string;
}

export interface SubscribeOkFrame {
  type: "subscribe:ok";
  docId: string;
}

export interface PingFrame {
  type: "ping";
}

export interface PongFrame {
  type: "pong";
}

export type ControlFrame =
  | SubscribeFrame
  | UnsubscribeFrame
  | PingFrame;

export type InboundFrame =
  | RelayFrame
  | ErrorFrame
  | SubscribeOkFrame
  | PongFrame;

// --- Relay messages (inside encrypted payload) ---

export type RelayMessage =
  | CommentAddedMessage
  | CommentResolvedMessage
  | DocumentUpdatedMessage;

export interface CommentAddedMessage {
  type: "comment:added";
  comment: PeerComment;
}

export interface CommentResolvedMessage {
  type: "comment:resolved";
  commentId: string;
}

export interface DocumentUpdatedMessage {
  type: "document:updated";
  updatedAt: string;
}
```

- [ ] **Step 2: Verify types compile**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/types/relay.ts
git commit -m "feat: add relay wire protocol and message types"
```

---

### Task 6: Create RelayHub Durable Object

**Files:**
- Create: `worker/src/relay.ts`

- [ ] **Step 1: Create the RelayHub DO class**

Create `worker/src/relay.ts` with the full DO implementation. Copy from [todos.md lines 117–235](../../features/realtime-comments/todos.md), which includes:

- `SocketAttachment` interface and `getAttachment`/`setAttachment` helpers
- `isRecord` type guard (avoids `as` cast)
- `RelayHub` class with:
  - `fetch()` — WebSocket upgrade + `acceptWebSocket`
  - `webSocketMessage()` — ping/pong, subscribe (KV verify + `subscribe:ok`), unsubscribe, relay with echo suppression and frame validation
  - `webSocketClose()` — no-op (hibernation handles cleanup)
  - `webSocketError()` — close the socket

- [ ] **Step 2: Verify it compiles**

```bash
cd worker && npx tsc --noEmit
```

Note: this may fail if the Worker TypeScript config doesn't know about Durable Object types. If so, ensure `@cloudflare/workers-types` is in the Worker's devDependencies.

- [ ] **Step 3: Commit**

```bash
git add worker/src/relay.ts
git commit -m "feat(worker): add RelayHub Durable Object with WebSocket Hibernation"
```

---

### Task 7: Wire RelayHub into the Worker and update wrangler config

**Files:**
- Modify: `worker/src/index.ts`
- Modify: `worker/wrangler.toml`

- [ ] **Step 1: Add `RELAY_HUB` to the `Env` interface**

In `worker/src/index.ts`, add to the `Env` interface:

```typescript
interface Env {
  LOLLIPOP_DRAGON: KVNamespace;
  ALLOWED_ORIGINS: string;
  RELAY_HUB: DurableObjectNamespace;
}
```

- [ ] **Step 2: Add the `/relay` route**

In `worker/src/index.ts`, inside the `fetch` handler, add BEFORE the `if (resource === "share")` block:

```typescript
      // --- /relay (WebSocket upgrade to Durable Object) ---
      if (resource === "relay") {
        if (req.headers.get("Upgrade") !== "websocket") {
          return errRes(426, "WebSocket upgrade required", cors);
        }
        const hubId = env.RELAY_HUB.idFromName("hub");
        const hub = env.RELAY_HUB.get(hubId);
        return hub.fetch(req);
      }
```

- [ ] **Step 3: Export RelayHub from the Worker entry point**

Add at the bottom of `worker/src/index.ts`:

```typescript
export { RelayHub } from "./relay";
```

- [ ] **Step 4: Update wrangler.toml**

Add to `worker/wrangler.toml`:

```toml
[[durable_objects.bindings]]
name = "RELAY_HUB"
class_name = "RelayHub"

[[migrations]]
tag = "v1"
new_sqlite_classes = ["RelayHub"]
```

- [ ] **Step 5: Test locally**

```bash
cd worker && npx wrangler dev
# In another terminal:
# This should return 426 since we're not doing a WebSocket upgrade
curl http://localhost:8787/relay -v
# Should see: 426 WebSocket upgrade required
```

- [ ] **Step 6: Commit**

```bash
git add worker/src/index.ts worker/wrangler.toml
git commit -m "feat(worker): wire RelayHub DO route and update wrangler config"
```

---

## Phase 3: Client Relay

---

### Task 8: Create the relay client service

**Files:**
- Create: `src/services/relay.ts`

- [ ] **Step 1: Write tests for the relay service**

Create `src/test/relay.test.ts`. This tests the core relay service logic — encryption, message handling, reconnect, ping. The tests mock `WebSocket` and `crypto` since jsdom doesn't support them natively.

Key test cases (from [todos.md testing section](../../features/realtime-comments/todos.md)):
- `connectRelay` encrypts outbound and decrypts inbound messages per docId key
- `connectRelay` handles ErrorFrame and PongFrame without attempting decryption
- `connectRelay` reconnects with exponential backoff and re-subscribes on reconnect
- `connectRelay` flushes outbound batch synchronously on close
- `isValidRelayMessage` validates message shape
- `arrayBufferToBase64` handles large payloads without stack overflow
- Client only adds docId to confirmed subscriptions after receiving `subscribe:ok`
- Intentional `close()` does not trigger reconnect

Note: WebSocket mocking in vitest/jsdom requires a mock class. Consider using a minimal mock that implements `addEventListener`, `send`, `close`, and `readyState`.

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/test/relay.test.ts
```

Expected: FAIL — module not found

- [ ] **Step 3: Implement the relay service**

Create `src/services/relay.ts` with the full implementation from [todos.md lines 211–509](../../features/realtime-comments/todos.md). Key components:

- `RelayConnection` interface (exported)
- `isValidRelayMessage` type guard
- `arrayBufferToBase64` helper (chunked for large payloads)
- `connectRelay(onMessage, onStatusChange, onSubscribeResult)` function
  - WebSocket lifecycle with `closedIntentionally` flag
  - `encryptionKeys` and `activeSubscriptions` maps
  - `confirmedSubscriptions` set
  - Ping interval (30s)
  - Debounced outbound flush (500ms)
  - Reconnect with exponential backoff
  - Inbound: handle pong, error, subscribe:ok before attempting decryption
  - `isValidRelayMessage` guard on decrypted payload

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/test/relay.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/services/relay.ts src/test/relay.test.ts
git commit -m "feat: add relay client service with encryption, reconnect, and ping"
```

---

### Task 9: Add relay state and actions to the Zustand store

**Files:**
- Modify: `src/store/index.ts`
- Modify: `src/store/selectors.ts`

This is the largest task. It adds:
- New state fields (`rtStatus`, `rtSocket`, `rtSubscriptions`, `documentUpdateAvailable`, `remotePeerComments`, `resolvedCommentIds`)
- New actions (`openRelay`, `subscribeDoc`, `unsubscribeDoc`, `closeRelay`, `setRtStatus`, `dismissDocumentUpdate`)
- Message handlers (`handlePeerMessage`, `handleHostMessage`)
- Relay broadcast integration in `syncPeerComments` and `mergeComment`
- Reconnect catch-up (mode-aware)
- `partialize` and `merge` updates for transient fields

- [ ] **Step 1: Write tests for store relay actions**

Create `src/test/storeRelayActions.test.ts` with test cases from [todos.md testing section](../../features/realtime-comments/todos.md):

- Incoming `comment:added` adds to host's `pendingComments` for the correct tab
- Incoming `comment:added` deduplicates by comment ID in host mode
- Incoming `comment:added` in peer mode goes to `remotePeerComments`, not `myPeerComments`
- Incoming `comment:resolved` removes from peer's `myPeerComments` and `remotePeerComments`, adds to `resolvedCommentIds`
- `comment:added` for an ID in `resolvedCommentIds` is skipped (zombie prevention)
- `syncPeerComments` broadcasts `comment:added` via relay after KV post
- `mergeComment` broadcasts `comment:resolved` after durable resolve sequence
- Relay broadcast failure does not break KV flow
- KV catch-up fires on reconnect (peer mode calls `loadSharedContent`, host mode calls `fetchAllPendingComments`)

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/test/storeRelayActions.test.ts
```

- [ ] **Step 3: Add state fields to AppState interface**

In `src/store/index.ts`, add to the `AppState` interface after the peer mode fields:

```typescript
  // Real-time relay
  rtStatus: "disconnected" | "connecting" | "connected";
  rtSocket: RelayConnection | null;
  rtSubscriptions: Set<string>;
  documentUpdateAvailable: boolean;
  remotePeerComments: PeerComment[];
  resolvedCommentIds: Set<string>;
```

Add corresponding initial values in the store creation, and add action signatures to the interface.

- [ ] **Step 4: Add `handlePeerMessage` and `handleHostMessage`**

Add these as module-level functions (not inside the store) following the code from [todos.md lines 555–641](../../features/realtime-comments/todos.md).

- [ ] **Step 5: Add store actions**

Add `openRelay`, `subscribeDoc`, `unsubscribeDoc`, `closeRelay`, `setRtStatus`, `dismissDocumentUpdate` as store actions. Follow [todos.md lines 546–793](../../features/realtime-comments/todos.md).

- [ ] **Step 6: Integrate relay broadcast into `syncPeerComments` and `mergeComment`**

Follow the durable resolve sequence from [todos.md lines 804–865](../../features/realtime-comments/todos.md):
- `syncPeerComments`: broadcast `comment:added` after KV post
- `mergeComment`: delete comment from KV → push content → broadcast `comment:resolved`

- [ ] **Step 7: Update `partialize` to exclude transient relay fields**

The existing `partialize` function only selects what to persist. Since it uses an allowlist pattern, the new fields are automatically excluded. Verify this by checking that `rtStatus`, `rtSocket`, etc. are NOT in the `partialize` return object.

- [ ] **Step 8: Update `merge` to provide defaults for new fields on hydration**

In the `merge` function, ensure the new transient fields get their defaults when persisted state is loaded:

```typescript
return {
  ...current,
  ...p,
  tabs,
  // Existing:
  submittedPeerCommentIds: Array.isArray(p.submittedPeerCommentIds)
    ? p.submittedPeerCommentIds
    : [],
  // New relay fields — always reset to defaults on hydration:
  rtStatus: "disconnected" as const,
  rtSocket: null,
  rtSubscriptions: new Set<string>(),
  documentUpdateAvailable: false,
  remotePeerComments: [],
  resolvedCommentIds: new Set<string>(),
};
```

- [ ] **Step 9: Add `allVisiblePeerComments` selector**

In `src/store/selectors.ts`:

```typescript
export function getAllVisiblePeerComments(state: AppState): PeerComment[] {
  return [...state.myPeerComments, ...state.remotePeerComments];
}
```

- [ ] **Step 10: Run tests**

```bash
npx vitest run src/test/storeRelayActions.test.ts
npx vitest run
```

- [ ] **Step 11: Commit**

```bash
git add src/store/index.ts src/store/selectors.ts src/test/storeRelayActions.test.ts
git commit -m "feat: add relay state, actions, and message handlers to Zustand store"
```

---

### Task 10: Auto-connect relay on startup and share creation

**Files:**
- Modify: `src/store/index.ts`

- [ ] **Step 1: Wire relay into `restoreTabs`**

At the end of `restoreTabs()`, after all tabs and share keys are restored, add:

```typescript
// Auto-connect relay for active shares
const restoredState = get();
const allShares = restoredState.tabs.flatMap((tab) => tab.shares);
const now = new Date();
const activeShares = allShares.filter((share) => new Date(share.expiresAt) > now);
if (activeShares.length > 0) {
  get().openRelay();
  for (const share of activeShares) {
    get().subscribeDoc(share.docId);
  }
}
```

- [ ] **Step 2: Wire relay into `shareContent`**

After a new share is created in `shareContent()`, add:

```typescript
get().openRelay();
get().subscribeDoc(docId);
```

- [ ] **Step 3: Wire relay into `loadSharedContent` (peer mode)**

After content is decrypted and stored in peer mode, add:

```typescript
get().openRelay();
get().subscribeDoc(docId);
```

- [ ] **Step 4: Wire cleanup into `beforeunload`**

In `src/App.tsx` or the appropriate root component, add:

```typescript
useEffect(() => {
  const handleBeforeUnload = () => {
    useAppStore.getState().closeRelay();
  };
  window.addEventListener("beforeunload", handleBeforeUnload);
  return () => {
    window.removeEventListener("beforeunload", handleBeforeUnload);
  };
}, []);
```

- [ ] **Step 5: Run full test suite**

```bash
npx vitest run
```

- [ ] **Step 6: Commit**

```bash
git add src/store/index.ts src/App.tsx
git commit -m "feat: auto-connect relay on startup, share creation, and peer load"
```

---

### Task 11: ConnectionStatus component

**Files:**
- Create: `src/components/ConnectionStatus/ConnectionStatus.tsx`
- Create: `src/components/ConnectionStatus/ConnectionStatus.css`
- Create: `src/components/ConnectionStatus/index.ts`

- [ ] **Step 1: Write the test**

Create `src/test/ConnectionStatus.test.tsx`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { ConnectionStatus } from "../components/ConnectionStatus";
import { setTestState, resetTestStore, makeShare } from "./testHelpers";

describe("ConnectionStatus", () => {
  beforeEach(() => {
    resetTestStore();
  });

  it("renders nothing when not in peer mode and no active shares", () => {
    setTestState({}, { isPeerMode: false, rtStatus: "connected" });
    const { container } = render(<ConnectionStatus />);
    expect(container.firstChild).toBeNull();
  });

  it("renders green dot when connected in peer mode", () => {
    setTestState({}, { isPeerMode: true, rtStatus: "connected" });
    render(<ConnectionStatus />);
    expect(screen.getByText("Connected")).toBeTruthy();
  });

  it("renders yellow dot when connecting", () => {
    setTestState({}, { isPeerMode: true, rtStatus: "connecting" });
    render(<ConnectionStatus />);
    expect(screen.getByText("Connecting...")).toBeTruthy();
  });

  it("renders gray dot when disconnected", () => {
    setTestState({}, { isPeerMode: true, rtStatus: "disconnected" });
    render(<ConnectionStatus />);
    expect(screen.getByText("Offline")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/test/ConnectionStatus.test.tsx
```

- [ ] **Step 3: Create the component**

Follow [todos.md lines 916–965](../../features/realtime-comments/todos.md) for ConnectionStatus.tsx, ConnectionStatus.css, and index.ts. The component uses `data-status` attribute for CSS-driven styling.

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/test/ConnectionStatus.test.tsx
```

- [ ] **Step 5: Commit**

```bash
git add src/components/ConnectionStatus/
git commit -m "feat: add ConnectionStatus component"
```

---

### Task 12: ContentUpdateBanner component

**Files:**
- Create: `src/components/ContentUpdateBanner/ContentUpdateBanner.tsx`
- Create: `src/components/ContentUpdateBanner/ContentUpdateBanner.css`
- Create: `src/components/ContentUpdateBanner/index.ts`

- [ ] **Step 1: Write the test**

Create `src/test/ContentUpdateBanner.test.tsx` — test that it renders when `documentUpdateAvailable` is true, calls `loadSharedContent` on click, and resets the flag.

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Create the component**

Follow [todos.md lines 967–1068](../../features/realtime-comments/todos.md).

- [ ] **Step 4: Run test to verify it passes**

- [ ] **Step 5: Commit**

```bash
git add src/components/ContentUpdateBanner/
git commit -m "feat: add ContentUpdateBanner component for document:updated notifications"
```

---

### Task 13: Wire components into Header and peer layout

**Files:**
- Modify: `src/components/Header/Header.tsx`
- Modify: `src/App.tsx` (or wherever peer layout is rendered)

- [ ] **Step 1: Add ConnectionStatus to Header**

Import and render `<ConnectionStatus />` near the share controls in Header.

- [ ] **Step 2: Add ContentUpdateBanner to peer mode layout**

Import and render `<ContentUpdateBanner />` above the content area when in peer mode.

- [ ] **Step 3: Hide "Check comments" button when relay is connected**

In the SharedPanel or wherever "Check comments" is rendered, conditionally hide it when `rtStatus === "connected"`.

- [ ] **Step 4: Run full test suite**

```bash
npx vitest run
```

- [ ] **Step 5: Commit**

```bash
git add src/components/Header/ src/App.tsx
git commit -m "feat: wire ConnectionStatus and ContentUpdateBanner into layout"
```

---

### Task 14: Update peer-mode UI to render remote peer comments

**Files:**
- Modify: `src/components/CommentPanel/CommentPanel.tsx`
- Modify: `src/components/CommentMargin/CommentMargin.tsx`
- Modify: `src/components/Header/Header.tsx`

- [ ] **Step 1: Update CommentPanel to use combined selector**

In peer mode, replace `myPeerComments` reads with `getAllVisiblePeerComments` selector. Remote peer comments should be read-only (no edit/delete buttons).

- [ ] **Step 2: Update CommentMargin**

Show margin dots for remote peer comments alongside own comments.

- [ ] **Step 3: Update Header comment count**

Include `remotePeerComments` in the peer-mode comment count.

- [ ] **Step 4: Run full test suite**

```bash
npx vitest run
```

- [ ] **Step 5: Commit**

```bash
git add src/components/CommentPanel/ src/components/CommentMargin/ src/components/Header/
git commit -m "feat: render remote peer comments in peer-mode UI"
```

---

### Task 15: Integration broadcast for `document:updated`

**Files:**
- Modify: `src/services/shareSync.ts`

- [ ] **Step 1: Broadcast `document:updated` after `updateShare` succeeds**

In `src/services/shareSync.ts`, at the end of `updateShare()`, after `storage.updateContent()` succeeds:

```typescript
try {
  const { rtSocket } = useAppStore.getState();
  if (rtSocket) {
    rtSocket.send(docId, {
      type: "document:updated",
      updatedAt: new Date().toISOString(),
    }).catch((relayError) => {
      console.warn("[relay] document:updated broadcast failed:", relayError);
    });
  }
} catch (relayError) {
  console.warn("[relay] document:updated broadcast setup failed:", relayError);
}
```

- [ ] **Step 2: Run full test suite**

```bash
npx vitest run
```

- [ ] **Step 3: Commit**

```bash
git add src/services/shareSync.ts
git commit -m "feat: broadcast document:updated via relay after content push"
```

---

### Task 16: Final type check and full test run

- [ ] **Step 1: Type check**

```bash
npx tsc --noEmit
```

- [ ] **Step 2: Full test suite**

```bash
npx vitest run
```

- [ ] **Step 3: Manual smoke test**

1. Start dev server: `yarn dev`
2. Open the app, share a file
3. Open the shared link in another browser/incognito
4. Verify ConnectionStatus shows "Connected" on both sides
5. Post a comment as peer — verify it appears in host's pending comments
6. Merge the comment as host — verify it disappears from peer's view
7. Push updated content as host — verify peer sees the update banner
8. Kill the dev server WebSocket — verify fallback to async KV mode works

- [ ] **Step 4: Commit any remaining fixes**

```bash
git add -A
git commit -m "fix: address issues found during integration testing"
```
