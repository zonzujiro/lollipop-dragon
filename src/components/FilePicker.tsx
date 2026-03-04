import { useEffect, useState } from "react";
import { useAppStore } from "../store";

/* ═══════════════════════════════════════════════════════════════════
   Dragon mascot — friendly, flat, minimal
   Colors: teal body (#4ECDC4), orange wings (#FF9F43), pink (#FF6B9D)
   ═══════════════════════════════════════════════════════════════════ */

interface DragonProps {
  x: number;
  y: number;
  scale?: number;
  flip?: boolean;
  accessory?: "glasses" | "pencil" | "envelope" | "lollipop";
}

function Dragon({ x, y, scale = 1, flip, accessory }: DragonProps) {
  const tx = flip ? `translate(${x},${y}) scale(${-scale},${scale})` : `translate(${x},${y}) scale(${scale})`;
  return (
    <g transform={tx}>
      <path d="M18 30 Q32 28 36 18 Q38 12 34 10" fill="none" stroke="#4ECDC4" strokeWidth="4" strokeLinecap="round" />
      <circle cx="34" cy="10" r="3" fill="#FF6B9D" />
      <path d="M-8 8 Q-24 -8 -18 -20 Q-14 -12 -6 2" fill="#FF9F43" fillOpacity="0.85" />
      <path d="M8 8 Q24 -8 18 -20 Q14 -12 6 2" fill="#FF9F43" fillOpacity="0.85" />
      <ellipse cx="0" cy="18" rx="18" ry="20" fill="#4ECDC4" />
      <ellipse cx="0" cy="24" rx="11" ry="13" fill="#A8E6CF" />
      <ellipse cx="-8" cy="38" rx="5" ry="3" fill="#3BB5AD" />
      <ellipse cx="8" cy="38" rx="5" ry="3" fill="#3BB5AD" />
      <circle cx="0" cy="-4" r="14" fill="#4ECDC4" />
      <path d="M-8 -14 L-5 -24 L-2 -14" fill="#FF9F43" />
      <path d="M2 -14 L5 -24 L8 -14" fill="#FF9F43" />
      <ellipse cx="0" cy="2" rx="8" ry="5" fill="#5ED4CD" />
      <circle cx="-5" cy="-6" r="4" fill="white" />
      <circle cx="5" cy="-6" r="4" fill="white" />
      <circle cx="-4" cy="-6" r="2" fill="#2D2A2E" />
      <circle cx="6" cy="-6" r="2" fill="#2D2A2E" />
      <circle cx="-3" cy="-7" r="0.8" fill="white" />
      <circle cx="7" cy="-7" r="0.8" fill="white" />
      <circle cx="-2" cy="2" r="1" fill="#3BB5AD" />
      <circle cx="2" cy="2" r="1" fill="#3BB5AD" />
      <path d="M-4 5 Q0 8 4 5" fill="none" stroke="#3BB5AD" strokeWidth="1" strokeLinecap="round" />

      {accessory === "glasses" && (
        <g>
          <circle cx="-5" cy="-6" r="5.5" fill="none" stroke="#2D2A2E" strokeWidth="1.2" />
          <circle cx="5" cy="-6" r="5.5" fill="none" stroke="#2D2A2E" strokeWidth="1.2" />
          <line x1="-0.5" y1="-6" x2="0.5" y2="-6" stroke="#2D2A2E" strokeWidth="1.2" />
          <line x1="-10.5" y1="-6" x2="-14" y2="-8" stroke="#2D2A2E" strokeWidth="1.2" />
          <line x1="10.5" y1="-6" x2="14" y2="-8" stroke="#2D2A2E" strokeWidth="1.2" />
        </g>
      )}
      {accessory === "pencil" && (
        <g transform="translate(20, 10) rotate(30)">
          <rect x="0" y="-2" width="24" height="4" rx="1" fill="#FFD93D" />
          <polygon points="24,-2 24,2 30,0" fill="#2D2A2E" />
          <rect x="0" y="-2" width="4" height="4" rx="1" fill="#FF6B9D" />
        </g>
      )}
      {accessory === "envelope" && (
        <g transform="translate(18, 14)">
          <rect x="0" y="0" width="20" height="14" rx="2" fill="white" stroke="#dee2e6" strokeWidth="1" />
          <path d="M0 0 L10 8 L20 0" fill="none" stroke="#FF6B9D" strokeWidth="1.2" />
          <circle cx="16" cy="10" r="3" fill="#FF6B9D" opacity="0.6" />
        </g>
      )}
      {accessory === "lollipop" && (
        <g transform="translate(18, -8)">
          <line x1="0" y1="8" x2="0" y2="26" stroke="#ccc" strokeWidth="2.5" strokeLinecap="round" />
          <circle cx="0" cy="0" r="8" fill="#FF6B9D" />
          <circle cx="0" cy="0" r="5" fill="#FF9F43" />
          <circle cx="0" cy="0" r="2.5" fill="#FFD93D" />
        </g>
      )}
    </g>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   Illustration scenes
   ═══════════════════════════════════════════════════════════════════ */

function IllustrationAI() {
  const TAGS: Array<{ label: string; color: string; delay: number; y: number }> = [
    { label: "fix", color: "var(--c-red)", delay: 0, y: 52 },
    { label: "note", color: "var(--c-green)", delay: 0.5, y: 72 },
    { label: "rewrite", color: "var(--c-orange)", delay: 1.0, y: 92 },
    { label: "expand", color: "var(--accent)", delay: 1.5, y: 112 },
    { label: "clarify", color: "var(--c-purple)", delay: 2.0, y: 132 },
    { label: "question", color: "var(--c-cyan)", delay: 2.5, y: 152 },
    { label: "remove", color: "var(--text-muted)", delay: 3.0, y: 172 },
  ];

  return (
    <svg className="landing-scene__svg" viewBox="0 0 380 240" fill="none" aria-hidden="true">
      <rect x="20" y="26" width="140" height="188" rx="10" fill="var(--surface)" stroke="var(--border)" strokeWidth="1.5" />
      <g opacity="0.4">
        <rect x="36" y="44" width="80" height="4" rx="2" fill="var(--text-muted)" />
        <rect x="36" y="56" width="100" height="3" rx="1.5" fill="var(--border)" />
        <rect x="36" y="66" width="90" height="3" rx="1.5" fill="var(--border)" />
        <rect x="36" y="82" width="70" height="4" rx="2" fill="var(--text-muted)" />
        <rect x="36" y="94" width="105" height="3" rx="1.5" fill="var(--border)" />
        <rect x="36" y="104" width="85" height="3" rx="1.5" fill="var(--border)" />
        <rect x="36" y="120" width="75" height="4" rx="2" fill="var(--text-muted)" />
        <rect x="36" y="132" width="100" height="3" rx="1.5" fill="var(--border)" />
        <rect x="36" y="142" width="95" height="3" rx="1.5" fill="var(--border)" />
        <rect x="36" y="158" width="80" height="3" rx="1.5" fill="var(--border)" />
        <rect x="36" y="174" width="60" height="4" rx="2" fill="var(--text-muted)" />
        <rect x="36" y="186" width="100" height="3" rx="1.5" fill="var(--border)" />
      </g>

      <Dragon x="300" y="100" scale={1.6} accessory="glasses" />

      {TAGS.map((tag) => {
        const pillW = tag.label.length * 7 + 14;
        const startX = 250;
        const endX = 168;
        const startCenter = startX + pillW / 2;
        const endCenter = endX + pillW / 2;
        return (
          <g key={tag.label}>
            <rect x={startX} y={tag.y - 8} width={pillW} height="16" rx="8"
              fill={tag.color} fillOpacity="0.15" stroke={tag.color} strokeWidth="0.8" opacity="0">
              <animate attributeName="x" values={`${startX};${endX}`} dur="2s" begin={`${tag.delay}s`} fill="freeze" />
              <animate attributeName="opacity" values="0;1" dur="0.4s" begin={`${tag.delay}s`} fill="freeze" />
            </rect>
            <text x={startCenter} y={tag.y} textAnchor="middle" fontSize="9"
              fontFamily="var(--font-mono)" fill={tag.color} dominantBaseline="central" opacity="0">
              <animate attributeName="x" values={`${startCenter};${endCenter}`} dur="2s" begin={`${tag.delay}s`} fill="freeze" />
              <animate attributeName="opacity" values="0;1" dur="0.4s" begin={`${tag.delay}s`} fill="freeze" />
              {tag.label}
            </text>
          </g>
        );
      })}

      <circle cx="260" cy="66" r="4" fill="var(--surface)" stroke="var(--border)" strokeWidth="0.8" opacity="0.5" />
      <circle cx="250" cy="56" r="3" fill="var(--surface)" stroke="var(--border)" strokeWidth="0.8" opacity="0.4" />
    </svg>
  );
}

function IllustrationShare() {
  return (
    <svg className="landing-scene__svg" viewBox="0 0 360 220" fill="none" aria-hidden="true">
      <Dragon x="60" y="90" scale={1.3} accessory="envelope" />
      <text x="60" y="165" textAnchor="middle" fontSize="10" fill="currentColor" fontFamily="'Syne', system-ui" fontWeight="700" opacity="0.6">You</text>

      <g>
        <rect x="120" y="86" width="120" height="28" rx="14" fill="var(--surface)" stroke="var(--border)" strokeWidth="1.2" strokeDasharray="6 3" />
        <rect x="169" y="92" width="22" height="16" rx="3" fill="var(--accent-bg)" stroke="var(--accent)" strokeWidth="1" />
        <path d="M174 92v-3a6 6 0 0 1 12 0v3" stroke="var(--accent)" strokeWidth="1.2" fill="none" />
        <circle cx="180" cy="102" r="2" fill="var(--accent)" />
        <rect x="130" y="96" width="14" height="8" rx="3" fill="#FF6B9D" fillOpacity="0.5">
          <animate attributeName="x" values="130;216" dur="2s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.7;0" dur="2s" repeatCount="indefinite" />
        </rect>
      </g>

      <g transform="translate(300, 90)">
        <circle cx="0" cy="-8" r="14" fill="#FFD93D" />
        <path d="M-14 -10 Q-14 -22 0 -22 Q14 -22 14 -10" fill="#8B7355" />
        <circle cx="-4" cy="-10" r="2.5" fill="white" />
        <circle cx="4" cy="-10" r="2.5" fill="white" />
        <circle cx="-3.5" cy="-10" r="1.3" fill="#2D2A2E" />
        <circle cx="4.5" cy="-10" r="1.3" fill="#2D2A2E" />
        <path d="M-3 -3 Q0 1 3 -3" fill="none" stroke="#C68642" strokeWidth="1" strokeLinecap="round" />
        <rect x="-12" y="6" width="24" height="26" rx="8" fill="#AB9DF2" />
        <rect x="-18" y="10" width="8" height="4" rx="2" fill="#AB9DF2" />
        <rect x="10" y="10" width="8" height="4" rx="2" fill="#AB9DF2" />
      </g>
      <text x="300" y="165" textAnchor="middle" fontSize="10" fill="currentColor" fontFamily="'Syne', system-ui" fontWeight="700" opacity="0.6">Reviewer</text>
    </svg>
  );
}

function IllustrationMerge() {
  return (
    <svg className="landing-scene__svg" viewBox="0 0 360 230" fill="none" aria-hidden="true">
      <rect x="20" y="30" width="120" height="170" rx="10" fill="var(--surface)" stroke="var(--border)" strokeWidth="1.5" />
      <g opacity="0.4">
        <rect x="34" y="48" width="80" height="4" rx="2" fill="var(--text-muted)" />
        <rect x="34" y="60" width="90" height="3" rx="1.5" fill="var(--border)" />
        <rect x="34" y="70" width="75" height="3" rx="1.5" fill="var(--border)" />
        <rect x="34" y="86" width="60" height="4" rx="2" fill="var(--text-muted)" />
        <rect x="34" y="98" width="95" height="3" rx="1.5" fill="var(--border)" />
        <rect x="34" y="108" width="80" height="3" rx="1.5" fill="var(--border)" />
        <rect x="34" y="124" width="70" height="4" rx="2" fill="var(--text-muted)" />
        <rect x="34" y="136" width="90" height="3" rx="1.5" fill="var(--border)" />
        <rect x="34" y="150" width="85" height="3" rx="1.5" fill="var(--border)" />
      </g>

      <Dragon x="210" y="100" scale={1.4} accessory="pencil" />

      <g>
        <rect x="280" y="30" width="70" height="32" rx="10" fill="var(--surface)" stroke="var(--c-green)" strokeWidth="1.2">
          <animate attributeName="x" values="280;172" dur="2.5s" fill="freeze" />
          <animate attributeName="opacity" values="1;0.3" dur="2.5s" fill="freeze" />
        </rect>
        <circle cx="290" cy="42" r="3" fill="var(--c-green)">
          <animate attributeName="cx" values="290;182" dur="2.5s" fill="freeze" />
        </circle>
        <text x="352" y="52" fontSize="8" fill="var(--c-green)" fontFamily="'Syne', system-ui" fontWeight="700" opacity="0.7">
          <animate attributeName="opacity" values="0.7;0" dur="2.5s" fill="freeze" />
          Alice
        </text>
      </g>

      <g>
        <rect x="290" y="84" width="60" height="32" rx="10" fill="var(--surface)" stroke="var(--c-purple)" strokeWidth="1.2">
          <animate attributeName="x" values="290;172" dur="3s" fill="freeze" />
          <animate attributeName="opacity" values="1;0.3" dur="3s" fill="freeze" />
        </rect>
        <circle cx="300" cy="96" r="3" fill="var(--c-purple)">
          <animate attributeName="cx" values="300;182" dur="3s" fill="freeze" />
        </circle>
        <text x="352" y="106" fontSize="8" fill="var(--c-purple)" fontFamily="'Syne', system-ui" fontWeight="700" opacity="0.7">
          <animate attributeName="opacity" values="0.7;0" dur="3s" fill="freeze" />
          Bob
        </text>
      </g>

      <path d="M170 115 L150 115" stroke="var(--accent)" strokeWidth="2" markerEnd="url(#arrowMerge)" opacity="0.5">
        <animate attributeName="opacity" values="0.3;0.8;0.3" dur="2s" repeatCount="indefinite" />
      </path>
      <defs>
        <marker id="arrowMerge" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M0 0 L10 5 L0 10 z" fill="var(--accent)" />
        </marker>
      </defs>
    </svg>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   Collab split icons
   ═══════════════════════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════════════════════
   Animated demo editor
   ═══════════════════════════════════════════════════════════════════ */

const DEMO_LINES = [
  { type: "heading", text: "# Project Overview" },
  { type: "text", text: "The architecture uses a modular approach with clear" },
  { type: "text", text: "separation of concerns between the data layer" },
  { type: "comment-fix", markup: "{~~modular approach~>component-based architecture~~}", label: "fix", color: "var(--c-red)" },
  { type: "text", text: "and the presentation layer." },
  { type: "blank", text: "" },
  { type: "heading", text: "## Key Features" },
  { type: "text", text: "- Real-time collaboration support" },
  { type: "comment-note", markup: "{>>Consider adding WebSocket details<<}", label: "note", color: "var(--c-green)" },
  { type: "text", text: "- End-to-end encryption for shared documents" },
  { type: "text", text: "- Multi-tab editing with independent state" },
  { type: "comment-question", markup: "{>>Is this per-browser or per-device?<<}", label: "question", color: "var(--c-cyan)" },
  { type: "blank", text: "" },
  { type: "text", text: "Each reviewer can annotate inline, suggest edits," },
  { type: "text", text: "and track resolved feedback — all from the browser." },
];

function DemoEditor() {
  const [visibleLines, setVisibleLines] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setVisibleLines((v) => {
        if (v >= DEMO_LINES.length) {
          clearInterval(timer);
          return v;
        }
        return v + 1;
      });
    }, 120);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="landing-demo">
      <div className="landing-demo__chrome">
        <div className="landing-demo__dots">
          <span className="landing-demo__dot landing-demo__dot--red" />
          <span className="landing-demo__dot landing-demo__dot--yellow" />
          <span className="landing-demo__dot landing-demo__dot--green" />
        </div>
        <span className="landing-demo__title">overview.md</span>
      </div>
      <div className="landing-demo__body">
        <div className="landing-demo__margin" />
        <div className="landing-demo__content">
          {DEMO_LINES.slice(0, visibleLines).map((line, i) => {
            if (line.type === "blank") {
              return <div key={i} className="landing-demo__line landing-demo__line--blank">&nbsp;</div>;
            }
            if (line.type === "heading") {
              const level = line.text.startsWith("## ") ? 2 : 1;
              return (
                <div key={i} className={`landing-demo__line landing-demo__line--h${level}`}>
                  {line.text.replace(/^#+\s/, "")}
                </div>
              );
            }
            if (line.type.startsWith("comment-")) {
              return (
                <div key={i} className="landing-demo__line landing-demo__line--comment">
                  <span className="landing-demo__markup" style={{ borderColor: line.color }}>
                    {line.markup}
                  </span>
                  <span className="landing-demo__dot-indicator" style={{ backgroundColor: line.color }} title={line.label} />
                </div>
              );
            }
            return (
              <div key={i} className="landing-demo__line">{line.text}</div>
            );
          })}
          {visibleLines < DEMO_LINES.length && (
            <div className="landing-demo__cursor" />
          )}
        </div>
      </div>
    </div>
  );
}


/* ═══════════════════════════════════════════════════════════════════
   Main landing
   ═══════════════════════════════════════════════════════════════════ */

export function FilePicker() {
  const openFile = useAppStore((s) => s.openFileInNewTab);
  const openDirectory = useAppStore((s) => s.openDirectoryInNewTab);

  return (
    <div className="landing">
      {/* ── Hero (dark) ── */}
      <section className="landing-hero">
        <div className="landing-hero__inner">
          <div className="landing-hero__logo-wrap">
            <img
              src={`${import.meta.env.BASE_URL}favicon.svg`}
              alt=""
              className="landing-hero__logo"
              width="110"
              height="110"
            />
            <span className="landing-hero__easter-egg">Yes, it&apos;s a dragon</span>
          </div>
          <h1 className="landing-hero__title">Lollipop<br />Dragon</h1>
          <p className="landing-hero__tagline">
            Collaboration for you, your agent & your peers
          </p>
          <div className="landing-hero__actions">
            <button onClick={openFile} className="landing-hero__btn landing-hero__btn--primary">
              Open file
            </button>
            <button onClick={openDirectory} className="landing-hero__btn landing-hero__btn--secondary">
              Open folder
            </button>
          </div>
        </div>
      </section>

      {/* ── Demo editor + features ── */}
      <section className="landing-section landing-section--striped">
        <div className="landing-section__inner landing-demo-row">
          <div className="landing-demo-row__left">
            <DemoEditor />
          </div>
          <ul className="landing-demo-row__features">
            <li>CriticMarkup comments</li>
            <li>Mermaid diagrams</li>
            <li>Syntax-highlighted code</li>
            <li>GFM tables &amp; task lists</li>
            <li>Multi-tab editing</li>
            <li>Folder tree sidebar</li>
            <li>Dark mode &amp; focus mode</li>
            <li>Works offline</li>
          </ul>
        </div>
      </section>

      {/* ── Two ways to collaborate ── */}
      <section className="landing-section landing-section--dark landing-section--collab-title">
        <div className="landing-section__inner">
          <h2 className="landing-section__heading">Two ways to collaborate</h2>
        </div>
      </section>

      {/* ── With AI ── */}
      <section className="landing-section landing-section--light">
        <div className="landing-section__inner">
          <div className="landing-demo-row">
            <div className="landing-demo-row__left">
              <div className="landing-duo__card"><IllustrationAI /></div>
            </div>
            <ul className="landing-demo-row__features landing-demo-row__features--has-title">
              <li>With AI</li>
              <li>Seven structured comment types</li>
              <li>Any LLM reads &amp; writes CriticMarkup</li>
              <li>No plugins, no CLI</li>
              <li>Copy-paste or point an agent</li>
            </ul>
          </div>
        </div>
      </section>

      {/* ── With people ── */}
      <section className="landing-section landing-section--dark-alt">
        <div className="landing-section__inner">
          <div className="landing-demo-row">
            <div className="landing-demo-row__left">
              <div className="landing-duo__card landing-duo__card--tilt-right"><IllustrationShare /></div>
            </div>
            <ul className="landing-demo-row__features landing-demo-row__features--light landing-demo-row__features--has-title">
              <li>With people</li>
              <li>One encrypted share link</li>
              <li>Reviewer comments in the browser</li>
              <li>No account needed</li>
              <li>Pull &amp; merge with one click</li>
            </ul>
          </div>
        </div>
      </section>

      <footer className="landing-footer">
        <p className="landing-footer__title">Dragon&apos;s Favorite Lollipop</p>
        <p className="landing-footer__recipe">
          Melt 1 cup sugar with 1/3 cup corn syrup and 2 tbsp water over medium heat.
          Do not stir. At 300°F add a drop of teal food coloring and a pinch of
          chili flakes (dragons like it spicy). Pour into molds, insert sticks, and let cool.
          Yields 12 lollipops. Hide at least 3 from the dragon.
        </p>
        <svg className="landing-footer__illustration" viewBox="0 80 400 200" fill="none" aria-hidden="true">
          {/* Ground */}
          <ellipse cx="200" cy="260" rx="180" ry="12" fill="#E0D5CC" opacity="0.5" />

          {/* Campfire — logs + flames */}
          <g transform="translate(165, 220)">
            <rect x="-30" y="8" width="60" height="10" rx="5" fill="#8B6914" transform="rotate(-10, 0, 13)" />
            <rect x="-28" y="5" width="56" height="10" rx="5" fill="#A07A1A" transform="rotate(8, 0, 10)" />
            <rect x="-18" y="10" width="36" height="8" rx="4" fill="#6B5010" transform="rotate(-3, 0, 14)" />
            {/* Ember glow */}
            <ellipse cx="0" cy="8" rx="25" ry="8" fill="#FF9F43" opacity="0.25" />
            {/* Flames */}
            <path d="M-12 5 Q-16 -18 -6 -35 Q-2 -22 2 -38 Q8 -25 14 -40 Q18 -18 12 5Z" fill="#FF9F43">
              <animate attributeName="d" dur="0.7s" repeatCount="indefinite"
                values="M-12 5 Q-16 -18 -6 -35 Q-2 -22 2 -38 Q8 -25 14 -40 Q18 -18 12 5Z;M-12 5 Q-18 -15 -4 -38 Q0 -25 4 -42 Q10 -22 16 -38 Q20 -15 12 5Z;M-12 5 Q-16 -18 -6 -35 Q-2 -22 2 -38 Q8 -25 14 -40 Q18 -18 12 5Z" />
            </path>
            <path d="M-6 5 Q-8 -12 0 -26 Q8 -12 6 5Z" fill="#FFD93D">
              <animate attributeName="d" dur="0.5s" repeatCount="indefinite"
                values="M-6 5 Q-8 -12 0 -26 Q8 -12 6 5Z;M-6 5 Q-10 -10 -2 -28 Q10 -10 6 5Z;M-6 5 Q-8 -12 0 -26 Q8 -12 6 5Z" />
            </path>
            {/* Sparks */}
            <circle cx="-8" cy="-30" r="1.5" fill="#FFD93D" opacity="0.8">
              <animate attributeName="cy" values="-30;-45;-30" dur="1.2s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.8;0;0.8" dur="1.2s" repeatCount="indefinite" />
            </circle>
            <circle cx="6" cy="-35" r="1" fill="#FF9F43" opacity="0.6">
              <animate attributeName="cy" values="-35;-48;-35" dur="1.5s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.6;0;0.6" dur="1.5s" repeatCount="indefinite" />
            </circle>
          </g>

          {/* Big cauldron */}
          <g transform="translate(165, 165)">
            {/* Shadow */}
            <ellipse cx="0" cy="55" rx="45" ry="7" fill="rgba(0,0,0,0.08)" />
            {/* Tripod legs */}
            <line x1="-35" y1="-25" x2="-25" y2="50" stroke="#555" strokeWidth="3" strokeLinecap="round" />
            <line x1="35" y1="-25" x2="25" y2="50" stroke="#555" strokeWidth="3" strokeLinecap="round" />
            <line x1="0" y1="-30" x2="0" y2="-20" stroke="#555" strokeWidth="3" />
            {/* Horizontal bar */}
            <rect x="-38" y="-30" width="76" height="4" rx="2" fill="#666" />
            {/* Pot body — rounded bottom */}
            <path d="M-35 -10 L-38 15 Q-38 40 0 40 Q38 40 38 15 L35 -10Z" fill="#3d3d3d" />
            {/* Pot rim */}
            <rect x="-40" y="-15" width="80" height="8" rx="3" fill="#555" />
            {/* Inner dark */}
            <ellipse cx="0" cy="-11" rx="36" ry="7" fill="#2a2a2a" />
            {/* Teal bubbly liquid */}
            <ellipse cx="0" cy="-11" rx="32" ry="5.5" fill="#4ECDC4" opacity="0.75" />
            {/* Bubbles */}
            <circle cx="-12" cy="-13" r="3" fill="#5ED4CD" opacity="0.7">
              <animate attributeName="cy" values="-13;-20;-13" dur="1.4s" repeatCount="indefinite" />
              <animate attributeName="r" values="3;1;3" dur="1.4s" repeatCount="indefinite" />
            </circle>
            <circle cx="10" cy="-12" r="2.5" fill="#A8E6CF" opacity="0.6">
              <animate attributeName="cy" values="-12;-22;-12" dur="1.8s" repeatCount="indefinite" />
              <animate attributeName="r" values="2.5;0.5;2.5" dur="1.8s" repeatCount="indefinite" />
            </circle>
            <circle cx="0" cy="-14" r="2" fill="#5ED4CD" opacity="0.5">
              <animate attributeName="cy" values="-14;-19;-14" dur="1s" repeatCount="indefinite" />
            </circle>
            {/* Steam wisps */}
            <path d="M-15 -20 C-18 -35 -10 -45 -12 -55" fill="none" stroke="#ddd" strokeWidth="2" strokeLinecap="round" opacity="0.3">
              <animate attributeName="opacity" values="0.3;0.05;0.3" dur="3s" repeatCount="indefinite" />
              <animate attributeName="d" dur="3s" repeatCount="indefinite"
                values="M-15 -20 C-18 -35 -10 -45 -12 -55;M-15 -20 C-20 -33 -8 -48 -14 -58;M-15 -20 C-18 -35 -10 -45 -12 -55" />
            </path>
            <path d="M8 -20 C12 -32 6 -42 10 -52" fill="none" stroke="#ddd" strokeWidth="2" strokeLinecap="round" opacity="0.25">
              <animate attributeName="opacity" values="0.25;0.05;0.25" dur="3.5s" repeatCount="indefinite" />
              <animate attributeName="d" dur="3.5s" repeatCount="indefinite"
                values="M8 -20 C12 -32 6 -42 10 -52;M8 -20 C14 -30 4 -44 12 -55;M8 -20 C12 -32 6 -42 10 -52" />
            </path>
          </g>

          {/* Chef dragon — custom, not reusing Dragon component */}
          <g transform="translate(300, 140)">
            {/* Tail curling behind, resting on ground */}
            <path d="M10 55 Q45 60 55 45 Q62 35 50 30" fill="none" stroke="#3BB5AD" strokeWidth="6" strokeLinecap="round" />
            <circle cx="50" cy="28" r="3" fill="#FF6B9D" /> {/* tail tip */}

            {/* Legs */}
            <ellipse cx="-8" cy="68" rx="8" ry="5" fill="#3BB5AD" />
            <ellipse cx="12" cy="68" rx="8" ry="5" fill="#3BB5AD" />

            {/* Body — chubby, seated */}
            <ellipse cx="2" cy="42" rx="25" ry="28" fill="#4ECDC4" />
            {/* Belly */}
            <ellipse cx="2" cy="50" rx="16" ry="18" fill="#A8E6CF" />

            {/* Wings — folded back */}
            <path d="M-20 25 Q-42 5 -35 -10 Q-28 0 -18 18" fill="#FF9F43" fillOpacity="0.8" />
            <path d="M20 25 Q42 5 35 -10 Q28 0 18 18" fill="#FF9F43" fillOpacity="0.8" />

            {/* Arm holding ladle — reaching toward pot */}
            <path d="M-18 38 Q-40 30 -60 20" fill="none" stroke="#4ECDC4" strokeWidth="7" strokeLinecap="round" />
            <path d="M-18 38 Q-40 30 -60 20" fill="none" stroke="#3BB5AD" strokeWidth="4" strokeLinecap="round" />
            {/* Ladle */}
            <line x1="-58" y1="20" x2="-75" y2="-5" stroke="#aaa" strokeWidth="3" strokeLinecap="round" />
            <ellipse cx="-77" cy="-8" rx="7" ry="5" fill="#999" />
            <ellipse cx="-77" cy="-8" rx="5" ry="3" fill="#4ECDC4" opacity="0.6" />

            {/* Head */}
            <circle cx="2" cy="5" r="18" fill="#4ECDC4" />
            {/* Horns */}
            <path d="M-10 -10 L-13 -25 L-5 -12" fill="#FF9F43" />
            <path d="M10 -10 L13 -25 L5 -12" fill="#FF9F43" />
            {/* Snout bump */}
            <ellipse cx="2" cy="12" rx="10" ry="7" fill="#5ED4CD" />
            {/* Eyes — happy/squinting */}
            <path d="M-8 2 Q-5 -1 -2 2" fill="none" stroke="#2D2A2E" strokeWidth="2" strokeLinecap="round" />
            <path d="M6 2 Q9 -1 12 2" fill="none" stroke="#2D2A2E" strokeWidth="2" strokeLinecap="round" />
            {/* Blush */}
            <circle cx="-12" cy="8" r="4" fill="#FF6B9D" opacity="0.3" />
            <circle cx="16" cy="8" r="4" fill="#FF6B9D" opacity="0.3" />
            {/* Nostrils */}
            <circle cx="-1" cy="11" r="1.2" fill="#3BB5AD" />
            <circle cx="5" cy="11" r="1.2" fill="#3BB5AD" />
            {/* Smile */}
            <path d="M-3 15 Q2 19 7 15" fill="none" stroke="#3BB5AD" strokeWidth="1.2" strokeLinecap="round" />

            {/* Chef hat! */}
            <g transform="translate(2, -18)">
              <rect x="-14" y="0" width="28" height="5" rx="2" fill="white" />
              <ellipse cx="0" cy="-5" rx="12" ry="10" fill="white" />
              <ellipse cx="-5" cy="-8" rx="6" ry="7" fill="#f8f8f8" />
              <ellipse cx="5" cy="-8" rx="6" ry="7" fill="#f8f8f8" />
              <ellipse cx="0" cy="-10" rx="5" ry="6" fill="white" />
            </g>
          </g>

          {/* Scattered lollipops on the ground — already made ones */}
          <g transform="translate(90, 245) rotate(-20)">
            <line x1="0" y1="5" x2="0" y2="18" stroke="#ddd" strokeWidth="2" strokeLinecap="round" />
            <circle cx="0" cy="0" r="6" fill="#FF6B9D" />
            <circle cx="0" cy="0" r="3.5" fill="#FF9F43" />
            <circle cx="0" cy="0" r="1.5" fill="#FFD93D" />
          </g>
          <g transform="translate(115, 250) rotate(15)">
            <line x1="0" y1="5" x2="0" y2="16" stroke="#ddd" strokeWidth="2" strokeLinecap="round" />
            <circle cx="0" cy="0" r="5" fill="#4ECDC4" />
            <circle cx="0" cy="0" r="3" fill="#A8E6CF" />
            <circle cx="0" cy="0" r="1.2" fill="white" />
          </g>
          <g transform="translate(340, 255) rotate(8)">
            <line x1="0" y1="5" x2="0" y2="16" stroke="#ddd" strokeWidth="2" strokeLinecap="round" />
            <circle cx="0" cy="0" r="5.5" fill="#FF9F43" />
            <circle cx="0" cy="0" r="3" fill="#FFD93D" />
            <circle cx="0" cy="0" r="1.2" fill="white" />
          </g>
        </svg>
      </footer>

    </div>
  );
}
