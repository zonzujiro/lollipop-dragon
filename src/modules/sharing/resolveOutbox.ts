const RESOLVE_OUTBOX_KEY = "markreview-resolve-outbox-v1";

function isStringArrayMap(value: unknown): value is Record<string, string[]> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  return Object.values(value).every(
    (entry) =>
      Array.isArray(entry) && entry.every((item) => typeof item === "string"),
  );
}

interface ResolveOutboxRead {
  ok: boolean;
  value: Record<string, string[]>;
}

function readResolveOutbox(): ResolveOutboxRead {
  try {
    const raw = localStorage.getItem(RESOLVE_OUTBOX_KEY);
    if (!raw) {
      return { ok: true, value: {} };
    }
    const parsed: unknown = JSON.parse(raw);
    if (!isStringArrayMap(parsed)) {
      console.warn("[sharing] invalid resolve outbox; ignoring it");
      return { ok: false, value: {} };
    }
    return { ok: true, value: parsed };
  } catch (error) {
    console.warn("[sharing] failed to load resolve outbox:", error);
    return { ok: false, value: {} };
  }
}

export function loadResolveOutbox(): Record<string, string[]> {
  return readResolveOutbox().value;
}

export function saveResolveOutbox(outbox: Record<string, string[]>): boolean {
  try {
    localStorage.setItem(RESOLVE_OUTBOX_KEY, JSON.stringify(outbox));
    return true;
  } catch (error) {
    console.warn("[sharing] failed to persist resolve outbox:", error);
    return false;
  }
}

export function queueResolveInOutbox(docId: string, cmtId: string): boolean {
  const read = readResolveOutbox();
  if (!read.ok) {
    return false;
  }
  const outbox = read.value;
  const existing = outbox[docId] ?? [];
  if (existing.includes(cmtId)) {
    return true;
  }
  return saveResolveOutbox({
    ...outbox,
    [docId]: [...existing, cmtId],
  });
}

export function confirmResolveInOutbox(docId: string, cmtId: string): boolean {
  const read = readResolveOutbox();
  if (!read.ok) {
    return false;
  }
  const outbox = read.value;
  const existing = outbox[docId] ?? [];
  const remaining = existing.filter((item) => item !== cmtId);
  const next = { ...outbox };
  if (remaining.length > 0) {
    next[docId] = remaining;
  } else {
    delete next[docId];
  }
  return saveResolveOutbox(next);
}
