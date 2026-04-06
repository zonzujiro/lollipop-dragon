import { normalizeWorkerUrl } from "./utils/workerUrl";

const rawWorkerUrl: unknown = import.meta.env.VITE_WORKER_URL;

function resolveWorkerUrl(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalizedUrl = normalizeWorkerUrl(value);
  if (!normalizedUrl) {
    return undefined;
  }
  return normalizedUrl;
}

export const WORKER_URL: string | undefined = resolveWorkerUrl(rawWorkerUrl);
