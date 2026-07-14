import "./CommandPalette.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAppStore } from "../../../store";
import { useActiveTab } from "../../../store/selectors";

interface CommandAction {
  id: string;
  group: "Review" | "Navigate" | "View" | "Workspace";
  label: string;
  hint?: string;
  run: () => void | Promise<void>;
}

interface Props {
  onShare?: () => void;
}

export function CommandPalette({ onShare }: Props) {
  const tab = useActiveTab();
  const theme = useAppStore((state) => state.theme);
  const setTheme = useAppStore((state) => state.setTheme);
  const toggleSidebar = useAppStore((state) => state.toggleSidebar);
  const toggleCommentPanel = useAppStore((state) => state.toggleCommentPanel);
  const toggleFocusMode = useAppStore((state) => state.toggleFocusMode);
  const enterPresentationMode = useAppStore(
    (state) => state.enterPresentationMode,
  );
  const openFileInNewTab = useAppStore((state) => state.openFileInNewTab);
  const openDirectoryInNewTab = useAppStore(
    (state) => state.openDirectoryInNewTab,
  );
  const openAgentSettings = useAppStore((state) => state.openAgentSettings);
  const startAgentRun = useAppStore(
    (state) => state.startAddressCommentsAgentRun,
  );
  const navigateToComment = useAppStore((state) => state.navigateToComment);
  const showToast = useAppStore((state) => state.showToast);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const actions = useMemo<CommandAction[]>(() => {
    const nextActions: CommandAction[] = [];
    if (tab && tab.comments.length > 0) {
      nextActions.push({
        id: "run-agent",
        group: "Review",
        label: `Run agent on ${tab.comments.length} open comments`,
        hint: "⌘↵",
        run: async () => {
          const result = await startAgentRun();
          if (result.status === "unavailable") {
            showToast(result.message);
          }
        },
      });
    }
    if (onShare) {
      nextActions.push({
        id: "share",
        group: "Review",
        label: "Share current document",
        run: onShare,
      });
    }
    if (tab) {
      for (const entry of Object.values(tab.allFileComments).sort(
        (left, right) => left.filePath.localeCompare(right.filePath),
      )) {
        const firstComment = entry.comments[0];
        nextActions.push({
          id: `file-${entry.filePath}`,
          group: "Navigate",
          label: entry.filePath,
          hint: `${entry.comments.length} open`,
          run: () => {
            if (firstComment) {
              navigateToComment(entry.filePath, firstComment.rawStart);
            }
          },
        });
      }
      nextActions.push(
        {
          id: "toggle-sidebar",
          group: "View",
          label: "Toggle file rail",
          hint: "⌘B",
          run: toggleSidebar,
        },
        {
          id: "toggle-comments",
          group: "View",
          label: "Toggle comment rail",
          hint: "⌘\\",
          run: toggleCommentPanel,
        },
        {
          id: "presentation",
          group: "View",
          label: "Enter presentation mode",
          hint: "⌘P",
          run: enterPresentationMode,
        },
        {
          id: "focus",
          group: "View",
          label: "Toggle focus mode",
          run: toggleFocusMode,
        },
      );
    }
    nextActions.push(
      {
        id: "theme",
        group: "View",
        label: `Use ${theme === "dark" ? "light" : "dark"} theme`,
        run: () => setTheme(theme === "dark" ? "light" : "dark"),
      },
      {
        id: "open-file",
        group: "Workspace",
        label: "Open file in new tab",
        hint: "⌘T",
        run: openFileInNewTab,
      },
      {
        id: "open-folder",
        group: "Workspace",
        label: "Open folder in new tab",
        run: openDirectoryInNewTab,
      },
      {
        id: "agent-settings",
        group: "Workspace",
        label: "Agent settings",
        run: openAgentSettings,
      },
    );
    return nextActions;
  }, [
    enterPresentationMode,
    navigateToComment,
    onShare,
    openAgentSettings,
    openDirectoryInNewTab,
    openFileInNewTab,
    setTheme,
    showToast,
    startAgentRun,
    tab,
    theme,
    toggleCommentPanel,
    toggleFocusMode,
    toggleSidebar,
  ]);

  const filteredActions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return actions;
    }
    const queryParts = normalizedQuery.split(/\s+/);
    return actions.filter((action) => {
      const searchable = `${action.group} ${action.label}`.toLowerCase();
      return queryParts.every((part) => searchable.includes(part));
    });
  }, [actions, query]);

  const closePalette = useCallback(() => {
    setOpen(false);
    setQuery("");
    setSelectedIndex(0);
    requestAnimationFrame(() => previousFocusRef.current?.focus());
  }, []);

  const runAction = useCallback(
    (action: CommandAction | undefined) => {
      if (!action) {
        return;
      }
      closePalette();
      void action.run();
    },
    [closePalette],
  );

  useEffect(() => {
    function handleGlobalKeyDown(event: KeyboardEvent) {
      const commandKey = event.metaKey || event.ctrlKey;
      if (commandKey && event.key.toLowerCase() === "k") {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (open) {
          closePalette();
        } else {
          previousFocusRef.current =
            document.activeElement instanceof HTMLElement
              ? document.activeElement
              : null;
          setOpen(true);
        }
        return;
      }
      if (!open) {
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        closePalette();
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSelectedIndex((index) =>
          Math.min(index + 1, Math.max(filteredActions.length - 1, 0)),
        );
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setSelectedIndex((index) => Math.max(index - 1, 0));
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        runAction(filteredActions[selectedIndex]);
      }
    }
    window.addEventListener("keydown", handleGlobalKeyDown, true);
    return () =>
      window.removeEventListener("keydown", handleGlobalKeyDown, true);
  }, [closePalette, filteredActions, open, runAction, selectedIndex]);

  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => searchRef.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="command-palette"
      role="presentation"
      onMouseDown={closePalette}
    >
      <section
        className="command-palette__dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Commands"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <input
          ref={searchRef}
          className="command-palette__search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search commands…"
          aria-label="Search commands"
        />
        <div className="command-palette__list" role="listbox">
          {filteredActions.map((action, index) => (
            <button
              key={action.id}
              className={`command-palette__item${index === selectedIndex ? " command-palette__item--selected" : ""}`}
              role="option"
              aria-selected={index === selectedIndex}
              onMouseEnter={() => setSelectedIndex(index)}
              onClick={() => runAction(action)}
            >
              <span>
                <small>{action.group}</small>
                {action.label}
              </span>
              {action.hint ? <kbd>{action.hint}</kbd> : null}
            </button>
          ))}
          {filteredActions.length === 0 ? (
            <p className="command-palette__empty">No matching commands</p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
