import { render, screen, fireEvent } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../services/highlighter", () => ({
  useShikiRehypePlugin: () => null,
}));

import { PresentationMode } from "../components/PresentationMode";
import { useAppStore } from "../store";
import { setTestState, resetTestStore } from "./testHelpers";

// jsdom doesn't implement fullscreen API
const mockRequestFullscreen = vi.fn(() => Promise.resolve());
const mockExitFullscreen = vi.fn(() => Promise.resolve());

beforeEach(() => {
  resetTestStore();
  setTestState(
    {
      fileHandle: {} as FileSystemFileHandle,
      fileName: "slides.md",
      rawContent: "# Slide 1\nIntro text\n\n---\n\n# Slide 2\nMore content\n\n---\n\n# Slide 3\nFinal slide",
    },
    { presentationMode: true },
  );
  document.documentElement.requestFullscreen = mockRequestFullscreen;
  document.exitFullscreen = mockExitFullscreen;
  Object.defineProperty(document, "fullscreenElement", {
    value: document.documentElement,
    writable: true,
    configurable: true,
  });
  vi.clearAllMocks();
});

describe("PresentationMode — rendering", () => {
  it("renders the first slide content", () => {
    render(<PresentationMode />);
    expect(screen.getByText("Slide 1")).toBeInTheDocument();
    expect(screen.getByText("Intro text")).toBeInTheDocument();
  });

  it("does not render other slides initially", () => {
    render(<PresentationMode />);
    expect(screen.queryByText("More content")).not.toBeInTheDocument();
    expect(screen.queryByText("Final slide")).not.toBeInTheDocument();
  });

  it("renders dot navigation with correct number of dots", () => {
    render(<PresentationMode />);
    const nav = screen.getByRole("navigation", { name: "Slide navigation" });
    const dots = nav.querySelectorAll("button");
    expect(dots).toHaveLength(3);
  });

  it("marks the first dot as active", () => {
    render(<PresentationMode />);
    const dots = screen
      .getByRole("navigation", { name: "Slide navigation" })
      .querySelectorAll("button");
    expect(dots[0].className).toContain("presentation__dot--active");
    expect(dots[1].className).not.toContain("presentation__dot--active");
  });

  it("renders exit button and theme toggle", () => {
    render(<PresentationMode />);
    expect(
      screen.getByRole("button", { name: "Exit presentation mode" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /switch to dark mode/i }),
    ).toBeInTheDocument();
  });

  it("requests fullscreen via enterPresentationMode action", () => {
    vi.clearAllMocks();
    useAppStore.getState().enterPresentationMode();
    expect(mockRequestFullscreen).toHaveBeenCalled();
  });
});

