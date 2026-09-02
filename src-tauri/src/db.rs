use std::collections::HashSet;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::{params, Connection, OptionalExtension};
use uuid::Uuid;

use crate::model::{
    collect_image_ids, default_title, normalize_segments, summary_from_segments, Phrase,
    PhraseSegment, UpsertPhraseInput,
};
use crate::paths;

pub fn open(db_path: &Path) -> Result<Connection, String> {
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;
    conn.execute_batch("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;")
        .map_err(|e| e.to_string())?;
    Ok(conn)
}

pub fn migrate(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS phrases (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL DEFAULT '',
            group_name TEXT NOT NULL DEFAULT '默认',
            segments_json TEXT NOT NULL,
            summary TEXT NOT NULL DEFAULT '',
            pinned INTEGER NOT NULL DEFAULT 0,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_phrases_group ON phrases(group_name);
        CREATE INDEX IF NOT EXISTS idx_phrases_updated ON phrases(updated_at DESC);
        ",
    )
    .map_err(|e| e.to_string())
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn parse_segments_json(json: &str) -> Result<Vec<PhraseSegment>, String> {
    serde_json::from_str(json).map_err(|e| e.to_string())
}

fn with_image_paths(data_root: &Path, mut segments: Vec<PhraseSegment>) -> Vec<PhraseSegment> {
    for segment in &mut segments {
        if segment.kind == "image" {
            if let Some(image_id) = segment.image_id.as_deref() {
                if let Ok(path) = paths::image_file_path(data_root, image_id) {
                    segment.image_path = Some(path.to_string_lossy().into_owned());
                }
            }
        }
    }
    segments
}

fn row_to_phrase(data_root: &Path, row: &rusqlite::Row<'_>) -> Result<Phrase, rusqlite::Error> {
    let segments_json: String = row.get("segments_json")?;
    let segments = parse_segments_json(&segments_json).unwrap_or_default();
    Ok(Phrase {
        id: row.get("id")?,
        title: row.get("title")?,
        group_name: row.get("group_name")?,
        segments: with_image_paths(data_root, segments),
        summary: row.get("summary")?,
        pinned: row.get::<_, i64>("pinned")? != 0,
        sort_order: row.get("sort_order")?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
    })
}

pub fn seed_if_empty(conn: &Connection) -> Result<(), String> {
    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM phrases", [], |row| row.get(0))
        .map_err(|e| e.to_string())?;
    if count > 0 {
        return Ok(());
    }

    let segments = vec![PhraseSegment {
        kind: "text".to_string(),
        text: Some(
            "在右侧编辑常用语。可以直接输入文字，也可以粘贴或插入图片，文本和图片会混排保存。"
                .to_string(),
        ),
        image_id: None,
        image_path: None,
    }];
    let input = UpsertPhraseInput {
        id: None,
        title: "欢迎使用".to_string(),
        group_name: "默认".to_string(),
        segments,
        pinned: true,
    };
    upsert_phrase(conn, &input)?;
    Ok(())
}

pub fn list_phrases(
    conn: &Connection,
    data_root: &Path,
    query: Option<&str>,
    group_name: Option<&str>,
) -> Result<Vec<Phrase>, String> {
    let mut sql = String::from(
        "SELECT id, title, group_name, segments_json, summary, pinned, sort_order, created_at, updated_at
         FROM phrases WHERE 1=1",
    );
    let mut binds: Vec<String> = Vec::new();

    if let Some(group) = group_name {
        if group != "全部" && !group.is_empty() {
            sql.push_str(" AND group_name = ?");
            binds.push(group.to_string());
        }
    }
    if let Some(q) = query {
        let trimmed = q.trim();
        if !trimmed.is_empty() {
            sql.push_str(" AND (title LIKE ? OR summary LIKE ? OR segments_json LIKE ?)");
            let like = format!("%{trimmed}%");
            binds.push(like.clone());
            binds.push(like.clone());
            binds.push(like);
        }
    }
    sql.push_str(" ORDER BY pinned DESC, sort_order ASC, updated_at DESC");

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(rusqlite::params_from_iter(binds.iter()), |row| {
            row_to_phrase(data_root, row)
        })
        .map_err(|e| e.to_string())?;

    let mut items = Vec::new();
    for row in rows {
        items.push(row.map_err(|e| e.to_string())?);
    }
    Ok(items)
}

pub fn get_phrase(conn: &Connection, data_root: &Path, id: &str) -> Result<Phrase, String> {
    conn.query_row(
        "SELECT id, title, group_name, segments_json, summary, pinned, sort_order, created_at, updated_at
         FROM phrases WHERE id = ?",
        [id],
        |row| row_to_phrase(data_root, row),
    )
    .optional()
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "phrase not found".to_string())
}

