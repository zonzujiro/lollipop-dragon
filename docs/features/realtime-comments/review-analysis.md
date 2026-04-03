# Real-Time Comment Sync Review Analysis

Date: 2026-04-03

Reviewed artifacts:

- `docs/features/realtime-comments-spec.md`
- `docs/features/realtime-comments-todos.md`
- `src/store/index.ts`
- `src/components/CommentPanel/CommentPanel.tsx`
- Supporting implementation and architecture docs referenced by the spec

## Summary

The Durable Object relay direction is reasonable, but the design is not implementation-ready yet.

The main blockers are:

1. The Durable Object design is internally inconsistent about how subscriptions survive hibernation.
2. Subscription establishment is not reliable because subscribe failures can silently leave a client disconnected from a document while the UI still believes it is subscribed.
3. Reconnect reconciliation is incomplete, especially in peer mode.
4. The spec treats KV as the reconnect source of truth while also allowing edit/delete state to exist only on the relay.
5. The current host-side cleanup logic can delete unseen comments from KV.
6. The multi-peer peer-side UI is incomplete because remote comments are stored but not rendered.
7. The Wrangler migration example is incorrect for current Cloudflare Free constraints.

## BLOCKING

### 1. Wrong Durable Object migration type for Workers Free

Reference:

- `docs/features/realtime-comments-todos.md:260-279`

Problem:

The todo uses:

```toml
[[migrations]]
tag = "v1"
new_classes = ["RelayHub"]
```

That is the legacy migration form. New Durable Objects on current Cloudflare plans should use `new_sqlite_classes`, and Workers Free only supports SQLite-backed Durable Objects. If the project is staying on the free tier, the example as written is likely to fail at deployment time.

Why it matters:

This is a hard deployment blocker. The feature cannot ship if the Worker config is invalid for the target platform.

Suggested fix:

- Change the migration example to `new_sqlite_classes = ["RelayHub"]`.
- Update the spec and todos anywhere they mention `new_classes`.
- Verify the surrounding docs explicitly assume SQLite-backed Durable Objects.

### 2. Hibernation design contradicts the proposed subscription model

Reference:

- `docs/features/realtime-comments-spec.md:313-332`
- `docs/features/realtime-comments-todos.md:121-123`
- `docs/features/realtime-comments-todos.md:184-225`

Problem:

The spec says the Durable Object will use WebSocket hibernation tags and `state.getWebSockets(tag)` to route by `docId`. The todo later says dynamic subscribe/unsubscribe cannot update tags after `acceptWebSocket()`, so the implementation switches to `serializeAttachment()` plus a full `getWebSockets()` scan.

Those are different designs. A relay that supports dynamic subscriptions cannot rely on static tags the way the spec currently describes.

Why it matters:

An implementer following the spec will build the wrong mechanism. The actual routing strategy affects complexity, scalability, testing, and what hibernation guarantees are relied on.

Suggested fix:

Pick one of these explicitly:

- Attachment-based routing in a single hub DO:
  - Store subscribed `docId`s in socket attachments.
  - Route by scanning `state.getWebSockets()` and filtering attachments.
- One Durable Object per `docId`:
  - Remove dynamic multiplexing.
  - Keep subscription state implicit and static per room.

If the single-hub model remains, update the spec to match attachments, not tags.

### 3. Subscribe failures can strand a client in a false-connected state

Reference:

- `docs/features/realtime-comments-spec.md:194`
- `docs/features/realtime-comments-todos.md:401-405`
- `docs/features/realtime-comments-todos.md:728-753`

Problem:

The spec allows subscribe rejection because KV is eventually consistent and a just-created document may not be visible yet. But the client:

- sends `subscribe`
- logs an `error` frame if it fails
- still stores the `docId` in local subscription state
- has no subscribe acknowledgment
- has no retry path for a socket that stays open

That means the UI can show `connected`, hide the fallback button, and still never receive messages for that document.

Why it matters:

This creates a silent failure mode that is worse than an obvious disconnect. Users think realtime is active when it is not.

Suggested fix:

- Add an explicit subscribe success frame from the Durable Object.
- Only add a `docId` to client subscription state after success.
- Retry failed subscriptions with backoff while the socket remains open.
- Alternatively, remove the KV existence check and treat the relay as subscription-permissive.

### 4. Peer reconnect catch-up is not actually implemented

Reference:

- `docs/features/realtime-comments-spec.md:271-272`
- `docs/features/realtime-comments-spec.md:418`
- `docs/features/realtime-comments-todos.md:704-717`
- `src/store/index.ts:1560-1570`

Problem:

The spec promises reconnect catch-up from KV. The proposed reconnect hook calls `fetchAllPendingComments()`, but that action is host-tab-specific. In peer mode it does nothing useful for:

- missed `comment:resolved`
- missed comments from other peers
- other missed relay events

So peer reconnect reconciliation is currently a no-op.

Why it matters:

Without a real peer catch-up path, missed relay events remain permanently missed. That breaks the reliability story for live collaboration.

Suggested fix:

Add a peer-specific catch-up path, for example:

- reload comment state for the active shared document from KV
- reconcile host-resolved comments
- reconcile other-peer comments
- define exactly how peer state is rebuilt after reconnect

Do not reuse `fetchAllPendingComments()` for peer mode.

### 5. KV cannot be the reconnect source of truth while edit/delete are relay-only

Reference:

- `docs/features/realtime-comments-spec.md:97-99`
- `docs/features/realtime-comments-spec.md:264`
- `docs/features/realtime-comments-spec.md:431`
- `docs/features/realtime-comments-spec.md:478`
- `src/services/shareStorage.ts:106-122`
- `src/store/index.ts:1807-1814`
- `worker/src/index.ts:198-251`

Problem:

The feature scope includes:

- `comment:edited`
- `comment:deleted`

But the spec also explicitly accepts that edits and deletes are not persisted to KV in v1. That means reconnect from KV can restore stale state:

- deleted comments reappear
- edited text rolls back to an older version

This gets worse because the current comment persistence path discards the returned server `cmtId`, and the Worker has no endpoint for per-comment mutation. The current persistence model is append-only.

Why it matters:

The spec cannot simultaneously claim:

- KV is the source of truth on reconnect
- edits and deletes exist only on the relay

Those two statements are incompatible.

Suggested fix:

Choose one:

- Remove edit/delete from v1 realtime scope and support only add/resolve, or
- Redesign persistence now:
  - persist stable client-owned comment IDs
  - add worker support for per-comment update/delete or tombstones
  - define replay semantics on reconnect

### 6. Current host cleanup can delete unseen comments from KV

Reference:

- `src/store/index.ts:1655-1660`

Problem:

Today, when the host dismisses the last locally pending comment for a share, the app deletes all comments for that share from KV.

In an async-only world this was already coarse. In a realtime-plus-fallback world it is dangerous:

- host resolves the locally last-visible comment
- app deletes all KV comments for the share
- comments that were posted while the host was disconnected or before catch-up finished can be lost

Why it matters:

This breaks the spec’s durability and reconnect guarantees. KV cannot act as a safety net if the host wipes the whole backlog based on incomplete local state.

Suggested fix:

- Delete only the specific comment that was resolved, not all share comments.
- Or keep processed markers / tombstones instead of bulk deletion.
- Rework the worker API so comment lifecycle is per-comment, not all-or-nothing.

## MEDIUM

### 7. Remote peer comments are stored but never rendered

