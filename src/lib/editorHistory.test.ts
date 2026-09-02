import { describe, expect, it } from "vitest";
import { EditorHistory, historyKindFromInputType, snapshotEqual } from "./editorHistory";
import { segmentsEqual } from "./segments";
import type { PhraseSegment } from "../types";

const text = (value: string): PhraseSegment => ({ kind: "text", text: value });
const image = (imageId: string): PhraseSegment => ({ kind: "image", imageId });

describe("EditorHistory", () => {
  it("undo and redo restore segments and caret without leftover future after new edit", () => {
    const history = new EditorHistory({ segments: [text("a")], caret: 1 });
    history.record({ segments: [text("ab")], caret: 2 }, "type");
    history.record({ segments: [text("ab"), image("x.png")], caret: 3 }, "insert");

    const undone = history.undo();
    expect(undone && segmentsEqual(undone.segments, [text("ab")])).toBe(true);
    expect(undone?.caret).toBe(2);
    expect(history.canRedo).toBe(true);

    const redone = history.redo();
    expect(redone && segmentsEqual(redone.segments, [text("ab"), image("x.png")])).toBe(true);
    expect(history.canUndo).toBe(true);

    history.undo();
    history.record({ segments: [text("abc")], caret: 3 }, "type");
    expect(history.canRedo).toBe(false);
    expect(segmentsEqual(history.undo()?.segments ?? [], [text("ab")])).toBe(true);
  });

  it("coalesces rapid type steps into one undo entry", () => {
    const history = new EditorHistory({ segments: [text("")], caret: 0 });
    history.record({ segments: [text("你")], caret: 1 }, "type");
    history.record({ segments: [text("你好")], caret: 2 }, "type");
    expect(history.canUndo).toBe(true);
    const first = history.undo();
    expect(first && segmentsEqual(first.segments, [text("")])).toBe(true);
    expect(history.undo()).toBeNull();
  });

  it("does not coalesce insert after typing", () => {
    const history = new EditorHistory({ segments: [text("hi")], caret: 2 });
    history.record({ segments: [text("hi!")], caret: 3 }, "type");
    history.record({ segments: [text("hi!"), image("a.png")], caret: 4 }, "insert");
    expect(segmentsEqual(history.undo()?.segments ?? [], [text("hi!")])).toBe(true);
    expect(segmentsEqual(history.undo()?.segments ?? [], [text("hi")])).toBe(true);
  });

  it("reset clears stacks", () => {
    const history = new EditorHistory({ segments: [text("a")], caret: 1 });
    history.record({ segments: [text("b")], caret: 1 }, "type");
    history.reset({ segments: [text("other")], caret: 5 });
    expect(history.canUndo).toBe(false);
    expect(history.canRedo).toBe(false);
    expect(snapshotEqual(history.current, { segments: [text("other")], caret: 5 })).toBe(true);
  });
});

describe("historyKindFromInputType", () => {
  it("maps browser input types", () => {
    expect(historyKindFromInputType("insertText")).toBe("type");
    expect(historyKindFromInputType("deleteContentBackward")).toBe("delete");
    expect(historyKindFromInputType("insertFromPaste")).toBe("paste");
  });
});