pub fn list_groups(conn: &Connection) -> Result<Vec<String>, String> {
    let mut stmt = conn
        .prepare("SELECT DISTINCT group_name FROM phrases ORDER BY group_name COLLATE NOCASE")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|e| e.to_string())?;
    let mut groups = Vec::new();
    for row in rows {
        groups.push(row.map_err(|e| e.to_string())?);
    }
    if !groups.iter().any(|g| g == "默认") {
        groups.insert(0, "默认".to_string());
    }
    Ok(groups)
}

pub fn upsert_phrase(conn: &Connection, input: &UpsertPhraseInput) -> Result<String, String> {
    let segments = normalize_segments(&input.segments);
    let summary = summary_from_segments(&segments);
    let title = default_title(&input.title, &segments);
    let group_name = if input.group_name.trim().is_empty() {
        "默认".to_string()
    } else {
        input.group_name.trim().to_string()
    };
    let segments_json = serde_json::to_string(&segments).map_err(|e| e.to_string())?;
    let now = now_ms();
    let pinned = if input.pinned { 1 } else { 0 };

    if let Some(id) = input.id.as_deref() {
        let exists: Option<i64> = conn
            .query_row("SELECT 1 FROM phrases WHERE id = ?", [id], |row| row.get(0))
            .optional()
            .map_err(|e| e.to_string())?;
        if exists.is_some() {
            conn.execute(
                "UPDATE phrases
                 SET title = ?, group_name = ?, segments_json = ?, summary = ?, pinned = ?, updated_at = ?
                 WHERE id = ?",
                params![title, group_name, segments_json, summary, pinned, now, id],
            )
            .map_err(|e| e.to_string())?;
            return Ok(id.to_string());
        }
        conn.execute(
            "INSERT INTO phrases (id, title, group_name, segments_json, summary, pinned, sort_order, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)",
            params![id, title, group_name, segments_json, summary, pinned, now, now],
        )
        .map_err(|e| e.to_string())?;
        return Ok(id.to_string());
    }

    let id = Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO phrases (id, title, group_name, segments_json, summary, pinned, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)",
        params![id, title, group_name, segments_json, summary, pinned, now, now],
    )
    .map_err(|e| e.to_string())?;
    Ok(id)
}

pub fn delete_phrase(conn: &Connection, id: &str) -> Result<Vec<String>, String> {
    let json: Option<String> = conn
        .query_row(
            "SELECT segments_json FROM phrases WHERE id = ?",
            [id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    let Some(json) = json else {
        return Err("phrase not found".to_string());
    };
    let segments = parse_segments_json(&json)?;
    conn.execute("DELETE FROM phrases WHERE id = ?", [id])
        .map_err(|e| e.to_string())?;
    Ok(collect_image_ids(&segments))
}

pub fn referenced_image_ids(conn: &Connection) -> Result<HashSet<String>, String> {
    let mut stmt = conn
        .prepare("SELECT segments_json FROM phrases")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|e| e.to_string())?;
    let mut ids = HashSet::new();
    for row in rows {
        let json = row.map_err(|e| e.to_string())?;
        if let Ok(segments) = parse_segments_json(&json) {
            for image_id in collect_image_ids(&segments) {
                ids.insert(image_id);
            }
        }
    }
    Ok(ids)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    fn setup() -> (tempfile::TempDir, Connection) {
        let dir = tempdir().expect("temp dir");
        let conn = open(&dir.path().join("data.db")).expect("open db");
        migrate(&conn).expect("migrate");
        (dir, conn)
    }

    #[test]
    fn crud_roundtrip_and_search() {
        let (dir, conn) = setup();
        let id = upsert_phrase(
            &conn,
            &UpsertPhraseInput {
                id: None,
                title: "问候".to_string(),
                group_name: "工作".to_string(),
                segments: vec![PhraseSegment {
                    kind: "text".to_string(),
                    text: Some("你好，请查收附件。".to_string()),
                    image_id: None,
                    image_path: None,
                }],
                pinned: false,
            },
        )
        .unwrap();

        let loaded = get_phrase(&conn, dir.path(), &id).unwrap();
        assert_eq!(loaded.title, "问候");
        assert_eq!(loaded.group_name, "工作");
        assert_eq!(loaded.summary, "你好，请查收附件。");

        let found = list_phrases(&conn, dir.path(), Some("附件"), Some("工作")).unwrap();
        assert_eq!(found.len(), 1);

        delete_phrase(&conn, &id).unwrap();
        assert!(get_phrase(&conn, dir.path(), &id).is_err());
    }

    #[test]
    fn referenced_ids_follow_database_json() {
        let (_dir, conn) = setup();
        upsert_phrase(
            &conn,
            &UpsertPhraseInput {
                id: None,
                title: "图".to_string(),
                group_name: "默认".to_string(),
                segments: vec![PhraseSegment {
                    kind: "image".to_string(),
                    text: None,
                    image_id: Some("abc.png".to_string()),
                    image_path: None,
                }],
                pinned: false,
            },
        )
        .unwrap();
        let ids = referenced_image_ids(&conn).unwrap();
        assert!(ids.contains("abc.png"));
    }
}
