const pathById = new Map<string, string>();

export function rememberImagePath(imageId: string, imagePath: string): void {
  const id = imageId.trim();
  const path = imagePath.trim();
  if (id && path) {
    pathById.set(id, path);
  }
}

export function cachedImagePath(imageId: string): string | null {
  return pathById.get(imageId.trim()) ?? null;
}

export function rememberPhraseImages(
  segments: ReadonlyArray<{ imageId?: string | null; imagePath?: string | null }>,
): void {
  for (const segment of segments) {
    if (segment.imageId && segment.imagePath) {
      rememberImagePath(segment.imageId, segment.imagePath);
    }
  }
}
