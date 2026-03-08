import { useEffect, useState } from "react";
import rehypeShikiFromHighlighter from "@shikijs/rehype/core";
import { createHighlighter, type Highlighter } from "shiki";

let highlighterPromise: Promise<Highlighter> | null = null;

function getHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: ["github-light"],
      langs: [
        "javascript",
        "typescript",
        "tsx",
        "jsx",
        "python",
        "bash",
        "sh",
        "json",
        "yaml",
        "css",
        "html",
        "markdown",
        "sql",
        "rust",
        "go",
        "java",
        "c",
        "cpp",
      ],
    });
  }
  return highlighterPromise;
}

type RehypePlugin = [typeof rehypeShikiFromHighlighter, Highlighter, { theme: string; missingLang: string }];

export function useShikiRehypePlugin(): RehypePlugin | null {
  const [highlighter, setHighlighter] = useState<Highlighter | null>(null);

  useEffect(() => {
    let cancelled = false;
    getHighlighter()
      .then((h) => {
        if (!cancelled) setHighlighter(h);
      })
      .catch(() => {
        // Allow retry on next mount by clearing the cached promise
        highlighterPromise = null;
      });
    return () => { cancelled = true; };
  }, []);

  if (!highlighter) return null;
  return [rehypeShikiFromHighlighter, highlighter, { theme: "github-light", missingLang: "ignore" }];
}
