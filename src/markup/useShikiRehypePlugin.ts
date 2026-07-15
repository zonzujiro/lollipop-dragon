import { useEffect, useState } from "react";
import rehypeShikiFromHighlighter from "@shikijs/rehype/core";
import type { HighlighterCore } from "shiki/core";

let highlighterPromise: Promise<HighlighterCore> | null = null;

function getHighlighter(): Promise<HighlighterCore> {
  if (!highlighterPromise) {
    highlighterPromise = import("./createShikiHighlighter").then((module) =>
      module.createApplicationHighlighter(),
    );
  }
  return highlighterPromise;
}

type RehypePlugin = [
  typeof rehypeShikiFromHighlighter,
  HighlighterCore,
  { theme: string; missingLang: string },
];

export function useShikiRehypePlugin(): RehypePlugin | null {
  const [highlighter, setHighlighter] = useState<HighlighterCore | null>(null);

  useEffect(() => {
    let cancelled = false;
    getHighlighter()
      .then((loadedHighlighter) => {
        if (!cancelled) {
          setHighlighter(loadedHighlighter);
        }
      })
      .catch((error: unknown) => {
        // Allow retry on next mount by clearing the cached promise
        highlighterPromise = null;
        console.warn("[syntax-highlighting] failed to load Shiki:", error);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!highlighter) {
    return null;
  }
  return [
    rehypeShikiFromHighlighter,
    highlighter,
    { theme: "github-light", missingLang: "ignore" },
  ];
}