Reference:

- `docs/features/realtime-comments-spec.md:204-205`
- `docs/features/realtime-comments-spec.md:255-257`
- `docs/features/realtime-comments-todos.md:540-591`
- `src/components/CommentPanel/CommentPanel.tsx:57-120`
- `src/components/CommentMargin/CommentMargin.tsx:140-160`
- `src/components/Header/Header.tsx:165-199`

Problem:

The proposed store adds `remotePeerComments` and updates it when relay messages arrive, but the current peer-mode UI continues to read only `myPeerComments` for:

- comment panel entries
- margin dots
- header comment counts

So the multi-peer path exists in state only. Other peers’ comments will not actually appear unless the UI model changes.

Why it matters:

This is not a theoretical edge case. It means the advertised peer-to-peer visibility does not exist yet, even if the relay works correctly.

Suggested fix:

- Define a peer-mode display model that combines `myPeerComments` and `remotePeerComments`.
- Explicitly define edit/delete permissions so peers can edit only their own comments.
- Update `CommentPanel`, `CommentMargin`, and `Header` together.

### 8. Ping/pong weakens the "zero cost when idle" claim

Reference:

- `docs/features/realtime-comments-spec.md:222`
- `docs/features/realtime-comments-spec.md:421`
- `docs/features/realtime-comments-spec.md:449`
- `docs/features/realtime-comments-todos.md:179-180`
- `docs/features/realtime-comments-todos.md:360-366`

Problem:

The spec promises zero duration charges when idle, but it also requires an application-level ping every 30 seconds and a DO-side pong response. In the proposed implementation those frames are handled in user code, which means the Durable Object is still being awakened on an ongoing basis.

Why it matters:

This does not make the design invalid, but it makes the cost story materially weaker than the spec currently claims.

Suggested fix:

- Reframe the claim as low idle cost rather than zero idle cost.
- If zero-ish idle wakeups are important, use Cloudflare's auto-response mechanism for keep-alives instead of application-level handler logic.

### 9. Startup integration is aimed at the wrong lifecycle hook

Reference:

- `docs/features/realtime-comments-todos.md:879-891`
- `src/hooks/useHashRouter.ts:11-18`
- `src/store/index.ts:1376-1388`
- `src/store/index.ts:1391-1401`

Problem:

The todo says restored host subscriptions should be wired in `restoreShareSessions()`, but the real startup path for host mode goes through `restoreTabs()`, which already reloads shares and share keys for all tabs. `restoreShareSessions()` only restores keys for the active tab and is not the primary boot path.

Why it matters:

If the relay auto-subscribe logic is attached to the wrong hook, restored shares will not consistently reconnect on page load.

Suggested fix:

- Wire host-side relay restoration into `restoreTabs()` or the code that runs immediately after it.
- Keep `restoreShareSessions()` only as a narrower active-tab helper if it is still needed.

### 10. The batching story is internally contradictory

Reference:

- `docs/features/realtime-comments-spec.md:395`
- `docs/features/realtime-comments-spec.md:451`
- `docs/features/realtime-comments-todos.md:349-356`

Problem:

One part of the spec says batching sends events as a single frame, while the optimization section says individual events remain separate frames. The todo implementation matches the second behavior and simply delays sending before flushing multiple individual frames.

Why it matters:

This is a documentation inconsistency, but it also affects request estimates, test expectations, and how much value batching actually provides.

Suggested fix:

- Decide whether batching means one envelope containing multiple events, or delayed flushing of separate frames.
- Update the spec and tests to describe the chosen behavior consistently.

### 11. The VPN success claim is too absolute

Reference:

- `docs/features/realtime-comments-spec.md:13`
- `docs/features/realtime-comments-spec.md:423`
- `docs/features/realtime-comments-spec.md:469`

Problem:

The spec says WSS over 443 "works through corporate VPNs" or "VPNs cannot block" it. That is directionally better than WebRTC, but it is still too absolute. Some corporate proxies interfere with WebSocket upgrades, inspect traffic aggressively, or enforce short idle timeouts.

Why it matters:

Overstating this weakens the risk model and can create false confidence in rollout planning.

Suggested fix:

- Rephrase this as "much more likely to work than WebRTC in VPN-heavy environments."
- Keep the fallback path as a first-class part of the design rather than a rare exception.

## LOW

### 12. Connection status indicator is not fully specified for host tabs

Reference:

- `docs/features/realtime-comments-spec.md:275-295`
- `docs/features/realtime-comments-todos.md:916-920`

Problem:

The todo component has an explicit `TODO` for host-mode visibility. It currently checks only global subscription state and peer mode, not whether the current host tab actually has active shares relevant to the connection being shown.

Why it matters:

This will not break transport, but it can produce confusing UI by showing status in the wrong tab or hiding it when it should be visible.

Suggested fix:

- Define host-mode visibility in terms of the active tab's live shares.
- Add tests for tab switching and mixed subscribed/unsubscribed tab states.

### 13. Parse validation is still too loose in the examples

Reference:

- `docs/features/realtime-comments-todos.md:166`
- `docs/features/realtime-comments-todos.md:394`
- `docs/features/realtime-comments-todos.md:418`
- `worker/src/index.ts:54-57`

Problem:

Several examples parse JSON and then proceed with only partial shape checks. The current worker also still casts parsed metadata directly. That is survivable in trusted paths, but this feature introduces more wire-level message handling and therefore more malformed-input surface area.

Why it matters:

This is not the primary blocker, but it increases debugging pain and weakens the reliability of the relay boundary.

Suggested fix:

- Add explicit frame validators for control frames and relay frames.
- Replace unchecked casts in the worker with narrow validation helpers.

## OBSERVATIONS

### Durable Object relay is still the right direction

The move away from WebRTC is reasonable. The old WebRTC design depended on:

- signaling relays
- direct peer connectivity
- STUN/TURN reliability

The new relay approach removes the fragile P2P assumptions. It is much more likely to work in VPN-heavy environments.

That said, “more likely to work” is not the same as “guaranteed to work.” Some proxies still interfere with WebSocket upgrades or aggressively time out idle connections.

### Single-hub DO is viable for the stated scale

For the stated 2-5 peer target, a single hub Durable Object with attachment-based routing is viable. The main problems are correctness and state reconciliation, not raw scale.

If the product later expands significantly, the single-hub model will need revisiting.

## Recommended next decisions

Before implementation, I would resolve these in order:

1. Decide whether the relay is:
   - single hub with attachments, or
   - one DO per `docId`
2. Decide whether v1 supports:
   - add + resolve only, or
   - full add/edit/delete/resolve with persistent reconciliation
3. Replace bulk comment deletion with per-comment lifecycle handling
4. Define a real peer reconnect reconciliation path
5. Update peer UI rendering so remote comments actually appear
6. Fix Wrangler migration examples and deployment assumptions

## Bottom line

The overall idea is good, but the current spec and todo set are not consistent enough to implement safely. The biggest gap is that the relay layer, reconnect strategy, and persistence model are not describing the same system yet.

## Second Review

Date: 2026-04-03

Context:

- This second pass reviews the current workspace state after follow-up changes.
- The focus is the actual repo contents, not just the design intent in the spec and todos.

### Summary

The design docs improved, but the runtime implementation is still not present in the workspace.

The main outcomes of the second pass are:

