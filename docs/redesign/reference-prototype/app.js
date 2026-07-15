/* ============================================================
   Lollipop Dragon — interactive design prototype
   Vanilla JS, no build step. Open index.html in any browser.
   ============================================================ */
"use strict";

/* ---------------- data ---------------- */

const TYPES = {
  fix:      { hint: "something is wrong — correct it" },
  rewrite:  { hint: "right idea, wrong words" },
  expand:   { hint: "true but incomplete — go deeper" },
  clarify:  { hint: "ambiguous — make it precise" },
  question: { hint: "needs an answer, opens a thread" },
  remove:   { hint: "doesn’t belong — cut it" },
};
const TYPE_KEYS = Object.keys(TYPES);

const MERMAID_SVG = `
<div class="mermaid-box" style="border:1px solid var(--line);border-radius:10px;background:var(--bg-sunken);padding:22px;display:flex;justify-content:center;">
<svg width="430" height="180" viewBox="0 0 430 180" font-family="-apple-system" font-size="12">
  <rect x="10" y="20" width="120" height="40" rx="8" fill="none" stroke="var(--c-answer)" stroke-width="1.5"/>
  <text x="70" y="44" text-anchor="middle" fill="currentColor">sync running</text>
  <rect x="160" y="20" width="120" height="40" rx="8" fill="none" stroke="var(--c-rewrite)" stroke-width="1.5"/>
  <text x="220" y="44" text-anchor="middle" fill="currentColor">lag &gt; 30 s</text>
  <rect x="310" y="20" width="110" height="40" rx="8" fill="none" stroke="var(--c-fix)" stroke-width="1.5"/>
  <text x="365" y="44" text-anchor="middle" fill="currentColor">halt cutover</text>
  <rect x="160" y="120" width="120" height="40" rx="8" fill="none" stroke="var(--c-expand)" stroke-width="1.5"/>
  <text x="220" y="144" text-anchor="middle" fill="currentColor">retry window</text>
  <path d="M130 40h28M280 40h28M220 62v52" stroke="var(--ink-muted)" stroke-width="1.5" fill="none"/>
  <path d="M156 40l-6 -4v8zM306 40l-6 -4v8zM220 118l-4 -6h8z" fill="var(--ink-muted)"/>
</svg></div>`;

function freshDocs() {
  return {
    "overview.md": { blocks: [
      { t: "h1", h: "Overview" },
      { t: "p", h: "This folder holds the research for the ingestion-pipeline rebuild: storage evaluation, API surface, and the quarterly roadmap. Everything here was drafted by claude-code and is under review." },
      { t: "p", h: "Start with <code>database/comparison.md</code> — it carries the main recommendation. The roadmap is presentable as slides straight from this app." },
    ]},
    "database/comparison.md": { blocks: [
      { t: "h1", h: "Database Comparison" },
      { t: "p", h: "This document evaluates storage options for the ingestion pipeline. The evaluation covers operational cost, read latency under load, and the migration path from the current SQLite prototype." },
      { t: "h2", h: "Recommendation" },
      { t: "p", h: "PostgreSQL is the best choice for this project given the relational access patterns and the team's operational familiarity. It offers mature tooling, predictable performance, and a straightforward path from the prototype schema." },
      { t: "table", h: "<tr><th>Criterion</th><th>PostgreSQL</th><th>MySQL</th><th>SQLite</th></tr><tr><td>p95 read latency</td><td>4.2 ms</td><td>5.1 ms</td><td>1.8 ms</td></tr><tr><td>Concurrent writers</td><td>High</td><td>High</td><td>Single</td></tr><tr><td>Ops overhead</td><td>Medium</td><td>Medium</td><td>None</td></tr>" },
      { t: "h2", h: "Migration Path" },
      { t: "p", h: "The migration can be completed in a single maintenance window by exporting the SQLite database, transforming the schema, and replaying the write-ahead log against the new primary." },
      { t: "pre", h: "<span style='color:var(--ink-muted)'># one-shot migration</span>\nsqlite3 app.db .dump | sqlite-to-pg \\\n  --schema map.yaml --target $PG_URL" },
      { t: "p", h: "Rollback is handled by keeping the SQLite file read-only for 14 days after cutover. If error rates exceed the baseline, traffic is switched back within minutes." },
    ]},
    "database/benchmarks.md": { blocks: [
      { t: "h1", h: "Benchmarks" },
      { t: "p", h: "We ran each candidate for six hours against a replay of production traffic. In general the results were consistent across runs, with some variance in the tail that is discussed further down, after the methodology notes and the environment description." },
      { t: "table", h: "<tr><th>Engine</th><th>p50</th><th>p95</th><th>p99.9</th></tr><tr><td>PostgreSQL 17</td><td>1.1 ms</td><td>4.2 ms</td><td>11 ms</td></tr><tr><td>MySQL 9</td><td>1.3 ms</td><td>5.1 ms</td><td>19 ms</td></tr><tr><td>SQLite (WAL)</td><td>0.4 ms</td><td>1.8 ms</td><td>210 ms*</td></tr>" },
      { t: "p", h: "<em>* single-writer stalls under concurrent load — see the retry histogram.</em>" },
      { t: "pre", h: "replay --source prod-2026-06 --rate 8x \\\n  --duration 6h --report out/bench.json" },
    ]},
    "database/migration-risks.md": { blocks: [
      { t: "h1", h: "Migration Risks" },
      { t: "p", h: "Three risks dominate the cutover plan: replication lag during the sync phase, split-brain writes if the proxy flips early, and silent schema drift between the prototype and production." },
      { t: "h2", h: "Failure Modes" },
      { t: "mermaid", view: "diagram",
        src: "flowchart LR\n  sync[sync running] --> lag{lag > 30 s}\n  lag -->|abort| halt[halt cutover]\n  lag -->|wait| retry[retry window]",
        h: `<div class="mermaid-box" style="border:1px solid var(--line);border-radius:10px;background:var(--bg-sunken);padding:24px 22px;display:flex;justify-content:center;">
<svg width="470" height="182" viewBox="0 0 470 182" font-family="-apple-system" font-size="12.5">
  <path d="M144 46h28M304 46h28M230 66v40" stroke="var(--ink-muted)" stroke-width="1.5" fill="none"/>
  <path d="M176 46l-7-4v8zM336 46l-7-4v8zM230 110l-4-7h8z" fill="var(--ink-muted)"/>
  <g class="mnode" data-label="sync running"><rect x="20" y="26" width="124" height="40" rx="8" fill="var(--surface)" stroke="var(--line-strong)" stroke-width="1.5"/><text x="82" y="50" text-anchor="middle" fill="currentColor">sync running</text></g>
  <g class="mnode" data-label="lag &gt; 30 s"><rect x="176" y="26" width="108" height="40" rx="8" fill="var(--surface)" stroke="var(--line-strong)" stroke-width="1.5"/><text x="230" y="50" text-anchor="middle" fill="currentColor">lag &gt; 30 s</text></g>
  <g class="mnode" data-label="halt cutover"><rect x="336" y="26" width="114" height="40" rx="8" fill="var(--surface)" stroke="var(--line-strong)" stroke-width="1.5"/><text x="393" y="50" text-anchor="middle" fill="currentColor">halt cutover</text></g>
  <g class="mnode" data-label="retry window"><rect x="168" y="114" width="124" height="40" rx="8" fill="var(--surface)" stroke="var(--line-strong)" stroke-width="1.5"/><text x="230" y="138" text-anchor="middle" fill="currentColor">retry window</text></g>
</svg></div>` },
      { t: "p", h: "The replication watchdog aborts automatically when lag stays above the threshold for two consecutive checks. Manual intervention is expected to be rare and is limited to the on-call runbook." },
      { t: "pre", h: "<span style='color:var(--ink-muted)'># watchdog thresholds</span>\nlag_abort_seconds: 30\ndrift_check: on_schema_change" },
    ]},
    "api/endpoints.md": { blocks: [
      { t: "h1", h: "API Endpoints" },
      { t: "p", h: "The public surface is intentionally small: four REST endpoints plus one WebSocket channel. Everything else stays internal behind the gateway." },
      { t: "h2", h: "Rate Limiting" },
      { t: "p", h: "Every endpoint is limited per API key. Burst traffic is smoothed with a token bucket of 50 requests refilled at 10 per second, which comfortably covers the P99 client observed in staging." },
      { t: "h2", h: "Authentication" },
      { t: "p", h: "Clients authenticate with v0 bearer tokens issued by the console. Tokens rotate automatically every 90 days with a 24-hour overlap so clients can switch without downtime." },
      { t: "pre", h: "GET  /v1/documents        list document metadata\nPOST /v1/documents        create from markdown\nGET  /v1/documents/:id    fetch a single document" },
    ]},
    "api/auth-flow.md": { blocks: [
      { t: "h1", h: "Auth Flow" },
      { t: "p", h: "Authentication is a two-step exchange: the client trades its long-lived key for a short-lived session token at the gateway, then uses the session token for every subsequent call." },
      { t: "pre", h: "POST /v1/session   { api_key }  →  { token, ttl: 900 }" },
    ]},
    "roadmap.md": { blocks: [
      { t: "h1", h: "Ship the peer review loop" },
      { t: "p", h: "One quarter, three bets — each one shortens the distance between “the agent wrote it” and “the team trusts it.”" },
      { t: "ul", h: "<li>Encrypted share links open in any browser, no accounts</li><li>Comments stream back to the host in under a second</li><li>One keystroke hands the whole review to the agent</li>" },
      { t: "h1", h: "Instrument the review funnel" },
      { t: "p", h: "We only believe what we can measure. Three numbers tell us the loop is alive:" },
      { t: "ul", h: "<li>First comment in under 10 seconds from file open</li><li>Share-to-first-peer-comment under one minute</li><li>Median review round — comment to resolved — under an hour</li>" },
      { t: "h1", h: "Desktop agent GA" },
      { t: "p", h: "The desktop build turns copy-paste into a button: run the agent against the open comments, watch edits stream in, keep the terminal one flick away." },
      { t: "ul", h: "<li>One run per workspace, three app-wide</li><li>Run history with copyable prompts</li><li>Never in peer mode — agents act only for the host</li>" },
    ]},
    "release-plan.md": { blocks: [
      { t: "h1", h: "Release Plan — v2.0" },
      { t: "p", h: "This is a single-file workspace: the same reading room without the folder tree. Everything works here too — commenting, the agent, presentation mode." },
      { t: "h2", h: "Gates" },
      { t: "ul", h: "<li>All P0 review comments resolved</li><li>Perf budget: 10k-line file renders under 1 s</li><li>Accessibility pass at WCAG AA in both themes</li>" },
      { t: "h2", h: "Timeline" },
      { t: "table", h: "<tr><th>Week</th><th>Milestone</th></tr><tr><td>29</td><td>Feature freeze</td></tr><tr><td>30</td><td>Review + agent fix rounds</td></tr><tr><td>31</td><td>Ship</td></tr>" },
    ]},
  };
}

