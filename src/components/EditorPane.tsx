import { useRef, type ReactElement } from "react";
import type { PhraseDraft } from "../types";
import { MixedEditor } from "./MixedEditor";
import { hydrateSegments, persistImageFile, segmentImageSrc } from "../api";
import { insertImageAtCaret, parseEditorDom } from "../lib/editorDom";

interface EditorPaneProps {
  draft: PhraseDraft;
  groups: string[];
  dirty: boolean;
  onChange: (next: PhraseDraft) => void;
  onSave: () => void;
  onCopy: () => void;
  onDelete: () => void;
  onNew: () => void;
}

export function EditorPane({
  draft,
  groups,
  dirty,
  onChange,
  onSave,
  onCopy,
  onDelete,
  onNew,
}: EditorPaneProps): ReactElement {
  const fileRef = useRef<HTMLInputElement>(null);
  const surfaceHostRef = useRef<HTMLDivElement>(null);

  return (
    <section className="editor-pane" aria-label="常用语编辑">
      <header className="editor-toolbar">
        <button type="button" className="btn" onClick={onNew}>
          新建
        </button>
        <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
          插入图片
        </button>
        <button type="button" className="btn" onClick={onCopy} disabled={!draft.id}>
          复制
        </button>
        <button type="button" className="btn btn-primary" onClick={onSave} disabled={!dirty}>
          保存
        </button>
        <button type="button" className="btn btn-danger" onClick={onDelete} disabled={!draft.id}>
          删除
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp,image/bmp"
          multiple
          hidden
          onChange={async (event) => {
            const files = Array.from(event.target.files ?? []);
            event.target.value = "";
            const host = surfaceHostRef.current?.querySelector<HTMLElement>(".mixed-editor-surface");
            if (!host) {
              return;
            }
            for (const file of files) {
              const segment = await persistImageFile(file);
              insertImageAtCaret(host, segment.imageId ?? "", segmentImageSrc(segment));
            }
            onChange({ ...draft, segments: hydrateSegments(parseEditorDom(host)) });
          }}
        />
      </header>

      <div className="editor-meta">
        <label>
          标题
          <input
            value={draft.title}
            onChange={(event) => onChange({ ...draft, title: event.target.value })}
            placeholder="留空则用正文首行"
          />
        </label>
        <label>
          分组
          <input
            list="phrase-groups"
            value={draft.groupName}
            onChange={(event) => onChange({ ...draft, groupName: event.target.value })}
          />
          <datalist id="phrase-groups">
            {groups.map((group) => (
              <option key={group} value={group} />
            ))}
          </datalist>
        </label>
        <label className="pin-check">
          <input
            type="checkbox"
            checked={draft.pinned}
            onChange={(event) => onChange({ ...draft, pinned: event.target.checked })}
          />
          置顶
        </label>
      </div>

      <div ref={surfaceHostRef} className="editor-body">
        <MixedEditor
          segments={draft.segments}
          onChange={(segments) => onChange({ ...draft, segments })}
        />
      </div>
    </section>
  );
}
