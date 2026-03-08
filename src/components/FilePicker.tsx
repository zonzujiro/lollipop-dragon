import '../styles/landing.css'
import { useEffect, useState } from "react";
import { useAppStore } from "../store";

/* ═══════════════════════════════════════════════════════════════════
   bauhaus palette
   red #E63946 · yellow #FFB800 · blue #1D3557 · black #1A1A1A · cream #F5F0E8
   ═══════════════════════════════════════════════════════════════════ */

/* ── Geometric dragon — circles, triangles, rectangles only ── */
function BauhausDragon({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g transform={`translate(${x},${y}) scale(${s})`}>
      {/* body — blue circle */}
      <circle cx="0" cy="0" r="32" fill="#1D3557" />
      {/* belly — yellow circle */}
      <circle cx="0" cy="6" r="18" fill="#FFB800" />
      {/* head — red circle */}
      <circle cx="0" cy="-34" r="22" fill="#E63946" />
      {/* eyes — white circles + black pupils */}
      <circle cx="-8" cy="-38" r="6" fill="#F5F0E8" />
      <circle cx="8" cy="-38" r="6" fill="#F5F0E8" />
      <circle cx="-6" cy="-38" r="3" fill="#1A1A1A" />
      <circle cx="10" cy="-38" r="3" fill="#1A1A1A" />
      {/* horns — yellow triangles */}
      <polygon points="-14,-52 -18,-72 -6,-56" fill="#FFB800" />
      <polygon points="14,-52 18,-72 6,-56" fill="#FFB800" />
      {/* wings — blue triangles */}
      <polygon points="-30,-10 -65,-30 -28,15" fill="#1D3557" opacity="0.6" />
      <polygon points="30,-10 65,-30 28,15" fill="#1D3557" opacity="0.6" />
      {/* feet — black rectangles */}
      <rect x="-20" y="28" width="14" height="8" fill="#1A1A1A" />
      <rect x="6" y="28" width="14" height="8" fill="#1A1A1A" />
      {/* tail — red triangle */}
      <polygon points="20,20 55,10 30,30" fill="#E63946" />
      {/* tail tip — yellow circle */}
      <circle cx="55" cy="10" r="5" fill="#FFB800" />
    </g>
  );
}