const TREE = [
  { dir: "database", files: ["database/comparison.md", "database/benchmarks.md", "database/migration-risks.md"] },
  { dir: "api", files: ["api/endpoints.md", "api/auth-flow.md"] },
  { file: "overview.md" },
  { file: "roadmap.md" },
];

function freshComments() {
  return [
    { id: "c1", file: "database/comparison.md", block: 3, type: "fix", author: "You", when: "2 min",
      quote: "PostgreSQL is the best choice for this project",
      text: "This claim needs evidence. Compare PostgreSQL, MySQL and SQLite on cost and latency for our actual workload.",
      state: "open", thread: [] },
    { id: "c2", file: "database/comparison.md", block: 6, type: "question", author: "Marta", when: "18 min",
      quote: "completed in a single maintenance window",
      text: "What happens to writes that land during the WAL replay?",
      state: "open", thread: [
        { author: "claude-code", text: "Writes are queued at the proxy and replayed after cutover — added §3.2 covering the buffer window." },
        { author: "Marta", text: "Does the buffer have a size limit? A burst during cutover could overflow it." },
        { author: "You", text: "Good point — capped at 10k writes today. Beyond that the proxy rejects with a retry hint." },
        { author: "claude-code", text: "Documented the 10k cap and the retry-after behaviour in §3.2.1, with a link to the proxy config." },
        { author: "Alex", text: "Can we surface a metric for buffer depth? Otherwise we only learn about pressure from rejects." },
        { author: "You", text: "Yes — adding buffer_depth to the cutover dashboard before the drill." },
      ] },
    { id: "c3", file: "database/comparison.md", block: 8, type: "expand", author: "Alex", when: "1 h",
      quote: "keeping the SQLite file read-only for 14 days",
      text: "Add the exact alert thresholds and who owns the rollback decision.",
      state: "open", thread: [] },
    { id: "c8", file: "database/comparison.md", block: 7, type: "fix", author: "You", when: "10 min",
      quote: "--schema map.yaml --target $PG_URL",
      text: "The --schema flag died in v2 — the schema map is auto-detected now. Drop it from the command.",
      state: "open", thread: [] },
    { id: "c7", file: "database/migration-risks.md", block: 3, type: "question", author: "Marta", when: "25 min",
      quote: "retry window",
      text: "What's the max retry budget before we abort for the day?",
      state: "open", thread: [] },
    { id: "c6", file: "database/comparison.md", block: 3, type: "clarify", author: "Alex", when: "35 min",
      quote: "the best choice for this project given the relational access patterns",
      text: "“Best” by which criterion? Scope the claim to our access patterns explicitly.",
      state: "open", thread: [] },
    { id: "c4", file: "database/benchmarks.md", block: 1, type: "rewrite", author: "You", when: "3 h",
      quote: null,
      text: "Lead with the p95 chart — the prose buries the result.",
      state: "open", thread: [] },
    { id: "c5", file: "api/endpoints.md", block: 5, type: "fix", author: "Marta", when: "4 h",
      quote: "v0 bearer tokens",
      text: "The auth section still references the old v0 token format.",
      state: "open", thread: [] },
  ];
}

const AGENT_PLAN = [
  { cid: "c1", term: "fix: “claim needs evidence” → rewriting Recommendation with benchmark data",
    apply() {
      DOCS["database/comparison.md"].blocks[3].h =
        '<span class="diffline">PostgreSQL is recommended based on the benchmark below: it holds 4.2 ms p95 reads at 8× our current write load, while SQLite degrades past a single writer and MySQL costs 22% more on RDS for equal throughput.</span>';
    } },
  { cid: "c2", term: "question: “writes during WAL replay” → answering + adding §3.2 buffer window",
    apply() {
      const c = COMMENTS.find(x => x.id === "c2");
      c.thread.push({ author: "claude-code", text: "Writes are queued at the proxy and replayed after cutover — added §3.2 covering the buffer window." });
      DOCS["database/comparison.md"].blocks[6].h +=
        ' <span class="diffline">Writes that arrive during the replay are buffered at the proxy and applied before cutover completes (§3.2).</span>';
    }, done: "answered" },
  { cid: "c3", term: "expand: “rollback thresholds” → adding alert numbers + runbook owner",
    apply() {
      DOCS["database/comparison.md"].blocks[8].h +=
        ' <span class="diffline">Alerts fire at a 2% error-rate delta or a 500 ms p95 regression; the on-call engineer owns the rollback call (runbook: ops/rollback.md).</span>';
    } },
  { cid: "c4", term: "rewrite: benchmarks.md → leading with the p95 result",
    apply() {
      DOCS["database/benchmarks.md"].blocks[1].h =
        '<span class="diffline">PostgreSQL wins where it matters: 4.2 ms at p95 under an 8× replay of production traffic — the chart below carries the result, the methodology follows it.</span>';
    } },
  { cid: "c5", term: "fix: endpoints.md → replacing v0 token references with v1 session tokens",
    apply() {
      DOCS["api/endpoints.md"].blocks[5].h =
        '<span class="diffline">Clients authenticate with v1 session tokens issued by the gateway (see auth-flow.md). Tokens rotate automatically every 90 days with a 24-hour overlap so clients can switch without downtime.</span>';
    } },
];

/* ---------------- state ---------------- */

let DOCS = freshDocs();
let COMMENTS = freshComments();

const WORKSPACES = {
  ws1: { id: "ws1", label: "research-notes", kind: "folder", activeFile: "database/comparison.md",
         files: ["overview.md", "database/comparison.md", "database/benchmarks.md", "database/migration-risks.md", "api/endpoints.md", "api/auth-flow.md", "roadmap.md"] },
  ws2: { id: "ws2", label: "release-plan.md", kind: "file", activeFile: "release-plan.md", files: ["release-plan.md"] },
};

const state = {
  view: "landing",           // landing | host | peer
  openWs: [],                // workspace ids
  activeWs: null,
  filter: "all",
  sel: null,                 // selected comment id
  hoverBlock: null,
  composer: null,            // {file, block, quote, type, draft}
  agent: null,               // {statuses, progress, doneCount, finished}
  peerName: "Marta",
  peerComments: [],
  restoreLock: false,       // browser dropped the folder handle — read-only until restored
  present: null,             // {slides, i}
  sidebar: true,
  rail: true,
};

/* ---------------- helpers ---------------- */

