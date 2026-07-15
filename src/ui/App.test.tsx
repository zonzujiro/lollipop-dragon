import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock MarkdownRenderer — rendering pipeline is tested in MarkdownRenderer.test.tsx
vi.mock("./components/MarkdownRenderer", () => ({
  MarkdownRenderer: () => <div data-testid="markdown-renderer" />,
}));

vi.mock("../config", () => ({
  WORKER_URL: "https://mock-worker.test",
}));

import App from "./App";
import { shouldShowBrowserUnsupported } from "./browserSupport";
import { useAppStore } from "../store";
import {
  makeTestDirectoryHandle,
  makeTestFileHandle,
  resetTestStore,
  setTestState,
} from "../testing/testHelpers";
import type { FileTreeNode } from "../types/fileTree";

// Mock IntersectionObserver for landing page
const mockObserve = vi.fn();
const mockDisconnect = vi.fn();
vi.stubGlobal(
  "IntersectionObserver",
  vi.fn(() => ({
    observe: mockObserve,
    disconnect: mockDisconnect,
    unobserve: vi.fn(),
  })),
);

// Stub File System Access API so App doesn't render "Browser not supported"
if (!window.showOpenFilePicker) {
  vi.stubGlobal("showOpenFilePicker", vi.fn());
}
if (!window.showDirectoryPicker) {
  vi.stubGlobal("showDirectoryPicker", vi.fn());
}

function resetStore() {
  resetTestStore();
  setTestState(
    {
      fileHandle: null,
      fileName: null,
      rawContent: "",
      directoryHandle: null,
      directoryName: null,
      fileTree: [],
      activeFilePath: null,
      sidebarOpen: true,
      comments: [],
      resolvedComments: [],
      activeCommentId: null,
      commentPanelOpen: false,
      commentFilter: "all",
      writeAllowed: true,
    },
    {
      theme: "light",
      focusMode: false,
    },
  );
  useAppStore.setState({
    restoreTabs: vi.fn().mockResolvedValue(undefined),
  });
  localStorage.clear();
}

const fakeTree: FileTreeNode[] = [
  {
    kind: "file",
    name: "readme.md",
    path: "readme.md",
    handle: makeTestFileHandle(),
  },
  {
    kind: "directory",
    name: "docs",
    path: "docs",
    children: [
      {
        kind: "file",
        name: "guide.md",
        path: "docs/guide.md",
        handle: makeTestFileHandle(),
      },
    ],
  },
];

beforeEach(() => {
  document.documentElement.classList.remove("dark");
  resetStore();
  vi.restoreAllMocks();
});

describe("App — host browser support gate", () => {
  it("blocks web host mode when browser file access is required but unavailable", () => {
    expect(
      shouldShowBrowserUnsupported(
        { requiresBrowserFileSystemAccess: true },
        {},
      ),
    ).toBe(true);
  });

  it("does not block desktop host mode when browser file access is unavailable", () => {
    expect(
      shouldShowBrowserUnsupported(
        { requiresBrowserFileSystemAccess: false },
        {},
      ),
    ).toBe(false);
  });
});

