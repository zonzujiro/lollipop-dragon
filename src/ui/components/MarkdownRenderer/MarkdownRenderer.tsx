import "./MarkdownRenderer.css";
import { memo, useCallback, useMemo, useRef } from "react";
import type { PluggableList } from "unified";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { CommentMargin } from "../CommentMargin";
import { DocumentOutline } from "../DocumentOutline";
import {
  isCommentType,
  remarkMarkdownAlerts,
  useShikiRehypePlugin,
} from "../../../markup";
import { useActiveTabField } from "../../../store/selectors";
import {
  useMarkdownRendererStore,
  usePeerMarkdownStore,
  usePeerMode,
} from "../../../store/uiHooks";
import type { CommentAnchorDraft } from "../../../types/criticmarkup";
import type { TabState } from "../../../types/tab";
import {
  DocumentAccessBanner,
  type RestoreTabState,
} from "./DocumentAccessBanner";
import {
  getMarkdownContentKey,
  buildPeerRangeComments,
  parseMarkdownDocument,
} from "./markdownDocument";
import {
  CodeBlock,
  PreBlock,
  SpecialBlockProvider,
} from "./MarkdownSpecialBlocks";
import { MetadataPanel } from "./MetadataPanel";
import { rehypeBlockIndex } from "./rehypeBlockIndex";
import { useAgentChangedBlocks } from "./useAgentChangedBlocks";
import {
  useCommentHighlightLayer,
  useHostCommentSync,
  usePendingCommentScroll,
} from "./useMarkdownCommentEffects";
import { useMarkdownInteractions } from "./useMarkdownInteractions";
import { useSpecialBlockRendering } from "./useSpecialBlockRendering";

const markdownComponents = { code: CodeBlock, pre: PreBlock };

interface MarkdownRendererContentProps {
  activeFilePath: string | null;
  fileName: string | null;
  hostTabId: string | null;
  isPeerMode: boolean;
  pendingScrollTarget: TabState["pendingScrollTarget"];
  rawContent: string;
  restoreTabState: RestoreTabState;
  writeAllowed: boolean;
}

function HostMarkdownRendererView() {
  const rawContent = useActiveTabField("rawContent") ?? "";
  const hostTabId = useActiveTabField("id") ?? null;
  const fileName = useActiveTabField("fileName") ?? null;
  const directoryName = useActiveTabField("directoryName") ?? null;
  const activeFilePath = useActiveTabField("activeFilePath") ?? null;
  const pendingScrollTarget = useActiveTabField("pendingScrollTarget") ?? null;
  const writeAllowed = useActiveTabField("writeAllowed") ?? false;
  const restoreError = useActiveTabField("restoreError") ?? null;

  return (
    <MarkdownRendererContent
      activeFilePath={activeFilePath}
      fileName={fileName}
      hostTabId={hostTabId}
      isPeerMode={false}
      pendingScrollTarget={pendingScrollTarget}
      rawContent={rawContent}
      restoreTabState={{ directoryName, fileName, restoreError }}
      writeAllowed={writeAllowed}
    />
  );
}

function PeerMarkdownRendererView() {
  const { rawContent, fileName, activeFilePath } = usePeerMarkdownStore();

  return (
    <MarkdownRendererContent
      activeFilePath={activeFilePath}
      fileName={fileName}
      hostTabId={null}
      isPeerMode
      pendingScrollTarget={null}
      rawContent={rawContent}
      restoreTabState={{
        directoryName: null,
        fileName: null,
        restoreError: null,
      }}
      writeAllowed
    />
  );
}

