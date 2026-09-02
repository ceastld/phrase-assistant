import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { cachedImagePath, rememberImagePath, rememberPhraseImages } from "./lib/imageCache";
import type { Phrase, PhraseSegment, UpsertPhraseInput } from "./types";

export function toAssetUrl(filePath: string): string {
  return convertFileSrc(filePath);
}

export function hydrateSegment(segment: PhraseSegment): PhraseSegment {
  if (segment.kind !== "image") {
    return segment;
  }
  const imageId = (segment.imageId ?? "").trim();
  const imagePath = (segment.imagePath ?? cachedImagePath(imageId) ?? "").trim();
  if (imageId && imagePath) {
    rememberImagePath(imageId, imagePath);
  }
  return { ...segment, imageId, imagePath: imagePath || null };
}

export function hydrateSegments(segments: PhraseSegment[]): PhraseSegment[] {
  return segments.map(hydrateSegment);
}

export function segmentImageSrc(segment: PhraseSegment): string | null {
  const hydrated = hydrateSegment(segment);
  const path = (hydrated.imagePath ?? "").trim();
  if (!path) {
    return null;
  }
  return toAssetUrl(path);
}

export async function listPhrases(query?: string, groupName?: string): Promise<Phrase[]> {
  const phrases = await invoke<Phrase[]>("list_phrases", {
    query: query ?? null,
    groupName: groupName ?? null,
  });
  for (const phrase of phrases) {
    rememberPhraseImages(phrase.segments);
  }
  return phrases;
}

export async function getPhrase(id: string): Promise<Phrase> {
  return invoke<Phrase>("get_phrase", { id });
}

export async function listGroups(): Promise<string[]> {
  return invoke<string[]>("list_groups");
}

export async function upsertPhrase(input: UpsertPhraseInput): Promise<Phrase> {
  return invoke<Phrase>("upsert_phrase", { input });
}

export async function deletePhrase(id: string): Promise<void> {
  await invoke("delete_phrase", { id });
}

export async function saveImage(bytes: Uint8Array, ext?: string): Promise<string> {
  return invoke<string>("save_image", { bytes: Array.from(bytes), ext: ext ?? null });
}

export async function resolveImagePath(imageId: string): Promise<string> {
  return invoke<string>("resolve_image_path", { imageId });
}

export async function copyPhrase(id: string): Promise<void> {
  await invoke("copy_phrase", { id });
}

export async function persistImageFile(file: File): Promise<PhraseSegment> {
  const buffer = new Uint8Array(await file.arrayBuffer());
  const ext = file.name.split(".").pop() ?? file.type.split("/")[1];
  const imageId = await saveImage(buffer, ext);
  const imagePath = await resolveImagePath(imageId);
  rememberImagePath(imageId, imagePath);
  return { kind: "image", imageId, imagePath };
}
