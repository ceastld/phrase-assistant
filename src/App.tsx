import { useCallback, useEffect, useMemo, useState, type ReactElement } from "react";
import { copyPhrase, deletePhrase, listGroups, listPhrases, upsertPhrase } from "./api";
import { EditorPane } from "./components/EditorPane";
import { PhraseList } from "./components/PhraseList";
import { segmentsEqual } from "./lib/segments";
import {
  draftFromPhrase,
  emptyDraft,
  type Phrase,
  type PhraseDraft,
} from "./types";
import "./App.css";

const ALL_GROUP = "全部";

function isDirty(draft: PhraseDraft, original: Phrase | null): boolean {
  if (!original) {
    return (
      draft.title.trim().length > 0 ||
      draft.segments.length > 0 ||
      draft.groupName !== "默认" ||
      draft.pinned
    );
  }
  return (
    draft.title !== original.title ||
    draft.groupName !== original.groupName ||
    draft.pinned !== original.pinned ||
    !segmentsEqual(draft.segments, original.segments)
  );
}

export default function App(): ReactElement {
  const [phrases, setPhrases] = useState<Phrase[]>([]);
  const [groups, setGroups] = useState<string[]>(["默认"]);
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState(ALL_GROUP);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<PhraseDraft>(emptyDraft());
  const [status, setStatus] = useState("就绪");
  const [busy, setBusy] = useState(false);

  const original = useMemo(
    () => phrases.find((item) => item.id === draft.id) ?? null,
    [draft.id, phrases],
  );
  const dirty = isDirty(draft, original);

  const refresh = useCallback(
    async (keepId?: string | null) => {
      const [nextPhrases, nextGroups] = await Promise.all([
        listPhrases(query || undefined, group === ALL_GROUP ? undefined : group),
        listGroups(),
      ]);
      setPhrases(nextPhrases);
      setGroups(nextGroups);
      const nextId = keepId ?? selectedId ?? nextPhrases[0]?.id ?? null;
      if (nextId) {
        const found = nextPhrases.find((item) => item.id === nextId) ?? nextPhrases[0] ?? null;
        if (found) {
          setSelectedId(found.id);
          setDraft(draftFromPhrase(found));
          return;
        }
      }
      setSelectedId(null);
      setDraft(emptyDraft(group === ALL_GROUP ? "默认" : group));
    },
    [group, query, selectedId],
  );

  useEffect(() => {
    void refresh().catch((error: unknown) => {
      setStatus(error instanceof Error ? error.message : String(error));
    });
  }, [group, query]);

  const confirmIfDirty = useCallback((): boolean => {
    if (!dirty) {
      return true;
    }
    return window.confirm("当前常用语尚未保存，确定丢弃修改？");
  }, [dirty]);

  const handleSelect = useCallback(
    (id: string) => {
      if (id === selectedId) {
        return;
      }
      if (!confirmIfDirty()) {
        return;
      }
      const found = phrases.find((item) => item.id === id);
      if (!found) {
        return;
      }
      setSelectedId(id);
      setDraft(draftFromPhrase(found));
    },
    [confirmIfDirty, phrases, selectedId],
  );

  const handleNew = useCallback(() => {
    if (!confirmIfDirty()) {
      return;
    }
    setSelectedId(null);
    setDraft(emptyDraft(group === ALL_GROUP ? "默认" : group));
    setStatus("已新建草稿");
  }, [confirmIfDirty, group]);

  const handleSave = useCallback(async () => {
    setBusy(true);
    try {
      const saved = await upsertPhrase({
        id: draft.id,
        title: draft.title,
        groupName: draft.groupName,
        segments: draft.segments,
        pinned: draft.pinned,
      });
      setStatus("已保存");
      await refresh(saved.id);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }, [draft, refresh]);

  const handleCopy = useCallback(async () => {
    if (!draft.id) {
      return;
    }
    try {
      await copyPhrase(draft.id);
      setStatus("已复制到剪贴板");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }, [draft.id]);

  const handleDelete = useCallback(async () => {
    if (!draft.id) {
      return;
    }
    if (!window.confirm("确定删除这条常用语？")) {
      return;
    }
    setBusy(true);
    try {
      await deletePhrase(draft.id);
      setStatus("已删除");
      await refresh(null);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }, [draft.id, refresh]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (dirty && !busy) {
          void handleSave();
        }
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "n") {
        event.preventDefault();
        handleNew();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, dirty, handleNew, handleSave]);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <h1>常用语助手</h1>
          <p>文本 + 图片混排</p>
        </div>
        <input
          className="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索标题或正文"
        />
        <select className="group-select" value={group} onChange={(event) => setGroup(event.target.value)}>
          <option value={ALL_GROUP}>{ALL_GROUP}</option>
          {groups.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <PhraseList phrases={phrases} selectedId={selectedId} onSelect={handleSelect} />
      </aside>
      <EditorPane
        draft={draft}
        groups={groups}
        dirty={dirty}
        onChange={setDraft}
        onSave={() => {
          void handleSave();
        }}
        onCopy={() => {
          void handleCopy();
        }}
        onDelete={() => {
          void handleDelete();
        }}
        onNew={handleNew}
      />
      <footer className="status-bar">
        <span>{busy ? "处理中…" : status}</span>
        <span>{dirty ? "未保存" : "已同步"}</span>
      </footer>
    </div>
  );
}