1. The repo still does not contain the relay feature code paths described by the spec and todos.
2. The new peer reconnect story is still incorrect because it relies on `loadSharedContent()`, which does not reload comments.
3. The bulk-KV-delete data-loss path is still live in the actual store and worker code.
4. The subscribe-ack fix is still incomplete in the todo because failed subscribes are not retried while the socket remains open, and local subscription state is still updated too early.

### BLOCKING

#### 1. The runtime relay implementation is still missing from the workspace

Reference:

- `worker/wrangler.toml:1-10`
- `worker/src/index.ts:1-261`
- `src/store/index.ts:256-282`

Problem:

The current repo still does not contain the realtime runtime described by the updated spec and todos.

Specifically:

- `worker/wrangler.toml` still has no Durable Object binding or migration.
- `worker/src/index.ts` still exposes only the KV-backed `/share` and `/comments` routes.
- `src/store/index.ts` still has none of the new relay state or actions such as:
  - `rtStatus`
  - `rtSocket`
  - `rtSubscriptions`
  - `documentUpdateAvailable`
  - `remotePeerComments`

Why it matters:

The main feature under review is still not executable in the checked-out workspace. That makes the rest of the design fixes mostly theoretical until the implementation actually lands.

Suggested fix:

- Implement the worker relay route and Durable Object binding.
- Add the relay service and store wiring.
- Add the peer UI state and rendering changes promised by the spec.

#### 2. Peer reconnect catch-up is still wrong in the updated design

Reference:

- `docs/features/realtime-comments-spec.md:254-259`
- `docs/features/realtime-comments-todos.md:631-647`
- `src/store/index.ts:1723-1751`
- `src/services/shareStorage.ts:66-73`
- `src/services/shareSync.ts:49-86`
- `src/components/Header/Header.tsx:284-291`

Problem:

The updated spec now says peer reconnect catch-up should call `loadSharedContent()`. But the actual code shows that `loadSharedContent()` only:

- parses the share hash
- reloads the encrypted content blob from `/share/:docId`
- restores the active file path

It does not fetch `/comments/:docId`, and host-side share updates are still a separate manual action via `updateShare()` / `Push update`.

So this new story is still wrong for two reasons:

- missed peer comments are not rebuilt, because comments are not part of the share payload
- missed resolves are not reflected unless the host also pushed updated content

Why it matters:

This means the second-pass “fix” for peer reconnect does not actually solve the original bug. Realtime misses can still remain permanently missed.

Suggested fix:

- Define an actual peer reconnect path that reloads comments, not just document content.
- If resolves are supposed to be recoverable from shared content, then document exactly when host-side content is rewritten and pushed.
- Otherwise, add explicit peer comment state reconstruction from KV.

#### 3. Bulk KV deletion is still live and still unsafe

Reference:

- `src/store/index.ts:1636-1663`
- `worker/src/index.ts:241-251`
- `docs/features/realtime-comments-todos.md:806-811`

Problem:

The todo now recognizes bulk deletion as a future task, but the actual code path is unchanged:

- when the last local pending comment disappears, `dismissComment()` calls `deleteComments(docId, hostSecret)`
- the worker still deletes all comments for the share on `DELETE /comments/:docId`

Why it matters:

The original data-loss risk is still real in the runtime code today. Any new realtime layer built on top of this will inherit the same unsafe fallback semantics until per-comment deletion exists.

Suggested fix:

- Add a per-comment delete endpoint first.
- Change host cleanup to remove only the resolved comment.
- Do not keep the current bulk-delete behavior in a realtime rollout.

#### 4. The subscribe-ack fix is still incomplete in the todo

Reference:

- `docs/features/realtime-comments-spec.md:212`
- `docs/features/realtime-comments-todos.md:393-400`
- `docs/features/realtime-comments-todos.md:659-684`

Problem:

The updated spec says the client retries failed subscribes while the socket remains open and only adds local subscription state after `subscribe:ok`.

But the todo still does not fully implement that behavior:

- on `error`, it only logs a warning and returns
- there is no per-doc retry path while the socket remains open
- `subscribeDoc()` still updates `rtSubscriptions` immediately after calling `rtSocket.subscribe()`

Why it matters:

This preserves the original false-subscribed failure mode in the proposed implementation: the UI can believe a doc is subscribed before the server has confirmed it.

Suggested fix:

- Add explicit per-doc subscribe retry/backoff in the relay client.
- Move store-level subscription bookkeeping to confirmed state, not requested state.
- Consider splitting requested subscriptions from confirmed subscriptions if both are needed for reconnect behavior.

### LOW

#### 5. Scope language is still inconsistent about edit/delete

Reference:

- `docs/features/realtime-comments-spec.md:22`
- `docs/features/realtime-comments-spec.md:38`
- `docs/features/realtime-comments-spec.md:46`

Problem:

The updated scope now defers realtime edit/delete, but the decision table still says the sync protocol is `add/edit/delete/resolve`.

Why it matters:

This is easy to fix, but it still makes the intended v1 scope ambiguous for whoever implements `src/types/relay.ts` and the message handlers.

Suggested fix:

- Align the decision table with the scope section.
- If edit/delete are deferred, remove them everywhere in the v1 design.

#### 6. The batching description is still contradictory

Reference:

- `docs/features/realtime-comments-spec.md:377-384`
- `docs/features/realtime-comments-spec.md:437-443`

Problem:

One section still says batching sends a single frame, while another says the frames remain individual and only the flush is delayed.

Why it matters:

This is a docs-quality issue, but it affects estimates, tests, and implementation shape.

Suggested fix:

- Choose one batching model and describe it consistently in both sections.

### Residual note

This second review assumes the current workspace is the intended implementation target. If the actual relay/store/worker code exists on another branch or outside the checked-out files, that code was not available in this review pass.

## Third Review

This pass reflects the current workspace on 2026-04-03.

Several earlier doc-level issues are now fixed in the spec/todo set:

- Durable Object migrations now use `new_sqlite_classes`.
- The hibernation design now consistently uses socket attachments instead of dynamic tags.
- The todo now describes `subscribe:ok` plus retry/backoff instead of immediate optimistic subscription state.

Those are good corrections, but the checked-out runtime code still does not match the design.

## BLOCKING

### 1. The realtime relay implementation is still missing from the actual codebase

Reference:

- `worker/wrangler.toml:1-8`
- `worker/src/index.ts:1-4`
- `worker/src/index.ts:83-255`
- `src/store/index.ts:256-282`

Problem:

The current runtime still contains only the KV-backed share/comment flow:

- `worker/wrangler.toml` has no Durable Object binding or migration block.
- `worker/src/index.ts` still declares only `LOLLIPOP_DRAGON` and `ALLOWED_ORIGINS` in `Env`.
- The Worker handler still exposes only the existing `/share` and `/comments` routes.
- `AppState` still has no realtime relay fields such as `rtStatus`, `rtSocket`, `rtSubscriptions`, `documentUpdateAvailable`, or `remotePeerComments`.

Why it matters:

The updated docs are ahead of the implementation. There is still no executable relay feature in the workspace to validate against the spec.

Suggested fix:

- Land the actual Worker relay route and Durable Object wiring.
- Add the runtime relay service and the store fields/actions described in the todo.
- Re-run review after the source implementation exists, not just the docs.

### 2. Peer reconnect recovery for resolved comments still does not work with the current host update flow

Reference:

- `docs/features/realtime-comments-spec.md:259-261`
- `src/store/index.ts:1573-1634`
- `src/services/shareSync.ts:49-86`
- `src/components/Header/Header.tsx:284-291`

