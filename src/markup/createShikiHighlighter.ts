import { createHighlighterCore } from "shiki/core";
import { createOnigurumaEngine } from "shiki/engine/oniguruma";
import githubLight from "@shikijs/themes/github-light";
import bash from "@shikijs/langs/bash";
import c from "@shikijs/langs/c";
import cpp from "@shikijs/langs/cpp";
import css from "@shikijs/langs/css";
import go from "@shikijs/langs/go";
import html from "@shikijs/langs/html";
import java from "@shikijs/langs/java";
import javascript from "@shikijs/langs/javascript";
import jsx from "@shikijs/langs/jsx";
import json from "@shikijs/langs/json";
import markdown from "@shikijs/langs/markdown";
import python from "@shikijs/langs/python";
import rust from "@shikijs/langs/rust";
import sql from "@shikijs/langs/sql";
import tsx from "@shikijs/langs/tsx";
import typescript from "@shikijs/langs/typescript";
import yaml from "@shikijs/langs/yaml";

export async function createApplicationHighlighter() {
  return createHighlighterCore({
    themes: [githubLight],
    langs: [
      ...bash,
      ...c,
      ...cpp,
      ...css,
      ...go,
      ...html,
      ...java,
      ...javascript,
      ...jsx,
      ...json,
      ...markdown,
      ...python,
      ...rust,
      ...sql,
      ...tsx,
      ...typescript,
      ...yaml,
    ],
    engine: createOnigurumaEngine(import("shiki/wasm")),
  });
}
