import type {
  RelaySubscriptionPhase,
  RelaySubscriptionRole,
} from "../../types/relay";

export interface RelayDiagnosticEntry {
  at: string;
  kind: "frame" | "subscription" | "rejection";
  docId: string | null;
  subscriptionId: string | null;
  role: RelaySubscriptionRole | null;
  frameType: string | null;
  frameBytes: number | null;
  phase: RelaySubscriptionPhase | null;
  reason: string | null;
}

const MAX_DIAGNOSTIC_ENTRIES = 100;
let entries: RelayDiagnosticEntry[] = [];

export function recordRelayDiagnostic(
  entry: Omit<RelayDiagnosticEntry, "at">,
): void {
  entries = [...entries, { ...entry, at: new Date().toISOString() }].slice(
    -MAX_DIAGNOSTIC_ENTRIES,
  );
}

export function getRelayDiagnostics(): RelayDiagnosticEntry[] {
  return [...entries];
}

export function resetRelayDiagnostics(): void {
  entries = [];
}
