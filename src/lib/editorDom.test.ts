import { afterEach, describe, expect, it } from "vitest";
import { parseEditorDom, populateEditorDom } from "./editorDom";
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
});
