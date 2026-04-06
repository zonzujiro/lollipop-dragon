export function normalizeWorkerUrl(workerUrl: string): string {
  return workerUrl.trim().replace(/\/+$/, "");
}
