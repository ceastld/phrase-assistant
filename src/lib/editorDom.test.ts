import { afterEach, describe, expect, it } from "vitest";
import {
  contentLength,
  parseEditorDom,
  placeCollapsedCaret,
  populateEditorDom,
  readCaretOffset,
} from "./editorDom";
import type { PhraseSegment } from "../types";

describe("editorDom", () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it("roundtrips mixed text and image atoms", () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    const segments: PhraseSegment[] = [
      { kind: "text", text: "你好\n下一行" },
      { kind: "image", imageId: "abc.png" },
      { kind: "text", text: "结尾" },
    ];
    populateEditorDom(root, segments, (segment) =>
      segment.imageId ? `asset://${segment.imageId}` : null,
    );

    const imageAtom = root.querySelector("[data-phrase-segment='image']");
    expect(imageAtom?.getAttribute("data-image-id")).toBe("abc.png");
    expect(root.querySelector("img")?.getAttribute("src")).toBe("asset://abc.png");
    expect(imageAtom?.nextElementSibling?.getAttribute("data-caret-anchor")).toBe("1");

    expect(parseEditorDom(root)).toEqual([
      { kind: "text", text: "你好\n下一行" },
      { kind: "image", imageId: "abc.png" },
      { kind: "text", text: "结尾" },
    ]);
  });

  it("reads text typed inside the caret anchor after an image", () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    populateEditorDom(root, [{ kind: "image", imageId: "a.png" }], () => "asset://a.png");
    const anchor = root.querySelector("[data-caret-anchor='1']");
    expect(anchor).not.toBeNull();
    anchor?.appendChild(document.createTextNode("随后输入"));
    expect(parseEditorDom(root)).toEqual([
      { kind: "image", imageId: "a.png" },
      { kind: "text", text: "随后输入" },
    ]);
  });

  it("places a collapsed caret and reads the same offset back", () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    const segments: PhraseSegment[] = [
      { kind: "text", text: "你好" },
      { kind: "image", imageId: "a.png" },
      { kind: "text", text: "世界" },
    ];
    populateEditorDom(root, segments, () => "asset://a.png");
    expect(contentLength(segments)).toBe(5);

    for (const offset of [0, 2, 3, 5]) {
      placeCollapsedCaret(root, offset);
      const sel = window.getSelection();
      expect(sel?.rangeCount).toBe(1);
      expect(sel?.getRangeAt(0).collapsed).toBe(true);
      expect(readCaretOffset(root)).toBe(offset);
    }
  });

  it("clears a leftover highlight when placing the caret after a rebuild", () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    populateEditorDom(root, [{ kind: "text", text: "选中这段文字" }], () => null);

    const leftover = document.createRange();
    leftover.selectNodeContents(root);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(leftover);
    expect(sel?.getRangeAt(0).collapsed).toBe(false);

    populateEditorDom(root, [{ kind: "text", text: "撤销后的正文" }], () => null);
    placeCollapsedCaret(root, 3);

    const after = window.getSelection();
    expect(after?.rangeCount).toBe(1);
    expect(after?.getRangeAt(0).collapsed).toBe(true);
    expect(readCaretOffset(root)).toBe(3);
  });
});
