import './TabBar.css'
import { useState } from "react";
import { useAppStore } from "../store";

export function TabBar() {
  const tabs = useAppStore((s) => s.tabs);
  const activeTabId = useAppStore((s) => s.activeTabId);
  const switchTab = useAppStore((s) => s.switchTab);
  const removeTab = useAppStore((s) => s.removeTab);
  const openFileInNewTab = useAppStore((s) => s.openFileInNewTab);
  const openDirectoryInNewTab = useAppStore((s) => s.openDirectoryInNewTab);
  const [menuOpen, setMenuOpen] = useState(false);

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
      <div className="tab-bar__add-wrapper">
        <button
          className="tab-bar__add"
          aria-label="Open new tab"
          title="Open new tab"
          onClick={() => setMenuOpen(!menuOpen)}
        >
          +
        </button>
        {menuOpen && (
          <div className="tab-bar__menu">
            <button
              className="tab-bar__menu-item"
              onClick={() => {
                setMenuOpen(false);
                openFileInNewTab();
              }}
            >
              Open file
            </button>
            <button
              className="tab-bar__menu-item"
              onClick={() => {
                setMenuOpen(false);
                openDirectoryInNewTab();
              }}
            >
              Open folder
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
