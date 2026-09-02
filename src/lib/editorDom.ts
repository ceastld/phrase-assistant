import type { PhraseSegment } from "../types";
import { EDITOR_IMAGE_MAX_HEIGHT_PX, serializeSegments } from "./segments";

export const EDITOR_ZWSP = "\u200B";
const SEGMENT_ATTR = "data-phrase-segment";
const IMAGE_ID_ATTR = "data-image-id";

export type ImageSrcResolver = (segment: PhraseSegment) => string | null;

function isImageAtom(node: Node | null): node is HTMLElement {
  return node instanceof HTMLElement && node.dataset.phraseSegment === "image";
}

function appendTextWithLineBreaks(root: HTMLElement, text: string): void {
  const parts = text.split(/\r?\n/u);
  parts.forEach((part, index) => {
    if (part) {
      root.appendChild(document.createTextNode(part));
    }
    if (index < parts.length - 1) {
      root.appendChild(document.createElement("br"));
    }
  });
}

export function createImageAtom(imageId: string, src: string | null): HTMLElement {
  const wrap = document.createElement("span");
  wrap.className = "mixed-atom mixed-atom--image";
  wrap.contentEditable = "false";
  wrap.setAttribute(SEGMENT_ATTR, "image");
  wrap.setAttribute(IMAGE_ID_ATTR, imageId);

  if (src) {
    const img = document.createElement("img");
    img.className = "mixed-atom-image";
    img.src = src;
    img.alt = "";
    img.draggable = false;
    img.style.maxHeight = `${EDITOR_IMAGE_MAX_HEIGHT_PX}px`;
    wrap.appendChild(img);
  } else {
    wrap.classList.add("mixed-atom--missing");
    wrap.textContent = "[图片不可用]";
  }
  return wrap;
}

function appendAtom(root: HTMLElement, atom: HTMLElement): void {
  root.appendChild(atom);
  root.appendChild(document.createTextNode(EDITOR_ZWSP));
}

export function populateEditorDom(
  root: HTMLElement,
  segments: readonly PhraseSegment[],
  resolveSrc: ImageSrcResolver,
): void {
  root.replaceChildren();
  for (const segment of segments) {
    if (segment.kind === "image") {
      const imageId = (segment.imageId ?? "").trim();
      appendAtom(root, createImageAtom(imageId, resolveSrc(segment)));
    } else {
      appendTextWithLineBreaks(root, segment.text ?? "");
    }
  }
}

function flushTextBuffer(buffer: string, segments: PhraseSegment[]): void {
  if (!buffer) {
    return;
  }
  segments.push({ kind: "text", text: buffer });
}

export function parseEditorDom(root: HTMLElement): PhraseSegment[] {
  const segments: PhraseSegment[] = [];
  let textBuffer = "";

  const walk = (node: Node): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      const cleaned = (node.textContent ?? "").split(EDITOR_ZWSP).join("");
      if (cleaned) {
        textBuffer += cleaned;
      }
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) {
      return;
    }

    const element = node as HTMLElement;
    if (element.dataset.phraseSegment === "image") {
      flushTextBuffer(textBuffer, segments);
      textBuffer = "";
      segments.push({
        kind: "image",
        imageId: element.dataset.imageId ?? null,
      });
      return;
    }

    if (element.tagName === "BR") {
      textBuffer += "\n";
      return;
    }

    const blockLike = element.tagName === "DIV" || element.tagName === "P";
    for (const child of element.childNodes) {
      walk(child);
    }
    if (blockLike && element !== root) {
      textBuffer += "\n";
    }
  };

  for (const child of root.childNodes) {
    walk(child);
  }
  flushTextBuffer(textBuffer, segments);
  return segments;
}

export function serializeEditorSegments(segments: readonly PhraseSegment[]): string {
  return serializeSegments(segments);
}

function removeZwspNeighbors(atom: HTMLElement): void {
  const prev = atom.previousSibling;
  if (prev?.nodeType === Node.TEXT_NODE && prev.textContent === EDITOR_ZWSP) {
    prev.remove();
  }
  const next = atom.nextSibling;
  if (next?.nodeType === Node.TEXT_NODE && next.textContent === EDITOR_ZWSP) {
    next.remove();
  }
}

function placeCaretAfter(node: Node | null, root: HTMLElement): void {
  const sel = window.getSelection();
  if (!sel) {
    return;
  }
  const range = document.createRange();
  if (!node) {
    range.setStart(root, 0);
  } else if (node.nodeType === Node.TEXT_NODE) {
    range.setStart(node, (node.textContent ?? "").length);
  } else {
    const parent = node.parentNode ?? root;
    const index = Array.from(parent.childNodes).indexOf(node as ChildNode);
    range.setStart(parent, index + 1);
  }
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
}

function findAdjacentImageAtom(range: Range, direction: "before" | "after"): HTMLElement | null {
  const { startContainer, startOffset } = range;

  if (startContainer.nodeType === Node.TEXT_NODE) {
    const textNode = startContainer as Text;
    const text = textNode.textContent ?? "";
    if (direction === "before") {
      if (startOffset === 0 && isImageAtom(textNode.previousSibling)) {
        return textNode.previousSibling;
      }
      if (
        startOffset <= 1 &&
        text.split(EDITOR_ZWSP).join("").length === 0 &&
        isImageAtom(textNode.previousSibling)
      ) {
        return textNode.previousSibling;
      }
    } else if (startOffset >= text.length && isImageAtom(textNode.nextSibling)) {
      return textNode.nextSibling;
    }
    return null;
  }

  if (startContainer.nodeType !== Node.ELEMENT_NODE) {
    return null;
  }

  const element = startContainer as HTMLElement;
  if (direction === "before" && startOffset > 0) {
    const candidate = element.childNodes[startOffset - 1];
    if (isImageAtom(candidate)) {
      return candidate;
    }
    if (candidate?.nodeType === Node.TEXT_NODE) {
      const t = candidate.textContent ?? "";
      if (t.split(EDITOR_ZWSP).join("").length === 0 && startOffset > 1) {
        const before = element.childNodes[startOffset - 2];
        if (isImageAtom(before)) {
          return before;
        }
      }
    }
  }

  if (direction === "after" && startOffset < element.childNodes.length) {
    const candidate = element.childNodes[startOffset];
    if (isImageAtom(candidate)) {
      return candidate;
    }
  }

  return null;
}

export function deleteAdjacentImageAtom(
  root: HTMLElement,
  range: Range,
  key: "Backspace" | "Delete",
): boolean {
  if (!range.collapsed) {
    return false;
  }
  const atom = findAdjacentImageAtom(range, key === "Backspace" ? "before" : "after");
  if (!atom || atom.parentElement !== root) {
    return false;
  }
  removeZwspNeighbors(atom);
  const before = atom.previousSibling;
  atom.remove();
  placeCaretAfter(before, root);
  return true;
}

export function insertImageAtCaret(
  root: HTMLElement,
  imageId: string,
  src: string | null,
): void {
  const atom = createImageAtom(imageId, src);
  const zwsp = document.createTextNode(EDITOR_ZWSP);
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || !root.contains(sel.anchorNode)) {
    root.appendChild(atom);
    root.appendChild(zwsp);
    placeCaretAfter(zwsp, root);
    return;
  }

  const range = sel.getRangeAt(0);
  range.deleteContents();
  range.insertNode(zwsp);
  range.insertNode(atom);
  placeCaretAfter(zwsp, root);
}