const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const cssVars = (t) => `--ct:var(--c-${t});--ct-soft:var(--c-${t}-soft)`;
const AV = { You: ["av-you", "IV"], Marta: ["av-p1", "MK"], Alex: ["av-p2", "AL"], "claude-code": ["av-agent", "CC"] };

function toast(msg, tick) {
  const t = document.createElement("div");
  t.className = "toast";
  t.innerHTML = (tick ? '<span class="tick">✓</span> ' : "") + esc(msg);
  $("#toast-wrap").appendChild(t);
  setTimeout(() => { t.style.opacity = "0"; t.style.transition = "opacity .3s"; }, 2400);
  setTimeout(() => t.remove(), 2800);
}

function ws() { return WORKSPACES[state.activeWs]; }
function openCount(file) { return COMMENTS.filter(c => c.file === file && c.state === "open").length; }
function wsOpenCount(w) { return w.files.reduce((n, f) => n + openCount(f), 0); }

function setView(v) {
  state.view = v;
  $$(".view").forEach(el => el.classList.toggle("active", el.id === "view-" + v));
}

/* ---------------- rendering: host ---------------- */

function renderTabs() {
  const el = $("#tabs");
  el.innerHTML = "";
  state.openWs.forEach(id => {
    const w = WORKSPACES[id];
    const n = wsOpenCount(w);
    const d = document.createElement("div");
    d.className = "doc-tab" + (id === state.activeWs ? " active" : "");
    d.dataset.ws = id;
    const icon = w.kind === "folder"
      ? '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>'
      : '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/></svg>';
    d.innerHTML = `${icon} ${esc(w.label)} ${n ? `<span class="badge">${n}</span>` : ""} <span class="x" data-close="${id}">×</span>`;
    el.appendChild(d);
  });
  const add = document.createElement("div");
  add.className = "doc-tab add";
  add.textContent = "+";
  add.dataset.addTab = "1";
  el.appendChild(add);
}

function renderTree() {
  const w = ws();
  $("#ws-name").textContent = w.label;
  const el = $("#tree");
  el.innerHTML = "";
  const fileRow = (path, indent) => {
    const name = path.split("/").pop();
    const n = openCount(path);
    const r = document.createElement("div");
    r.className = "row" + (indent ? " indent-1" : "") + (path === w.activeFile ? " on" : "");
    r.dataset.file = path;
    r.innerHTML = `${esc(name)} <span class="count${n ? "" : " zero"}">${n || ""}</span>`;
    return r;
  };
  if (w.kind === "file") {
    el.appendChild(fileRow(w.files[0], false));
    return;
  }
  TREE.forEach(node => {
    if (node.dir) {
      const d = document.createElement("div");
      d.className = "row dir";
      d.innerHTML = `<span class="chev">▾</span>${esc(node.dir)}`;
      el.appendChild(d);
      node.files.forEach(f => el.appendChild(fileRow(f, true)));
    } else {
      el.appendChild(fileRow(node.file, false));
    }
  });
}

function preLines(html) {
  const lines = html.split("\n");
  const body = lines.map((line, i) =>
    `<span class="cl" data-line="${i}">${line}${i < lines.length - 1 ? "\n" : ""}</span>`
  ).join("");
  return `<pre class="numbered">${body}</pre>`;
}

function blockHTML(b) {
  if (b.t === "h1") return `<h1>${b.h}</h1>`;
  if (b.t === "h2") return `<h2>${b.h}</h2>`;
  if (b.t === "p") return `<p>${b.h}</p>`;
  if (b.t === "pre") return preLines(b.h);
  if (b.t === "mermaid") return b.view === "source" ? preLines(esc(b.src)) : b.h;
  if (b.t === "table") return `<table>${b.h}</table>`;
  if (b.t === "ul") return `<ul style="padding-left:22px;display:flex;flex-direction:column;gap:6px;">${b.h}</ul>`;
  if (b.t === "quote") return `<blockquote>${b.h}</blockquote>`;
  return b.h; // html
}

/* ----- range anchoring: character-precise, overlap-aware ----- */

const _plainDiv = document.createElement("div");
function plainOf(html) { _plainDiv.innerHTML = html; return _plainDiv.textContent; }
function blockPlain(file, block) {
  const b = DOCS[file] && DOCS[file].blocks[block];
  if (!b) return "";
  // mermaid comments anchor against the SOURCE — that's what lives in the file
  return b.t === "mermaid" ? b.src : plainOf(b.h);
}

// derive {start,end} ranges for seed comments that only carry a quote
function seedRanges(list) {
  list.forEach(c => {
    if (c.quote && !c.range) {
      const idx = blockPlain(c.file, c.block).indexOf(c.quote);
      if (idx !== -1) c.range = { start: idx, end: idx + c.quote.length };
    }
  });
}

// a range-anchored comment whose text was rewritten underneath it
function isOrphan(c) {
  if (!c.range || !c.quote) return false;
  return blockPlain(c.file, c.block).slice(c.range.start, c.range.end) !== c.quote;
}

// wrap every distinct overlap segment in its own span; stripes stack per comment
function applyHighlights(root, comments) {
  const anchored = comments
    .filter(c => c.range && !isOrphan(c))
    .sort((a, b) => a.range.start - b.range.start);
  if (!anchored.length) return;
  const bounds = [...new Set(anchored.flatMap(c => [c.range.start, c.range.end]))].sort((x, y) => x - y);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  let offset = 0;
  nodes.forEach(node => {
    const nodeStart = offset;
    const nodeLen = node.length;
    offset += nodeLen;
    const nodeEnd = nodeStart + nodeLen;
    // segment boundaries inside this node
    const cuts = [nodeStart, ...bounds.filter(b => b > nodeStart && b < nodeEnd), nodeEnd];
    const pieces = [];
    for (let i = 0; i < cuts.length - 1; i++) {
      const s = cuts[i], e = cuts[i + 1];
      const covering = anchored.filter(c => c.range.start < e && c.range.end > s);
      if (covering.length) pieces.push({ s, e, covering });
    }
    let cur = node, curStart = nodeStart;
    pieces.forEach(p => {
      if (!cur) return;
      if (p.s > curStart) { cur = cur.splitText(p.s - curStart); curStart = p.s; }
      let rest = null;
      if (p.e - curStart < cur.length) rest = cur.splitText(p.e - curStart);
      const span = document.createElement("span");
      span.className = "hl2" + (p.covering.length > 1 ? " hl2-multi" : "");
      span.dataset.cids = p.covering.map(c => c.id).join(",");
      span.title = p.covering.map(c => `${c.type} — ${c.author}`).join("  ·  ");
      const tints = p.covering.map(c => `linear-gradient(var(--c-${c.type}-soft), var(--c-${c.type}-soft))`);
      const stripes = p.covering.map((c, i) => `inset 0 ${-2 * (i + 1) - i}px 0 var(--c-${c.type})`);
      if (p.covering.some(c => c.id === state.sel)) {
        const selC = p.covering.find(c => c.id === state.sel);
        stripes.unshift(`0 0 0 3px color-mix(in srgb, var(--c-${selC.type}) 20%, transparent)`);
      }
      span.style.backgroundImage = tints.join(",");
      span.style.boxShadow = stripes.join(",");
      cur.replaceWith(span);
      span.appendChild(cur);
      cur = rest;
      curStart = p.e;
    });
  });
}

// diagram view: a comment whose quote equals a node label rings that node and pins a dot to it
function decorateMermaid(blk, comments) {
  const body = blk.querySelector(".blk-body");
  const blkBox = blk.getBoundingClientRect();
  comments.filter(c => !isOrphan(c)).forEach(c => {
    const node = Array.from(body.querySelectorAll(".mnode"))
      .find(n => n.dataset.label === c.quote);
    if (!node) return; // e.g. a source-line comment — margin marker only
    const rect = node.querySelector("rect");
    rect.style.stroke = `var(--c-${c.type})`;
    rect.style.strokeWidth = c.id === state.sel ? "4" : "2.5";
    const box = rect.getBoundingClientRect();
    const pin = document.createElement("span");
    pin.className = "mpin" + (c.id === state.sel ? " sel" : "") + (c.fresh ? " fresh" : "");
    pin.dataset.cids = c.id;
    pin.title = `${c.type} — ${c.author}`;
    pin.style.background = `var(--c-${c.type})`;
    pin.style.left = `${box.right - blkBox.left - 7}px`;
    pin.style.top = `${box.top - blkBox.top - 7}px`;
    blk.appendChild(pin);
  });
}

// character offset of a DOM point within root
function offsetIn(root, node, nodeOffset) {
  const r = document.createRange();
  r.selectNodeContents(root);
  try { r.setEnd(node, nodeOffset); } catch { return null; }
  return r.toString().length;
}