/* ── Geometric AI illustration ── */
function GeoAI() {
  return (
    <svg viewBox="0 0 400 300" fill="none" aria-hidden="true" className="bh-svg">
      {/* Grid of dots — structure */}
      {Array.from({ length: 7 }).map((_, row) =>
        Array.from({ length: 5 }).map((_, col) => (
          <circle key={`${row}-${col}`} cx={220 + col * 20} cy={60 + row * 30} r="2" fill="#1A1A1A" opacity="0.15" />
        ))
      )}
      {/* Document — black rectangle */}
      <rect x="30" y="40" width="140" height="200" fill="#1A1A1A" />
      <rect x="40" y="55" width="80" height="4" fill="#F5F0E8" opacity="0.5" />
      <rect x="40" y="65" width="100" height="3" fill="#F5F0E8" opacity="0.3" />
      <rect x="40" y="74" width="90" height="3" fill="#F5F0E8" opacity="0.3" />
      <rect x="40" y="90" width="70" height="4" fill="#F5F0E8" opacity="0.5" />
      <rect x="40" y="100" width="105" height="3" fill="#F5F0E8" opacity="0.3" />
      <rect x="40" y="109" width="85" height="3" fill="#F5F0E8" opacity="0.3" />
      <rect x="40" y="125" width="75" height="4" fill="#F5F0E8" opacity="0.5" />
      <rect x="40" y="135" width="100" height="3" fill="#F5F0E8" opacity="0.3" />
      <rect x="40" y="150" width="60" height="4" fill="#F5F0E8" opacity="0.5" />
      <rect x="40" y="160" width="95" height="3" fill="#F5F0E8" opacity="0.3" />
      <rect x="40" y="175" width="80" height="4" fill="#F5F0E8" opacity="0.5" />
      <rect x="40" y="185" width="100" height="3" fill="#F5F0E8" opacity="0.3" />

      {/* Scholar dragon — seated, reading, built differently from hero */}
      <g transform="translate(300, 150)">
        {/* Body — yellow square (different from hero's blue circle) */}
        <rect x="-30" y="-15" width="60" height="55" fill="#FFB800" />
        {/* Belly — cream rectangle */}
        <rect x="-18" y="0" width="36" height="30" fill="#F5F0E8" />
        {/* Head — blue square (hero has red circle) */}
        <rect x="-22" y="-55" width="44" height="44" fill="#1D3557" />
        {/* Eyes — white squares + black pupils */}
        <rect x="-14" y="-42" width="10" height="10" fill="#F5F0E8" />
        <rect x="4" y="-42" width="10" height="10" fill="#F5F0E8" />
        <rect x="-11" y="-39" width="5" height="5" fill="#1A1A1A" />
        <rect x="7" y="-39" width="5" height="5" fill="#1A1A1A" />
        {/* Glasses — circles on square head */}
        <circle cx="-9" cy="-37" r="9" fill="none" stroke="#1A1A1A" strokeWidth="2.5" />
        <circle cx="9" cy="-37" r="9" fill="none" stroke="#1A1A1A" strokeWidth="2.5" />
        <line x1="0" y1="-37" x2="0" y2="-37" stroke="#1A1A1A" strokeWidth="2.5" />
        <line x1="-18" y1="-37" x2="-24" y2="-40" stroke="#1A1A1A" strokeWidth="2" />
        <line x1="18" y1="-37" x2="24" y2="-40" stroke="#1A1A1A" strokeWidth="2" />
        {/* Horns — red triangles (hero has yellow) */}
        <polygon points="-16,-55 -22,-75 -8,-55" fill="#E63946" />
        <polygon points="16,-55 22,-75 8,-55" fill="#E63946" />
        {/* Wings — small red triangles folded */}
        <polygon points="-30,-5 -55,-25 -28,15" fill="#E63946" opacity="0.5" />
        <polygon points="30,-5 55,-25 28,15" fill="#E63946" opacity="0.5" />
        {/* Feet — blue rectangles */}
        <rect x="-22" y="38" width="14" height="8" fill="#1D3557" />
        <rect x="8" y="38" width="14" height="8" fill="#1D3557" />
        {/* Tail — yellow triangle */}
        <polygon points="28,25 60,15 32,38" fill="#FFB800" />
        <rect x="56" y="12" width="8" height="8" fill="#E63946" />
      </g>

      {/* Comment tags flowing from AI to doc */}
      {[
        { label: "fix", color: "#E63946", y: 70, delay: 0 },
        { label: "note", color: "#1D3557", y: 100, delay: 0.6 },
        { label: "rewrite", color: "#FFB800", y: 130, delay: 1.2 },
        { label: "expand", color: "#E63946", y: 160, delay: 1.8 },
        { label: "clarify", color: "#1D3557", y: 190, delay: 2.4 },
      ].map((tag) => (
        <g key={tag.label}>
          <rect x="240" y={tag.y - 8} width={tag.label.length * 8 + 12} height="16" fill={tag.color} opacity="0">
            <animate attributeName="x" values="240;172" dur="2s" begin={`${tag.delay}s`} fill="freeze" />
            <animate attributeName="opacity" values="0;1" dur="0.4s" begin={`${tag.delay}s`} fill="freeze" />
          </rect>
          <text x={240 + (tag.label.length * 8 + 12) / 2} y={tag.y} textAnchor="middle" fontSize="9"
            fontFamily="'Jost', sans-serif" fill="#F5F0E8" fontWeight="700" dominantBaseline="central"
            textTransform="uppercase" letterSpacing="0.05em" opacity="0">
            <animate attributeName="x" values={`${240 + (tag.label.length * 8 + 12) / 2};${172 + (tag.label.length * 8 + 12) / 2}`} dur="2s" begin={`${tag.delay}s`} fill="freeze" />
            <animate attributeName="opacity" values="0;1" dur="0.4s" begin={`${tag.delay}s`} fill="freeze" />
            {tag.label}
          </text>
        </g>
      ))}

      {/* Connecting lines */}
      <line x1="240" y1="120" x2="170" y2="120" stroke="#1A1A1A" strokeWidth="2" strokeDasharray="4 4" opacity="0.2" />
    </svg>
  );
}

