import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

interface ThemeColors {
  accent: string;
  agent: string;
  avatarNeutral: string;
  background: string;
  codeBackground: string;
  ink: string;
  onAccent: string;
  remove: string;
  secondaryInk: string;
  surface: string;
  taxonomy: string[];
}

const TOKEN_STYLESHEET = readFileSync("src/ui/styles/tokens.css", "utf8");
const TAXONOMY_TOKENS = [
  "--c-fix",
  "--c-rewrite",
  "--c-expand",
  "--c-clarify",
  "--c-question",
  "--c-answer",
  "--c-remove",
];

function extractTokenBlock(pattern: RegExp, label: string): string {
  const match = pattern.exec(TOKEN_STYLESHEET);
  const block = match?.[1];
  if (!block) {
    throw new Error(`Missing ${label} token block`);
  }
  return block;
}

function parseHexTokens(block: string): ReadonlyMap<string, string> {
  const tokens = new Map<string, string>();
  const declarationPattern = /(--[a-z0-9-]+):\s*(#[0-9a-f]{6})\s*;/gi;
  let match: RegExpExecArray | null = declarationPattern.exec(block);
  while (match) {
    const tokenName = match[1];
    const tokenValue = match[2];
    if (tokenName && tokenValue) {
      tokens.set(tokenName, tokenValue.toLowerCase());
    }
    match = declarationPattern.exec(block);
  }
  return tokens;
}

function getToken(
  tokenName: string,
  rootTokens: ReadonlyMap<string, string>,
  overrides: ReadonlyMap<string, string>,
): string {
  const value = overrides.get(tokenName) ?? rootTokens.get(tokenName);
  if (!value) {
    throw new Error(`Missing hex value for ${tokenName}`);
  }
  return value;
}

function buildThemeColors(
  rootTokens: ReadonlyMap<string, string>,
  overrides: ReadonlyMap<string, string>,
): ThemeColors {
  const value = (tokenName: string) =>
    getToken(tokenName, rootTokens, overrides);
  return {
    accent: value("--accent"),
    agent: value("--agent"),
    avatarNeutral: value("--avatar-neutral"),
    background: value("--bg"),
    codeBackground: value("--bg-sunken"),
    ink: value("--ink"),
    onAccent: value("--on-accent"),
    remove: value("--c-remove"),
    secondaryInk: value("--ink-secondary"),
    surface: value("--surface"),
    taxonomy: TAXONOMY_TOKENS.map(value),
  };
}

const rootTokens = parseHexTokens(
  extractTokenBlock(/:root\s*\{([\s\S]*?)\n\}/, ":root"),
);
const darkTokens = parseHexTokens(
  extractTokenBlock(/\.dark\s*\{([\s\S]*?)\n\}/, ".dark"),
);
const themes: [string, ThemeColors][] = [
  ["light", buildThemeColors(rootTokens, new Map())],
  ["dark", buildThemeColors(rootTokens, darkTokens)],
];

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
  it.each(themes)(
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

  it.each(themes)("%s theme keeps control glyphs legible", (_name, colors) => {
    expect(
      contrastRatio(colors.onAccent, colors.accent),
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      contrastRatio(colors.onAccent, colors.remove),
    ).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(colors.onAccent, colors.agent)).toBeGreaterThanOrEqual(
      3,
    );
    expect(
      contrastRatio(colors.onAccent, colors.avatarNeutral),
    ).toBeGreaterThanOrEqual(3);
  });
});