Problem:

The spec now says missed `comment:resolved` events are recovered by calling `loadSharedContent()`, because the resolved comment has been removed from the shared CriticMarkup and the updated content has been pushed to KV.

That is not true in the current code:

- `mergeComment()` writes the local file and dismisses the pending comment.
- It does not call `updateShare()` or `syncActiveShares()`.
- Share content updates are still pushed only through the manual `Push update` button.

Why it matters:

If a peer misses a realtime `comment:resolved` event, reconnecting and calling `loadSharedContent()` will usually not help unless the host also manually pushed updated content afterward. The stated recovery path is therefore unreliable for the normal resolve flow.

Suggested fix:

- Either automatically push the affected share content when the host merges/resolves a comment, or
- stop claiming that `loadSharedContent()` is sufficient to recover missed resolves until the push behavior changes.

### 3. The bulk KV deletion data-loss path is still live in runtime code

Reference:

- `src/store/index.ts:1655-1660`
- `worker/src/index.ts:241-251`
- `docs/features/realtime-comments-todos.md:852-857`

Problem:

The todo now correctly calls out the need for per-comment deletion, but the checked-out implementation still deletes all comments for a share when the last locally visible pending comment disappears.

Why it matters:

This is still incompatible with the realtime-plus-fallback design. Any comment the host has not seen yet can be erased by resolving the locally last-visible item.

Suggested fix:

- Add `DELETE /comments/:docId/:cmtId`.
- Change `dismissComment()` and `mergeComment()` to delete only the resolved comment.
- Do not ship realtime delivery while the bulk-delete path remains active.

## MEDIUM

### 4. The proposed peer catch-up logic still imports all KV comments as “remote” comments

Reference:

- `docs/features/realtime-comments-spec.md:248`
- `docs/features/realtime-comments-todos.md:654-663`
- `src/services/shareStorage.ts:124-144`
- `src/store/index.ts:1791-1815`

Problem:

The spec says `remotePeerComments` is for comments from other peers. But the proposed reconnect catch-up loads the full `GET /comments/:docId` result from KV and appends every unseen comment to `remotePeerComments`, deduplicating only against existing `remotePeerComments`.

That means the current peer's own previously submitted comments can be re-imported as “remote” comments, because:

- `fetchComments()` returns the full comment set for the document.
- `syncPeerComments()` keeps submitted items in `myPeerComments`.
- the dedupe set in the todo does not exclude IDs already present in `myPeerComments` or `submittedPeerCommentIds`.

Why it matters:

Once the UI starts rendering `remotePeerComments`, the peer can see duplicates of their own comments or see their own comments downgraded into the read-only “remote” bucket.

Suggested fix:

- Exclude comment IDs already present in `myPeerComments` and `submittedPeerCommentIds` when building `remotePeerComments`, or
- redefine the state model so reconnect loads a single unified peer-visible comment list instead of splitting local and remote comments this late.

### 5. Peer-mode rendering still reads only `myPeerComments`

Reference:

- `src/components/CommentPanel/CommentPanel.tsx:57-143`
- `src/components/CommentMargin/CommentMargin.tsx:140-186`
- `src/components/Header/Header.tsx:165-199`
- `docs/features/realtime-comments-todos.md:1031-1036`

Problem:

The runtime UI still only uses `myPeerComments` for panel entries, margin dots, and header counts. The todo correctly calls out the need to render `remotePeerComments`, but those component changes are not present in source yet.

Why it matters:

Even after the relay/store work lands, peers still will not see one another's comments until the display layer is updated too.

Suggested fix:

- Add a selector that combines local and remote peer-visible comments.
- Use that selector in `CommentPanel`, `CommentMargin`, and `Header`.
- Keep edit/delete controls scoped to locally owned comments only.

## LOW

### 6. The todo still contains one stale reconnect note

Reference:

- `docs/features/realtime-comments-todos.md:645-673`
- `docs/features/realtime-comments-todos.md:848-849`

Problem:

The main reconnect code sample now shows the correct peer-specific two-step catch-up path, but the later checklist note still says reconnect is handled by iterating `rtSubscriptions` and calling `fetchPendingComments(docId)` for each.

Why it matters:

This is just a docs consistency issue now, but it can still send an implementer back toward the old host-only catch-up model.

Suggested fix:

- Update the checklist note to match the code sample.
- Keep host and peer reconnect behavior described separately.

### Residual note

This third review is still bounded by the checked-out workspace. If the relay/store/worker implementation exists on a different branch, this pass did not have it available.

## Fourth Review

This pass reflects the current workspace on 2026-04-03 after the latest doc updates.

One previously reported medium issue is now fixed in the todo/spec examples: peer reconnect catch-up now excludes IDs already present in `myPeerComments`, `submittedPeerCommentIds`, and `remotePeerComments` before appending to `remotePeerComments`.

The remaining problems are mostly runtime gaps: the design docs are getting closer, but the checked-out app/worker code still does not implement the relay path.

## BLOCKING

### 1. The realtime relay still does not exist in the checked-out runtime

Reference:

- `worker/wrangler.toml:1-10`
- `worker/src/index.ts:1-261`
- `src/store/index.ts:256-374`

Problem:

The current source still has no executable Durable Object or relay client path:

- `worker/wrangler.toml` has no `durable_objects` binding or migration.
- `worker/src/index.ts` still exposes only the KV-backed `/share` and `/comments` routes.
- `AppState` still has no `rtStatus`, `rtSocket`, `rtSubscriptions`, `documentUpdateAvailable`, or `remotePeerComments`.

Why it matters:

At this point the main implementation risk is no longer a docs contradiction. It is that the runtime feature still is not present to test or ship.

Suggested fix:

- Land the Worker relay route plus Durable Object binding/export.
- Add the runtime relay service and the corresponding store state/actions.
- Re-run review once the actual source implementation exists.

### 2. The stated peer recovery path for missed resolves still depends on a manual host action

Reference:

- `docs/features/realtime-comments-spec.md:260-261`
- `src/store/index.ts:1573-1634`
- `src/services/shareSync.ts:49-86`
- `src/components/Header/Header.tsx:284-291`

Problem:

The spec now correctly documents that `loadSharedContent()` only catches missed `comment:resolved` events if the host has pushed updated content since the resolve. The checked-out runtime still requires that push to happen manually through the `Push update` button.

`mergeComment()` still:

- writes the file locally
- dismisses the pending comment
- does not call `updateShare()` or `syncActiveShares()`

Why it matters:

Even with a working relay, a peer that misses `comment:resolved` will stay stale until the host manually pushes content. That makes reconnect recovery incomplete for a very normal failure mode.

Suggested fix:

- Auto-push the affected share when `mergeComment()` resolves a comment, or
- explicitly downgrade the guarantee and treat missed resolves as manual-refresh-only until auto-push exists.

### 3. Bulk deletion of all KV comments for a share is still live

Reference:

- `src/store/index.ts:1636-1663`
- `worker/src/index.ts:241-251`
- `docs/features/realtime-comments-todos.md:857-858`

Problem:

The source still bulk-deletes all comments for a document when the last locally visible pending comment is removed. The todo now acknowledges this is wrong, but the code path remains unchanged.

Why it matters:

This still breaks the durability/fallback model. Any comment not yet visible to the host can be erased by resolving the last locally visible one.

