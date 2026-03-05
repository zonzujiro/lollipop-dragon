const rawWorkerUrl: unknown = import.meta.env.VITE_WORKER_URL;
export const WORKER_URL: string | undefined =
  typeof rawWorkerUrl === 'string' ? rawWorkerUrl : undefined;
