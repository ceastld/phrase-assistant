import type { PhraseSegment } from "../types";
import { cloneSegments, segmentsEqual, serializeSegments } from "./segments";

export type HistoryKind = "type" | "delete" | "insert" | "paste" | "image";

export type EditorSnapshot = {
  segments: PhraseSegment[];
  caret: number;
};

const COALESCE_MS = 500;
const MAX_PAST = 100;

const COALESCE_KINDS = new Set<HistoryKind>(["type", "delete"]);

export function snapshotEqual(a: EditorSnapshot, b: EditorSnapshot): boolean {
  return a.caret === b.caret && segmentsEqual(a.segments, b.segments);
}

export class EditorHistory {
  private past: EditorSnapshot[] = [];
  private present: EditorSnapshot;
  private future: EditorSnapshot[] = [];
  private lastKind: HistoryKind | "none" = "none";
  private lastAt = 0;

  constructor(initial: EditorSnapshot) {
    this.present = cloneSnapshot(initial);
  }

  reset(next: EditorSnapshot): void {
    this.past = [];
    this.future = [];
    this.present = cloneSnapshot(next);
    this.lastKind = "none";
    this.lastAt = 0;
  }

  get current(): EditorSnapshot {
    return cloneSnapshot(this.present);
  }

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }

  record(next: EditorSnapshot, kind: HistoryKind): void {
    const cloned = cloneSnapshot(next);
    if (snapshotEqual(cloned, this.present)) {
      return;
    }
    const now = Date.now();
    const coalesce =
      kind === this.lastKind &&
      COALESCE_KINDS.has(kind) &&
      now - this.lastAt < COALESCE_MS;
    if (!coalesce) {
      this.past.push(this.present);
      if (this.past.length > MAX_PAST) {
        this.past.shift();
      }
      this.future = [];
    }
    this.present = cloned;
    this.lastKind = kind;
    this.lastAt = now;
  }

  undo(): EditorSnapshot | null {
    const previous = this.past.pop();
    if (!previous) {
      return null;
    }
    this.future.push(this.present);
    this.present = previous;
    this.lastKind = "none";
    return cloneSnapshot(this.present);
  }

  redo(): EditorSnapshot | null {
    const next = this.future.pop();
    if (!next) {
      return null;
    }
    this.past.push(this.present);
    this.present = next;
    this.lastKind = "none";
    return cloneSnapshot(this.present);
  }
}

function cloneSnapshot(snapshot: EditorSnapshot): EditorSnapshot {
  return {
    segments: cloneSegments(snapshot.segments),
    caret: snapshot.caret,
  };
}

export function historyKindFromInputType(inputType: string): HistoryKind {
  if (inputType.startsWith("delete") || inputType === "deleteByCut") {
    return "delete";
  }
  if (inputType === "insertFromPaste" || inputType === "insertFromDrop" || inputType === "insertFromYank") {
    return "paste";
  }
  return "type";
}

export function serializeSnapshot(snapshot: EditorSnapshot): string {
  return `${serializeSegments(snapshot.segments)}|${snapshot.caret}`;
}