function renderDoc(container, file, opts) {
  const peer = opts && opts.peer;
  const doc = DOCS[file];
  const comments = (peer ? state.peerComments : COMMENTS).filter(c => c.file === file && c.state === "open");
  const beingEdited = state.agent && !state.agent.finished && !peer;
  let out = `<p class="kicker">${esc(file)} · ${beingEdited ? '<span class="live">being edited by claude-code</span>' : (peer ? "snapshot from today, 14:02" : "updated 2 min ago by claude-code")}</p>`;
  doc.blocks.forEach((b, i) => {
    const here = comments.filter(c => c.block === i)
      .sort((x, y) => (x.range ? x.range.start : -1) - (y.range ? y.range.start : -1));
    const markers = here.map(c =>
      `<span class="marker${c.id === state.sel ? " sel" : ""}${c.fresh ? " fresh" : ""}" data-cid="${c.id}" style="--mark-line:var(--c-${c.type})" title="${c.type}"><span class="dot" style="background:var(--c-${c.type})"></span></span>`
    ).join("");
    const lane = `<span class="blk-lane">${markers}<span class="blk-add" data-add="${i}" title="Comment on this block (C)">+</span></span>`;
    const tools = b.t === "mermaid"
      ? `<span class="blk-tools"><button class="mchip ${b.view !== "source" ? "on" : ""}" data-mview="diagram" data-mblock="${i}">diagram</button><button class="mchip ${b.view === "source" ? "on" : ""}" data-mview="source" data-mblock="${i}">source</button></span>`
      : "";
    out += `<div class="blk" data-i="${i}" data-file="${esc(file)}">${lane}${tools}<div class="blk-body">${blockHTML(b)}</div></div>`;
  });
  container.innerHTML = out;
  // paint character-range highlights (overlap-aware) on top of the rendered DOM
  container.querySelectorAll(".blk").forEach(blk => {
    const i = parseInt(blk.dataset.i, 10);
    const b = doc.blocks[i];
    const here = comments.filter(c => c.block === i && c.range);
    if (!here.length) return;
    if (b.t === "mermaid" && b.view !== "source") {
      decorateMermaid(blk, here);
    } else {
      applyHighlights(blk.querySelector(".blk-body"), here);
    }
  });
  if (state.composer && state.composer.file === file && state.composer.peer === !!peer) {
    const blk = container.querySelector(`.blk[data-i="${state.composer.block}"]`);
    if (blk) { blk.appendChild(buildComposer()); const ta = blk.querySelector("textarea"); ta.focus(); ta.value = state.composer.draft || ""; }
  }
  comments.forEach(c => delete c.fresh);
}

function commentCard(c, opts) {
  const peer = opts && opts.peer;
  const card = document.createElement("div");
  card.className = "c-card" + (c.id === state.sel ? " sel" : "") + (c.state === "resolved" ? " done" : "");
  card.dataset.cid = c.id;
  card.style.cssText = cssVars(c.type);
  const st = state.agent ? (state.agent.statuses[c.id] || null) : null;
  let right;
  if (st === "working") right = '<span class="state working">● in progress</span>';
  else if (st === "done") right = `<span class="state done">✓ ${c.doneLabel || "resolved"}</span>`;
  else if (st === "queued") right = '<span class="state queued">○ queued</span>';
  else if (peer) right = '<span class="sent-tick">✓ sent</span>';
  else if (c.state === "resolved") right = `<span class="state done">✓ ${c.doneLabel || "resolved"}</span>`;
  else right = `<span class="when">${c.when || "now"}</span>`;
  const who = peer ? esc(c.file) : esc(c.author);
  const answered = c.type === "question" && c.thread.length > 0 && !state.agent && c.state === "open";
  if (answered) {
    right = `<span class="answered-chip">✓ answered · ${c.thread.length}</span>`;
  }
  let html = `<div class="top"><span class="type-tag">${c.type}</span><span class="who">${who}</span>${right}</div>`;
  if (c.quote) html += `<div class="quote">“${esc(c.quote)}”</div>`;
  if (c.state === "open" && isOrphan(c)) {
    html += `<div class="orphan-note">text changed underneath — anchor released, quote kept</div>`;
  }
  html += `<div class="body">${esc(c.text)}</div>`;
  if (c.thread.length) {
    const renderReply = (r) => {
      const [cls, ini] = AV[r.author] || ["av-you", "?"];
      return `<div class="thread"><span class="avatar ${cls}">${ini}</span><span><b style="color:var(--ink)">${esc(r.author)}</b> — ${esc(r.text)}</span></div>`;
    };
    let rows;
    if (!c.threadExpanded && c.thread.length > 3) {
      rows = [
        renderReply(c.thread[0]),
        `<button class="thread-collapse" data-expand-thread="${c.id}">⌄ ${c.thread.length - 2} more replies</button>`,
        renderReply(c.thread[c.thread.length - 1]),
      ];
    } else {
      rows = c.thread.map(renderReply);
      if (c.thread.length > 3) {
        rows.push(`<button class="thread-collapse" data-expand-thread="${c.id}">⌃ collapse thread</button>`);
      }
    }
    html += `<div class="thread-list">${rows.join("")}</div>`;
  }
  if (!peer && c.state === "open" && c.type === "question" && c.id === state.sel && !state.agent) {
    html += `<div class="reply-row"><input data-reply-input="${c.id}" placeholder="Reply — Enter to send" maxlength="200"></div>`;
  }
  if (!peer && c.state === "open" && !state.agent) {
    card.classList.add("actionable");
    html += `<div class="actions"><button data-resolve="${c.id}">✓ Resolve</button></div>`;
  }
  card.innerHTML = html;
  return card;
}

function renderRail() {
  const w = ws();
  const open = COMMENTS.filter(c => c.state === "open" && w.files.includes(c.file));
  const resolved = COMMENTS.filter(c => c.state === "resolved" && w.files.includes(c.file));
  $("#rail-count").textContent = `${open.length} open${resolved.length ? " · " + resolved.length + " resolved" : ""}`;
  // filters
  const counts = {};
  open.forEach(c => { counts[c.type] = (counts[c.type] || 0) + 1; });
  let chips = `<span class="chip ${state.filter === "all" ? "on" : ""}" data-filter="all">All ${open.length}</span>`;
  TYPE_KEYS.forEach(t => {
    if (counts[t]) chips += `<span class="chip ${state.filter === t ? "on" : ""}" data-filter="${t}"><span class="swatch" style="background:var(--c-${t})"></span>${t} ${counts[t]}</span>`;
  });
  if (resolved.length) chips += `<span class="chip ${state.filter === "resolved" ? "on" : ""}" data-filter="resolved">Resolved ${resolved.length}</span>`;
  $("#filters").innerHTML = chips;
  // list
  const list = $("#rail-list");
  list.innerHTML = "";
  if (state.restoreLock) {
    const lockStrip = document.createElement("div");
    lockStrip.className = "resolved-strip";
    lockStrip.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--c-rewrite)" stroke-width="2.4"><rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg> read-only until folder access is restored`;
    list.appendChild(lockStrip);
  }
  const pool = state.filter === "resolved" ? resolved : open.filter(c => state.filter === "all" || c.type === state.filter);
  const byFile = w.files.filter(f => pool.some(c => c.file === f));
  if (!pool.length) {
    list.innerHTML = `<div class="rail-empty">${state.filter === "resolved" ? "Nothing resolved yet." : "No open comments.<br>Select any span of text — a word, half a sentence — even where another comment already lives. Overlaps are fine."}</div>`;
  }
  byFile.forEach(f => {
    const g = document.createElement("div");
    g.className = "file-group";
    g.textContent = f;
    list.appendChild(g);
    pool.filter(c => c.file === f)
        .sort((a, b) => a.block - b.block)
        .forEach(c => list.appendChild(commentCard(c)));
  });
  if (state.filter !== "resolved" && resolved.length && !state.agent) {
    const strip = document.createElement("div");
    strip.className = "resolved-strip";
    strip.dataset.filter = "resolved";
    strip.style.cursor = "pointer";
    strip.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--agent)" stroke-width="2.6"><path d="M20 6L9 17l-5-5"/></svg> ${resolved.length} resolved — kept for history, one click away`;
    list.appendChild(strip);
  }
  renderRunCard();
}

