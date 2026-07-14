import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function readStylesheet(path: string): string {
  return readFileSync(path, "utf8");
}

describe("Reading Room surface parity", () => {
  it("maps the document and rails to the prototype surface hierarchy", () => {
    const layoutCss = readStylesheet("src/ui/styles/app-layout.css");
    const fileTreeCss = readStylesheet(
      "src/ui/components/FileTreeSidebar/FileTreeSidebar.css",
    );
    const commentPanelCss = readStylesheet(
      "src/ui/components/CommentPanel/CommentPanel.css",
    );

    expect(layoutCss).toMatch(
      /\.app-main\s*\{[^}]*background:\s*var\(--surface\)/s,
    );
    expect(fileTreeCss).toMatch(
      /\.file-tree-sidebar\s*\{[^}]*background-color:\s*var\(--bg\)/s,
    );
    expect(commentPanelCss).toMatch(
      /\.comment-panel\s*\{[^}]*background-color:\s*var\(--bg\)/s,
    );
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
