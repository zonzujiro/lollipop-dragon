import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

  it("starts every folder collapsed and reveals nested levels on demand", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <FileTreeSidebar
        tree={[
          {
            kind: "directory",
            name: "database",
            path: "database",
            children: [
              {
                kind: "directory",
                name: "benchmarks",
                path: "database/benchmarks",
                children: [
                  {
                    kind: "file",
                    name: "comparison.md",
                    path: "database/benchmarks/comparison.md",
                  },
                ],
              },
            ],
          },
        ]}
        activeFilePath="database/benchmarks/comparison.md"
        onSelect={() => undefined}
        header={{ title: "research-notes" }}
      />,
    );

    const databaseRow = screen.getByRole("button", { name: "database" });
    expect(databaseRow).toHaveAttribute("aria-expanded", "false");
    expect(databaseRow.querySelector(".tree-item__folder-icon")).not.toBeNull();
    expect(screen.queryByRole("button", { name: "benchmarks" })).toBeNull();

    await user.click(databaseRow);
    const benchmarksRow = screen.getByRole("button", { name: "benchmarks" });
    expect(databaseRow).toHaveAttribute("aria-expanded", "true");
    expect(benchmarksRow).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: "comparison.md" })).toBeNull();

    await user.click(benchmarksRow);
    const fileRow = screen.getByRole("button", { name: "comparison.md" });
    expect(fileRow).toHaveClass("tree-item--depth-2");
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
