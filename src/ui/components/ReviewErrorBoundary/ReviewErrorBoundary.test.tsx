import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ReviewErrorBoundary } from "./ReviewErrorBoundary";

function CrashingReviewSurface(): never {
  throw new Error("malformed review item");
}

describe("ReviewErrorBoundary", () => {
  it("contains a review-surface crash and offers recovery", () => {
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    render(
      <ReviewErrorBoundary title="Incoming comments could not be displayed">
        <CrashingReviewSurface />
      </ReviewErrorBoundary>,
    );

    expect(
      screen.getByText("Incoming comments could not be displayed"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(error).toHaveBeenCalled();
  });
});
