import {
  Children,
  isValidElement,
  type ComponentPropsWithoutRef,
  type ReactNode,
  useContext,
} from "react";
import { CodeCommentSurface } from "../CodeCommentSurface";
import { MermaidBlock } from "../MermaidBlock";
import type { MermaidComment } from "../MermaidBlock/MermaidBlock";
import type { CommentAnchorDraft } from "../../../types/criticmarkup";
import {
  SpecialBlockContext,
  type SpecialBlockContextValue,
} from "./specialBlockContext";

export function CodeBlock({
  className,
  children,
}: ComponentPropsWithoutRef<"code">) {
  return <code className={className}>{children}</code>;
}

interface PreBlockProps extends ComponentPropsWithoutRef<"pre"> {
  "data-block-index"?: number | string;
}

function textFromReactNode(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node.map(textFromReactNode).join("");
  }
  if (isValidElement<{ children?: ReactNode }>(node)) {
    return textFromReactNode(node.props.children);
  }
  return "";
}

export function PreBlock({ children, ...props }: PreBlockProps) {
  const specialBlock = useContext(SpecialBlockContext);
  const child = Children.toArray(children)[0];
  if (!isValidElement<{ className?: string; children?: ReactNode }>(child)) {
    return <pre>{children}</pre>;
  }
  const rawBlockIndex = props["data-block-index"];
  const blockIndex = Number(rawBlockIndex);
  if (!specialBlock || !Number.isInteger(blockIndex)) {
    return <pre data-block-index={rawBlockIndex}>{children}</pre>;
  }
  const className = child.props.className;
  const plainText = textFromReactNode(child.props.children).replace(/\n$/, "");
  const blockComments = specialBlock.comments.filter(
    (comment) => comment.blockIndex === blockIndex && !!comment.anchor,
  );
  const onCreateAnchor = (anchor: CommentAnchorDraft) => {
    specialBlock.onCreateAnchor(blockIndex, anchor);
  };
  if (className?.includes("language-mermaid")) {
    const mermaidComments: MermaidComment[] = blockComments.map((comment) => ({
      id: comment.id,
      type: comment.type,
      anchor: comment.anchor,
      authorLabel: comment.thread?.authorLabel ?? "You",
    }));
    return (
      <MermaidBlock
        activeCommentId={specialBlock.activeCommentId}
        blockIndex={blockIndex}
        code={plainText}
        comments={mermaidComments}
        initialView={specialBlock.specialViews.get(blockIndex)}
        onCreateAnchor={onCreateAnchor}
        onSelectComment={specialBlock.onSelectComment}
        onViewChange={(view) => specialBlock.onViewChange(blockIndex, view)}
      />
    );
  }
  return (
    <div className="code-comment-block" data-block-index={blockIndex}>
      <CodeCommentSurface
        plainText={plainText}
        languageClassName={className}
        onCreateAnchor={onCreateAnchor}
      >
        {child.props.children}
      </CodeCommentSurface>
    </div>
  );
}

export function SpecialBlockProvider({
  children,
  value,
}: {
  children: ReactNode;
  value: SpecialBlockContextValue;
}) {
  return (
    <SpecialBlockContext.Provider value={value}>
      {children}
    </SpecialBlockContext.Provider>
  );
}
