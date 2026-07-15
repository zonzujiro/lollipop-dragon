import { useState, type DragEvent } from "react";
import "../../styles/landing.css";
import { canRunAgent } from "../../../runtime";
import { useAppStore } from "../../../store";
import lollipopDragonLogo from "../../../assets/lollipop-dragon-logo.svg";

function Mark({
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

function HeroArtwork() {
  return (
    <svg viewBox="0 0 640 780" aria-hidden="true">
      <rect
        x="304"
        y="320"
        width="26"
        height="360"
        className="landing-fill-rewrite"
      />
      <circle cx="317" cy="220" r="180" className="landing-fill-teal" />
      <circle cx="317" cy="220" r="96" fill="#fbedd3" />
      <circle cx="317" cy="220" r="38" className="landing-fill-accent" />
      <path d="M150 240 L18 150 L160 120 Z" className="landing-fill-accent" />
      <path d="M484 240 L616 150 L474 120 Z" fill="#211d18" />
      <rect
        x="392"
        y="470"
        width="216"
        height="270"
        fill="#fffcf5"
        stroke="#211d18"
        strokeWidth="3"
      />
      <rect x="416" y="502" width="120" height="14" fill="#211d18" />
      <rect x="416" y="534" width="168" height="8" fill="#8a8175" />
      <rect x="416" y="552" width="150" height="8" fill="#8a8175" />
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
      <rect x="416" y="628" width="168" height="8" fill="#8a8175" />
      <rect x="416" y="646" width="104" height="8" fill="#8a8175" />
      <rect
        x="416"
        y="678"
        width="150"
        height="36"
        fill="#efeadd"
        stroke="#cfc5b0"
        strokeWidth="2"
      />
      <rect
        x="428"
        y="690"
        width="86"
        height="6"
        className="landing-fill-teal"
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
      <rect x="0" y="744" width="640" height="5" fill="#211d18" />
      <rect
        x="72"
        y="716"
        width="28"
        height="28"
        className="landing-fill-rewrite"
      />
      <path d="M150 744 L172 706 L194 744 Z" className="landing-fill-teal" />
    </svg>
  );
}

function ReadingArtwork() {
  return (
    <svg className="landing-band__art" viewBox="0 0 300 260" aria-hidden="true">
      <rect
        x="30"
        y="14"
        width="176"
        height="232"
        fill="#fffcf5"
        stroke="#211d18"
        strokeWidth="3"
      />
      <rect x="52" y="42" width="96" height="12" fill="#211d18" />
      <rect x="52" y="68" width="132" height="7" fill="#8a8175" />
      <rect x="52" y="84" width="120" height="7" fill="#8a8175" />
      <rect
        x="52"
        y="108"
        width="132"
        height="52"
        fill="#efeadd"
        stroke="#cfc5b0"
        strokeWidth="2"
      />
      <circle
        cx="88"
        cy="134"
        r="14"
        fill="none"
        className="landing-stroke-teal"
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
      <rect x="52" y="182" width="132" height="7" fill="#8a8175" />
      <rect x="52" y="198" width="100" height="7" fill="#8a8175" />
      <circle cx="236" cy="60" r="42" className="landing-fill-accent" />
      <rect
        x="212"
        y="170"
        width="56"
        height="56"
        className="landing-fill-teal"
        transform="rotate(12 240 198)"
      />
    </svg>
  );
}

function CommentArtwork() {
  return (
    <svg className="landing-band__art" viewBox="0 0 300 260" aria-hidden="true">
      <rect
        x="20"
        y="52"
        width="260"
        height="10"
        fill="#fbedd3"
        opacity=".85"
      />
      <rect
        x="20"
        y="80"
        width="220"
        height="10"
        fill="#fbedd3"
        opacity=".85"
      />
      <rect
        x="20"
        y="108"
        width="244"
        height="10"
        fill="#fbedd3"
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
      <rect x="20" y="150" width="120" height="44" fill="#fffcf5" />
      <rect x="34" y="164" width="70" height="6" fill="#211d18" />
      <rect x="34" y="178" width="90" height="6" fill="#8a8175" />
      <rect x="160" y="164" width="120" height="44" fill="#fffcf5" />
      <rect x="174" y="178" width="70" height="6" fill="#211d18" />
      <rect x="174" y="192" width="90" height="6" fill="#8a8175" />
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

function PrivacyArtwork() {
  return (
    <svg className="landing-band__art" viewBox="0 0 300 260" aria-hidden="true">
      <path
        d="M96 118v-30a54 54 0 0 1 108 0v30"
        fill="none"
        className="landing-stroke-teal"
        strokeWidth="14"
      />
      <rect x="72" y="118" width="156" height="116" fill="#fbedd3" />
      <circle cx="150" cy="164" r="17" className="landing-fill-accent" />
      <rect
        x="143"
        y="172"
        width="14"
        height="34"
        className="landing-fill-accent"
      />
      <rect x="42" y="234" width="216" height="6" fill="#fbedd3" opacity=".4" />
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

export function FilePicker() {
  const openFile = useAppStore((state) => state.openFileInNewTab);
  const openDirectory = useAppStore((state) => state.openDirectoryInNewTab);
  const openDirectoryHandle = useAppStore(
    (state) => state.openDirectoryHandleInNewTab,
  );
  const openAgentSettings = useAppStore((state) => state.openAgentSettings);
  const history = useAppStore((state) => state.history);
  const reopenFromHistory = useAppStore((state) => state.reopenFromHistory);

  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkValue, setLinkValue] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);

  function openReviewLink() {
    setLinkValue("");
    setLinkError(null);
    setLinkDialogOpen(true);
  }

  function submitReviewLink() {
    try {
      const parsedLink = new URL(linkValue.trim());
      if (!parsedLink.hash) {
        setLinkError(
          "that link is missing its encrypted key — copy the full link, # part included",
        );
        return;
      }
      setLinkDialogOpen(false);
      window.location.hash = parsedLink.hash;
    } catch (error) {
      console.warn("[FilePicker] invalid review link:", error);
      setLinkError(
        "that doesn't look like a link — paste the whole review url",
      );
    }
  }

  async function handleFolderDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    for (const item of event.dataTransfer.items) {
      const handle = await item.getAsFileSystemHandle();
      if (handle?.kind === "directory") {
        await openDirectoryHandle(handle);
        return;
      }
    }
    await openDirectory();
  }

  return (
    <main className="landing">
      <div className="landing-scroll">
        <section
          className="landing-hero"
          aria-labelledby="landing-title"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            void handleFolderDrop(event);
          }}
        >
          <div className="landing-hero__left">
            <img
              className="landing-stamp"
              src={lollipopDragonLogo}
              alt="Lollipop Dragon"
              title="yes, it’s a dragon"
            />
            <div className="landing-kicker">
              <Mark shape="square" color="accent" />
              local-first markdown review
            </div>
            <h1 className="landing-title" id="landing-title">
              <span>lollipop</span>
              <br />
              <span className="landing-title__outline">dragon</span>
            </h1>
            <p className="landing-tag">
              read what your agent wrote.
              <br />
              say what to change. watch it happen.
            </p>
            <div className="landing-actions">
              <button
                className="landing-action landing-action--red"
                onClick={openDirectory}
              >
                <Mark shape="square" color="cream" />
                open a folder<kbd>⌘O</kbd>
              </button>
              <button
                className="landing-action landing-action--line"
                onClick={openFile}
              >
                <Mark shape="circle" color="teal" />
                open a file<kbd>⌘⇧O</kbd>
              </button>
              <button
                className="landing-action landing-action--teal"
                onClick={openReviewLink}
              >
                <Mark shape="triangle" color="cream" />
                paste a review link
                <span className="landing-action__note">no install</span>
              </button>
            </div>
            {history.length > 0 && (
              <div className="landing-recents" aria-label="Recent workspaces">
                <span className="landing-recents__label">recent</span>
                {history.slice(0, 4).map((entry) => (
                  <button
                    key={entry.id}
                    className="landing-chip"
                    onClick={() => {
                      void reopenFromHistory(entry.id);
                    }}
                  >
                    {entry.type === "directory" ? "■" : "●"} {entry.name}
                    {entry.hasActiveShares ? <b>shared</b> : null}
                  </button>
                ))}
              </div>
            )}
            {canRunAgent && (
              <button className="landing-settings" onClick={openAgentSettings}>
                configure desktop agent
              </button>
            )}
          </div>
          <div className="landing-hero__art">
            <HeroArtwork />
          </div>
          <div className="landing-hero__foot">
            <a href="#landing-features">what it does ↓</a>
            <span>
              your files stay on this device · local folders need chrome or edge
              · review links work everywhere
            </span>
          </div>
        </section>

        <section
          className="landing-band landing-band--cream"
          id="landing-features"
        >
          <div className="landing-band__inner">
            <div className="landing-number">01</div>
            <div className="landing-band__copy">
              <h2 className="landing-heading">reads like a book</h2>
              <p className="landing-copy">
                your agent writes faster than you can read. every file renders
                as a well-set page — a 66-character serif column with everything
                technical intact — so reviewing feels like reading, not
                decoding.
              </p>
              <div className="landing-tiles">
                <span>
                  <Mark shape="square" color="accent" />
                  mermaid diagrams
                </span>
                <span>
                  <Mark shape="circle" color="teal" />
                  highlighted code
                </span>
                <span>
                  <Mark shape="triangle" color="rewrite" />
                  gfm tables &amp; task lists
                </span>
                <span>
                  <Mark shape="square" color="teal" />
                  tabs for files &amp; folders
                </span>
                <span>
                  <Mark shape="circle" color="rewrite" />
                  presentation mode
                </span>
                <span>
                  <Mark shape="triangle" color="accent" />
                  local &amp; offline
                </span>
              </div>
            </div>
            <ReadingArtwork />
          </div>
        </section>

        <section className="landing-band landing-band--black">
          <div className="landing-band__inner">
            <div className="landing-number landing-number--outline">02</div>
            <div className="landing-band__copy">
              <h2 className="landing-heading landing-heading--cream">
                say it with types
              </h2>
              <p className="landing-copy landing-copy--cream">
                comments here are instructions, not chat. pick a verb, and any
                agent knows exactly what to do — they live inside the markdown
                as criticmarkup, so nothing is lost between you and the model.
              </p>
              <div className="landing-types">
                <span>clarify</span>
                <span>rewrite</span>
              </div>
              <p className="landing-copy landing-copy--cream">
                anchor to half a sentence or where someone already commented.
                overlaps are welcome; every comment keeps its own underline.
              </p>
            </div>
            <CommentArtwork />
          </div>
        </section>

        <section className="landing-band landing-band--cream landing-band--handoff">
          <div className="landing-band__inner landing-band__inner--head">
            <div className="landing-number">03</div>
            <h2 className="landing-heading">hand it off</h2>
          </div>
          <div className="landing-duo">
            <div className="landing-panel landing-panel--teal">
              <h3>to your agent</h3>
              <ul>
                <li>
                  <Mark shape="square" color="cream" />
                  one keystroke sends every open comment
                </li>
                <li>
                  <Mark shape="circle" color="ink" />
                  watch edits stream back in, live
                </li>
                <li>
                  <Mark shape="triangle" color="rewrite" />
                  answers come back as threads
                </li>
              </ul>
            </div>
            <div className="landing-panel landing-panel--red">
              <h3>to your people</h3>
              <ul>
                <li>
                  <Mark shape="square" color="cream" />
                  one encrypted link, no accounts
                </li>
                <li>
                  <Mark shape="circle" color="ink" />
                  their comments land in your margin live
                </li>
                <li>
                  <Mark shape="triangle" color="rewrite" />
                  merge or dismiss with one click
                </li>
              </ul>
            </div>
          </div>
        </section>

        <section className="landing-band landing-band--black">
          <div className="landing-band__inner">
            <div className="landing-number landing-number--outline">04</div>
            <div className="landing-band__copy">
              <h2 className="landing-heading landing-heading--cream">
                private by construction
              </h2>
              <ul className="landing-locklist">
                <li>
                  <Mark shape="square" color="accent" />
                  your files stay on this device — reviewing happens in your
                  browser, straight from disk. no upload, works offline.
                </li>
                <li>
                  <Mark shape="circle" color="teal" />
                  sharing is end-to-end encrypted — the key lives in the link
                  itself and is never sent to any server. storage sees only
                  noise, and purges it when the share expires.
                </li>
                <li>
                  <Mark shape="triangle" color="rewrite" />
                  no accounts, no telemetry — reviewers open a link, pick a
                  name, done.
                </li>
              </ul>
            </div>
            <PrivacyArtwork />
          </div>
        </section>

        <section className="landing-cta">
          <h2 className="landing-heading landing-heading--big">
            start reading
          </h2>
          <button
            className="landing-action landing-action--red"
            onClick={openDirectory}
          >
            <Mark shape="square" color="cream" />
            open a folder<kbd>⌘O</kbd>
          </button>
        </section>
        <footer className="landing-footer">
          <svg
            className="landing-footer__shapes"
            viewBox="0 0 120 40"
            aria-hidden="true"
          >
            <circle cx="20" cy="20" r="16" className="landing-fill-accent" />
            <circle cx="20" cy="20" r="7" fill="#fbedd3" />
            <rect
              x="52"
              y="6"
              width="28"
              height="28"
              className="landing-fill-teal"
              transform="rotate(14 66 20)"
            />
            <path
              d="M92 34 L106 8 L120 34 Z"
              className="landing-fill-rewrite"
            />
          </svg>
          <p className="landing-footer__label">dragon’s favorite lollipop</p>
          <p className="landing-footer__recipe">
            melt 1 cup sugar with 1/3 cup corn syrup and 2 tbsp water. do not
            stir. at 300°f add a drop of teal food coloring and a pinch of chili
            flakes — dragons like it spicy. pour, insert sticks, cool. yields
            12. hide at least 3 from the dragon.
          </p>
        </footer>
      </div>

      {linkDialogOpen && (
        <div
          className="landing-link-scrim"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setLinkDialogOpen(false);
            }
          }}
        >
          <div
            className="landing-link-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Paste a review link"
          >
            <h2 className="landing-link-dialog__title">paste a review link</h2>
            <p className="landing-link-dialog__hint">
              the whole url — the part after # carries the encrypted key and
              never reaches any server
            </p>
            <input
              className="landing-link-dialog__input"
              type="url"
              value={linkValue}
              placeholder="https://…/#doc=…&key=…"
              autoFocus
              spellCheck={false}
              onChange={(event) => {
                setLinkValue(event.target.value);
                setLinkError(null);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  submitReviewLink();
                }
                if (event.key === "Escape") {
                  setLinkDialogOpen(false);
                }
              }}
            />
            {linkError && (
              <p className="landing-link-dialog__error" role="alert">
                {linkError}
              </p>
            )}
            <div className="landing-link-dialog__actions">
              <button
                type="button"
                className="landing-link-dialog__cancel"
                onClick={() => setLinkDialogOpen(false)}
              >
                cancel
              </button>
              <button
                type="button"
                className="landing-link-dialog__join"
                disabled={!linkValue.trim()}
                onClick={submitReviewLink}
              >
                join the review
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
