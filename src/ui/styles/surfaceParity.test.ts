import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function readStylesheet(path: string): string {
  return readFileSync(path, "utf8");
}

function listStylesheets(directory: string): string[] {
  const stylesheets: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      stylesheets.push(...listStylesheets(entryPath));
    } else if (entry.name.endsWith(".css")) {
      stylesheets.push(entryPath);
    }
  }
  return stylesheets;
}

describe("Reading Room surface parity", () => {
  it("maps the document and rails to the prototype surface hierarchy", () => {
    const tokensCss = readStylesheet("src/ui/styles/tokens.css");
    const layoutCss = readStylesheet("src/ui/styles/app-layout.css");
    const fileTreeCss = readStylesheet(
      "src/ui/components/FileTreeSidebar/FileTreeSidebar.css",
    );
    const commentPanelCss = readStylesheet(
      "src/ui/components/CommentPanel/CommentPanel.css",
    );

    expect(layoutCss).toMatch(
      /\.app-main\s*\{[^}]*--bg:\s*var\(--document-bg\)[^}]*--surface:\s*var\(--document-surface\)[^}]*background:\s*var\(--surface\)/s,
    );
    expect(fileTreeCss).toMatch(
      /\.file-tree-sidebar\s*\{[^}]*background-color:\s*var\(--bg\)/s,
    );
    expect(commentPanelCss).toMatch(
      /\.comment-panel\s*\{[^}]*--bg:\s*var\(--panel-bg\)[^}]*--surface:\s*var\(--panel-surface\)[^}]*background-color:\s*var\(--bg\)/s,
    );
    for (const context of ["document", "panel"]) {
      for (const token of ["bg", "surface", "ink", "line"]) {
        expect(tokensCss).toContain(`--${context}-${token}:`);
      }
    }
  });

  it("uses the dashed plus block-comment affordance", () => {
    const commentMarginCss = readStylesheet(
      "src/ui/components/CommentMargin/CommentMargin.css",
    );

    expect(commentMarginCss).toMatch(
      /\.comment-margin__add\s*\{[^}]*border:\s*1px dashed var\(--line-strong\)/s,
    );
    expect(commentMarginCss).toMatch(
      /\.comment-margin__add\s*\{[^}]*background:\s*var\(--bg\)/s,
    );
  });

  it("uses raised taxonomy markers and bordered shortcut keycaps", () => {
    const commentMarginCss = readStylesheet(
      "src/ui/components/CommentMargin/CommentMargin.css",
    );
    const commentPanelCss = readStylesheet(
      "src/ui/components/CommentPanel/CommentPanel.css",
    );

    expect(commentMarginCss).toMatch(
      /\.comment-margin__dot\s*\{[^}]*width:\s*26px[^}]*border-radius:\s*8px[^}]*background:\s*var\(--surface-raised\)/s,
    );
    expect(commentMarginCss).toMatch(
      /\.comment-margin__dot-mark\s*\{[^}]*width:\s*8px[^}]*background:\s*var\(--comment-marker-color\)/s,
    );
    expect(commentPanelCss).toMatch(
      /\.comment-panel__shortcut-hints kbd\s*\{[^}]*border:\s*1px solid var\(--line-strong\)[^}]*border-bottom-width:\s*2px/s,
    );
  });

  it("maps every comment filter swatch to its taxonomy color", () => {
    const commentPanelCss = readStylesheet(
      "src/ui/components/CommentPanel/CommentPanel.css",
    );

    for (const commentType of ["question", "clarify", "rewrite", "remove"]) {
      expect(commentPanelCss).toMatch(
        new RegExp(
          `\\.comment-panel__filter\\[data-comment-type="${commentType}"\\]\\s*\\{[^}]*--comment-color:\\s*var\\(--c-${commentType}\\)`,
          "s",
        ),
      );
    }
  });

  it("keeps redesigned comment surfaces on shared color tokens", () => {
    const commentThreadCss = readStylesheet(
      "src/ui/components/CommentThreadCard/CommentThreadCard.css",
    );
    const markdownRendererCss = readStylesheet(
      "src/ui/components/MarkdownRenderer/MarkdownRenderer.css",
    );

    expect(commentThreadCss).not.toMatch(/#[0-9a-f]{3,8}|rgba?\(/i);
    expect(markdownRendererCss).not.toMatch(/#[0-9a-f]{3,8}|rgba?\(/i);
  });

  it("uses the contrast-safe foreground token on solid brand controls", () => {
    const literalWhiteViolations: string[] = [];
    const solidBrandBackground =
      /background(?:-color)?:\s*var\(--(?:accent(?:-light)?|agent|c-red|c-remove|c-orange|c-rewrite)\)/;
    const literalWhiteForeground = /color:\s*(?:#fff(?:fff)?|white)\b/i;

    for (const stylesheetPath of listStylesheets("src/ui")) {
      const ruleBlocks =
        readStylesheet(stylesheetPath).match(/[^{}]+\{[^{}]*\}/g) ?? [];
      for (const ruleBlock of ruleBlocks) {
        if (
          solidBrandBackground.test(ruleBlock) &&
          literalWhiteForeground.test(ruleBlock)
        ) {
          literalWhiteViolations.push(stylesheetPath);
        }
      }
    }

    expect(literalWhiteViolations).toEqual([]);
  });

  it("keeps the landing composition on the shared app palette", () => {
    const landingCss = readStylesheet("src/ui/styles/landing.css");

    expect(landingCss).not.toContain("var(--poster-");
    for (const themeToken of [
      "bg",
      "surface",
      "ink",
      "accent",
      "agent",
      "c-rewrite",
      "c-clarify",
    ]) {
      expect(landingCss).toContain(`var(--${themeToken})`);
    }
    expect(landingCss).toContain("var(--document-surface)");
    expect(landingCss).toContain("var(--document-ink)");
  });

  it("keeps the metadata title compact inside the document heading scope", () => {
    const markdownCss = readStylesheet(
      "src/ui/components/MarkdownRenderer/MarkdownRenderer.css",
    );

    expect(markdownCss).toMatch(
      /\.markdown-body \.markdown-metadata__title\s*\{[^}]*margin:\s*0 0 0\.75rem/s,
    );
    expect(markdownCss).toMatch(
      /\.markdown-body \.markdown-metadata__title\s*\{[^}]*font-size:\s*0\.95rem/s,
    );
  });

  it("keeps header actions and the file tree on prototype geometry", () => {
    const headerCss = readStylesheet("src/ui/components/Header/Header.css");
    const fileTreeCss = readStylesheet(
      "src/ui/components/FileTreeSidebar/FileTreeSidebar.css",
    );

    expect(headerCss).toMatch(
      /\.app-header__btn\s*\{[^}]*height:\s*32px[^}]*min-height:\s*32px/s,
    );
    expect(headerCss).not.toMatch(
      /\.app-header__btn--agent\s*\{[^}]*min-width:/s,
    );
    expect(fileTreeCss).toMatch(
      /\.tree-item\s*\{[^}]*height:\s*28px[^}]*border-radius:\s*7px/s,
    );
    expect(fileTreeCss).toMatch(
      /\.tree-item--depth-1\s*\{[^}]*padding-left:\s*24px/s,
    );
    expect(fileTreeCss).not.toContain("tree-item-share-btn");
  });

  it("uses the prototype share sheet geometry and encrypted-link panel", () => {
    const shareDialogCss = readStylesheet(
      "src/ui/components/ShareDialog/ShareDialog.css",
    );

    expect(shareDialogCss).toMatch(
      /\.share-dialog\s*\{[^}]*width:\s*min\(560px, 100%\)[^}]*border-radius:\s*16px/s,
    );
    expect(shareDialogCss).toMatch(
      /\.share-dialog__link-box\s*\{[^}]*border:\s*1px solid var\(--agent\)[^}]*background:\s*var\(--agent-soft\)/s,
    );
    expect(shareDialogCss).toMatch(
      /\.share-dialog__active\s*\{[^}]*background:\s*var\(--bg\)/s,
    );
    expect(shareDialogCss).toMatch(
      /\.share-dialog__expiry-options\s*\{[^}]*grid-template-columns:\s*repeat\(3, 1fr\)/s,
    );
    expect(shareDialogCss).not.toContain("share-dialog__select");
  });

  it("uses compact prototype comment cards and poster landing actions", () => {
    const commentPanelCss = readStylesheet(
      "src/ui/components/CommentPanel/CommentPanel.css",
    );
    const landingCss = readStylesheet("src/ui/styles/landing.css");

    expect(commentPanelCss).toMatch(
      /\.comment-panel__entry\s*\{[^}]*padding:\s*10px 12px[^}]*border-left:\s*3px solid/s,
    );
    expect(commentPanelCss).toMatch(
      /\.comment-panel__badge\s*\{[^}]*background:\s*var\(--comment-soft\)/s,
    );
    expect(landingCss).toMatch(
      /\.landing-hero\s*\{[^}]*grid-template-columns:\s*1\.1fr 1fr/s,
    );
    expect(landingCss).toMatch(
      /\.landing-action\s*\{[^}]*height:\s*54px[^}]*box-shadow:\s*5px 5px 0 var\(--ink\)/s,
    );
  });
});