Suggested fix:

- Add per-comment deletion in the Worker.
- Remove the share-wide delete from `dismissComment()` and `clearPendingComments()` for realtime flows.

## MEDIUM

### 4. Peer-mode UI still only renders `myPeerComments`

Reference:

- `src/components/CommentPanel/CommentPanel.tsx:57-143`
- `src/components/CommentMargin/CommentMargin.tsx:140-186`
- `src/components/Header/Header.tsx:165-199`
- `docs/features/realtime-comments-todos.md:1036-1037`

Problem:

The actual peer UI still renders only the local peer's comments for:

- panel entries
- margin dots
- header counts

The todo now describes the right follow-up, but those source changes are still absent.

Why it matters:

Even after the relay path lands, peers still will not see each other's comments until the UI starts reading the combined visible comment set.

Suggested fix:

- Add an `allVisiblePeerComments` selector.
- Use it in `CommentPanel`, `CommentMargin`, and `Header`.
- Keep ownership-sensitive actions scoped to local comments.

## LOW

### 5. One reconnect checklist note in the todo is still stale

Reference:

- `docs/features/realtime-comments-todos.md:645-678`
- `docs/features/realtime-comments-todos.md:853-854`

Problem:

The main reconnect example now shows the peer-specific catch-up path, but the later checklist note still says reconnect iterates `rtSubscriptions` and calls `fetchPendingComments(docId)` for each.

Why it matters:

This is a docs cleanup issue, but it still points implementers back toward the old host-only mental model.

Suggested fix:

- Update the checklist note to match the reconnect sample.

### Residual note

This fourth review is still bounded by the current workspace. If the actual relay implementation exists on another branch, it was not available in this pass.

## Fifth Review (Docs Only)

This pass intentionally reviews only the design docs:

- `docs/features/realtime-comments-spec.md`
- `docs/features/realtime-comments-todos.md`

It does not rely on the checked-out runtime implementation.

The docs are materially better than the first draft. The hibernation model, migration config, and peer catch-up filtering are now much clearer. The remaining issues are mostly design contradictions or plan gaps that could still send an implementer in the wrong direction.

## BLOCKING

### 1. The architecture still contradicts itself on room topology

Reference:

- `docs/features/realtime-comments-spec.md:19`
- `docs/features/realtime-comments-spec.md:83`
- `docs/features/realtime-comments-spec.md:304-305`
- `docs/features/realtime-comments-todos.md:110-115`

Problem:

The scope still says the design includes a Durable Object relay room with "one room per shared document," but the actual architecture everywhere else is a single relay hub DO multiplexed by `docId`.

Those are different systems:

- one room per document means one DO namespace instance per doc
- one relay hub means one global DO plus attachment-based routing

Why it matters:

This changes connection count, routing complexity, hibernation behavior, and scaling assumptions. An implementer following the scope section can build the wrong architecture.

Suggested fix:

- Rewrite the scope section to match the chosen design.
- If the design is the single-hub model, say that explicitly everywhere and remove the "one room per shared document" phrasing.

### 2. The spec calls out auto-push after resolve as required, but the todo never plans it

Reference:

- `docs/features/realtime-comments-spec.md:259-261`
- `docs/features/realtime-comments-spec.md:409`
- `docs/features/realtime-comments-todos.md:793-827`

Problem:

The spec now correctly says peer reconnect can recover missed `comment:resolved` events via `loadSharedContent()` only if the host has pushed updated content, and it explicitly says auto-pushing after `mergeComment()` is a required implementation change.

But the todo never actually includes that change. The plan adds:

- a `comment:resolved` relay broadcast from `mergeComment()`
- a `document:updated` relay broadcast from `updateShare()`

What it does not add is the required step that connects those two things: automatically pushing the affected share content when a comment is resolved.

Why it matters:

The acceptance criteria still claim reconnect catches up on missed events from KV, but the plan does not include the only design change that would make missed resolves reliably recoverable.

Suggested fix:

- Add an explicit todo item to push the affected share content from `mergeComment()` after a successful resolve, or
- narrow the acceptance criteria so reconnect recovery does not claim to cover missed resolves yet.

### 3. The planned `close()` path always reconnects, so lazy disconnect cannot work as designed

Reference:

- `docs/features/realtime-comments-spec.md:208-214`
- `docs/features/realtime-comments-spec.md:444`
- `docs/features/realtime-comments-todos.md:437-440`
- `docs/features/realtime-comments-todos.md:502-518`
- `docs/features/realtime-comments-todos.md:532-533`

Problem:

The lifecycle says the socket closes when no subscriptions remain, and the optimization section says it closes after 5 minutes of inactivity. But the todo's relay client schedules reconnect on every `close` event, and `close()` itself has no "intentional shutdown" flag.

That means:

- close because there are no subscriptions -> reconnect
- close because of inactivity timeout -> reconnect
- close because app is cleaning up -> reconnect

Why it matters:

This breaks the lazy-connect/lazy-disconnect design at the protocol layer. The plan cannot satisfy its own lifecycle rules without a way to distinguish expected closes from failures.

Suggested fix:

- Add a `shouldReconnect` or `isClosing` flag.
- Only call `scheduleReconnect()` for unexpected socket closes.

### 4. Host reconnect catch-up still does not meet the spec’s own multi-share guarantees

Reference:

- `docs/features/realtime-comments-spec.md:98-100`
- `docs/features/realtime-comments-spec.md:219-221`
- `docs/features/realtime-comments-spec.md:408-409`
- `docs/features/realtime-comments-todos.md:679-685`

Problem:

The spec says active shares are subscribed and reconnect catch-up uses KV so no comments are lost. But the todo’s reconnect path for host mode still fetches pending comments only for the active tab and explicitly leaves background tabs to catch up later when the user switches to them.

Why it matters:

That violates the acceptance story for a host with multiple shared tabs. Comments for non-active shares can remain stale until user action, which is exactly what the acceptance criteria say should not be required.

Suggested fix:

- On reconnect, iterate all active subscribed docIds or all active shares across all tabs, not just the active tab.
- If that cost is intentionally deferred, document the limitation in the spec and relax the acceptance criteria.

## MEDIUM

### 5. The relay client examples still have an inbound ordering race for add vs resolve

Reference:

- `docs/features/realtime-comments-spec.md:422`
- `docs/features/realtime-comments-todos.md:384-431`
- `docs/features/realtime-comments-todos.md:552-577`

Problem:

The relay client processes inbound frames in an `async` WebSocket message handler and awaits decrypt/parse before calling `onMessage`. That means two frames can be received in order but applied out of order if the later decrypt finishes first.

For `comment:added` and `comment:resolved`, that is not harmless:

- `comment:resolved` can be applied first and no-op
- `comment:added` can then apply later
- the peer ends up showing a comment that has already been resolved

The spec’s current mitigation for ordering issues is "deduplicate by comment ID," but dedup does not solve add-after-resolve reordering.

Suggested fix:

- Serialize inbound message handling per connection or per `docId`, or
- add per-comment versioning / tombstones so stale `comment:added` frames can be dropped after a resolve.

### 6. The host-side live-delivery example does not update any host notification metadata

Reference:

- `docs/features/realtime-comments-spec.md:91-95`
- `docs/features/realtime-comments-todos.md:595-614`

Problem:

The todo’s `handleHostMessage()` example appends the comment to `pendingComments`, but it does not update any per-share pending count or other notification metadata.

