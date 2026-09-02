import { describe, expect, it } from "vitest";
import { segmentsEqual, serializeSegments, summaryFromSegments } from "./segments";
import type { PhraseSegment } from "../types";

const text = (value: string): PhraseSegment => ({ kind: "text", text: value });
const image = (imageId: string): PhraseSegment => ({ kind: "image", imageId });

describe("summaryFromSegments", () => {
  it("joins text and image tokens like clip IM preview", () => {
    expect(summaryFromSegments([text("你好"), image("a.png"), text("世界")])).toBe(
      "你好[图片]世界",
    );
  });
});

describe("segmentsEqual", () => {
  it("compares kind, text and image id", () => {
    expect(segmentsEqual([text("a"), image("1.png")], [text("a"), image("1.png")])).toBe(true);
    expect(segmentsEqual([text("a")], [text("b")])).toBe(false);
  });
});

describe("serializeSegments", () => {
  it("drops display-only imagePath", () => {
    const json = serializeSegments([{ kind: "image", imageId: "a.png", imagePath: "C:\\tmp\\a.png" }]);
    expect(json).toBe(JSON.stringify([{ kind: "image", text: null, imageId: "a.png" }]));
  });
});
