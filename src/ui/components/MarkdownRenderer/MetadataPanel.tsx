import type { MarkdownMetadataField } from "../../../markup";

const CHIP_FIELDS = new Set([
  "participants",
  "extends",
  "amends",
  "relates",
  "tags",
  "owners",
  "reviewers",
]);

function formatMetadataLabel(key: string): string {
  return key.replace(/[-_]/g, " ");
}

function shouldRenderChips(field: MarkdownMetadataField): boolean {
  return field.values.length > 1 || CHIP_FIELDS.has(field.key.toLowerCase());
}

export function MetadataPanel({ fields }: { fields: MarkdownMetadataField[] }) {
  if (fields.length === 0) {
    return null;
  }

  return (
    <section className="markdown-metadata" aria-label="Metadata">
      <h2 className="markdown-metadata__title">Metadata</h2>
      <dl className="markdown-metadata__list">
        {fields.map((field) => (
          <div key={field.key} className="markdown-metadata__row">
            <dt className="markdown-metadata__key">
              {formatMetadataLabel(field.key)}
            </dt>
            <dd className="markdown-metadata__value">
              {shouldRenderChips(field) ? (
                <span className="markdown-metadata__chips">
                  {field.values.map((value) => (
                    <span key={value} className="markdown-metadata__chip">
                      {value}
                    </span>
                  ))}
                </span>
              ) : (
                <span>{field.values[0] ?? ""}</span>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
