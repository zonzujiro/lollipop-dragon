import { useAppStore } from "../../store";
import "./ContentUpdateBanner.css";

export function ContentUpdateBanner() {
  const documentUpdateAvailable = useAppStore((state) => state.documentUpdateAvailable);
  const loadSharedContent = useAppStore((state) => state.loadSharedContent);
  const dismissDocumentUpdate = useAppStore((state) => state.dismissDocumentUpdate);

  if (!documentUpdateAvailable) {
    return null;
  }

  function handleRefresh(): void {
    dismissDocumentUpdate();
    loadSharedContent().catch((error) => {
      console.warn("[ContentUpdateBanner] refresh failed:", error);
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
        ×
      </button>
    </div>
  );
}
