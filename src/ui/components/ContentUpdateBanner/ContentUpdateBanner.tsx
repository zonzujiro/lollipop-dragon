import { selectDocumentUpdateAvailable } from "../../../modules/relay";
import { useAppStore } from "../../../store";
import "./ContentUpdateBanner.css";

const closeIcon = (
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
);

function BannerActions(props: {
  onRefresh: () => void;
  onDismiss: () => void;
}) {
  return (
    <>
      <button
        className="content-update-banner__refresh"
        type="button"
        onClick={props.onRefresh}
      >
        Refresh
      </button>
      <button
        className="content-update-banner__dismiss"
        type="button"
        onClick={props.onDismiss}
        aria-label="Dismiss"
      >
        {closeIcon}
      </button>
    </>
  );
}

export function ContentUpdateBanner() {
  const documentUpdateAvailable = useAppStore(selectDocumentUpdateAvailable);
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
      .catch((error: unknown) => {
        console.warn("[ContentUpdateBanner] refresh failed:", error);
      });
  }

  return (
    <div className="content-update-banner">
      <span>The shared document has been updated.</span>
      <BannerActions
        onRefresh={handleRefresh}
        onDismiss={dismissDocumentUpdate}
      />
    </div>
  );
}
