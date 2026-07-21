export function Mark({
  shape,
  color,
}: {
  shape: "square" | "circle" | "triangle";
  color: string;
}) {
  return (
    <i
      className={`landing-mark landing-mark--${shape} landing-mark--${color}`}
      aria-hidden="true"
    />
  );
}

export function HeroArtwork() {
  return (
    <svg viewBox="0 0 640 780" aria-hidden="true">
      <rect
        x="304"
        y="320"
        width="26"
        height="360"
        className="landing-fill-rewrite"
      />
      <circle cx="317" cy="220" r="180" className="landing-fill-agent" />
      <circle cx="317" cy="220" r="96" className="landing-fill-pop" />
      <circle cx="317" cy="220" r="38" className="landing-fill-accent" />
      <path d="M150 240 L18 150 L160 120 Z" className="landing-fill-accent" />
      <path d="M484 240 L616 150 L474 120 Z" className="landing-fill-ink" />
      <rect
        x="392"
        y="470"
        width="216"
        height="270"
        className="landing-page"
        strokeWidth="3"
      />
      <rect
        x="416"
        y="502"
        width="120"
        height="14"
        className="landing-fill-ink"
      />
      <rect
        x="416"
        y="534"
        width="168"
        height="8"
        className="landing-fill-muted"
      />
      <rect
        x="416"
        y="552"
        width="150"
        height="8"
        className="landing-fill-muted"
      />
      <rect
        x="416"
        y="576"
        width="160"
        height="16"
        className="landing-fill-accent landing-opacity-mark"
      />
      <rect
        x="472"
        y="576"
        width="112"
        height="16"
        className="landing-fill-clarify landing-opacity-mark"
      />
      <rect
        x="416"
        y="596"
        width="54"
        height="5"
        className="landing-fill-accent"
      />
      <rect
        x="472"
        y="604"
        width="58"
        height="5"
        className="landing-fill-clarify"
      />
      <rect
        x="416"
        y="628"
        width="168"
        height="8"
        className="landing-fill-muted"
      />
      <rect
        x="416"
        y="646"
        width="104"
        height="8"
        className="landing-fill-muted"
      />
      <rect
        x="416"
        y="678"
        width="150"
        height="36"
        className="landing-well"
        strokeWidth="2"
      />
      <rect
        x="428"
        y="690"
        width="86"
        height="6"
        className="landing-fill-agent"
      />
      <rect
        x="352"
        y="576"
        width="18"
        height="18"
        className="landing-fill-accent"
      />
      <rect
        x="352"
        y="602"
        width="18"
        height="18"
        className="landing-fill-clarify"
        transform="rotate(45 361 611)"
      />
      <rect x="0" y="744" width="640" height="5" className="landing-fill-ink" />
      <rect
        x="72"
        y="716"
        width="28"
        height="28"
        className="landing-fill-rewrite"
      />
      <path d="M150 744 L172 706 L194 744 Z" className="landing-fill-agent" />
    </svg>
  );
}

export function ReadingArtwork() {
  return (
    <svg className="landing-band__art" viewBox="0 0 300 260" aria-hidden="true">
      <rect
        x="30"
        y="14"
        width="176"
        height="232"
        className="landing-page"
        strokeWidth="3"
      />
      <rect x="52" y="42" width="96" height="12" className="landing-fill-ink" />
      <rect
        x="52"
        y="68"
        width="132"
        height="7"
        className="landing-fill-muted"
      />
      <rect
        x="52"
        y="84"
        width="120"
        height="7"
        className="landing-fill-muted"
      />
      <rect
        x="52"
        y="108"
        width="132"
        height="52"
        className="landing-well"
        strokeWidth="2"
      />
      <circle
        cx="88"
        cy="134"
        r="14"
        fill="none"
        className="landing-stroke-agent"
        strokeWidth="3"
      />
      <rect
        x="112"
        y="122"
        width="24"
        height="24"
        fill="none"
        className="landing-stroke-rewrite"
        strokeWidth="3"
      />
      <path
        d="M148 146 L160 124 L172 146 Z"
        fill="none"
        className="landing-stroke-accent"
        strokeWidth="3"
      />
      <rect
        x="52"
        y="182"
        width="132"
        height="7"
        className="landing-fill-muted"
      />
      <rect
        x="52"
        y="198"
        width="100"
        height="7"
        className="landing-fill-muted"
      />
      <circle cx="236" cy="60" r="42" className="landing-fill-accent" />
      <rect
        x="212"
        y="170"
        width="56"
        height="56"
        className="landing-fill-agent"
        transform="rotate(12 240 198)"
      />
    </svg>
  );
}

export function CommentArtwork() {
  return (
    <svg className="landing-band__art" viewBox="0 0 300 260" aria-hidden="true">
      <rect
        x="20"
        y="52"
        width="260"
        height="10"
        className="landing-fill-pop"
        opacity=".85"
      />
      <rect
        x="20"
        y="80"
        width="220"
        height="10"
        className="landing-fill-pop"
        opacity=".85"
      />
      <rect
        x="20"
        y="108"
        width="244"
        height="10"
        className="landing-fill-pop"
        opacity=".85"
      />
      <rect
        x="20"
        y="72"
        width="150"
        height="26"
        className="landing-fill-accent landing-opacity-comment"
      />
      <rect
        x="96"
        y="72"
        width="144"
        height="26"
        className="landing-fill-clarify landing-opacity-comment"
      />
      <rect
        x="20"
        y="104"
        width="76"
        height="4"
        className="landing-fill-accent"
      />
      <rect
        x="96"
        y="112"
        width="74"
        height="4"
        className="landing-fill-clarify"
      />
      <rect
        x="20"
        y="150"
        width="120"
        height="44"
        className="landing-fill-paper"
      />
      <rect x="34" y="164" width="70" height="6" className="landing-fill-ink" />
      <rect
        x="34"
        y="178"
        width="90"
        height="6"
        className="landing-fill-muted"
      />
      <rect
        x="160"
        y="164"
        width="120"
        height="44"
        className="landing-fill-paper"
      />
      <rect
        x="174"
        y="178"
        width="70"
        height="6"
        className="landing-fill-ink"
      />
      <rect
        x="174"
        y="192"
        width="90"
        height="6"
        className="landing-fill-muted"
      />
      <circle cx="34" cy="228" r="10" className="landing-fill-accent" />
      <rect
        x="160"
        y="232"
        width="18"
        height="18"
        className="landing-fill-clarify"
        transform="rotate(45 169 241)"
      />
    </svg>
  );
}

export function PrivacyArtwork() {
  return (
    <svg className="landing-band__art" viewBox="0 0 300 260" aria-hidden="true">
      <path
        d="M96 118v-30a54 54 0 0 1 108 0v30"
        fill="none"
        className="landing-stroke-agent"
        strokeWidth="14"
      />
      <rect
        x="72"
        y="118"
        width="156"
        height="116"
        className="landing-fill-pop"
      />
      <circle cx="150" cy="164" r="17" className="landing-fill-accent" />
      <rect
        x="143"
        y="172"
        width="14"
        height="34"
        className="landing-fill-accent"
      />
      <rect
        x="42"
        y="234"
        width="216"
        height="6"
        className="landing-fill-pop"
        opacity=".4"
      />
      <rect
        x="238"
        y="52"
        width="26"
        height="26"
        className="landing-fill-rewrite"
        transform="rotate(18 251 65)"
      />
      <circle
        cx="46"
        cy="60"
        r="13"
        fill="none"
        className="landing-stroke-accent"
        strokeWidth="4"
      />
    </svg>
  );
}
