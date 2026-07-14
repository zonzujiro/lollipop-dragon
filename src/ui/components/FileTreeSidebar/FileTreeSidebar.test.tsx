import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FileTreeSidebar } from "./index";

describe("FileTreeSidebar", () => {
  it("keeps the redesign width independent of legacy saved resize values", () => {
    localStorage.setItem("markreview-sidebar-width", "600");

    render(
      <FileTreeSidebar
        tree={[{ kind: "file", name: "overview.md", path: "overview.md" }]}
        activeFilePath="overview.md"
        onSelect={() => undefined}
        header={{ title: "research-notes" }}
      />,
    );

    const sidebar = screen.getByRole("complementary");
    expect(sidebar).not.toHaveAttribute("style");
    expect(screen.getByTitle("research-notes")).toHaveTextContent(
      "research-notes",
    );
    expect(
      screen.queryByRole("separator", { name: "Resize sidebar" }),
    ).not.toBeInTheDocument();
  });

  it("uses iconless file rows with prototype depth spacing", () => {
    const { container } = render(
      <FileTreeSidebar
        tree={[
          {
            kind: "directory",
            name: "database",
            path: "database",
            children: [
              {
                kind: "file",
                name: "comparison.md",
                path: "database/comparison.md",
              },
            ],
          },
        ]}
        activeFilePath="database/comparison.md"
        onSelect={() => undefined}
        header={{ title: "research-notes" }}
      />,
    );

    const fileRow = screen.getByRole("button", { name: "comparison.md" });
    expect(fileRow).toHaveClass("tree-item--depth-1");
    expect(fileRow.querySelector("svg")).toBeNull();
    expect(container.querySelector(".tree-item__chevron")).toBeInTheDocument();
  });

  it("keeps the comment badge as the only trailing file-row action", () => {
    render(
      <FileTreeSidebar
        tree={[{ kind: "file", name: "overview.md", path: "overview.md" }]}
        activeFilePath="overview.md"
        onSelect={() => undefined}
        header={{ title: "research-notes" }}
        commentCounts={{ "overview.md": 2 }}
      />,
    );

    expect(screen.getByText("2")).toHaveClass("tree-item__comment-count");
    expect(
      screen.queryByRole("button", { name: "Share overview.md" }),
    ).not.toBeInTheDocument();
  });
});
