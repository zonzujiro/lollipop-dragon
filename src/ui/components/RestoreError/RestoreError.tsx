import "./RestoreError.css";

interface RestoreErrorProps {
  title: string;
  actionLabel: string;
  secondaryActionLabel: string;
  onReopen: () => void;
  onOpenOther: () => void;
}

export function RestoreError({
  title,
  actionLabel,
  secondaryActionLabel,
  onReopen,
  onOpenOther,
}: RestoreErrorProps) {
  return (
    <div className="restore-error">
      <svg
        className="restore-error__icon"
        xmlns="http://www.w3.org/2000/svg"
        width="88"
        height="88"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <circle cx="11" cy="13" r="2.2" />
        <path d="M13.2 13h4.3m-1.8 0v2" />
      </svg>
      <h2 className="restore-error__title">{title}</h2>
      <p className="restore-error__text">
        Browsers ask again after a restart — one click brings it back.
      </p>
      <div className="restore-error__actions">
        <button
          className="restore-error__btn restore-error__btn--primary"
          onClick={onReopen}
        >
          {actionLabel}
        </button>
        <button className="restore-error__btn" onClick={onOpenOther}>
          {secondaryActionLabel}
        </button>
      </div>
    </div>
  );
}
