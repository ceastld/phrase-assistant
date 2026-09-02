import type { ReactElement } from "react";
import type { PhraseSegment } from "../types";
import { segmentImageSrc } from "../api";
import { PREVIEW_IMAGE_MAX_HEIGHT_PX } from "../lib/segments";

interface MixedPreviewProps {
  segments: readonly PhraseSegment[];
  compact?: boolean;
}

export function MixedPreview({ segments, compact = true }: MixedPreviewProps): ReactElement {
  if (segments.length === 0) {
    return <span className="muted">空常用语</span>;
  }

  return (
    <div className={`mixed-preview${compact ? " mixed-preview--compact" : ""}`}>
      {segments.map((segment, index) => {
        const key = `${segment.kind}-${index}`;
        if (segment.kind === "image") {
          const src = segmentImageSrc(segment);
          if (!src) {
            return (
              <span key={key} className="mixed-chip mixed-chip--missing">
                [图片不可用]
              </span>
            );
          }
          return (
            <img
              key={key}
              className="mixed-preview-image"
              src={src}
              alt=""
              draggable={false}
              style={{ maxHeight: `${PREVIEW_IMAGE_MAX_HEIGHT_PX}px` }}
            />
          );
        }
        return (
          <span key={key} className="mixed-preview-text">
            {segment.text}
          </span>
        );
      })}
    </div>
  );
}
