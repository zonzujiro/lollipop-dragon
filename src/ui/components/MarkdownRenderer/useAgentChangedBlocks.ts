import { type RefObject, useEffect, useRef, useState } from "react";
import type { AgentRun } from "../../../modules/agent-workflow";
import { getCleanMarkdownBlocks } from "./markdownDocument";

export function useAgentChangedBlocks(input: {
  activeAgentRun: AgentRun | null;
  bodyRef: RefObject<HTMLDivElement | null>;
  cleanMarkdown: string;
  rawContent: string;
}): void {
  const baselineRef = useRef<{ runId: string; blocks: string[] } | null>(null);
  const [changedBlocks, setChangedBlocks] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!input.activeAgentRun) {
      baselineRef.current = null;
      setChangedBlocks((currentBlocks) =>
        currentBlocks.size === 0 ? currentBlocks : new Set(),
      );
      return;
    }
    if (baselineRef.current?.runId !== input.activeAgentRun.id) {
      baselineRef.current = {
        runId: input.activeAgentRun.id,
        blocks: getCleanMarkdownBlocks(input.rawContent),
      };
      setChangedBlocks((currentBlocks) =>
        currentBlocks.size === 0 ? currentBlocks : new Set(),
      );
      return;
    }
    const nextBlocks = getCleanMarkdownBlocks(input.rawContent);
    const nextChangedBlocks = new Set<number>();
    const baselineBlocks = baselineRef.current.blocks;
    const blockCount = Math.max(baselineBlocks.length, nextBlocks.length);
    for (let blockIndex = 0; blockIndex < blockCount; blockIndex += 1) {
      if (baselineBlocks[blockIndex] !== nextBlocks[blockIndex]) {
        nextChangedBlocks.add(blockIndex);
      }
    }
    setChangedBlocks(nextChangedBlocks);
  }, [input.activeAgentRun, input.rawContent]);

  useEffect(() => {
    const body = input.bodyRef.current;
    if (!body) {
      return;
    }
    const blocks = body.querySelectorAll<HTMLElement>("[data-block-index]");
    for (const block of blocks) {
      const blockIndex = Number(block.dataset.blockIndex);
      if (changedBlocks.has(blockIndex)) {
        block.dataset.agentChanged = "true";
      } else {
        delete block.dataset.agentChanged;
      }
    }
  }, [changedBlocks, input.bodyRef, input.cleanMarkdown]);
}
