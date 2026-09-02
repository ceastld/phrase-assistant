import { useCallback, useEffect, useRef, useState, type ReactElement } from "react";
import type { PhraseSegment } from "../types";
import { hydrateSegments, persistImageFile, segmentImageSrc } from "../api";
import {
  contentLength,
  deleteAdjacentImageAtom,
  insertImageFileAtCaret,
  parseEditorDom,
  placeCollapsedCaret,
  populateEditorDom,
  readCaretOffset,
  serializeEditorSegments,
} from "../lib/editorDom";
import {
  EditorHistory,
  historyKindFromInputType,
  type EditorSnapshot,
  type HistoryKind,
} from "../lib/editorHistory";
import { cloneSegments } from "../lib/segments";

interface MixedEditorProps {
  segments: PhraseSegment[];
  onChange: (next: PhraseSegment[]) => void;
  disabled?: boolean;
  focusNonce?: number;
  historyKey?: string;
}

function isImageFile(file: File): boolean {
  return file.type.startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp)$/iu.test(file.name);
}

function isImeComposing(event: { nativeEvent: { isComposing?: boolean }; key?: string }): boolean {
  return event.nativeEvent.isComposing === true || event.key === "Process";
}

function snapshotFrom(segments: PhraseSegment[], caret: number): EditorSnapshot {
  return { segments: cloneSegments(segments), caret };
}

