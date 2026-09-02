import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { copyPhrase, deletePhrase, listGroups, listPhrases, upsertPhrase } from "./api";
import { ConfirmDialog } from "./components/ConfirmDialog";
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
const AUTOSAVE_MS = 700;

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

function mergeSavedPhrase(list: Phrase[], saved: Phrase): Phrase[] {
  const index = list.findIndex((item) => item.id === saved.id);
  if (index < 0) {
    return [saved, ...list];
  }
  const next = [...list];
  next[index] = saved;
  return next;
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
  const [focusNonce, setFocusNonce] = useState(0);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const draftRef = useRef(draft);
  draftRef.current = draft;

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

  const persistDraft = useCallback(async (current: PhraseDraft): Promise<Phrase> => {
    const saved = await upsertPhrase({
      id: current.id,
      title: current.title,
      groupName: current.groupName,
      segments: current.segments,
      pinned: current.pinned,
    });
    setPhrases((prev) => mergeSavedPhrase(prev, saved));
    setGroups((prev) => (prev.includes(saved.groupName) ? prev : [...prev, saved.groupName]));
    setSelectedId(saved.id);
    setDraft((prev) => ({
      ...prev,
      id: saved.id,
      title: prev.title.trim() === "" ? saved.title : prev.title,
    }));
    return saved;
  }, []);

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

  const handleNew = useCallback(async () => {
    if (!confirmIfDirty()) {
      return;
    }
    setBusy(true);
    try {
      const created = await persistDraft({
        ...emptyDraft(group === ALL_GROUP ? "默认" : group),
        title: "",
      });
      setDraft(draftFromPhrase(created));
      setFocusNonce((value) => value + 1);
      setStatus("已新建，写入数据库，可以直接编辑");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }, [confirmIfDirty, group, persistDraft]);

  const handleSave = useCallback(async () => {
    setBusy(true);
    try {
      await persistDraft(draftRef.current);
      setStatus("已保存");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }, [persistDraft]);

  useEffect(() => {
    if (!dirty || busy) {
      return;
    }
    const timer = window.setTimeout(() => {
      void handleSave();
    }, AUTOSAVE_MS);
    return () => window.clearTimeout(timer);
  }, [busy, dirty, draft.groupName, draft.pinned, draft.segments, draft.title, handleSave]);

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

  const handleDeleteRequest = useCallback(() => {
    if (!draft.id || busy) {
      return;
    }
    setDeleteOpen(true);
  }, [busy, draft.id]);

  const handleDeleteConfirm = useCallback(async () => {
    if (!draft.id) {
      setDeleteOpen(false);
      return;
    }
    setDeleteOpen(false);
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
        void handleNew();
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
          <p>文本 + 图片混排，保存在本机数据库</p>
        </div>
        <button type="button" className="btn btn-primary sidebar-new" onClick={() => void handleNew()}>
          新建常用语
        </button>
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
        <PhraseList
          phrases={phrases}
          selectedId={selectedId}
          query={query}
          onSelect={handleSelect}
          onNew={() => void handleNew()}
        />
      </aside>
      <EditorPane
        draft={draft}
        groups={groups}
        dirty={dirty}
        focusNonce={focusNonce}
        onChange={setDraft}
        onSave={() => {
          void handleSave();
        }}
        onCopy={() => {
          void handleCopy();
        }}
        onDelete={handleDeleteRequest}
        onNew={() => {
          void handleNew();
        }}
      />
      <ConfirmDialog
        open={deleteOpen}
        title="删除常用语"
        message={`确定删除「${draft.title || "未命名常用语"}」？这条会从数据库里去掉，不可恢复。`}
        confirmLabel="删除"
        danger
        onConfirm={() => {
          void handleDeleteConfirm();
        }}
        onCancel={() => setDeleteOpen(false)}
      />
      <footer className="status-bar">
        <span>{busy ? "处理中…" : status}</span>
        <span>{dirty ? "未保存（将自动保存）" : "已写入数据库"}</span>
      </footer>
    </div>
  );
}
