import "./RestoreError.css";

interface RestoreErrorProps {
  message: string;
  isDirectory: boolean;
  onReopen: () => void;
}

export function RestoreError({
  message,
  isDirectory,
  onReopen,
}: RestoreErrorProps) {
  return (
    <div className="restore-error">
      <svg
        className="restore-error__icon"
        xmlns="http://www.w3.org/2000/svg"
        width="48"
        height="48"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M3 7v6h6" />
        <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6.69 3L3 13" />
        <line x1="17" y1="7" x2="17" y2="7.01" />
        <circle cx="17" cy="7" r="0.5" fill="currentColor" stroke="none" />
      </svg>
      <h2 className="restore-error__title">
        {isDirectory ? "Folder not found" : "File not found"}
      </h2>
      <p className="restore-error__text">{message}</p>
      <button className="restore-error__btn" onClick={onReopen}>
        {isDirectory ? "Reopen folder" : "Reopen file"}
      </button>
    </div>
  );
}