function renderRunCard() {
  const slot = $("#run-slot");
  if (!state.agent) { slot.innerHTML = ""; return; }
  const a = state.agent;
  const total = AGENT_PLAN.length;
  if (!a.finished) {
    slot.innerHTML = `<div class="run-card">
      <div class="top"><span class="spin"></span>
        <div><div class="title">claude-code is addressing ${total} comments</div>
        <div class="sub">database/ · api/ — started just now</div></div>
        <button class="stop" data-stop-agent="1">Stop</button></div>
      <div class="bar"><i style="width:${a.progress}%"></i></div>
      <div class="meta"><span>${a.doneCount} of ${total} resolved</span><span>${a.working ? "1 in progress" : ""}</span><span style="margin-left:auto;text-decoration:underline;text-underline-offset:2px;cursor:pointer" data-copy-prompt="1">Copy prompt</span></div>
    </div>`;
  } else {
    slot.innerHTML = `<div class="run-card" style="border-color:var(--line);box-shadow:var(--shadow-card)">
      <div class="top"><span class="done-ic">✓</span>
        <div><div class="title">Run complete — ${a.doneCount} comments addressed</div>
        <div class="sub">claude-code · 8 s · edits are highlighted in teal</div></div>
        <button class="stop" data-dismiss-run="1">Dismiss</button></div>
    </div>`;
  }
}

function renderHost() {
  renderTabs();
  renderTree();
  renderDoc($("#doc-col"), ws().activeFile, {});
  renderRail();
  $("#restore-banner").hidden = !state.restoreLock;
  $("#host-pane").classList.toggle("locked", state.restoreLock);
  $("#btn-agent").classList.toggle("dimmed", state.restoreLock);
  $("#file-rail").classList.toggle("collapsed", !state.sidebar || ws().kind === "file");
  $("#sidebar-restore").classList.toggle("show", !state.sidebar && ws().kind !== "file");
  $("#rail").classList.toggle("collapsed", !state.rail);
  const folderMode = ws().kind === "folder";
  $("#host-conn").style.display = folderMode ? "" : "none";
  $(".presence", $("#view-host")).style.display = folderMode ? "" : "none";
}

/* ---------------- rendering: peer ---------------- */

function renderPeer() {
  const w = WORKSPACES.ws1;
  const el = $("#peer-tree");
  el.innerHTML = "";
  TREE.forEach(node => {
    if (node.dir) {
      const d = document.createElement("div");
      d.className = "row dir";
      d.innerHTML = `<span class="chev">▾</span>${esc(node.dir)}`;
      el.appendChild(d);
      node.files.forEach(f => {
        const r = document.createElement("div");
        r.className = "row indent-1" + (f === state.peerFile ? " on" : "");
        r.dataset.peerFile = f;
        r.textContent = f.split("/").pop();
        el.appendChild(r);
      });
    } else {
      const r = document.createElement("div");
      r.className = "row" + (node.file === state.peerFile ? " on" : "");
      r.dataset.peerFile = node.file;
      r.textContent = node.file;
      el.appendChild(r);
    }
  });
  renderDoc($("#peer-doc-col"), state.peerFile, { peer: true });
  // tray
  const tray = $("#peer-tray");
  tray.innerHTML = "";
  if (!state.peerComments.length) {
    tray.innerHTML = `<div class="rail-empty">Read, then select any text —<br>your comments appear here and reach Ivan instantly.</div>`;
  }
  state.peerComments.forEach(c => tray.appendChild(commentCard(c, { peer: true })));
  $("#peer-tray-count").textContent = state.peerComments.length ? `${state.peerComments.length} sent` : "";
  $("#peer-name-label").textContent = state.peerName;
  $("#peer-avatar").textContent = state.peerName.trim().slice(0, 2).toUpperCase();
}

/* ---------------- composer ---------------- */

function buildComposer() {
  const c = state.composer;
  const box = document.createElement("div");
  box.className = "composer";
  box.style.setProperty("--ct-line", `var(--c-${c.type})`);
  const chips = TYPE_KEYS.map((t, i) =>
    `<span class="t ${t === c.type ? "on" : ""}" data-type="${t}" style="--tcol:var(--c-${t});--tsoft:var(--c-${t}-soft)">${t === c.type ? `<span style="width:7px;height:7px;border-radius:2px;background:var(--c-${t})"></span>` : ""}${t} <span class="k">${i + 1}</span></span>`
  ).join("");
  box.innerHTML = `
    <div class="drag"><span></span></div>
    ${c.quote ? `<div class="quote-line">“${esc(c.quote)}”</div>` : ""}
    <div class="typebar">${chips}</div>
    <textarea placeholder="${TYPES[c.type].hint}…"></textarea>
    <div class="foot">
      <span class="hint">${c.peer ? "Sent to the host — encrypted" : "Written into the file as CriticMarkup"}</span>
      <button class="send" data-submit="1">${c.peer ? "Send comment" : "Comment"} <kbd>⌘↵</kbd></button>
    </div>`;
  return box;
}

function openComposer(file, block, quote, peer, range) {
  if (state.restoreLock && !peer) {
    toast("Read-only — restore folder access first");
    return;
  }
  state.composer = { file, block, quote: quote || null, range: range || null, type: state.composer && state.composer.type || "fix", peer: !!peer, draft: "" };
  rerenderDocs();
}

function closeComposer() {
  if (!state.composer) return false;
  state.composer = null;
  rerenderDocs();
  return true;
}

function submitComposer() {
  const c = state.composer;
  if (!c) return;
  const ta = $(".composer textarea");
  const text = (ta && ta.value.trim()) || "";
  if (!text) { ta && ta.focus(); return; }
  const comment = {
    id: "c" + Math.random().toString(36).slice(2, 8),
    file: c.file, block: c.block, type: c.type,
    author: c.peer ? state.peerName : "You",
    when: "now", quote: c.quote, range: c.range, text, state: "open", thread: [], fresh: true,
  };
  if (c.peer) {
    state.peerComments.push(comment);
    state.composer = null;
    renderPeer();
    toast("Comment sent — Ivan will see it instantly", true);
  } else {
    COMMENTS.push(comment);
    state.composer = null;
    state.sel = comment.id;
    renderHost();
    toast("Comment saved to the file as CriticMarkup", true);
  }
}

function rerenderDocs() {
  if (state.view === "host") renderHost();
  if (state.view === "peer") renderPeer();
}

/* ---------------- selection & navigation ---------------- */

function selectComment(id, scroll) {
  state.sel = id;
  const c = COMMENTS.find(x => x.id === id);
  if (c && ws().activeFile !== c.file && ws().files.includes(c.file)) {
    ws().activeFile = c.file;
  }
  renderHost();
  if (c) {
    if (scroll !== false) {
      const blk = $(`#doc-col .blk[data-i="${c.block}"]`);
      if (blk) blk.scrollIntoView({ block: "center" });
    }
    const card = $(`#rail-list .c-card[data-cid="${id}"]`);
    if (card) card.scrollIntoView({ block: "nearest" });
  }
}

function visibleComments() {
  const w = ws();
  return w.files.flatMap(f =>
    COMMENTS.filter(c => c.file === f && c.state === "open" && (state.filter === "all" || state.filter === "resolved" || c.type === state.filter))
            .sort((a, b) => a.block - b.block));
}

function nav(dir) {
  const list = visibleComments();
  if (!list.length) return;
  const i = list.findIndex(c => c.id === state.sel);
  const next = list[(i + dir + list.length) % list.length];
  selectComment(next.id);
}

/* ---------------- agent run ---------------- */

function runAgent() {
  if (state.restoreLock) { toast("Read-only — restore folder access first"); return; }
  if (state.agent && !state.agent.finished) return;
  const open = COMMENTS.filter(c => c.state === "open");
  if (!open.length) { toast("No open comments — the review is clean"); return; }
  state.agent = { statuses: {}, progress: 4, doneCount: 0, working: true, finished: false, timers: [] };
  AGENT_PLAN.forEach(step => {
    const c = COMMENTS.find(x => x.id === step.cid);
    if (c && c.state === "open") state.agent.statuses[step.cid] = "queued";
  });
  const btn = $("#btn-agent");
  btn.classList.add("running");
  $("#btn-agent-label").innerHTML = '<span class="spin" style="width:12px;height:12px;border-width:2px;display:inline-block;vertical-align:-2px"></span> Agent running…';
  const term = $("#term");
  term.hidden = false;
  term.classList.remove("collapsed");
  const tl = $("#tlines");
  tl.innerHTML = "";
  termLine('<span class="d">$</span> claude -p "Address the review comments in research-notes/"');
  const steps = AGENT_PLAN.filter(s => state.agent.statuses[s.cid]);
  termLine(`<span class="g">●</span> Reading comments… found ${steps.length + (COMMENTS.filter(c => c.state === "open").length - steps.length)} CriticMarkup annotations`);
  let t = 900;
  steps.forEach((step, idx) => {
    schedule(t, () => {
      state.agent.statuses[step.cid] = "working";
      state.agent.working = true;
      termLine(`<span class="g">●</span> ${esc(step.term)}`);
      rerenderHostSoft();
    });
    t += 1250;
    schedule(t, () => {
      step.apply();
      const c = COMMENTS.find(x => x.id === step.cid);
      c.state = "resolved";
      c.doneLabel = step.done || "resolved";
      state.agent.statuses[step.cid] = "done";
      state.agent.doneCount++;
      state.agent.working = false;
      state.agent.progress = Math.round(((idx + 1) / steps.length) * 100);
      termLine(`<span class="g">✓</span> Updated ${esc(step.cid === "c4" ? "database/benchmarks.md" : step.cid === "c5" ? "api/endpoints.md" : "database/comparison.md")} — removed 1 addressed annotation`);
      rerenderHostSoft();
    });
    t += 350;
  });
  // any user-added comments beyond the plan: resolve generically at the end
  schedule(t + 100, () => {
    COMMENTS.filter(c => c.state === "open").forEach(c => {
      c.state = "resolved";
      state.agent.doneCount++;
      termLine(`<span class="g">✓</span> Addressed “${esc(c.text.slice(0, 44))}…”`);
    });
    state.agent.finished = true;
    state.agent.progress = 100;
    btn.classList.remove("running");
    $("#btn-agent-label").textContent = "Run agent";
    termLine('<span class="d">▊</span> done — 8.1 s');
    rerenderHostSoft();
    toast("All comments addressed — edits highlighted in teal", true);
  });
}

