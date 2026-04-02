import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TableOfContents } from "../components/TableOfContents";
import { resetTestStore, setTestState } from "./testHelpers";

beforeEach(() => {
  resetTestStore();
});

describe("TableOfContents", () => {
  it("renders a disabled button when there are no headings", () => {
    setTestState({ rawContent: "Just a paragraph with no headings." });
    render(<TableOfContents />);
    const btn = screen.getByRole("button", { name: "Table of contents" });
    expect(btn).toBeDisabled();
  });

  it("renders an enabled button when there are headings", () => {
    setTestState({ rawContent: "# Title\n\nSome text." });
    render(<TableOfContents />);
    const btn = screen.getByRole("button", { name: "Table of contents" });
    expect(btn).not.toBeDisabled();
  });

  it("opens popover with headings on click", () => {
    setTestState({ rawContent: "# Title\n\n## Section\n\nText." });
    render(<TableOfContents />);
    fireEvent.click(screen.getByRole("button", { name: "Table of contents" }));
    expect(screen.getByText("Title")).toBeInTheDocument();
    expect(screen.getByText("Section")).toBeInTheDocument();
  });

  it("closes popover after clicking a heading", () => {
    setTestState({ rawContent: "# Title\n\nText." });
    render(<TableOfContents />);
    fireEvent.click(screen.getByRole("button", { name: "Table of contents" }));
    expect(screen.getByText("Title")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Title"));
    expect(screen.queryByText("Contents")).not.toBeInTheDocument();
  });

  it("indents headings by level via data-level attribute", () => {
    setTestState({ rawContent: "# H1\n\n## H2\n\n### H3" });
    render(<TableOfContents />);
    fireEvent.click(screen.getByRole("button", { name: "Table of contents" }));
    expect(screen.getByText("H1").getAttribute("data-level")).toBe("1");
    expect(screen.getByText("H2").getAttribute("data-level")).toBe("2");
    expect(screen.getByText("H3").getAttribute("data-level")).toBe("3");
  });

  it("is disabled when no file is open", () => {
    setTestState({ rawContent: "" });
    render(<TableOfContents />);
    const btn = screen.getByRole("button", { name: "Table of contents" });
    expect(btn).toBeDisabled();
  });

  it("reads from peer state in peer mode", () => {
    setTestState({}, { peerRawContent: "# Peer heading\n\nContent." });
    render(<TableOfContents peerMode />);
    fireEvent.click(screen.getByRole("button", { name: "Table of contents" }));
    expect(screen.getByText("Peer heading")).toBeInTheDocument();
  });
});
