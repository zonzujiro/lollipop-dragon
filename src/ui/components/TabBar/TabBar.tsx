import "./TabBar.css";
import { useAppStore } from "../../../store";
import { buildCommentThreadGroups } from "../../../markup";

function TabKindIcon({ folder }: { folder: boolean }) {
  if (folder) {
    return (
      <svg
        className="tab-bar__kind-icon"
        data-kind="folder"
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M3 6a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
      </svg>
    );
  }

  return (
    <svg
      className="tab-bar__kind-icon"
      data-kind="file"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
      <path d="M14 2v6h6" />
    </svg>
  );
}

function getTabCommentCount(
  tab: ReturnType<typeof useAppStore.getState>["tabs"][number],
) {
  if (tab.directoryName) {
    return Object.values(tab.allFileComments).reduce(
      (total, entry) => total + buildCommentThreadGroups(entry.comments).length,
      0,
    );
  }
  return buildCommentThreadGroups(tab.comments).length;
}

export function TabBar() {
  const tabs = useAppStore((s) => s.tabs);
  const activeTabId = useAppStore((s) => s.activeTabId);
  const switchTab = useAppStore((s) => s.switchTab);
  const removeTab = useAppStore((s) => s.removeTab);
  const openFileInNewTab = useAppStore((s) => s.openFileInNewTab);

  return (
    <div className="tab-bar" role="navigation" aria-label="Workspaces">
      <div
        className="tab-bar__tabs"
        role="tablist"
        aria-label="Open workspaces"
      >
        {tabs.map((tab) => {
          const commentCount = getTabCommentCount(tab);
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={tab.id === activeTabId}
              className={`tab-bar__tab${tab.id === activeTabId ? " tab-bar__tab--active" : ""}`}
              onClick={() => {
                void switchTab(tab.id).catch((error: unknown) => {
                  console.warn("[workspace] failed to switch tab:", error);
                });
              }}
              title={tab.directoryName ?? tab.fileName ?? tab.label}
            >
              <TabKindIcon folder={Boolean(tab.directoryName)} />
              <span className="tab-bar__label">
                {tab.directoryName ?? tab.fileName ?? tab.label}
              </span>
              {commentCount > 0 && (
                <span
                  className="tab-bar__badge"
                  aria-label={`${commentCount} open comments`}
                >
                  {commentCount}
                </span>
              )}
              <span
                className="tab-bar__close"
                role="button"
                tabIndex={0}
                aria-label={`Close ${tab.label}`}
                onClick={(e) => {
                  e.stopPropagation();
                  removeTab(tab.id);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.stopPropagation();
                    removeTab(tab.id);
                  }
                }}
              >
                &times;
              </span>
            </button>
          );
        })}
        <button
          className="tab-bar__add"
          aria-label="Open file in new tab"
          title="Open file in new tab"
          onClick={() => {
            void openFileInNewTab();
          }}
        >
          +
        </button>
      </div>
    </div>
  );
}