Why it matters:

The spec’s user-facing story is that realtime delivery replaces manual checking. If the arrival path only mutates the hidden comment array and does not update the visible host notification model, the host can still miss incoming feedback unless the relevant panel is already open.

Suggested fix:

- Update the matching share record’s pending count in the same state transition.
- Keep the notification path aligned with however host users currently notice pending feedback.

## LOW

### 7. The spec still says "no heartbeats" while also requiring a 30-second ping

Reference:

- `docs/features/realtime-comments-spec.md:28`
- `docs/features/realtime-comments-spec.md:215`
- `docs/features/realtime-comments-spec.md:440`

Problem:

The scope says request optimization is "event-driven only (no heartbeats/polling)," but the lifecycle and optimization sections explicitly require a keep-alive ping every 30 seconds.

Suggested fix:

- Remove the "no heartbeats" wording, or
- restate it as "no polling; minimal keep-alive ping only."

### 8. The optimization table still includes debounced edits even though realtime edits are out of scope

Reference:

- `docs/features/realtime-comments-spec.md:22`
- `docs/features/realtime-comments-spec.md:38`
- `docs/features/realtime-comments-spec.md:445`

Problem:

Realtime edit/delete are deferred to v2, but the optimization table still budgets for "Debounced edits."

Suggested fix:

- Remove that row for v1, or
- relabel it as future work tied to the edit/delete phase.

### 9. One reconnect checklist note in the todo still points at the old host-only model

Reference:

- `docs/features/realtime-comments-todos.md:645-678`
- `docs/features/realtime-comments-todos.md:853-854`

Problem:

The main reconnect sample now shows the peer-specific two-step catch-up path, but the later checklist note still says reconnect iterates `rtSubscriptions` and calls `fetchPendingComments(docId)` for each.

Suggested fix:

- Update the checklist note to match the main reconnect sample.

### Residual note

This fifth review is intentionally docs-only. It does not make any claims about whether the current source tree already implements or fixes these design points.

## Sixth Review (Docs Only)

This pass again reviews only:

- `docs/features/realtime-comments-spec.md`
- `docs/features/realtime-comments-todos.md`

The old migration finding no longer applies. The docs now use `new_sqlite_classes`, so the previous Workers Free deployment blocker is fixed.

## BLOCKING

### 1. The docs still disagree on whether this is one DO per document or one shared hub

Reference:

- `docs/features/realtime-comments-spec.md:19`
- `docs/features/realtime-comments-spec.md:60`
- `docs/features/realtime-comments-spec.md:83`
- `docs/features/realtime-comments-spec.md:304`
- `docs/features/realtime-comments-todos.md:112-115`

Problem:

The scope still says "one room per shared document," but the architecture, interface section, and todo all describe a single relay hub Durable Object multiplexed by `docId`.

Why it matters:

Those are not wording variants. They are different topologies with different connection counts, routing logic, hibernation behavior, and scaling characteristics.

Suggested fix:

- Remove the "one room per shared document" language.
- State consistently that v1 uses one relay hub DO with per-socket subscriptions keyed by `docId`.

### 2. The planned connection lifecycle still cannot satisfy its own lazy-close rules

Reference:

- `docs/features/realtime-comments-spec.md:208-215`
- `docs/features/realtime-comments-spec.md:444`
- `docs/features/realtime-comments-todos.md:437-440`
- `docs/features/realtime-comments-todos.md:502-518`
- `docs/features/realtime-comments-todos.md:532-533`

Problem:

The spec says the socket closes when no subscriptions remain and may also close after 5 minutes of inactivity. But the todo’s relay client schedules reconnect on every socket `close`, and the `close()` path has no flag for intentional shutdown.

Why it matters:

The current plan would reconnect after:

- expected cleanup
- inactivity timeout
- zero-subscription close

So the design cannot actually deliver its own lazy-connect/lazy-disconnect behavior as written.

Suggested fix:

- Add an explicit intentional-close flag such as `shouldReconnect`.
- Only schedule reconnect for unexpected disconnects.

### 3. Host reconnect catch-up still contradicts the no-user-action acceptance story

Reference:

- `docs/features/realtime-comments-spec.md:98-100`
- `docs/features/realtime-comments-spec.md:219-221`
- `docs/features/realtime-comments-spec.md:408-409`
- `docs/features/realtime-comments-todos.md:867-870`

Problem:

The spec says reconnect catch-up from KV prevents missed comments, but the todo still limits host reconnect catch-up to the active tab and explicitly leaves background tabs to catch up later on tab switch.

Why it matters:

That means a host with multiple active shared tabs still has a user-action-dependent gap, which conflicts with the acceptance language that the app falls back and catches up with no user action required.

Suggested fix:

- Catch up all active subscribed `docId`s across tabs on reconnect, or
- document the active-tab limitation in the spec and relax the acceptance criteria.

## MEDIUM

### 4. The spec is internally inconsistent about subscribe retry timing

Reference:

- `docs/features/realtime-comments-spec.md:187`
- `docs/features/realtime-comments-spec.md:212`
- `docs/features/realtime-comments-todos.md:393-404`

Problem:

The connection-parameters section says a failed subscribe retries on the next reconnection cycle, while the lifecycle section and todo say failed subscribes retry with backoff while the socket remains open.

Why it matters:

These produce different user behavior and different failure windows for newly created shares under KV eventual consistency.

Suggested fix:

- Pick one retry policy and describe it consistently.
- The todo already points toward the better option: retry while the socket stays open.

### 5. The relay client design still has an inbound ordering race for add vs resolve

Reference:

- `docs/features/realtime-comments-spec.md:422`
- `docs/features/realtime-comments-todos.md:384-431`
- `docs/features/realtime-comments-todos.md:552-577`

Problem:

Inbound WebSocket frames are handled in an `async` message callback, and decrypt/parse is awaited before state application. Two frames can therefore be received in order but applied out of order.

For `comment:added` and `comment:resolved`, that can leave a resolved comment visible if the resolve is processed first and the add lands later.

Why it matters:

The spec currently treats deduplication by ID as the ordering mitigation, but dedup does not solve add-after-resolve reordering.

Suggested fix:

- Serialize inbound processing per connection or per `docId`, or
- add enough metadata to drop stale add events after a resolve.

## LOW

### 6. The overview still claims realtime edit/delete even though the scope defers them

Reference:

- `docs/features/realtime-comments-spec.md:5`
- `docs/features/realtime-comments-spec.md:22`
- `docs/features/realtime-comments-spec.md:38`

Problem:

The overview says peers can add, edit, or delete comments in realtime, but the scope explicitly defers realtime edit/delete to v2.

Suggested fix:

- Update the overview to say v1 covers add and resolve only.

### 7. The spec still says "no heartbeats" while requiring a 30-second ping

Reference:

- `docs/features/realtime-comments-spec.md:28`
- `docs/features/realtime-comments-spec.md:215`
- `docs/features/realtime-comments-spec.md:440`

Problem:

The scope says "event-driven only (no heartbeats/polling)," but the lifecycle and optimization sections explicitly require a keep-alive ping.

Suggested fix:

- Rephrase this as "no polling; minimal keep-alive ping only."

### 8. The optimization table still budgets for debounced edits even though edits are out of scope

Reference:

- `docs/features/realtime-comments-spec.md:22`
- `docs/features/realtime-comments-spec.md:38`
- `docs/features/realtime-comments-spec.md:445`

