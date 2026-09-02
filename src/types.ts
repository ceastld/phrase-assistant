export type SegmentKind = "text" | "image";

export interface PhraseSegment {
  kind: SegmentKind;
  text?: string | null;
  imageId?: string | null;
  imagePath?: string | null;
}

export interface Phrase {
  id: string;
  title: string;
  groupName: string;
  segments: PhraseSegment[];
  summary: string;
  pinned: boolean;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
}

export interface UpsertPhraseInput {
  id?: string | null;
  title: string;
  groupName: string;
  segments: PhraseSegment[];
  pinned: boolean;
}

export interface PhraseDraft {
  id: string | null;
  title: string;
  groupName: string;
  segments: PhraseSegment[];
  pinned: boolean;
}

export function emptyDraft(groupName = "默认"): PhraseDraft {
  return {
    id: null,
    title: "",
    groupName,
    segments: [],
    pinned: false,
  };
}

export function draftFromPhrase(phrase: Phrase): PhraseDraft {
  return {
    id: phrase.id,
    title: phrase.title,
    groupName: phrase.groupName,
    segments: phrase.segments.map((segment) => ({ ...segment })),
    pinned: phrase.pinned,
  };
}
