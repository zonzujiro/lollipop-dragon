import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, it, expect, vi } from "vitest";

const mockDownloadFile = vi.fn();

vi.mock("./downloadActiveFile", () => ({
  downloadActiveFile: () => mockDownloadFile(),
}));

import { Header } from "./index";
import { setTestState, resetTestStore } from "../../../testing/testHelpers";

beforeEach(() => {
  resetTestStore();
  mockDownloadFile.mockClear();
});

describe("Header — Save file button", () => {
  it("renders Save file button in peer mode", () => {
    setTestState(
      {},
      { isPeerMode: true, peerFileName: "readme.md", peerRawContent: "# Hi" },
    );
    render(<Header peerMode />);
    expect(
      screen.getByRole("button", { name: /Save file/ }),
    ).toBeInTheDocument();
  });

  it("does not render Save file button in host mode", () => {
    setTestState({ fileName: "readme.md" });
    render(<Header />);
    expect(
      screen.queryByRole("button", { name: /Save file/ }),
    ).not.toBeInTheDocument();
  });

  it("calls downloadActiveFile when clicked", async () => {
    setTestState(
      {},
      {
        isPeerMode: true,
        peerFileName: "readme.md",
        peerActiveFilePath: "readme.md",
        peerRawContent: "# Hello",
      },
    );
    const user = userEvent.setup();
    render(<Header peerMode />);
    await user.click(screen.getByRole("button", { name: /Save file/ }));
    expect(mockDownloadFile).toHaveBeenCalledOnce();
  });

  it("does not render a standalone Get latest button in peer mode", () => {
    setTestState(
      {},
      { isPeerMode: true, peerFileName: "readme.md", peerRawContent: "# Hi" },
    );
    render(<Header peerMode />);
    expect(
      screen.queryByRole("button", { name: /Get latest/i }),
    ).not.toBeInTheDocument();
  });

  it("disables Submit comments while the peer view is stale", () => {
    setTestState(
      {},
      {
        isPeerMode: true,
        peerFileName: "readme.md",
        peerRawContent: "# Hi",
        myPeerComments: [
          {
            id: "c-1",
            peerName: "Alice",
            path: "readme.md",
            blockRef: { blockIndex: 0, contentPreview: "Hi" },
            commentType: "note",
            text: "Comment",
            createdAt: new Date().toISOString(),
          },
        ],
        submittedPeerCommentIds: [],
        documentUpdateAvailable: true,
      },
    );
    render(<Header peerMode />);
    expect(screen.getByRole("button", { name: /Submit comments/i })).toBeDisabled();
  });
});