Problem:

Realtime edit/delete are deferred, but the optimization table still includes "Debounced edits" as a v1 traffic strategy.

Suggested fix:

- Remove that row for v1, or
- mark it explicitly as future work for the edit/delete phase.

### Residual note

This sixth review is docs-only and supersedes older findings that were already fixed in the docs, such as the previous `new_classes` migration issue.

## Seventh Review (Docs Only)

This pass again reviews only:

- `docs/features/realtime-comments-spec.md`
- `docs/features/realtime-comments-todos.md`

Several older doc issues are now fixed:

- the migration examples use `new_sqlite_classes`
- the topology is now consistently described as a single hub DO
- the intentional-close reconnect bug is addressed with `closedIntentionally`
- the overview/scope mismatch around edit/delete is fixed
- the "no heartbeats" and "debounced edits" wording issues are fixed

What remains are a smaller set of real design inconsistencies.

## BLOCKING

### 1. The new zombie-comment mitigation is not actually applied in the KV catch-up path it is meant to protect

Reference:

- `docs/features/realtime-comments-spec.md:426`
- `docs/features/realtime-comments-todos.md:569-573`
- `docs/features/realtime-comments-todos.md:687-703`

Problem:

The spec now adds a specific mitigation for relay/KV reordering: track resolved comment IDs in `resolvedCommentIds` and skip late `comment:added` events for those IDs.

The todo applies that guard in `handlePeerMessage()` for relay-delivered `comment:added`, but it does not apply the same guard in the peer reconnect KV catch-up path. The reconnect code filters out:

- `myPeerComments`
- `submittedPeerCommentIds`
- `remotePeerComments`

but it does not filter out `resolvedCommentIds`.

Why it matters:

This is the exact scenario the new risk row is trying to solve: `comment:resolved` arrives first via relay, then reconnect catch-up imports the same comment from KV and recreates a zombie comment. The documented mitigation currently does not cover the documented failure mode.

Suggested fix:

- Exclude IDs in `resolvedCommentIds` when merging KV comments during peer reconnect catch-up.
- Update the tests to cover the relay-first / KV-later reorder case specifically.

### 2. Host reconnect behavior still conflicts with the acceptance criteria

Reference:

- `docs/features/realtime-comments-spec.md:409`
- `docs/features/realtime-comments-todos.md:900-903`

Problem:

Acceptance criterion 4 still says fallback to async KV mode works with no user action required, but the todo still says host reconnect catch-up only covers the active tab and background tabs catch up only when the user switches to them.

Why it matters:

That is still a user-action-dependent recovery path for a host with multiple shared tabs. As written, the acceptance criteria and the plan still do not describe the same behavior.

Suggested fix:

- Either catch up all active subscribed `docId`s across all tabs on reconnect, or
- relax the acceptance criterion so it does not promise no-user-action recovery for background tabs.

## MEDIUM

### 3. Subscribe retry timing is still described two different ways

Reference:

- `docs/features/realtime-comments-spec.md:187`
- `docs/features/realtime-comments-spec.md:212`
- `docs/features/realtime-comments-todos.md:396-407`

Problem:

The connection-parameters section still says subscribe failures retry on the next reconnection cycle, while the lifecycle section and todo say retries happen with backoff while the socket remains open.

Why it matters:

That is a real behavior difference for freshly created shares under KV eventual consistency, and it affects how quickly realtime starts working after share creation.

Suggested fix:

- Keep the "retry while socket remains open" behavior.
- Update the earlier spec section to match.

### 4. The state model is still out of sync with the new `resolvedCommentIds` mitigation

Reference:

- `docs/features/realtime-comments-spec.md:191-197`
- `docs/features/realtime-comments-spec.md:426`
- `docs/features/realtime-comments-todos.md:83-108`

Problem:

The spec’s state additions list still does not include `resolvedCommentIds`, even though the risks section now depends on that set as a core mitigation. The todo adds the field, but its persist note still only says to exclude `rtSocket`, `rtSubscriptions`, and `documentUpdateAvailable`.

Why it matters:

An implementer following the state model section can miss a field the risk mitigation depends on, and the persist note is now stale for a field that is clearly transient.

Suggested fix:

- Add `resolvedCommentIds` to the spec’s state additions section.
- Update the persist note so `resolvedCommentIds` is also excluded from persistence.

## LOW

### 5. Acceptance criterion 4 says the host reconnect limitation is documented in the spec, but it currently is not

Reference:

- `docs/features/realtime-comments-spec.md:409`
- `docs/features/realtime-comments-spec.md:428-434`

Problem:

Criterion 4 says active-tab-only host catch-up is documented in §5.3 and §9, but the checked text in those sections does not actually spell out that limitation.

Suggested fix:

- Add the host reconnect limitation explicitly to the spec, or
- remove the claim that it is already documented there.

### Residual note

This seventh review is docs-only and supersedes older doc findings that have since been fixed.

## Eighth Review (Docs Only)

This pass again reviews only:

- `docs/features/realtime-comments-spec.md`
- `docs/features/realtime-comments-todos.md`

Claude was right about several of the latest fixes. These previous findings are now resolved in the docs:

- `resolvedCommentIds` is now included in the spec state model.
- The persist note now excludes `resolvedCommentIds`.
- Subscribe retry timing is now consistent: both spec sections say retries happen with backoff while the socket remains open.
- The peer reconnect KV catch-up path now filters out `resolvedCommentIds`, so the zombie-comment mitigation is actually applied where it needs to be.

## BLOCKING

### 1. Host reconnect behavior still conflicts with acceptance criterion 4

Reference:

- `docs/features/realtime-comments-spec.md:412`
- `docs/features/realtime-comments-todos.md:901-904`

Problem:

Acceptance criterion 4 still says the app falls back to async KV mode with no user action required, but the todo still says host reconnect catch-up only covers the active tab and that background tabs catch up on switch.

Why it matters:

That is still a user-action-dependent recovery path for a host with multiple shared tabs. The acceptance criteria and the implementation plan are still promising different behavior.

Suggested fix:

- Either catch up all active subscribed `docId`s across all tabs on reconnect, or
- relax criterion 4 so it does not promise no-user-action recovery for background tabs.

## LOW

### 2. Criterion 4 still claims the host reconnect limitation is documented in the spec, but it is not

Reference:

- `docs/features/realtime-comments-spec.md:412`
- `docs/features/realtime-comments-spec.md:431-438`

Problem:

Criterion 4 says the active-tab-only host catch-up limitation is documented in §5.3 and §9, but the spec text in those sections still does not actually spell that limitation out.

Suggested fix:

- Add the host reconnect limitation explicitly to the spec, or
- remove the claim that it is already documented there.

### Residual note

This eighth review is docs-only and supersedes the seventh review where those now-fixed issues were still open.

## Ninth Review (Docs Only)

This pass again reviews only:

- `docs/features/realtime-comments-spec.md`
- `docs/features/realtime-comments-todos.md`

## Findings

No new docs-only findings.

The last remaining acceptance/catch-up mismatch is now aligned:

- the spec explicitly documents the active-tab-only host reconnect limitation in §5.3
- acceptance criterion 4 now matches that limitation instead of overpromising
- the todo still matches the same behavior

At this point, the remaining concerns are documented limitations or planned implementation work, not unresolved contradictions inside the docs themselves.

### Residual risks still intentionally documented