/* ── Geometric Share illustration ── */
function GeoShare() {
  return (
    <svg viewBox="0 0 400 300" fill="none" aria-hidden="true" className="bh-svg">
      {/* Author — blue circle */}
      <circle cx="70" cy="150" r="45" fill="#1D3557" />
      <text x="70" y="155" textAnchor="middle" fontSize="11" fill="#F5F0E8" fontFamily="'Jost', sans-serif" fontWeight="700" textTransform="uppercase" letterSpacing="0.08em">you</text>

      {/* Encrypted tunnel — black rectangle with lock */}
      <rect x="140" y="120" width="120" height="60" fill="#1A1A1A" />
      {/* Lock shape — geometric */}
      <rect x="188" y="140" width="24" height="20" fill="#FFB800" />
      <rect x="192" y="128" width="16" height="14" rx="8" fill="none" stroke="#FFB800" strokeWidth="3" />
      <circle cx="200" cy="152" r="3" fill="#1A1A1A" />
      {/* Data packets moving through */}
      <rect x="148" y="145" width="12" height="8" fill="#E63946" opacity="0.7">
        <animate attributeName="x" values="148;245" dur="2s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.8;0" dur="2s" repeatCount="indefinite" />
      </rect>

      {/* Reviewer — red circle */}
      <circle cx="330" cy="150" r="45" fill="#E63946" />
      <text x="330" y="155" textAnchor="middle" fontSize="10" fill="#F5F0E8" fontFamily="'Jost', sans-serif" fontWeight="700" textTransform="uppercase" letterSpacing="0.06em">reviewer</text>

      {/* Decorative geometry */}
      <polygon points="70,80 90,60 50,60" fill="#FFB800" opacity="0.4" />
      <rect x="320" y="80" width="20" height="20" fill="#FFB800" opacity="0.4" />
      <circle cx="200" cy="100" r="8" fill="#E63946" opacity="0.2" />
      <circle cx="200" cy="200" r="6" fill="#1D3557" opacity="0.2" />
    </svg>
  );
}

/* ── Animated demo editor ── */

