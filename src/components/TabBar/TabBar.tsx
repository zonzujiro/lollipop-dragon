import "./TabBar.css";
import { useAppStore } from "../../store";

export function TabBar() {
  const tabs = useAppStore((s) => s.tabs);
  const activeTabId = useAppStore((s) => s.activeTabId);
  const switchTab = useAppStore((s) => s.switchTab);
  const removeTab = useAppStore((s) => s.removeTab);

  return (
    <div className="tab-bar">
      <div className="tab-bar__tabs" role="tablist">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={tab.id === activeTabId}
            className={`tab-bar__tab${tab.id === activeTabId ? " tab-bar__tab--active" : ""}`}
            onClick={() => switchTab(tab.id)}
            title={tab.directoryName ?? tab.fileName ?? tab.label}
          >
            <span className="tab-bar__label">
              {tab.directoryName ?? tab.fileName ?? tab.label}
            </span>
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
        ))}
      </div>
    </div>
  );
}