describe("App — no file open", () => {
  it("shows the FilePicker landing screen", () => {
    // Reset to no tabs so FilePicker shows
    resetTestStore();
    render(<App />);
    expect(
      screen.getByRole("heading", { name: /lollipop\s+dragon/i }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: /open a file/i }).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByRole("button", { name: /open a folder/i }).length,
    ).toBeGreaterThan(0);
  });

  it("uses the poster landing layout and the reduced comment taxonomy", () => {
    resetTestStore();
    const { container } = render(<App />);

    expect(container.querySelector(".landing-hero__art")).toBeInTheDocument();
    expect(container.querySelector(".landing-duo")).toBeInTheDocument();
    expect(screen.getByText("clarify")).toBeInTheDocument();
    expect(screen.getByText("rewrite")).toBeInTheDocument();
    expect(screen.queryByText("expand")).not.toBeInTheDocument();
    expect(screen.queryByText("fix")).not.toBeInTheDocument();
    expect(screen.getByText("reads like a book")).toBeInTheDocument();
    expect(screen.getByText("hand it off")).toBeInTheDocument();
    expect(screen.getByText("private by construction")).toBeInTheDocument();
    expect(
      container.querySelector(".landing-footer__shapes"),
    ).toBeInTheDocument();
  });

  it("calls openFileInNewTab on the store when the button is clicked", async () => {
    // Reset to no tabs so FilePicker shows
    resetTestStore();
    const user = userEvent.setup();
    const mockOpen = vi.fn();
    useAppStore.setState({ openFileInNewTab: mockOpen });

    render(<App />);
    await user.click(
      screen.getAllByRole("button", { name: /open a file/i })[0],
    );

    expect(mockOpen).toHaveBeenCalledOnce();
  });

  it("calls openDirectoryInNewTab on the store when Open Folder is clicked", async () => {
    // Reset to no tabs so FilePicker shows
    resetTestStore();
    const user = userEvent.setup();
    const mockOpen = vi.fn();
    useAppStore.setState({ openDirectoryInNewTab: mockOpen });

    render(<App />);
    await user.click(
      screen.getAllByRole("button", { name: /open a folder/i })[0],
    );

    expect(mockOpen).toHaveBeenCalledOnce();
  });

  it("opens a dropped folder handle directly", async () => {
    resetTestStore();
    const mockOpenDroppedFolder = vi.fn().mockResolvedValue(undefined);
    const droppedDirectory = { kind: "directory", name: "notes" };
    useAppStore.setState({
      openDirectoryHandleInNewTab: mockOpenDroppedFolder,
    });

    render(<App />);
    fireEvent.drop(screen.getByRole("region", { name: /lollipop dragon/i }), {
      dataTransfer: {
        items: [
          {
            getAsFileSystemHandle: vi.fn().mockResolvedValue(droppedDirectory),
          },
        ],
      },
    });

    await waitFor(() => {
      expect(mockOpenDroppedFolder).toHaveBeenCalledWith(droppedDirectory);
    });
  });
});

