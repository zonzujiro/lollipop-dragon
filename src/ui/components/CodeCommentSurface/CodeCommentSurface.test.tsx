import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CodeCommentSurface } from "./index";

describe("CodeCommentSurface", () => {
  it("keeps CSS-counter line numbers out of textContent", () => {
    const { container } = render(
      <CodeCommentSurface plainText={"alpha\nbeta"} onCreateAnchor={vi.fn()}>
        {"alpha\nbeta"}
      </CodeCommentSurface>,
    );

    expect(container.textContent).toBe("alpha\nbeta");
    expect(
      screen.getByRole("button", { name: "Comment on line 1" }),
    ).toHaveTextContent("");
    expect(
      screen.getByRole("button", { name: "Comment on line 2" }),
    ).toHaveTextContent("");
  });

  it("creates a durable whole-line anchor with the correct occurrence", () => {
    const onCreateAnchor = vi.fn();
    render(
      <CodeCommentSurface
        plainText={"repeat();\nrepeat();"}
        onCreateAnchor={onCreateAnchor}
      >
        {"repeat();\nrepeat();"}
      </CodeCommentSurface>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Comment on line 2" }));

    expect(onCreateAnchor).toHaveBeenCalledWith({
      quote: "repeat();",
      occurrence: 2,
      start: 10,
      end: 19,
    });
  });
});
