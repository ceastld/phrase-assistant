import type { ReactElement } from "react";
import type { Phrase } from "../types";
import { MixedPreview } from "./MixedPreview";

interface PhraseListProps {
  phrases: Phrase[];
  selectedId: string | null;
  query: string;
  onSelect: (id: string) => void;
  onNew: () => void;
}

export function PhraseList({
  phrases,
  selectedId,
  query,
  onSelect,
  onNew,
}: PhraseListProps): ReactElement {
  if (phrases.length === 0) {
    return (
      <div className="empty-list">
        {query.trim() ? (
          <p>没有匹配「{query}」的常用语</p>
        ) : (
          <>
            <p>数据库里还没有常用语。</p>
            <button type="button" className="btn" onClick={onNew}>
              新建一条
            </button>
          </>
        )}
      </div>
    );
  }

  return (
    <ul className="phrase-list" role="listbox" aria-label="常用语列表">
      {phrases.map((phrase) => {
        const selected = phrase.id === selectedId;
        return (
          <li key={phrase.id}>
            <button
              type="button"
              className={`phrase-row${selected ? " is-selected" : ""}`}
              aria-selected={selected}
              onClick={() => onSelect(phrase.id)}
            >
              <div className="phrase-row-head">
                <strong>{phrase.title}</strong>
                {phrase.pinned ? (
                  <span className="pin-dot" title="置顶">
                    钉
                  </span>
                ) : null}
              </div>
              <MixedPreview segments={phrase.segments} />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
