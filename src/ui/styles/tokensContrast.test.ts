import { describe, expect, it } from "vitest";

interface ThemeColors {
  background: string;
  codeBackground: string;
  surface: string;
  ink: string;
  secondaryInk: string;
  taxonomy: string[];
}

const themes: Record<"light" | "dark", ThemeColors> = {
  light: {
    background: "#f6f2e9",
    codeBackground: "#efeadd",
    surface: "#fffdf8",
    ink: "#211d18",
    secondaryInk: "#575046",
    taxonomy: [
      "#d93030",
      "#bb7410",
      "#2563eb",
      "#7c4fd0",
      "#0e8a9e",
      "#2e9678",
      "#6e6659",
    ],
  },
  dark: {
    background: "#171412",
    codeBackground: "#100e0c",
    surface: "#1f1b18",
    ink: "#ede6d9",
    secondaryInk: "#b5ac9e",
    taxonomy: [
      "#f07272",
      "#e0a33e",
      "#6d9bf5",
      "#a98be8",
      "#4fb8cb",
      "#4cba9a",
      "#97907f",
    ],
  },
};

function channelToLinear(channel: number): number {
  const normalized = channel / 255;
  if (normalized <= 0.04045) {
    return normalized / 12.92;
  }
  return ((normalized + 0.055) / 1.055) ** 2.4;
}

function luminance(color: string): number {
  const channels = color
    .slice(1)
    .match(/.{2}/g)
    ?.map((channel) => Number.parseInt(channel, 16));
  if (!channels || channels.length !== 3) {
    throw new Error(`Invalid hex color: ${color}`);
  }
  const [red, green, blue] = channels.map(channelToLinear);
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(firstColor: string, secondColor: string): number {
  const firstLuminance = luminance(firstColor);
  const secondLuminance = luminance(secondColor);
  const lighter = Math.max(firstLuminance, secondLuminance);
  const darker = Math.min(firstLuminance, secondLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

describe("Reading Room token contrast", () => {
  it.each(Object.entries(themes))(
    "%s theme meets text and taxonomy contrast budgets",
    (_themeName, colors) => {
      expect(
        contrastRatio(colors.ink, colors.background),
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrastRatio(colors.secondaryInk, colors.background),
      ).toBeGreaterThanOrEqual(4.5);
      for (const taxonomyColor of colors.taxonomy) {
        expect(
          contrastRatio(taxonomyColor, colors.surface),
        ).toBeGreaterThanOrEqual(3);
        expect(
          contrastRatio(taxonomyColor, colors.codeBackground),
        ).toBeGreaterThanOrEqual(3);
      }
    },
  );
});
