import "./PeerNamePrompt.css";
import { useState } from "react";
import lollipopDragonLogo from "../../../assets/lollipop-dragon-logo.svg";
import { useAppStore } from "../../../store";

export function PeerNamePrompt() {
  const setPeerName = useAppStore((state) => state.setPeerName);
  const sharedContent = useAppStore((state) => state.sharedContent);
  const [name, setName] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      return;
    }
    setPeerName(trimmed);
  }

  return (
    <div
      className="peer-prompt__overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Enter your name"
    >
      <div className="peer-prompt">
        <img className="peer-prompt__dragon" src={lollipopDragonLogo} alt="" />
        <span className="peer-prompt__eyebrow">
          Encrypted review invitation
        </span>
        <h2 className="peer-prompt__title">
          You’ve been invited to review{" "}
          {Object.keys(sharedContent?.tree ?? {}).length > 1
            ? "a workspace"
            : "a document"}
        </h2>
        <p className="peer-prompt__desc">
          Enter your name so the author knows who left each comment. Your name
          is only attached to feedback you submit.
        </p>
        <form onSubmit={handleSubmit} className="peer-prompt__form">
          <input
            className="peer-prompt__input"
            type="text"
            placeholder="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            aria-label="Your name"
          />
          <button
            className="peer-prompt__btn"
            type="submit"
            disabled={!name.trim()}
          >
            Start reviewing
          </button>
        </form>
      </div>
    </div>
  );
}