- bulk KV comment deletion is still called out as a must-fix issue before implementation
- host reconnect catch-up remains active-tab-only in v1
- relay/KV reorder risk is mitigated via `resolvedCommentIds`

### Residual note

This ninth review is docs-only and found no fresh design inconsistencies in the current spec/todo set.

## Tenth Review (Technical Design)

This pass reviews the dedicated technical design set:

- `docs/features/realtime-comments/technical-design.md`
- `docs/features/realtime-comments/spec.md`
- `docs/features/realtime-comments/todos.md`

## BLOCKING

### 1. Resolve tombstone is still session-scoped

Reference:

- `docs/features/realtime-comments/technical-design.md:112-145`
- `docs/features/realtime-comments/technical-design.md:120-128`
- `docs/features/realtime-comments/todos.md:827-847`

Problem:

The technical design describes `resolvedCommentIds` as the mitigation for relay/KV reordering, but it also says that set is global non-persisted state. The implementation plan broadcasts `comment:resolved` first and only then auto-pushes updated content with `updateShare(docId)`.

That leaves a reload window:

- peer receives `comment:resolved`
- peer stores the tombstone only in transient memory
- peer reloads before `updateShare(docId)` finishes and the new content is durable
- tombstone is gone, KV/content are still stale, and the comment can reappear on reconnect

Why it matters:

The current zombie-comment mitigation is only reliable within the same session. It does not fully protect against reloads or tab crashes in the resolve-before-push window.

Suggested fix:

- Make resolution durable before broadcasting, or
- introduce a durable tombstone/version mechanism instead of relying only on transient `resolvedCommentIds`.

## MEDIUM

### 2. “KV is the source of truth on reconnect” overstates the actual recovery model

Reference:

- `docs/features/realtime-comments/technical-design.md:56`
- `docs/features/realtime-comments/technical-design.md:114`
- `docs/features/realtime-comments/spec.md:239`

Problem:

The summary says KV is the source of truth on reconnect, but the actual design also depends on:

- transient `resolvedCommentIds`
- content reload to recover missed resolves
- an active-tab-only host catch-up limitation

That is more nuanced than a pure KV truth model.

Why it matters:

This can mislead an implementer into assuming reconnect state is fully reconstructible from KV alone, which the current design does not actually guarantee.

Suggested fix:

- Rephrase this as something like “KV is the primary durable catch-up layer on reconnect.”

### 3. Modified-files ownership points to the wrong module

Reference:

- `docs/features/realtime-comments/technical-design.md:169`
- `docs/features/realtime-comments/todos.md:803-824`
- `docs/features/realtime-comments/todos.md:856-873`

Problem:

The modified-files table says `src/services/shareSync.ts` handles broadcasting `comment:added` after KV post in `syncPeerComments`, but the implementation plan places that work in the store action and uses `shareSync.ts` only for `document:updated` after `updateShare()`.

Why it matters:

This sends an implementer to the wrong module and blurs ownership between store/state logic and share-sync service logic.

Suggested fix:

- Change the table entry so `src/services/shareSync.ts` is responsible only for `document:updated` after `updateShare()`.
- Attribute `comment:added` post-sync broadcasting to `src/store/index.ts`.

## LOW

### 4. “Everything from v2 remains unchanged” is misleading

Reference:

- `docs/features/realtime-comments/technical-design.md:70`

Problem:

This sentence sits directly above sections that add new state, new files, modified files, and required pre-implementation changes. It reads like a broader behavioral claim than intended.

Why it matters:

It adds avoidable ambiguity to a design doc whose job is to clarify exactly what changes.

Suggested fix:

- Narrow the wording to something like “No new npm dependencies” or “Existing platform choices remain.”

### Residual note

This technical-design review is separate from the earlier spec/todo-only rounds. The dedicated design set is mostly consistent, but the resolve durability window still needs a stronger answer before implementation.

## Eleventh Review (Technical Design)

This pass reviews the updated dedicated design set:

- `docs/features/realtime-comments/technical-design.md`
- `docs/features/realtime-comments/spec.md`
- `docs/features/realtime-comments/todos.md`

Several prior technical-design findings are fixed:

- the summary no longer overstates KV as the sole reconnect truth source
- the “everything from v2 remains unchanged” wording is tightened
- modified-file ownership for `comment:added` vs `document:updated` is now corrected
- the resolve flow now requires auto-push before broadcasting `comment:resolved`

## BLOCKING

### 1. Auto-push-before-broadcast is still not enough to make resolves durable

Reference:

- `docs/features/realtime-comments/technical-design.md:112-145`
- `docs/features/realtime-comments/todos.md:827-858`
- `docs/features/realtime-comments/todos.md:904-914`

Problem:

The updated design now treats “push content to KV before broadcasting `comment:resolved`” as the durable protection against zombie comments. That is only half the story.

Peer reconnect catch-up still does two separate things:

- fetch comment blobs from KV
- reload shared content from KV

Even if the content push happens before the resolve broadcast, the resolved comment can still be resurrected after a reload if the comment blob remains in KV when reconnect catch-up runs. `resolvedCommentIds` is transient and disappears on reload, so it cannot protect that case.

In other words:

- content durability alone is not sufficient
- comment persistence also has to reflect the resolve durably before reconnect catch-up reads it

Why it matters:

The current design still has a reload/reconnect path where a resolved comment can come back unless per-comment deletion or a durable tombstone/version is ordered correctly with the resolve flow.

Suggested fix:

- Define the full durable resolve sequence, not just the content push sequence.
- Either:
  - delete the specific comment from KV before broadcasting `comment:resolved`, or
  - write a durable tombstone/version that reconnect catch-up can use to suppress the stale KV comment blob.
- Make that ordering explicit in the technical design, not just in the todos.

## MEDIUM

### 2. The modified-files table still omits the Worker comment-route change required by the design

Reference:

- `docs/features/realtime-comments/technical-design.md:143`
- `docs/features/realtime-comments/technical-design.md:165`

Problem:

Section 8 says per-comment KV deletion is a required pre-implementation change and explicitly requires a new `DELETE /comments/:docId/:cmtId` Worker endpoint. But the modified-files table only describes `worker/src/index.ts` as adding the `/relay` route/export and does not mention the comment-route change.

Why it matters:

This under-scopes the Worker changes in the design inventory and can mislead an implementer into thinking the Worker entrypoint only needs relay wiring.

Suggested fix:

- Update the `worker/src/index.ts` row to include the new per-comment delete route as well as the relay route/export.

### 3. The cost estimate is no longer internally consistent with the required resolve flow

Reference:

- `docs/features/realtime-comments/technical-design.md:145`
- `docs/features/realtime-comments/technical-design.md:143`
- `docs/features/realtime-comments/technical-design.md:191-193`

Problem:

The cost table still says KV writes are “unchanged from v2 (comment persistence),” but the design now requires at least two additional write-producing behaviors:

- pushing updated share content after resolves
- per-comment delete/tombstone work for resolved comments

Why it matters:

This does not make the design invalid, but it does mean the capacity/cost section is understating the new storage traffic introduced by the design itself.

Suggested fix:

- Update the KV write estimate to account for share-content updates after resolve and per-comment resolve persistence work.
- If the exact number is unknown, mark it as increased-from-v2 and estimate by resolved-comment frequency.

### Residual note

This eleventh review focuses on the updated technical design. The docs are in better shape, but the design still needs one complete durable-resolve story that covers both content KV and comment KV together.