function schedule(ms, fn) { state.agent.timers.push(setTimeout(fn, ms)); }

function stopAgent() {
  if (!state.agent) return;
  state.agent.timers.forEach(clearTimeout);
  state.agent.finished = true;
  $("#btn-agent").classList.remove("running");
  $("#btn-agent-label").textContent = "Run agent";
  termLine('<span class="d">✕ stopped by user</span>');
  renderHost();
  toast("Run stopped — finished edits are kept");
}

function termLine(html) {
  const d = document.createElement("div");
  d.innerHTML = html;
  $("#tlines").appendChild(d);
  const lines = $$("#tlines > div");
  if (lines.length > 6) lines[0].remove();
}

function rerenderHostSoft() { if (state.view === "host") renderHost(); }

/* ---------------- share sheet ---------------- */

function openShare() {
  if (state.restoreLock) { toast("Share management resumes once folder access is restored"); return; }
  const w = ws();
  const sheet = $("#share-sheet");
  sheet.innerHTML = `
    <div class="head"><h2>Share for review</h2>
      <div class="sub">Reviewers only need the link — no account, no install. Content is encrypted before it leaves this browser.</div></div>
    <div class="seg">
      <div class="opt ${w.kind === "file" ? "on" : ""}" data-scope="file">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/></svg> This file</div>
      <div class="opt ${w.kind === "folder" ? "on" : ""}" data-scope="folder">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg> Whole folder · ${w.files.length} files</div>
    </div>
    <div class="row-set">
      <div class="field"><label>Expires</label><div class="select">7 days <span style="color:var(--ink-muted)">▾</span></div></div>
      <div class="field"><label>Reviewers can</label><div class="select">Read &amp; comment <span style="color:var(--ink-muted)">▾</span></div></div>
    </div>
    <div class="linkbox">
      <div class="lab"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"><rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg> Encrypted link — key never leaves the URL</div>
      <div class="url">lollipop.dev/r/#doc=8f3a21c4<span class="frag">&amp;key=Qm9y…c2Vj</span></div>
      <div class="actions"><button class="btn primary" data-copy-link="1">Copy link</button><button class="btn" data-copy-slack="1">Copy as Slack message</button></div>
    </div>
    <div class="keynote">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--agent)" stroke-width="2.2" style="flex-shrink:0;margin-top:1px"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
      <span>The decryption key lives in the <b>#fragment</b> of the URL, which browsers never send to any server. Our storage only ever sees encrypted bytes. The share auto-purges when it expires.</span>
    </div>
    <div class="shares">
      <div class="lab">Active shares · this workspace</div>
      <div class="share-row"><span class="avatar av-agent" style="border-radius:6px">F</span>
        <span><span class="name">research-notes</span> <span class="meta">folder · created today · expires in 7 d</span></span>
        <span class="pend">2 peers viewing</span><span class="revoke" data-revoke="1">Revoke</span></div>
    </div>`;
  $("#share-overlay").hidden = false;
}

/* ---------------- command palette ---------------- */

function paletteItems() {
  const openN = COMMENTS.filter(c => c.state === "open").length;
  const items = [];
  items.push({ group: "Review", label: `Review with agent — address all ${openN} open comments`, ic: "✦", keys: "⌘⏎", run: () => { closePalette(); runAgent(); } });
  items.push({ group: "Review", label: "Share current folder for review…", ic: "⇗", keys: "⌘⇧S", run: () => { closePalette(); openShare(); } });
  if (state.view === "host") {
    ws().files.forEach(f => {
      const n = openCount(f);
      items.push({ group: "Navigate", label: f + (n ? `  ·  ${n} open` : ""), ic: "📄", run: () => { ws().activeFile = f; closePalette(); renderHost(); } });
    });
  }
  items.push({ group: "View", label: "Toggle dark mode", ic: "◐", run: () => { toggleTheme(); closePalette(); } });
  items.push({ group: "View", label: "Start presentation from this file", ic: "▶", keys: "⌘P", run: () => { closePalette(); startPresent(); } });
  items.push({ group: "View", label: "Toggle file sidebar", ic: "⌫", keys: "⌘B", run: () => { state.sidebar = !state.sidebar; closePalette(); renderHost(); } });
  items.push({ group: "View", label: "Toggle comment panel", ic: "▤", keys: "⌘\\", run: () => { state.rail = !state.rail; closePalette(); renderHost(); } });
  items.push({ group: "Prototype", label: "Preview the peer experience", ic: "☍", run: () => { closePalette(); enterPeerFlow(); } });
  items.push({ group: "Prototype", label: "Reset demo & back to landing", ic: "↺", run: () => { closePalette(); resetDemo(); } });
  return items;
}

let paletteSel = 0;
function renderPalette() {
  const q = $("#palette-input").value.trim().toLowerCase();
  const items = paletteItems().filter(it => !q || it.label.toLowerCase().includes(q));
  const list = $("#palette-list");
  list.innerHTML = "";
  if (!items.length) { list.innerHTML = '<div class="none">Nothing matches — try “agent”, “share”, “dark”…</div>'; return; }
  paletteSel = Math.min(paletteSel, items.length - 1);
  let lastGroup = null;
  items.forEach((it, i) => {
    if (it.group !== lastGroup) {
      lastGroup = it.group;
      const g = document.createElement("div");
      g.className = "group";
      g.textContent = it.group;
      list.appendChild(g);
    }
    const d = document.createElement("div");
    d.className = "item" + (i === paletteSel ? " on" : "");
    d.dataset.pi = i;
    d.innerHTML = `<span class="ic">${it.ic}</span><span class="name">${esc(it.label)}</span>${it.keys ? `<span class="keys"><kbd>${it.keys}</kbd></span>` : ""}`;
    list.appendChild(d);
  });
  list._items = items;
}

function openPalette() { $("#palette-overlay").hidden = false; $("#palette-input").value = ""; paletteSel = 0; renderPalette(); $("#palette-input").focus(); }
function closePalette() { $("#palette-overlay").hidden = true; }

/* ---------------- presentation ---------------- */

function startPresent() {
  const file = state.view === "peer" ? state.peerFile : ws().activeFile;
  const doc = DOCS[file];
  const slides = [];
  let cur = null;
  doc.blocks.forEach(b => {
    if (b.t === "h1" || !cur) { cur = { blocks: [] }; slides.push(cur); }
    cur.blocks.push(b);
  });
  state.present = { slides, i: 0, file };
  $("#present-overlay").hidden = false;
  renderPresent();
}

function renderPresent() {
  const p = state.present;
  const s = p.slides[p.i];
  $("#pslide-wrap").innerHTML = `<div class="pslide"><div class="kick">${esc(p.file)} · slide ${p.i + 1}</div>${s.blocks.map(blockHTML).join("")}</div>`;
  $("#pdots").innerHTML = p.slides.map((_, i) => `<i class="${i === p.i ? "on" : ""}" data-slide="${i}"></i>`).join("");
  $("#pcounter").textContent = `${p.i + 1} / ${p.slides.length} · ${p.file}`;
}

function exitPresent() { state.present = null; $("#present-overlay").hidden = true; }

/* ---------------- flows ---------------- */

function enterHost(wsId) {
  if (!state.openWs.includes(wsId)) state.openWs.push(wsId);
  state.activeWs = wsId;
  setView("host");
  renderHost();
}

