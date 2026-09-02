import type { PhraseSegment } from "../types";
import { EDITOR_IMAGE_MAX_HEIGHT_PX, serializeSegments } from "./segments";

export const EDITOR_ZWSP = "\u200B";
const SEGMENT_ATTR = "data-phrase-segment";
const IMAGE_ID_ATTR = "data-image-id";
export const CARET_ANCHOR_ATTR = "data-caret-anchor";

export type ImageSrcResolver = (segment: PhraseSegment) => string | null;

export type ImageDisplaySize = {
  width: number;
  height: number;
};

function isImageAtom(node: Node | null): node is HTMLElement {
  return node instanceof HTMLElement && node.dataset.phraseSegment === "image";
}

function isCaretAnchor(node: Node | null): boolean {
  return node instanceof HTMLElement && node.dataset.caretAnchor === "1";
}

function closestCaretAnchor(node: Node | null): HTMLElement | null {
  const element = node instanceof Element ? node : node?.parentElement;
  return element?.closest(`[${CARET_ANCHOR_ATTR}]`) ?? null;
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

export function createCaretAnchor(): HTMLElement {
  const anchor = document.createElement("span");
  anchor.className = "mixed-caret-anchor";
  anchor.setAttribute(CARET_ANCHOR_ATTR, "1");
  anchor.appendChild(document.createTextNode(EDITOR_ZWSP));
  return anchor;
}

export function placeCaretInAnchor(anchor: HTMLElement): void {
  const sel = window.getSelection();
  if (!sel) {
    return;
  }
  const text = anchor.firstChild;
  const range = document.createRange();
  if (text?.nodeType === Node.TEXT_NODE) {
    range.setStart(text, (text.textContent ?? "").length);
  } else {
    range.setStart(anchor, anchor.childNodes.length);
  }
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
}

export function createImageAtom(
  imageId: string,
  src: string | null,
  size?: ImageDisplaySize | null,
): HTMLElement {
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
    if (size && size.width > 0 && size.height > 0) {
      img.width = size.width;
      img.height = size.height;
    }
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
  root.appendChild(createCaretAnchor());
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
    if (isCaretAnchor(element)) {
      return;
    }
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

function removeNeighborAnchors(atom: HTMLElement): void {
  const next = atom.nextSibling;
  if (next && isCaretAnchor(next)) {
    next.remove();
  }
  const prev = atom.previousSibling;
  if (prev && isCaretAnchor(prev) && (prev.textContent ?? "").split(EDITOR_ZWSP).join("").length === 0) {
    prev.remove();
  }
}

function placeCaretAfter(node: Node | null, root: HTMLElement): void {
  if (node instanceof HTMLElement && isCaretAnchor(node)) {
    placeCaretInAnchor(node);
    return;
  }
  if (node && isImageAtom(node) && node.nextSibling instanceof HTMLElement && isCaretAnchor(node.nextSibling)) {
    placeCaretInAnchor(node.nextSibling);
    return;
  }
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
  const anchor = closestCaretAnchor(range.startContainer);
  if (anchor && anchor.parentElement) {
    if (direction === "before" && isImageAtom(anchor.previousSibling)) {
      return anchor.previousSibling;
    }
    if (direction === "after" && isImageAtom(anchor.nextSibling)) {
      return anchor.nextSibling;
    }
  }

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
    if (isCaretAnchor(candidate) && isImageAtom(candidate.previousSibling)) {
      return candidate.previousSibling;
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
  removeNeighborAnchors(atom);
  const before = atom.previousSibling;
  atom.remove();
  placeCaretAfter(before, root);
  return true;
}

export function insertImageAtCaret(
  root: HTMLElement,
  imageId: string,
  src: string | null,
  size?: ImageDisplaySize | null,
): { atom: HTMLElement; anchor: HTMLElement } {
  const atom = createImageAtom(imageId, src, size);
  const anchor = createCaretAnchor();
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || !root.contains(sel.anchorNode)) {
    root.appendChild(atom);
    root.appendChild(anchor);
    placeCaretInAnchor(anchor);
    return { atom, anchor };
  }

  const range = sel.getRangeAt(0);
  const existingAnchor = closestCaretAnchor(range.startContainer);
  range.deleteContents();
  if (existingAnchor && existingAnchor.parentElement === root) {
    existingAnchor.after(atom, anchor);
  } else {
    range.insertNode(anchor);
    range.insertNode(atom);
  }
  placeCaretInAnchor(anchor);
  return { atom, anchor };
}

function fitDisplaySize(naturalWidth: number, naturalHeight: number): ImageDisplaySize | null {
  if (naturalWidth <= 0 || naturalHeight <= 0) {
    return null;
  }
  const height = Math.min(naturalHeight, EDITOR_IMAGE_MAX_HEIGHT_PX);
  const width = Math.max(1, Math.round(naturalWidth * (height / naturalHeight)));
  return { width, height };
}

export async function measureImageDisplaySize(file: File): Promise<ImageDisplaySize | null> {
  try {
    if (typeof createImageBitmap === "function") {
      const bitmap = await createImageBitmap(file);
      const size = fitDisplaySize(bitmap.width, bitmap.height);
      bitmap.close();
      if (size) {
        return size;
      }
    }
  } catch {
    // Fall through to HTMLImageElement.
  }

  return await new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(fitDisplaySize(image.naturalWidth, image.naturalHeight));
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    image.src = url;
  });
}

export async function waitForImageLayout(atom: HTMLElement): Promise<void> {
  const img = atom.querySelector("img");
  if (!img) {
    return;
  }
  if (img.complete && img.naturalHeight > 0) {
    return;
  }
  try {
    await img.decode();
  } catch {
    await new Promise<void>((resolve) => {
      img.addEventListener("load", () => resolve(), { once: true });
      img.addEventListener("error", () => resolve(), { once: true });
    });
  }
}

export async function insertImageFileAtCaret(
  root: HTMLElement,
  file: File,
  persist: (next: File) => Promise<PhraseSegment>,
  resolveSrc: ImageSrcResolver,
): Promise<void> {
  const size = await measureImageDisplaySize(file);
  const segment = await persist(file);
  const { atom, anchor } = insertImageAtCaret(root, segment.imageId ?? "", resolveSrc(segment), size);
  await waitForImageLayout(atom);
  placeCaretInAnchor(anchor);
}
