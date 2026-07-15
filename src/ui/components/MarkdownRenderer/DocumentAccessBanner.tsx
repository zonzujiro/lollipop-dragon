import {
  getRestoreOpenOtherLabel,
  getRestoreWorkspaceName,
  shouldRenderRestoreBanner,
} from "../../../types/tab";
import type { TabState } from "../../../types/tab";

export type RestoreTabState = Pick<
  TabState,
  "directoryName" | "fileName" | "restoreError"
>;

interface DocumentAccessBannerProps {
  hostTabId: string | null;
  isPeerMode: boolean;
  onOpenOther: () => void;
  onRestoreAccess: () => void;
  restoreTabState: RestoreTabState;
  writeAllowed: boolean;
}

export function DocumentAccessBanner({
  hostTabId,
  isPeerMode,
  onOpenOther,
  onRestoreAccess,
  restoreTabState,
  writeAllowed,
}: DocumentAccessBannerProps) {
  if (!isPeerMode && hostTabId && shouldRenderRestoreBanner(restoreTabState)) {
    return (
      <div className="restore-access-banner" role="status">
        <svg
          className="restore-access-banner__icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <circle cx="11" cy="13" r="2.2" />
          <path d="M13.2 13h4.3m-1.8 0v2" />
        </svg>
        <span className="restore-access-banner__text">
          <strong>
            Live access to “{getRestoreWorkspaceName(restoreTabState)}” was
            dropped when the browser restarted.
          </strong>{" "}
          Keep reading — commenting and agent runs resume once access is
          restored.
        </span>
        <div className="restore-access-banner__actions">
          <button
            className="restore-access-banner__btn restore-access-banner__btn--primary"
            onClick={onRestoreAccess}
          >
            Restore access
          </button>
          <button className="restore-access-banner__btn" onClick={onOpenOther}>
            {getRestoreOpenOtherLabel(restoreTabState)}
          </button>
        </div>
      </div>
    );
  }

  if (!writeAllowed && !isPeerMode) {
    return (
      <div className="readonly-banner" role="status">
        Read-only — write permission was denied or the file is on a read-only
        filesystem. Comments cannot be saved to disk.
      </div>
    );
  }

  return null;
}
