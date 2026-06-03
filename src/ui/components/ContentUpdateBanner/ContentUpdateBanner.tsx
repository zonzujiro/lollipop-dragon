import { selectDocumentUpdateAvailable } from "../../../modules/relay";
import { selectHasPeerLocalCommentWork } from "../../../modules/peer-review";
import { useAppStore } from "../../../store";
import "./ContentUpdateBanner.css";

export function ContentUpdateBanner() {
  const documentUpdateAvailable = useAppStore(selectDocumentUpdateAvailable);
  const hasPeerLocalCommentWork = useAppStore(selectHasPeerLocalCommentWork);
  const loadSharedContent = useAppStore((state) => state.loadSharedContent);
  const dismissDocumentUpdate = useAppStore(
    (state) => state.dismissDocumentUpdate,
  );

  if (!documentUpdateAvailable) {
    return null;
  }

  function handleRefresh(): void {
    loadSharedContent({ discardUnsubmitted: true })
      .then(() => {
        dismissDocumentUpdate();
      })
      .catch((error: unknown) => {
        console.warn("[ContentUpdateBanner] refresh failed:", error);
      });
  }

  return (
    <div className="content-update-banner">
      <span>
        {hasPeerLocalCommentWork
          ? "The shared document changed. Refresh to continue reviewing. Unsent comments will be discarded."
          : "The shared document has been updated. Refresh to continue reviewing."}
      </span>
      <button
        className="content-update-banner__refresh"
        type="button"
        onClick={handleRefresh}
      >
        Refresh
      </button>
    </div>
  );
}
