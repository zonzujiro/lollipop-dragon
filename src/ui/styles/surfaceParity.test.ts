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

  it("gives long comment drafts more room without crowding narrow screens", () => {
    const commentPanelCss = readStylesheet(
      "src/ui/components/CommentPanel/CommentPanel.css",
    );
    const commentThreadCss = readStylesheet(
      "src/ui/components/CommentThreadCard/CommentThreadCard.css",
    );

    expect(commentPanelCss).toMatch(
      /\.comment-panel\s*\{[^}]*width:\s*clamp\(332px,\s*28vw,\s*380px\)/s,
    );
    expect(commentPanelCss).toMatch(
      /@media\s*\(max-width:\s*920px\)\s*\{[\s\S]*?\.comment-panel\s*\{[^}]*width:\s*280px/s,
    );
    expect(commentThreadCss).toMatch(
      /\.comment-thread-card__reply-input\s*\{[^}]*min-height:\s*72px[^}]*max-height:\s*10rem/s,
    );
  });

  it("keeps incoming review cards inside the comment rail", () => {
    const commentPanelCss = readStylesheet(
      "src/ui/components/CommentPanel/CommentPanel.css",
    );
    const pendingReviewCss = readStylesheet(
      "src/ui/components/PendingCommentReview/PendingCommentReview.css",
    );
    const peerCommentCardCss = readStylesheet(
      "src/ui/components/PeerCommentCard/PeerCommentCard.css",
    );

    expect(commentPanelCss).toMatch(
      /\.comment-panel__incoming\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)[^}]*min-width:\s*0/s,
    );
    expect(pendingReviewCss).toMatch(
      /\.pending-review,\s*\.pending-review__list\s*\{[^}]*min-width:\s*0/s,
    );
    expect(peerCommentCardCss).toMatch(
      /\.peer-card\s*\{[^}]*width:\s*100%[^}]*min-width:\s*0[^}]*max-width:\s*100%/s,
    );
    expect(peerCommentCardCss).toMatch(
      /\.peer-card__text\s*\{[^}]*overflow-wrap:\s*anywhere/s,
    );
  });

  it("styles thread confirmation actions as compact app controls", () => {
    const commentThreadCss = readStylesheet(
      "src/ui/components/CommentThreadCard/CommentThreadCard.css",
    );

    expect(commentThreadCss).toMatch(
      /\.comment-thread-card__confirm-actions\s*\{[^}]*display:\s*flex[^}]*gap:\s*8px/s,
    );
    expect(commentThreadCss).toMatch(
      /\.comment-thread-card__confirm-yes,\s*\.comment-thread-card__confirm-cancel\s*\{[^}]*height:\s*30px[^}]*border-radius:\s*8px[^}]*font:\s*700 12\.5px\/1 var\(--font-ui\)/s,
    );
    expect(commentThreadCss).toMatch(
      /\.comment-thread-card__confirm-yes\s*\{[^}]*border:\s*1px solid var\(--c-remove\)[^}]*background:\s*var\(--c-remove\)[^}]*color:\s*var\(--on-remove\)/s,
    );
    expect(commentThreadCss).toMatch(
      /\.comment-thread-card__confirm-cancel\s*\{[^}]*border:\s*1px solid var\(--line\)[^}]*background:\s*var\(--surface\)[^}]*color:\s*var\(--ink-secondary\)/s,
    );
    expect(commentThreadCss).toMatch(
      /\.comment-thread-card__confirm-yes:focus-visible,\s*\.comment-thread-card__confirm-cancel:focus-visible\s*\{[^}]*box-shadow:\s*0 0 0 3px color-mix\(in srgb, var\(--accent\) 22%, transparent\)/s,
    );
  });

  it("keeps thread and sidebar edit forms aligned with app controls", () => {
    const commentThreadCss = readStylesheet(
      "src/ui/components/CommentThreadCard/CommentThreadCard.css",
    );
    const commentPanelCss = readStylesheet(
      "src/ui/components/CommentPanel/CommentPanel.css",
    );

    expect(commentThreadCss).toMatch(
      /\.comment-thread-card__edit-form \.comment-add-form__input\s*\{[^}]*width:\s*100%[^}]*margin:\s*0[^}]*min-height:\s*7rem/s,
    );
    expect(commentThreadCss).toMatch(
      /\.comment-thread-card__edit-actions\s*\{[^}]*display:\s*flex[^}]*justify-content:\s*flex-end[^}]*gap:\s*8px/s,
    );
    expect(commentThreadCss).toMatch(
      /\.comment-thread-card__edit-save,\s*\.comment-thread-card__edit-cancel\s*\{[^}]*height:\s*30px[^}]*border-radius:\s*8px[^}]*font:\s*700 12\.5px\/1 var\(--font-ui\)/s,
    );
    expect(commentThreadCss).toMatch(
      /\.comment-thread-card__edit-save\s*\{[^}]*border:\s*1px solid var\(--accent\)[^}]*background:\s*var\(--accent\)[^}]*color:\s*var\(--on-accent\)/s,
    );
    expect(commentThreadCss).toMatch(
      /\.comment-thread-card__edit-cancel\s*\{[^}]*border:\s*1px solid var\(--line\)[^}]*background:\s*var\(--surface\)[^}]*color:\s*var\(--ink-secondary\)/s,
    );
    expect(commentPanelCss).toMatch(
      /\.comment-panel__inline-edit \.comment-add-form__input\s*\{[^}]*width:\s*100%[^}]*margin:\s*0[^}]*min-height:\s*5\.5rem/s,
    );
    expect(commentPanelCss).toMatch(
      /\.comment-panel__inline-edit-actions\s*\{[^}]*display:\s*flex[^}]*justify-content:\s*flex-end[^}]*gap:\s*8px/s,
    );
    expect(commentPanelCss).toMatch(
      /\.comment-panel__inline-edit-save,\s*\.comment-panel__inline-edit-cancel\s*\{[^}]*height:\s*30px[^}]*border-radius:\s*8px[^}]*font:\s*700 12\.5px\/1 var\(--font-ui\)/s,
    );
    expect(commentPanelCss).toMatch(
      /\.comment-panel__inline-edit-save\s*\{[^}]*border:\s*1px solid var\(--accent\)[^}]*background:\s*var\(--accent\)[^}]*color:\s*var\(--on-accent\)/s,
    );
    expect(commentPanelCss).toMatch(
      /\.comment-panel__inline-edit-cancel\s*\{[^}]*border:\s*1px solid var\(--line\)[^}]*background:\s*var\(--surface\)[^}]*color:\s*var\(--ink-secondary\)/s,
    );
  });

  it("rebinds inherited compatibility aliases to the document context", () => {
    const layoutCss = readStylesheet("src/ui/styles/app-layout.css");
    const appMainBlock = layoutCss.match(/\.app-main\s*\{([^}]*)\}/s)?.[1];

    expect(appMainBlock).toBeDefined();
    for (const [alias, canonical] of [
      ["surface-alt", "bg-sunken"],
      ["border", "line"],
      ["text", "ink"],
      ["text-secondary", "ink-secondary"],
      ["text-muted", "ink-muted"],
      ["c-red", "c-fix"],
      ["c-orange", "c-rewrite"],
      ["c-purple", "c-clarify"],
      ["c-cyan", "c-question"],
    ]) {
      expect(appMainBlock).toContain(`--${alias}: var(--${canonical});`);
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

    const commentTypeColors = [
      ["note", "answer"],
      ["question", "question"],
      ["clarify", "clarify"],
      ["rewrite", "rewrite"],
      ["remove", "remove"],
    ];
    for (const [commentType, colorToken] of commentTypeColors) {
      expect(commentPanelCss).toMatch(
        new RegExp(
          `\\.comment-panel__filter\\[data-comment-type="${commentType}"\\]\\s*\\{[^}]*--comment-color:\\s*var\\(--c-${colorToken}\\)`,
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