function enterPeerFlow() {
  $("#name-overlay").hidden = false;
  const inp = $("#peer-name-input");
  inp.value = "";
  setTimeout(() => inp.focus(), 50);
}

function joinPeer() {
  const name = $("#peer-name-input").value.trim() || "Marta";
  state.peerName = name;
  state.peerFile = "database/comparison.md";
  $("#name-overlay").hidden = true;
  setView("peer");
  renderPeer();
  toast(`Decrypted in your browser — welcome, ${name}`, true);
}

function toggleTheme() { document.body.classList.toggle("dark"); }

function resetDemo() {
  DOCS = freshDocs();
  COMMENTS = freshComments();
  seedRanges(COMMENTS);
  state.openWs = [];
  state.activeWs = null;
  state.agent = null;
  state.sel = null;
  state.filter = "all";
  state.composer = null;
  state.peerComments = [];
  state.sidebar = true;
  state.rail = true;
  $("#term").hidden = true;
  $("#recent-count").textContent = "5";
  setView("landing");
}

/* ---------------- events ---------------- */

document.addEventListener("click", (e) => {
  // mermaid node → composer anchored to the node's label text (maps to a source range)
  const mnode = e.target.closest(".mnode");
  if (mnode && (state.view === "host" || state.view === "peer")) {
    const blk = mnode.closest(".blk");
    const file = blk.dataset.file;
    const bi = parseInt(blk.dataset.i, 10);
    const label = mnode.dataset.label;
    const src = blockPlain(file, bi);
    const idx = src.indexOf(label);
    openComposer(file, bi, label, state.view === "peer", idx !== -1 ? { start: idx, end: idx + label.length } : null);
    return;
  }
  // code line gutter: a click on the line number / + zone comments that whole line
  const codeLine = e.target.closest(".cl");
  if (codeLine && e.offsetX < 0 && (state.view === "host" || state.view === "peer")) {
    const blk = codeLine.closest(".blk");
    const file = blk.dataset.file;
    const bi = parseInt(blk.dataset.i, 10);
    const plain = blockPlain(file, bi);
    const lines = plain.split("\n");
    const li = parseInt(codeLine.dataset.line, 10);
    let lineStart = 0;
    for (let k = 0; k < li; k++) { lineStart += lines[k].length + 1; }
    const quote = lines[li].trim();
    if (quote) {
      const start = lineStart + lines[li].indexOf(quote);
      openComposer(file, bi, quote, state.view === "peer", { start, end: start + quote.length });
    }
    return;
  }
  const t = e.target.closest("[data-action],[data-file],[data-peer-file],[data-ws],[data-close],[data-add-tab],[data-mview],[data-expand-thread],[data-reply-input],[data-cids],[data-cid],[data-add],[data-filter],[data-resolve],[data-type],[data-submit],[data-copy-link],[data-copy-slack],[data-revoke],[data-scope],[data-stop-agent],[data-dismiss-run],[data-copy-prompt],[data-slide],[data-pi]");
  if (!t) {
    // click outside composer closes it
    if (state.composer && !e.target.closest(".composer")) closeComposer();
    return;
  }
  const a = t.dataset;

  if (a.action === "open-folder") { enterHost("ws1"); return; }
  if (a.action === "open-file") { enterHost("ws2"); return; }
  if (a.action === "open-link") { enterPeerFlow(); return; }
  if (a.action === "join-peer") { joinPeer(); return; }
  if (a.action === "go-landing") { resetDemo(); return; }
  if (a.action === "exit-peer") { setView(state.openWs.length ? "host" : "landing"); if (state.openWs.length) renderHost(); return; }
  if (a.action === "theme") { toggleTheme(); return; }
  if (a.action === "share") { openShare(); return; }
  if (a.action === "run-agent") { runAgent(); return; }
  if (a.action === "present") { startPresent(); return; }
  if (a.action === "exit-present") { exitPresent(); return; }
  if (a.action === "toggle-rail") { state.rail = !state.rail; renderHost(); return; }
  if (a.action === "toggle-sidebar") { state.sidebar = !state.sidebar; renderHost(); return; }
  if (a.action === "toggle-term") { $("#term").classList.toggle("collapsed"); return; }
  if (a.action === "save-copy") { toast("Saved research-notes.zip — CriticMarkup included", true); return; }
  if (a.action === "restore-access") {
    state.restoreLock = false;
    renderHost();
    toast("Access restored — commenting is back", true);
    return;
  }
  if (a.action === "restore-other") { toast("In the real app this opens the OS folder picker"); return; }

  if (a.ws) { state.activeWs = a.ws; renderHost(); return; }
  if (a.close) {
    e.stopPropagation();
    state.openWs = state.openWs.filter(id => id !== a.close);
    if (!state.openWs.length) { resetDemo(); return; }
    if (state.activeWs === a.close) state.activeWs = state.openWs[0];
    renderHost(); return;
  }
  if (a.addTab) {
    const other = state.openWs.includes("ws1") ? "ws2" : "ws1";
    if (!state.openWs.includes(other)) { enterHost(other); }
    else toast("In the real app this opens the OS file picker");
    return;
  }
  if (a.mview) {
    const blk = t.closest(".blk");
    const doc = DOCS[blk.dataset.file];
    doc.blocks[parseInt(a.mblock, 10)].view = a.mview;
    rerenderDocs();
    return;
  }
  if (a.file) { ws().activeFile = a.file; state.composer = null; renderHost(); return; }
  if (a.peerFile) { state.peerFile = a.peerFile; state.composer = null; renderPeer(); return; }

  if (a.filter) { state.filter = a.filter; renderRail(); renderDoc($("#doc-col"), ws().activeFile, {}); return; }
  if (a.resolve) {
    e.stopPropagation();
    const c = COMMENTS.find(x => x.id === a.resolve);
    if (c) { c.state = "resolved"; if (state.sel === c.id) state.sel = null; renderHost(); toast("Resolved — kept in history", true); }
    return;
  }
  if (a.replyInput !== undefined) { return; }
  if (a.expandThread) {
    const comment = COMMENTS.find(x => x.id === a.expandThread);
    if (comment) {
      comment.threadExpanded = !comment.threadExpanded;
      renderHost();
    }
    return;
  }
  if (a.cids) {
    // a highlight segment: cycle through the comments covering it
    if (state.view === "peer") return;
    const ids = a.cids.split(",");
    const cur = ids.indexOf(state.sel);
    selectComment(ids[(cur + 1) % ids.length], false);
    if (ids.length > 1 && cur === -1) toast(`${ids.length} comments share this span — click again to cycle`);
    return;
  }
  if (a.cid) {
    if (state.view === "peer") return;
    selectComment(a.cid);
    return;
  }
  if (a.add !== undefined) {
    const blk = t.closest(".blk");
    openComposer(blk.dataset.file, parseInt(a.add, 10), null, state.view === "peer");
    return;
  }
  if (a.type) {
    if (state.composer) {
      const ta = $(".composer textarea");
      state.composer.draft = ta ? ta.value : "";
      state.composer.type = a.type;
      rerenderDocs();
    }
    return;
  }
  if (a.submit) { submitComposer(); return; }

  if (a.copyLink || a.copySlack) {
    t.textContent = "Copied ✓";
    toast(a.copyLink ? "Link copied — send it to your reviewers" : "Slack message copied", true);
    return;
  }
  if (a.revoke) { t.closest(".share-row").remove(); toast("Share revoked — the link is dead"); return; }
  if (a.scope) { $$(".seg .opt").forEach(o => o.classList.toggle("on", o === t)); return; }

  if (a.stopAgent) { stopAgent(); return; }
  if (a.dismissRun) { state.agent = null; renderHost(); return; }
  if (a.copyPrompt) { toast("Prompt copied — paste it into any agent CLI", true); return; }

  if (a.slide !== undefined) { state.present.i = parseInt(a.slide, 10); renderPresent(); return; }
  if (a.pi !== undefined) {
    const items = $("#palette-list")._items;
    if (items && items[a.pi]) items[a.pi].run();
    return;
  }
});

// overlay backdrop click
$("#share-overlay").addEventListener("click", (e) => { if (e.target === e.currentTarget) e.currentTarget.hidden = true; });
$("#palette-overlay").addEventListener("click", (e) => { if (e.target === e.currentTarget) closePalette(); });

