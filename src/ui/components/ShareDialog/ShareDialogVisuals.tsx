import { truncateShareUrlForDisplay } from "../../../utils/shareUrl";

export function FileScopeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
      <path d="M14 3v6h6" />
    </svg>
  );
}

export function FolderScopeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </svg>
  );
}

export function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="4" y="10" width="16" height="10" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

export function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

export function ShareUrlPreview({ link }: { link: string }) {
  const display = truncateShareUrlForDisplay(link);
  const hashIndex = display.indexOf("#");
  const base = hashIndex === -1 ? display : display.slice(0, hashIndex);
  const fragment = hashIndex === -1 ? null : display.slice(hashIndex);
  return (
    <p className="share-dialog__url" aria-label="Shareable link">
      {base}
      {fragment && (
        <span className="share-dialog__url-fragment">{fragment}</span>
      )}
    </p>
  );
}