function MarkdownRendererContent({
  activeFilePath,
  fileName,
  hostTabId,
  isPeerMode,
  pendingScrollTarget,
  rawContent,
  restoreTabState,
  writeAllowed,
}: MarkdownRendererContentProps) {
  const {
    setComments,
    addComment: addCommentAction,
    postPeerComment: postPeerCommentAction,
    reopenTab,
    openDirectoryInNewTab,
    openFileInNewTab,
    clearPendingScrollTarget,
    setActiveCommentId,
    showToast,
    peerActiveCommentId,
    myPeerComments,
    activeAgentRun,
    hoveredBlockHighlight,
  } = useMarkdownRendererStore(hostTabId);
  const hostActiveCommentId = useActiveTabField("activeCommentId") ?? null;
  const activeCommentId = isPeerMode
    ? peerActiveCommentId
    : hostActiveCommentId;
  const shikiPlugin = useShikiRehypePlugin();
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const canComment = writeAllowed || isPeerMode;

  const { cleanMarkdown, comments, metadata } = useMemo(
    () => parseMarkdownDocument(rawContent),
    [rawContent],
  );
  const contentKey = useMemo(
    () => getMarkdownContentKey({ activeFilePath, fileName, cleanMarkdown }),
    [activeFilePath, cleanMarkdown, fileName],
  );
  const peerRangeComments = useMemo(
    () =>
      isPeerMode
        ? buildPeerRangeComments({
            comments: myPeerComments,
            activeFilePath,
            cleanMarkdown,
          })
        : [],
    [activeFilePath, cleanMarkdown, isPeerMode, myPeerComments],
  );
  const visibleRangeComments = isPeerMode ? peerRangeComments : comments;

  const interactions = useMarkdownInteractions({ bodyRef, canComment });
  const specialBlocks = useSpecialBlockRendering({
    activeCommentId,
    comments: visibleRangeComments,
    onCreateAnchor: interactions.handleSpecialBlockAnchor,
    onSelectComment: setActiveCommentId,
  });

  useAgentChangedBlocks({
    activeAgentRun,
    bodyRef,
    cleanMarkdown,
    rawContent,
  });
  useHostCommentSync({ comments, isPeerMode, setComments });
  usePendingCommentScroll({
    activeFilePath,
    clearPendingScrollTarget,
    comments,
    pendingScrollTarget,
    setActiveCommentId,
  });
  useCommentHighlightLayer({
    activeCommentId,
    bodyRef,
    comments: visibleRangeComments,
    contentKey,
    hoveredBlockHighlight,
    revision: specialBlocks.revision,
    setActiveCommentId,
    showToast,
    viewerRef,
  });

  const handleAddComment = useCallback(
    (
      blockIndex: number,
      type: string,
      text: string,
      anchor?: CommentAnchorDraft,
    ) => {
      if (isCommentType(type)) {
        void addCommentAction(blockIndex, type, text, anchor);
      }
    },
    [addCommentAction],
  );
  const handlePostPeerComment = useCallback(
    (
      blockIndex: number,
      type: string,
      text: string,
      anchor?: CommentAnchorDraft,
    ) => {
      if (!isCommentType(type)) {
        return;
      }
      const posted = postPeerCommentAction({
        blockIndex,
        type,
        text,
        path: activeFilePath ?? fileName ?? "",
        anchor: anchor
          ? { quote: anchor.quote, occurrence: anchor.occurrence }
          : undefined,
      });
      if (!posted) {
        showToast(
          "Comment is too large to send safely, or this document needs refresh.",
        );
      }
    },
    [activeFilePath, fileName, postPeerCommentAction, showToast],
  );
  const handleRestoreAccess = useCallback(() => {
    if (hostTabId) {
      void reopenTab(hostTabId);
    }
  }, [hostTabId, reopenTab]);
  const handleOpenOther = useCallback(() => {
    if (restoreTabState.directoryName) {
      void openDirectoryInNewTab();
      return;
    }
    void openFileInNewTab();
  }, [openDirectoryInNewTab, openFileInNewTab, restoreTabState.directoryName]);

  const rehypePlugins: PluggableList = shikiPlugin
    ? [shikiPlugin, rehypeBlockIndex]
    : [rehypeBlockIndex];

  return (
    <div className="markdown-scroll-area" ref={scrollAreaRef}>
      <DocumentAccessBanner
        hostTabId={hostTabId}
        isPeerMode={isPeerMode}
        onOpenOther={handleOpenOther}
        onRestoreAccess={handleRestoreAccess}
        restoreTabState={restoreTabState}
        writeAllowed={writeAllowed}
      />
      <div className="document-kicker">
        {activeFilePath ?? fileName ?? "Untitled document"}
      </div>
      <DocumentOutline
        cleanMarkdown={cleanMarkdown}
        comments={visibleRangeComments}
        scrollRootRef={scrollAreaRef}
      />
      <div
        className="markdown-viewer"
        ref={viewerRef}
        onMouseLeave={interactions.handleBodyMouseLeave}
      >
        <CommentMargin
          containerRef={viewerRef}
          hoveredBlock={canComment ? interactions.hoveredBlock : null}
          onAddComment={handleAddComment}
          peerMode={isPeerMode}
          onPostPeerComment={handlePostPeerComment}
          selectionDraft={interactions.rangeCommentDraft}
          onDismissSelection={interactions.dismissRangeComment}
        />
        {interactions.pendingSelection && (
          <button
            type="button"
            className="selection-comment-button"
            style={{
              top: interactions.pendingSelection.top,
              left: interactions.pendingSelection.left,
            }}
            onMouseDown={(event) => event.preventDefault()}
            onClick={(event) => {
              event.stopPropagation();
              interactions.confirmPendingSelection();
            }}
          >
            Comment
          </button>
        )}
        <div
          className="markdown-body"
          data-agent-status={activeAgentRun?.status}
          ref={bodyRef}
          onClick={interactions.handleBodyClick}
          onMouseDown={interactions.handleBodyMouseDown}
          onMouseOver={interactions.handleBodyMouseOver}
          onMouseUp={interactions.handleBodyMouseUp}
        >
          <MetadataPanel fields={metadata} />
          <div className="markdown-content" key={contentKey}>
            <SpecialBlockProvider value={specialBlocks.contextValue}>
              <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkMarkdownAlerts]}
                rehypePlugins={rehypePlugins}
                components={markdownComponents}
              >
                {cleanMarkdown}
              </ReactMarkdown>
            </SpecialBlockProvider>
          </div>
        </div>
      </div>
    </div>
  );
}

export const MarkdownRenderer = memo(function MarkdownRenderer() {
  const isPeerMode = usePeerMode();
  return isPeerMode ? (
    <PeerMarkdownRendererView />
  ) : (
    <HostMarkdownRendererView />
  );
});