describe("App — single file open", () => {
  beforeEach(() => {
    setTestState({
      fileHandle: makeTestFileHandle(),
      fileName: "research.md",
      rawContent: "# Hello\n\nThis is a test.",
    });
  });

  it("shows the app logo instead of a workflow context label", () => {
    render(<App />);
    expect(
      screen.getByRole("img", { name: "Lollipop Dragon" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("File review")).not.toBeInTheDocument();
  });

  it("renders the MarkdownRenderer", () => {
    render(<App />);
    expect(screen.getByTestId("markdown-renderer")).toBeInTheDocument();
  });

  it("keeps rendering the file when restore access is needed", () => {
    setTestState({
      fileHandle: null,
      fileName: "research.md",
      rawContent: "# Persisted",
      restoreError: 'Live access to "research.md" is unavailable.',
    });

    render(<App />);

    expect(screen.getByTestId("markdown-renderer")).toBeInTheDocument();
    expect(screen.queryByText(/access needed/i)).not.toBeInTheDocument();
  });

  it("shows the single add-tab control in the header", () => {
    render(<App />);
    expect(
      screen.getByRole("button", { name: "Open file in new tab" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Open folder in new tab" }),
    ).not.toBeInTheDocument();
  });
});

describe("App — folder open", () => {
  beforeEach(() => {
    setTestState({
      directoryHandle: makeTestDirectoryHandle(),
      directoryName: "my-docs",
      fileTree: fakeTree,
      sidebarOpen: true,
    });
  });

  it("shows the file tree sidebar", () => {
    render(<App />);
    expect(screen.getByRole("complementary")).toBeInTheDocument(); // <aside>
  });

  it("shows the file tree sidebar from persisted sidebar state after browser restore", () => {
    const persistedTree = [
      { kind: "file", name: "readme.md", path: "readme.md" },
      {
        kind: "directory",
        name: "docs",
        path: "docs",
        children: [{ kind: "file", name: "guide.md", path: "docs/guide.md" }],
      },
    ];
    setTestState({
      directoryHandle: null,
      directoryName: "my-docs",
      fileTree: persistedTree,
      sidebarOpen: true,
    });

    render(<App />);

    expect(screen.getByRole("complementary")).toBeInTheDocument();
  });

  it("shows the directory name in the sidebar header", () => {
    const { container } = render(<App />);
    const sidebarName = container.querySelector(".file-tree-header__name");
    expect(sidebarName?.textContent).toBe("my-docs");
  });

  it("shows an empty state when no file is selected", () => {
    render(<App />);
    expect(
      screen.getByText(/Choose a Markdown file from the sidebar/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "my-docs" }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("markdown-renderer")).not.toBeInTheDocument();
  });

  it("shows the restore placeholder when no file content is available", () => {
    setTestState({
      directoryHandle: null,
      directoryName: "my-docs",
      fileName: null,
      rawContent: "",
      activeFilePath: null,
      restoreError: 'Live access to folder "my-docs" is unavailable.',
    });

    render(<App />);

    expect(
      screen.getByRole("heading", { name: "Reconnect “my-docs”" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Re-open folder" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Open another folder…" }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("markdown-renderer")).not.toBeInTheDocument();
  });

  it("shows the markdown renderer after a file is selected", () => {
    setTestState({
      fileName: "readme.md",
      rawContent: "# Hello",
      activeFilePath: "readme.md",
    });
    render(<App />);
    expect(screen.getByTestId("markdown-renderer")).toBeInTheDocument();
    expect(
      screen.queryByText(/Choose a Markdown file from the sidebar/),
    ).not.toBeInTheDocument();
  });

  it("does not repeat the folder context in the header", () => {
    setTestState({ fileName: "readme.md", activeFilePath: "readme.md" });
    render(<App />);
    expect(screen.queryByText("Folder review")).not.toBeInTheDocument();
  });

  it("shows the single add-tab control in folder mode", () => {
    render(<App />);
    expect(
      screen.getByRole("button", { name: "Open file in new tab" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Open folder in new tab" }),
    ).not.toBeInTheDocument();
  });

  it("hides the sidebar when sidebar toggle is clicked", async () => {
    const user = userEvent.setup();
    render(<App />);

    const sidebar = screen.getByRole("complementary");
    expect(sidebar).toBeInTheDocument();
    expect(
      within(sidebar).getByRole("button", { name: "Hide sidebar" }),
    ).toBeInTheDocument();

    await user.click(
      within(sidebar).getByRole("button", { name: "Hide sidebar" }),
    );

    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Show sidebar" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Show sidebar" }));

    expect(screen.getByRole("complementary")).toBeInTheDocument();
  });

  it("toggles sidebar with Cmd+B", () => {
    render(<App />);
    expect(screen.getByRole("complementary")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "b", metaKey: true });

    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
  });

  it("opens the share dialog from the header folder action and shares the current folder lazily", async () => {
    const user = userEvent.setup();
    const shareContent = vi
      .fn()
      .mockResolvedValue("https://example.com/#share=abc&key=xyz");
    useAppStore.setState({ shareContent });

    render(<App />);

    await user.click(screen.getByRole("button", { name: "Share" }));

    expect(
      screen.getByRole("heading", { name: "Share for review" }),
    ).toBeInTheDocument();

    await user.click(await screen.findByRole("button", { name: "Copy link" }));

    expect(shareContent).toHaveBeenCalledWith(
      expect.objectContaining({
        ttl: 604800,
        label: "my-docs",
        preparedIdentity: expect.any(Object),
      }),
    );
  });
});

describe("App — theme toggle", () => {
  beforeEach(() => {
    setTestState(
      {
        fileHandle: makeTestFileHandle(),
        fileName: "doc.md",
        rawContent: "",
      },
      { theme: "light" },
    );
  });

  it("adds dark class to <html> when theme is dark", async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(document.documentElement.classList.contains("dark")).toBe(false);

    await user.click(
      screen.getByRole("button", { name: "Switch to dark mode" }),
    );

    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("removes dark class when switching back to light", async () => {
    useAppStore.setState({ theme: "dark" });
    const user = userEvent.setup();
    render(<App />);

    expect(document.documentElement.classList.contains("dark")).toBe(true);

    await user.click(
      screen.getByRole("button", { name: "Switch to light mode" }),
    );

    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });
});

describe("App — focus mode", () => {
  beforeEach(() => {
    setTestState(
      {
        fileHandle: makeTestFileHandle(),
        fileName: "doc.md",
        rawContent: "",
      },
      { focusMode: false },
    );
  });

  it("hides the header in focus mode", () => {
    render(<App />);

    expect(screen.getByRole("banner")).toBeInTheDocument();

    act(() => {
      useAppStore.getState().toggleFocusMode();
    });

    expect(screen.queryByRole("banner")).not.toBeInTheDocument();
  });

  it("shows an exit button in focus mode", () => {
    render(<App />);

    act(() => {
      useAppStore.getState().toggleFocusMode();
    });

    expect(
      screen.getByRole("button", { name: "Exit focus mode" }),
    ).toBeInTheDocument();
  });

  it("restores the header when exiting focus mode", async () => {
    const user = userEvent.setup();
    render(<App />);

    act(() => {
      useAppStore.getState().toggleFocusMode();
    });
    await user.click(screen.getByRole("button", { name: "Exit focus mode" }));

    expect(screen.getByRole("banner")).toBeInTheDocument();
  });
});