// track hovered block for the C shortcut
document.addEventListener("mouseover", (e) => {
  const blk = e.target.closest(".blk");
  if (blk) state.hoverBlock = { file: blk.dataset.file, i: parseInt(blk.dataset.i, 10) };
  // spotlight: hovering a rail card focuses its spans, mutes the others;
  // focused spans drop every other comment's tint/stripe while spotlit
  const card = e.target.closest(".c-card[data-cid]");
  const hoveredId = card ? card.dataset.cid : null;
  const hoveredComment = hoveredId ? COMMENTS.find((x) => x.id === hoveredId) : null;
  document.querySelectorAll(".hl2").forEach((span) => {
    if (span.dataset.obg !== undefined) {
      span.style.backgroundImage = span.dataset.obg;
      span.style.boxShadow = span.dataset.osh;
      delete span.dataset.obg;
      delete span.dataset.osh;
    }
    const covers = hoveredId && (span.dataset.cids || "").split(",").includes(hoveredId);
    span.classList.toggle("hl2-focus", !!covers);
    span.classList.toggle("hl2-muted", !!hoveredId && !covers);
    if (covers && hoveredComment) {
      span.dataset.obg = span.style.backgroundImage;
      span.dataset.osh = span.style.boxShadow;
      span.style.backgroundImage = `linear-gradient(var(--c-${hoveredComment.type}-soft), var(--c-${hoveredComment.type}-soft))`;
      span.style.boxShadow = `inset 0 -2px 0 var(--c-${hoveredComment.type})`;
    }
  });
});

// text selection → composer with a character-precise range (sub-sentence anchoring)
document.addEventListener("mouseup", (e) => {
  if (state.view !== "host" && state.view !== "peer") return;
  if (e.target.closest(".composer")) return;
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || !sel.rangeCount) return;
  const domRange = sel.getRangeAt(0);
  const node = sel.anchorNode && (sel.anchorNode.nodeType === 3 ? sel.anchorNode.parentElement : sel.anchorNode);
  const blk = node && node.closest && node.closest(".blk");
  if (!blk) return;
  const body = blk.querySelector(".blk-body");
  if (!body) return;
  let start = offsetIn(body, domRange.startContainer, domRange.startOffset);
  let end = body.contains(domRange.endContainer)
    ? offsetIn(body, domRange.endContainer, domRange.endOffset)
    : body.textContent.length; // selection ran past the block — clamp to its end
  if (start === null || end === null) return;
  if (start > end) { [start, end] = [end, start]; }
  const plain = body.textContent;
  // trim whitespace off the edges of the anchor
  while (start < end && /\s/.test(plain[start])) start++;
  while (end > start && /\s/.test(plain[end - 1])) end--;
  if (end - start < 3 || end - start > 300) return;
  sel.removeAllRanges();
  const file = blk.dataset.file;
  const block = parseInt(blk.dataset.i, 10);
  openComposer(file, block, plain.slice(start, end), state.view === "peer", { start, end });
});

// palette input
$("#palette-input").addEventListener("input", () => { paletteSel = 0; renderPalette(); });

// keyboard
document.addEventListener("keydown", (e) => {
  const meta = e.metaKey || e.ctrlKey;
  const active = document.activeElement;
  if (e.key === "Enter" && active && active.dataset && active.dataset.replyInput) {
    const comment = COMMENTS.find(x => x.id === active.dataset.replyInput);
    const text = active.value.trim();
    if (comment && text) {
      comment.thread.push({ author: "You", text });
      comment.threadExpanded = true;
      renderHost();
      toast("Reply added to the thread", true);
    }
    return;
  }
  const inInput = /INPUT|TEXTAREA/.test(document.activeElement.tagName);

  // palette
  if (meta && e.key.toLowerCase() === "k") {
    e.preventDefault();
    if ($("#palette-overlay").hidden) openPalette(); else closePalette();
    return;
  }
  if (!$("#palette-overlay").hidden) {
    const items = $("#palette-list")._items || [];
    if (e.key === "ArrowDown") { e.preventDefault(); paletteSel = Math.min(paletteSel + 1, items.length - 1); renderPalette(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); paletteSel = Math.max(paletteSel - 1, 0); renderPalette(); }
    else if (e.key === "Enter") { e.preventDefault(); if (items[paletteSel]) items[paletteSel].run(); }
    else if (e.key === "Escape") closePalette();
    return;
  }

  // presentation
  if (state.present) {
    const p = state.present;
    if (["ArrowRight", "ArrowDown", " ", "PageDown"].includes(e.key)) { e.preventDefault(); if (p.i < p.slides.length - 1) { p.i++; renderPresent(); } }
    else if (["ArrowLeft", "ArrowUp", "Backspace", "PageUp"].includes(e.key)) { e.preventDefault(); if (p.i > 0) { p.i--; renderPresent(); } }
    else if (e.key === "Home") { p.i = 0; renderPresent(); }
    else if (e.key === "End") { p.i = p.slides.length - 1; renderPresent(); }
    else if (e.key === "Escape") exitPresent();
    return;
  }

  // name modal
  if (!$("#name-overlay").hidden) {
    if (e.key === "Enter") { e.preventDefault(); joinPeer(); }
    if (e.key === "Escape") $("#name-overlay").hidden = true;
    return;
  }

  // escape chain
  if (e.key === "Escape") {
    if (!$("#share-overlay").hidden) { $("#share-overlay").hidden = true; return; }
    if (closeComposer()) return;
    if (state.sel) { state.sel = null; renderHost(); return; }
    return;
  }

  // composer keys
  if (state.composer) {
    if (meta && e.key === "Enter") { e.preventDefault(); submitComposer(); return; }
    if (!inInput && /^[1-6]$/.test(e.key)) {
      e.preventDefault();
      state.composer.type = TYPE_KEYS[parseInt(e.key, 10) - 1];
      rerenderDocs();
      return;
    }
    return;
  }

  if (inInput) return;

  // host shortcuts
  if (state.view === "host") {
    if (meta && e.key.toLowerCase() === "b") { e.preventDefault(); state.sidebar = !state.sidebar; renderHost(); return; }
    if (meta && e.key === "\\") { e.preventDefault(); state.rail = !state.rail; renderHost(); return; }
    if (meta && e.key.toLowerCase() === "p") { e.preventDefault(); startPresent(); return; }
    if (meta && e.key === "Enter") { e.preventDefault(); runAgent(); return; }
    if (e.key === "j" || e.key === "J") { nav(1); return; }
    if (e.key === "k" || e.key === "K") { nav(-1); return; }
    if (e.key === "c" || e.key === "C") {
      const h = state.hoverBlock && state.hoverBlock.file === ws().activeFile ? state.hoverBlock : null;
      const sc = COMMENTS.find(x => x.id === state.sel);
      const block = h ? h.i : (sc && sc.file === ws().activeFile ? sc.block : 1);
      openComposer(ws().activeFile, block, null, false);
      return;
    }
  }
  if (state.view === "peer") {
    if (e.key === "c" || e.key === "C") {
      const h = state.hoverBlock && state.hoverBlock.file === state.peerFile ? state.hoverBlock : null;
      openComposer(state.peerFile, h ? h.i : 1, null, true);
    }
  }
});

/* ---------------- boot & demo routes ---------------- */

function boot() {
  seedRanges(COMMENTS);
  const h = location.hash.replace("#", "");
  if (h.startsWith("host")) {
    enterHost("ws1");
    if (h === "host-agent") setTimeout(runAgent, 400);
    if (h === "host-composer") setTimeout(() => {
      const q = "given the relational access patterns and the team's operational familiarity";
      const idx = blockPlain("database/comparison.md", 3).indexOf(q);
      openComposer("database/comparison.md", 3, q, false, idx !== -1 ? { start: idx, end: idx + q.length } : null);
    }, 300);
    if (h === "host-share") setTimeout(openShare, 300);
    if (h === "host-palette") setTimeout(openPalette, 300);
    if (h === "host-dark") document.body.classList.add("dark");
    if (h === "host-thread" || h === "host-thread-open") {
      if (h === "host-thread-open") {
        const threaded = COMMENTS.find(x => x.id === "c2");
        if (threaded) { threaded.threadExpanded = true; }
      }
      setTimeout(() => selectComment("c2"), 300);
    }
    if (h === "host-restore") {
      state.restoreLock = true;
      renderHost();
    }
    if (h === "host-mermaid" || h === "host-mermaid-src") {
      WORKSPACES.ws1.activeFile = "database/migration-risks.md";
      if (h === "host-mermaid-src") { DOCS["database/migration-risks.md"].blocks[3].view = "source"; }
      renderHost();
      setTimeout(() => selectComment("c7"), 300);
    }
  } else if (h === "peer") {
    state.peerFile = "database/comparison.md";
    setView("peer");
    renderPeer();
  } else if (h === "present") {
    enterHost("ws1");
    ws().activeFile = "roadmap.md";
    renderHost();
    startPresent();
  } else {
    setView("landing");
  }
  $("#recent-count").textContent = String(COMMENTS.filter(c => c.state === "open").length);
}
boot();
