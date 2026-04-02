import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, it, expect, vi } from "vitest";

const mockDownloadFile = vi.fn();

vi.mock("../services/download", () => ({
  downloadActiveFile: () => mockDownloadFile(),
}));

import { Header } from "../components/Header";
import { setTestState, resetTestStore } from "./testHelpers";

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
});
