import { useAppStore } from "../../store";
import "./ContentUpdateBanner.css";

export function ContentUpdateBanner() {
  const documentUpdateAvailable = useAppStore(
    (state) => state.documentUpdateAvailable,
  );
  const loadSharedContent = useAppStore((state) => state.loadSharedContent);
  const dismissDocumentUpdate = useAppStore(
    (state) => state.dismissDocumentUpdate,
  );

  if (!documentUpdateAvailable) {
    return null;
  }

  function handleRefresh(): void {
    loadSharedContent()
      .then(() => {
        dismissDocumentUpdate();
      })
      .catch((error) => {
        console.warn("[ContentUpdateBanner] refresh failed:", error);
        // Don't dismiss — banner stays visible so user can retry
      });
  }

  return (
    <div className="content-update-banner">
      <span>The shared document has been updated.</span>
      <button
        className="content-update-banner__refresh"
        type="button"
        onClick={handleRefresh}
      >
        Refresh
      </button>
      <button
        className="content-update-banner__dismiss"
        type="button"
        onClick={dismissDocumentUpdate}
        aria-label="Dismiss"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <path d="M1 1l12 12M13 1L1 13" />
        </svg>
      </button>
    </div>
  );
}
