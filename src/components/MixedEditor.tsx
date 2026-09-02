import { useCallback, useEffect, useRef, type ReactElement } from "react";
import type { PhraseSegment } from "../types";
import { hydrateSegments, persistImageFile, segmentImageSrc } from "../api";
import {
  deleteAdjacentImageAtom,
  insertImageFileAtCaret,
  parseEditorDom,
  populateEditorDom,
  serializeEditorSegments,
} from "../lib/editorDom";

interface MixedEditorProps {
  segments: PhraseSegment[];
  onChange: (next: PhraseSegment[]) => void;
  disabled?: boolean;
}

function isImageFile(file: File): boolean {
  return file.type.startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp)$/iu.test(file.name);
}

function isImeComposing(event: { nativeEvent: { isComposing?: boolean }; key?: string }): boolean {
  return event.nativeEvent.isComposing === true || event.key === "Process";
}

export function MixedEditor({ segments, onChange, disabled = false }: MixedEditorProps): ReactElement {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const lastSerializedRef = useRef<string | null>(null);
  const composingRef = useRef(false);

  useEffect(() => {
    if (composingRef.current) {
      return;
    }
    const serialized = serializeEditorSegments(segments);
    if (serialized === lastSerializedRef.current) {
      return;
    }
    lastSerializedRef.current = serialized;
    const root = surfaceRef.current;
    if (!root) {
      return;
    }
    populateEditorDom(root, segments, segmentImageSrc);
  }, [segments]);

  const syncFromDom = useCallback(() => {
    if (composingRef.current) {
      return;
    }
    const root = surfaceRef.current;
    if (!root) {
      return;
    }
    const next = hydrateSegments(parseEditorDom(root));
    lastSerializedRef.current = serializeEditorSegments(next);
    onChange(next);
  }, [onChange]);

  const insertFiles = useCallback(
    async (files: File[]) => {
      const root = surfaceRef.current;
      if (!root || disabled) {
        return;
      }
      for (const file of files) {
        if (!isImageFile(file)) {
          continue;
        }
        await insertImageFileAtCaret(root, file, persistImageFile, segmentImageSrc);
      }
      root.focus();
      syncFromDom();
    },
    [disabled, syncFromDom],
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (disabled || isImeComposing(event) || composingRef.current) {
        return;
      }
      if (event.key !== "Backspace" && event.key !== "Delete") {
        return;
      }
      const root = surfaceRef.current;
      const sel = window.getSelection();
      if (!root || !sel || sel.rangeCount === 0) {
        return;
      }
      const range = sel.getRangeAt(0);
      if (!root.contains(range.commonAncestorContainer)) {
        return;
      }
      if (deleteAdjacentImageAtom(root, range, event.key)) {
        event.preventDefault();
        syncFromDom();
      }
    },
    [disabled, syncFromDom],
  );

  const handlePaste = useCallback(
    async (event: React.ClipboardEvent<HTMLDivElement>) => {
      if (disabled || composingRef.current) {
        return;
      }
      const files = Array.from(event.clipboardData.files).filter(isImageFile);
      const text = event.clipboardData.getData("text/plain");
      if (files.length === 0 && !text) {
        return;
      }
      event.preventDefault();
      if (text) {
        document.execCommand("insertText", false, text);
      }
      if (files.length > 0) {
        await insertFiles(files);
      } else {
        syncFromDom();
      }
    },
    [disabled, insertFiles, syncFromDom],
  );

  const handleDrop = useCallback(
    async (event: React.DragEvent<HTMLDivElement>) => {
      if (disabled) {
        return;
      }
      const files = Array.from(event.dataTransfer.files).filter(isImageFile);
      if (files.length === 0) {
        return;
      }
      event.preventDefault();
      await insertFiles(files);
    },
    [disabled, insertFiles],
  );

  return (
    <div className="mixed-editor" role="group" aria-label="图文内容">
      <div
        ref={surfaceRef}
        className="mixed-editor-surface"
        contentEditable={!disabled}
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label="图文混排编辑区"
        data-placeholder="输入文字，或粘贴 / 拖入图片…"
        onCompositionStart={() => {
          composingRef.current = true;
        }}
        onCompositionEnd={() => {
          composingRef.current = false;
          syncFromDom();
        }}
        onInput={(event) => {
          if (isImeComposing(event) || composingRef.current) {
            return;
          }
          syncFromDom();
        }}
        onBlur={syncFromDom}
        onKeyDown={handleKeyDown}
        onPaste={(event) => {
          void handlePaste(event);
        }}
        onDragOver={(event) => {
          if (!disabled) {
            event.preventDefault();
          }
        }}
        onDrop={(event) => {
          void handleDrop(event);
        }}
      />
      <p className="hint">文本和图片混排保存。图片在光标旁按 Backspace / Delete 可删除。</p>
    </div>
  );
}