describe("PresentationMode — keyboard navigation", () => {
  it("navigates to the next slide on ArrowDown", () => {
    render(<PresentationMode />);
    fireEvent.keyDown(window, { key: "ArrowDown" });
    expect(screen.getByText("Slide 2")).toBeInTheDocument();
    expect(screen.getByText("More content")).toBeInTheDocument();
  });

  it("navigates to the next slide on ArrowRight", () => {
    render(<PresentationMode />);
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(screen.getByText("Slide 2")).toBeInTheDocument();
  });

  it("navigates to the next slide on Space", () => {
    render(<PresentationMode />);
    fireEvent.keyDown(window, { key: " " });
    expect(screen.getByText("Slide 2")).toBeInTheDocument();
  });

  it("navigates to previous slide on ArrowUp", () => {
    render(<PresentationMode />);
    // Go to slide 2 first
    fireEvent.keyDown(window, { key: "ArrowDown" });
    expect(screen.getByText("Slide 2")).toBeInTheDocument();
    // Go back
    fireEvent.keyDown(window, { key: "ArrowUp" });
    expect(screen.getByText("Slide 1")).toBeInTheDocument();
  });

  it("does not go before the first slide", () => {
    render(<PresentationMode />);
    fireEvent.keyDown(window, { key: "ArrowUp" });
    expect(screen.getByText("Slide 1")).toBeInTheDocument();
  });

  it("does not go past the last slide", () => {
    render(<PresentationMode />);
    fireEvent.keyDown(window, { key: "ArrowDown" });
    fireEvent.keyDown(window, { key: "ArrowDown" });
    expect(screen.getByText("Slide 3")).toBeInTheDocument();
    // Try to go further
    fireEvent.keyDown(window, { key: "ArrowDown" });
    expect(screen.getByText("Slide 3")).toBeInTheDocument();
  });

  it("navigates to last slide on End", () => {
    render(<PresentationMode />);
    fireEvent.keyDown(window, { key: "End" });
    expect(screen.getByText("Slide 3")).toBeInTheDocument();
    expect(screen.getByText("Final slide")).toBeInTheDocument();
  });

  it("navigates to first slide on Home", () => {
    render(<PresentationMode />);
    fireEvent.keyDown(window, { key: "End" });
    fireEvent.keyDown(window, { key: "Home" });
    expect(screen.getByText("Slide 1")).toBeInTheDocument();
  });

  it("exits presentation mode on Escape when not fullscreen", () => {
    Object.defineProperty(document, "fullscreenElement", {
      value: null,
      writable: true,
      configurable: true,
    });
    render(<PresentationMode />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(useAppStore.getState().presentationMode).toBe(false);
  });

  it("exits fullscreen on Escape when in fullscreen", () => {
    render(<PresentationMode />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(mockExitFullscreen).toHaveBeenCalled();
  });
});

describe("PresentationMode — dot navigation", () => {
  it("navigates to a specific slide when a dot is clicked", () => {
    render(<PresentationMode />);
    const dots = screen
      .getByRole("navigation", { name: "Slide navigation" })
      .querySelectorAll("button");
    fireEvent.click(dots[2]);
    expect(screen.getByText("Slide 3")).toBeInTheDocument();
  });

  it("updates the active dot after navigation", () => {
    render(<PresentationMode />);
    const nav = screen.getByRole("navigation", { name: "Slide navigation" });
    fireEvent.keyDown(window, { key: "ArrowDown" });
    const dots = nav.querySelectorAll("button");
    expect(dots[1].className).toContain("presentation__dot--active");
    expect(dots[0].className).not.toContain("presentation__dot--active");
  });
});

describe("PresentationMode — theme toggle", () => {
  it("toggles theme when the theme button is clicked", () => {
    render(<PresentationMode />);
    expect(useAppStore.getState().theme).toBe("light");
    fireEvent.click(
      screen.getByRole("button", { name: /switch to dark mode/i }),
    );
    expect(useAppStore.getState().theme).toBe("dark");
  });
});

describe("PresentationMode — exit button", () => {
  it("exits presentation mode when exit button is clicked", () => {
    render(<PresentationMode />);
    fireEvent.click(
      screen.getByRole("button", { name: "Exit presentation mode" }),
    );
    expect(useAppStore.getState().presentationMode).toBe(false);
  });
});

describe("PresentationMode — slide splitting", () => {
  it("keeps heading and surrounding content on the same slide", () => {
    setTestState({ rawContent: "Preamble text\n\n# First heading\nBody" });
    render(<PresentationMode />);
    expect(screen.getByText("Preamble text")).toBeInTheDocument();
    expect(screen.getByText("First heading")).toBeInTheDocument();
    expect(screen.getByText("Body")).toBeInTheDocument();
  });

  it("splits on horizontal rules", () => {
    setTestState({ rawContent: "Part one\n\n---\n\nPart two\n\n---\n\nPart three" });
    render(<PresentationMode />);
    expect(screen.getByText("Part one")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "ArrowDown" });
    expect(screen.getByText("Part two")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "ArrowDown" });
    expect(screen.getByText("Part three")).toBeInTheDocument();
  });

  it("renders a single slide when there are no headings or rules", () => {
    setTestState({ rawContent: "Just a paragraph.\n\nAnother paragraph." });
    render(<PresentationMode />);
    expect(screen.getByText("Just a paragraph.")).toBeInTheDocument();
    expect(screen.getByText("Another paragraph.")).toBeInTheDocument();
    // No dot navigation for a single slide
    expect(
      screen.queryByRole("navigation", { name: "Slide navigation" }),
    ).not.toBeInTheDocument();
  });

  it("does not split on HRs inside fenced code blocks", () => {
    setTestState({
      rawContent: "Slide 1\nIntro\n\n---\n\n```bash\n# this is a comment\n---\necho hello\n```\nAfter code",
    });
    render(<PresentationMode />);
    // Navigate to slide 2
    fireEvent.keyDown(window, { key: "ArrowDown" });
    // The code block content and "After code" should all be on slide 2
    expect(screen.getByText("After code")).toBeInTheDocument();
    // Should only have 2 slides (dots)
    const dots = screen
      .getByRole("navigation", { name: "Slide navigation" })
      .querySelectorAll("button");
    expect(dots).toHaveLength(2);
  });

  it("handles empty content", () => {
    setTestState({ rawContent: "" });
    render(<PresentationMode />);
    // Should render without crashing, no dot nav
    expect(
      screen.queryByRole("navigation", { name: "Slide navigation" }),
    ).not.toBeInTheDocument();
  });
});