const DEMO_LINES = [
  { type: "heading", text: "# Project Overview" },
  { type: "text", text: "The architecture uses a modular approach with clear" },
  { type: "text", text: "separation of concerns between the data layer" },
  { type: "comment-fix", markup: "{~~modular approach~>component-based architecture~~}", label: "fix", color: "#E63946" },
  { type: "text", text: "and the presentation layer." },
  { type: "blank", text: "" },
  { type: "heading", text: "## Key Features" },
  { type: "text", text: "- Real-time collaboration support" },
  { type: "comment-note", markup: "{>>Consider adding WebSocket details<<}", label: "note", color: "#1D3557" },
  { type: "text", text: "- End-to-end encryption for shared documents" },
  { type: "text", text: "- Multi-tab editing with independent state" },
  { type: "comment-question", markup: "{>>Is this per-browser or per-device?<<}", label: "question", color: "#FFB800" },
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
    <div className="bh-demo">
      <div className="bh-demo__chrome">
        <div className="bh-demo__dots">
          <span className="bh-demo__dot" style={{ background: "#E63946" }} />
          <span className="bh-demo__dot" style={{ background: "#FFB800" }} />
          <span className="bh-demo__dot" style={{ background: "#1D3557" }} />
        </div>
        <span className="bh-demo__title">overview.md</span>
      </div>
      <div className="bh-demo__body">
        <div className="bh-demo__margin" />
        <div className="bh-demo__content">
          {DEMO_LINES.slice(0, visibleLines).map((line, i) => {
            if (line.type === "blank") {
              return <div key={i} className="bh-demo__line bh-demo__line--blank">&nbsp;</div>;
            }
            if (line.type === "heading") {
              const level = line.text.startsWith("## ") ? 2 : 1;
              return (
                <div key={i} className={`bh-demo__line bh-demo__line--h${level}`}>
                  {line.text.replace(/^#+\s/, "")}
                </div>
              );
            }
            if (line.type.startsWith("comment-")) {
              return (
                <div key={i} className="bh-demo__line bh-demo__line--comment">
                  <span className="bh-demo__markup" style={{ borderColor: line.color }}>
                    {line.markup}
                  </span>
                  <span className="bh-demo__indicator" style={{ backgroundColor: line.color }} title={line.label} />
                </div>
              );
            }
            return (
              <div key={i} className="bh-demo__line">{line.text}</div>
            );
          })}
          {visibleLines < DEMO_LINES.length && (
            <div className="bh-demo__cursor" />
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Chef dragon — bauhaus geometric ── */
function GeoCookingDragon() {
  return (
    <svg viewBox="0 0 400 240" fill="none" aria-hidden="true" className="bh-svg">
      {/* Ground line */}
      <rect x="0" y="220" width="400" height="20" fill="#1A1A1A" opacity="0.06" />

      {/* Cauldron — black trapezoid */}
      <polygon points="130,140 120,218 220,218 210,140" fill="#1A1A1A" />
      <rect x="115" y="132" width="110" height="12" fill="#1A1A1A" />
      {/* Liquid — blue */}
      <rect x="128" y="142" width="84" height="10" fill="#1D3557" />
      {/* Bubbles — circles */}
      <circle cx="150" cy="138" r="5" fill="#1D3557" opacity="0.5">
        <animate attributeName="cy" values="138;125;138" dur="1.4s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.5;0;0.5" dur="1.4s" repeatCount="indefinite" />
      </circle>
      <circle cx="180" cy="136" r="4" fill="#1D3557" opacity="0.4">
        <animate attributeName="cy" values="136;120;136" dur="1.8s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.4;0;0.4" dur="1.8s" repeatCount="indefinite" />
      </circle>
      <circle cx="195" cy="140" r="3" fill="#1D3557" opacity="0.3">
        <animate attributeName="cy" values="140;128;140" dur="1.2s" repeatCount="indefinite" />
      </circle>

      {/* Fire — triangles */}
      <polygon points="140,218 170,170 200,218" fill="#E63946">
        <animate attributeName="points" dur="0.6s" repeatCount="indefinite"
          values="140,218 170,170 200,218;140,218 165,165 200,218;140,218 170,170 200,218" />
      </polygon>
      <polygon points="155,218 170,180 185,218" fill="#FFB800">
        <animate attributeName="points" dur="0.5s" repeatCount="indefinite"
          values="155,218 170,180 185,218;155,218 168,175 185,218;155,218 170,180 185,218" />
      </polygon>

      {/* Dragon — geometric */}
      {/* Body */}
      <circle cx="310" cy="170" r="38" fill="#1D3557" />
      <circle cx="310" cy="180" r="22" fill="#FFB800" />
      {/* Head */}
      <circle cx="310" cy="120" r="26" fill="#E63946" />
      {/* Eyes — happy arcs */}
      <path d="M298,116 Q302,110 306,116" fill="none" stroke="#F5F0E8" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M314,116 Q318,110 322,116" fill="none" stroke="#F5F0E8" strokeWidth="2.5" strokeLinecap="round" />
      {/* Chef hat — white geometric */}
      <rect x="290" y="92" width="40" height="6" fill="#F5F0E8" />
      <circle cx="300" cy="85" r="10" fill="#F5F0E8" />
      <circle cx="320" cy="85" r="10" fill="#F5F0E8" />
      <circle cx="310" cy="82" r="10" fill="#F5F0E8" />
      {/* Horns — yellow triangles peeking from hat */}
      <polygon points="295,92 290,78 300,92" fill="#FFB800" />
      <polygon points="325,92 330,78 320,92" fill="#FFB800" />
      {/* Arm + ladle reaching to pot */}
      <rect x="240" y="155" width="35" height="8" fill="#1D3557" />
      <rect x="232" y="130" width="6" height="35" fill="#1A1A1A" opacity="0.5" />
      <circle cx="235" cy="127" r="6" fill="#1A1A1A" opacity="0.4" />
      {/* Feet */}
      <rect x="290" y="204" width="16" height="10" fill="#1A1A1A" />
      <rect x="314" y="204" width="16" height="10" fill="#1A1A1A" />
      {/* Tail */}
      <polygon points="345,185 385,170 350,198" fill="#E63946" />
      <circle cx="385" cy="170" r="5" fill="#FFB800" />

      {/* Lollipops on ground */}
      <g transform="translate(60, 200)">
        <rect x="-2" y="0" width="4" height="20" fill="#1A1A1A" opacity="0.3" />
        <circle cx="0" cy="-5" r="10" fill="#E63946" />
        <circle cx="0" cy="-5" r="6" fill="#FFB800" />
      </g>
      <g transform="translate(380, 198)">
        <rect x="-2" y="0" width="4" height="18" fill="#1A1A1A" opacity="0.3" />
        <circle cx="0" cy="-5" r="8" fill="#1D3557" />
        <circle cx="0" cy="-5" r="4" fill="#F5F0E8" />
      </g>
    </svg>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   main landing
   ═══════════════════════════════════════════════════════════════════ */

export function FilePicker() {
  const openFile = useAppStore((s) => s.openFileInNewTab);
  const openDirectory = useAppStore((s) => s.openDirectoryInNewTab);

  return (
    <div className="landing">
      {/* ── hero ── */}
      <section className="bh-hero">
        {/* Geometric background composition */}
        <svg className="bh-hero__geo" viewBox="0 0 1200 600" fill="none" aria-hidden="true" preserveAspectRatio="xMidYMid slice">
          <circle cx="900" cy="300" r="250" fill="#E63946" opacity="0.9" />
          <rect x="50" y="100" width="300" height="300" fill="#1D3557" opacity="0.8" />
          <polygon points="600,50 750,350 450,350" fill="#FFB800" opacity="0.85" />
          <circle cx="150" cy="500" r="120" fill="#FFB800" opacity="0.3" />
          <rect x="800" y="450" width="200" height="100" fill="#1D3557" opacity="0.3" />
          <line x1="0" y1="350" x2="1200" y2="350" stroke="#1A1A1A" strokeWidth="1" opacity="0.08" />
          <line x1="600" y1="0" x2="600" y2="600" stroke="#1A1A1A" strokeWidth="1" opacity="0.08" />
          <BauhausDragon x="1000" y="420" s={1.2} />
        </svg>

        <div className="bh-hero__content">
          <div className="bh-hero__logo-wrap">
            <img
              src={`${import.meta.env.BASE_URL}favicon.svg`}
              alt=""
              className="bh-hero__logo"
              width="80"
              height="80"
            />
            <span className="bh-hero__easter-egg">yes, it&apos;s a dragon</span>
          </div>
          <h1 className="bh-hero__title">
            lollipop<br />dragon
          </h1>
          <p className="bh-hero__tagline">
            collaboration for you, your agent &amp; your peers
          </p>
          <div className="bh-hero__actions">
            <button onClick={openFile} className="bh-btn bh-btn--primary">
              open file
            </button>
            <button onClick={openDirectory} className="bh-btn bh-btn--secondary">
              open folder
            </button>
          </div>
        </div>
      </section>

      {/* ── demo + features ── */}
      <section className="bh-section bh-section--cream">
        <div className="bh-section__inner bh-row">
          <div className="bh-row__main">
            <DemoEditor />
          </div>
          <ul className="bh-features">
            <li><span className="bh-features__dot" style={{ background: "#E63946" }} />criticmarkup comments</li>
            <li><span className="bh-features__dot" style={{ background: "#FFB800" }} />mermaid diagrams</li>
            <li><span className="bh-features__dot" style={{ background: "#1D3557" }} />syntax-highlighted code</li>
            <li><span className="bh-features__dot" style={{ background: "#E63946" }} />gfm tables &amp; task lists</li>
            <li><span className="bh-features__dot" style={{ background: "#FFB800" }} />multi-tab editing</li>
            <li><span className="bh-features__dot" style={{ background: "#1D3557" }} />folder tree sidebar</li>
            <li><span className="bh-features__dot" style={{ background: "#E63946" }} />dark mode &amp; focus mode</li>
            <li><span className="bh-features__dot" style={{ background: "#FFB800" }} />works offline</li>
          </ul>
        </div>
      </section>

      {/* ── two ways to collaborate ── */}
      <section className="bh-section bh-section--black">
        <div className="bh-section__inner">
          <h2 className="bh-heading bh-heading--light">two ways to collaborate</h2>
        </div>
      </section>

      {/* ── with ai ── */}
      <section className="bh-section bh-section--blue">
        <div className="bh-section__inner bh-row">
          <div className="bh-row__main">
            <div className="bh-card">
              <GeoAI />
            </div>
          </div>
          <ul className="bh-features bh-features--light bh-features--titled">
            <li className="bh-features__title">with ai</li>
            <li><span className="bh-features__dot" style={{ background: "#FFB800" }} />seven structured comment types</li>
            <li><span className="bh-features__dot" style={{ background: "#E63946" }} />any llm reads &amp; writes criticmarkup</li>
            <li><span className="bh-features__dot" style={{ background: "#FFB800" }} />no plugins, no cli</li>
            <li><span className="bh-features__dot" style={{ background: "#E63946" }} />copy-paste or point an agent</li>
          </ul>
        </div>
      </section>

      {/* ── with people ── */}
      <section className="bh-section bh-section--red">
        <div className="bh-section__inner bh-row">
          <div className="bh-row__main">
            <div className="bh-card">
              <GeoShare />
            </div>
          </div>
          <ul className="bh-features bh-features--light bh-features--titled">
            <li className="bh-features__title">with people</li>
            <li><span className="bh-features__dot" style={{ background: "#FFB800" }} />one encrypted share link</li>
            <li><span className="bh-features__dot" style={{ background: "#1D3557" }} />reviewer comments in the browser</li>
            <li><span className="bh-features__dot" style={{ background: "#FFB800" }} />no account needed</li>
            <li><span className="bh-features__dot" style={{ background: "#1D3557" }} />pull &amp; merge with one click</li>
          </ul>
        </div>
      </section>

      {/* ── footer ── */}
      <footer className="bh-footer">
        <p className="bh-footer__title">dragon&apos;s favorite lollipop</p>
        <p className="bh-footer__recipe">
          Melt 1 cup sugar with 1/3 cup corn syrup and 2 tbsp water over medium heat.
          Do not stir. At 300°F add a drop of teal food coloring and a pinch of
          chili flakes (dragons like it spicy). Pour into molds, insert sticks, and let cool.
          Yields 12 lollipops. Hide at least 3 from the dragon.
        </p>
        <GeoCookingDragon />
      </footer>
    </div>
  );
}