function isUndoHotkey(event: React.KeyboardEvent): boolean {
  return (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z" && !event.altKey && !event.shiftKey;
}

function isRedoHotkey(event: React.KeyboardEvent): boolean {
  const key = event.key.toLowerCase();
  const mod = event.ctrlKey || event.metaKey;
  if (!mod || event.altKey) {
    return false;
  }
  return key === "y" || (key === "z" && event.shiftKey);
}

export function MixedEditor({
  segments,
  onChange,
  disabled = false,
  focusNonce = 0,
  historyKey = "",
}: MixedEditorProps): ReactElement {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const lastSerializedRef = useRef<string | null>(null);
  const lastHistoryKeyRef = useRef<string | null>(null);
  const composingRef = useRef(false);
  const applyingHistoryRef = useRef(false);
  const skipInputRef = useRef(false);
  const pendingCaretRef = useRef<number | null>(null);
  const historyRef = useRef(new EditorHistory(snapshotFrom(segments, contentLength(segments))));
  const lastInputKindRef = useRef<HistoryKind>("type");
  const [historyTick, setHistoryTick] = useState(0);

  const bumpHistory = useCallback(() => {
    setHistoryTick((value) => value + 1);
  }, []);

  const finishApplyCaret = useCallback((caret: number): void => {
    const root = surfaceRef.current;
    if (!root) {
      return;
    }
    root.focus({ preventScroll: true });
    placeCollapsedCaret(root, caret);
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && !sel.getRangeAt(0).collapsed) {
      sel.removeAllRanges();
      placeCollapsedCaret(root, caret);
    }
  }, []);

  const applySnapshot = useCallback(
    (snapshot: EditorSnapshot): void => {
      const root = surfaceRef.current;
      if (!root) {
        return;
      }
      applyingHistoryRef.current = true;
      composingRef.current = false;
      const next = hydrateSegments(snapshot.segments);
      lastSerializedRef.current = serializeEditorSegments(next);
      pendingCaretRef.current = snapshot.caret;
      populateEditorDom(root, next, segmentImageSrc);
      finishApplyCaret(snapshot.caret);
      onChange(next);
      window.requestAnimationFrame(() => {
        const caret = pendingCaretRef.current ?? snapshot.caret;
        finishApplyCaret(caret);
        pendingCaretRef.current = null;
        applyingHistoryRef.current = false;
      });
    },
    [finishApplyCaret, onChange],
  );

  useEffect(() => {
    const serialized = serializeEditorSegments(segments);
    const keyChanged = lastHistoryKeyRef.current !== historyKey;
    lastHistoryKeyRef.current = historyKey;

    if (applyingHistoryRef.current) {
      lastSerializedRef.current = serialized;
      return;
    }
    if (composingRef.current && !keyChanged) {
      return;
    }
    if (!keyChanged && serialized === lastSerializedRef.current) {
      return;
    }

    const root = surfaceRef.current;
    if (!root) {
      lastSerializedRef.current = serialized;
      return;
    }

    const fromDom = serializeEditorSegments(hydrateSegments(parseEditorDom(root)));
    if (!keyChanged && fromDom === serialized) {
      lastSerializedRef.current = serialized;
      historyRef.current.record(snapshotFrom(segments, readCaretOffset(root)), "insert");
      bumpHistory();
      return;
    }

    lastSerializedRef.current = serialized;
    populateEditorDom(root, segments, segmentImageSrc);
    historyRef.current.reset(snapshotFrom(segments, contentLength(segments)));
    bumpHistory();
  }, [bumpHistory, historyKey, segments]);

  useEffect(() => {
    if (focusNonce > 0) {
      surfaceRef.current?.focus();
    }
  }, [focusNonce]);

  const syncFromDom = useCallback(
    (kind: HistoryKind = "type") => {
      if (composingRef.current || applyingHistoryRef.current) {
        return;
      }
      const root = surfaceRef.current;
      if (!root) {
        return;
      }
      const next = hydrateSegments(parseEditorDom(root));
      lastSerializedRef.current = serializeEditorSegments(next);
      historyRef.current.record(snapshotFrom(next, readCaretOffset(root)), kind);
      bumpHistory();
      onChange(next);
    },
    [bumpHistory, onChange],
  );

  const undo = useCallback(() => {
    const snapshot = historyRef.current.undo();
    if (!snapshot) {
      return;
    }
    bumpHistory();
    applySnapshot(snapshot);
  }, [applySnapshot, bumpHistory]);

  const redo = useCallback(() => {
    const snapshot = historyRef.current.redo();
    if (!snapshot) {
      return;
    }
    bumpHistory();
    applySnapshot(snapshot);
  }, [applySnapshot, bumpHistory]);

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
      syncFromDom("insert");
    },
    [disabled, syncFromDom],
  );

  const handleHistoryKey = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (disabled) {
        return;
      }
      if (isUndoHotkey(event)) {
        event.preventDefault();
        event.stopPropagation();
        undo();
        return;
      }
      if (isRedoHotkey(event)) {
        event.preventDefault();
        event.stopPropagation();
        redo();
      }
    },
    [disabled, redo, undo],
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (disabled) {
        return;
      }
      if (isUndoHotkey(event) || isRedoHotkey(event)) {
        return;
      }
      if (isImeComposing(event) || composingRef.current) {
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
        syncFromDom("image");
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
      skipInputRef.current = true;
      if (text) {
        document.execCommand("insertText", false, text);
      }
      if (files.length > 0) {
        await insertFiles(files);
      } else {
        syncFromDom("paste");
      }
      skipInputRef.current = false;
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

  const canUndo = historyTick >= 0 && historyRef.current.canUndo;
  const canRedo = historyTick >= 0 && historyRef.current.canRedo;

  return (
    <div className="mixed-editor" role="group" aria-label="图文内容">
      <div className="mixed-editor-history">
        <button
          type="button"
          className="btn"
          disabled={disabled || !canUndo}
          onMouseDown={(event) => event.preventDefault()}
          onClick={undo}
        >
          撤销
        </button>
        <button
          type="button"
          className="btn"
          disabled={disabled || !canRedo}
          onMouseDown={(event) => event.preventDefault()}
          onClick={redo}
        >
          重做
        </button>
        <span className="hint">Ctrl+Z / Ctrl+Y</span>
      </div>
      <div
        ref={surfaceRef}
        className="mixed-editor-surface"
        contentEditable={!disabled}
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label="图文混排编辑区"
        data-placeholder="输入文字，或粘贴 / 拖入图片…"
        onBeforeInput={(event) => {
          const inputType = (event.nativeEvent as InputEvent).inputType;
          if (inputType === "historyUndo") {
            event.preventDefault();
            undo();
            return;
          }
          if (inputType === "historyRedo") {
            event.preventDefault();
            redo();
            return;
          }
          lastInputKindRef.current = historyKindFromInputType(inputType ?? "");
        }}
        onCompositionStart={() => {
          composingRef.current = true;
        }}
        onCompositionEnd={() => {
          composingRef.current = false;
          window.requestAnimationFrame(() => {
            syncFromDom("type");
          });
        }}
        onInput={(event) => {
          if (skipInputRef.current || isImeComposing(event) || composingRef.current) {
            return;
          }
          syncFromDom(lastInputKindRef.current);
        }}
        onBlur={() => {
          if (!applyingHistoryRef.current) {
            syncFromDom(lastInputKindRef.current);
          }
        }}
        onKeyDownCapture={handleHistoryKey}
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
      <p className="hint">
        停一下会自动写入数据库。可直接打字，或粘贴 / 拖入图片。图片旁 Backspace / Delete 可删图。
      </p>
    </div>
  );
}
