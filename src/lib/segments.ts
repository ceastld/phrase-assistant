import type { PhraseSegment } from "../types";

export const PREVIEW_IMAGE_MAX_HEIGHT_PX = 56;
export const EDITOR_IMAGE_MAX_HEIGHT_PX = 90;

export function summaryFromSegments(segments: readonly PhraseSegment[]): string {
  return segments
    .map((segment) => {
      if (segment.kind === "image") {
        return "[图片]";
      }
      return (segment.text ?? "").trim();
    })
    .filter((part) => part.length > 0)
    .join("");
}

export function segmentsEqual(a: readonly PhraseSegment[], b: readonly PhraseSegment[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  return a.every((segment, index) => {
    const other = b[index];
    return (
      segment.kind === other.kind &&
      (segment.text ?? "") === (other.text ?? "") &&
      (segment.imageId ?? "") === (other.imageId ?? "")
    );
  });
}

export function cloneSegments(segments: readonly PhraseSegment[]): PhraseSegment[] {
  return segments.map((segment) => ({
    kind: segment.kind,
    text: segment.text ?? null,
    imageId: segment.imageId ?? null,
    imagePath: segment.imagePath ?? null,
  }));
}

export function serializeSegments(segments: readonly PhraseSegment[]): string {
  return JSON.stringify(
    segments.map((segment) => ({
      kind: segment.kind,
      text: segment.text ?? null,
      imageId: segment.imageId ?? null,
    })),
  );
}
