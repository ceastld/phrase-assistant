use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PhraseSegment {
    pub kind: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub image_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub image_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Phrase {
    pub id: String,
    pub title: String,
    pub group_name: String,
    pub segments: Vec<PhraseSegment>,
    pub summary: String,
    pub pinned: bool,
    pub sort_order: i64,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertPhraseInput {
    pub id: Option<String>,
    pub title: String,
    pub group_name: String,
    pub segments: Vec<PhraseSegment>,
    #[serde(default)]
    pub pinned: bool,
}

pub fn normalize_segments(segments: &[PhraseSegment]) -> Vec<PhraseSegment> {
    let mut out: Vec<PhraseSegment> = Vec::new();
    for segment in segments {
        match segment.kind.as_str() {
            "image" => {
                let image_id = segment
                    .image_id
                    .as_deref()
                    .unwrap_or("")
                    .trim()
                    .to_string();
                if image_id.is_empty() {
                    continue;
                }
                out.push(PhraseSegment {
                    kind: "image".to_string(),
                    text: None,
                    image_id: Some(image_id),
                    image_path: None,
                });
            }
            _ => {
                let text = segment.text.clone().unwrap_or_default();
                if text.is_empty() && !out.is_empty() {
                    continue;
                }
                if let Some(last) = out.last_mut() {
                    if last.kind == "text" {
                        last.text = Some(format!("{}{}", last.text.clone().unwrap_or_default(), text));
                        continue;
                    }
                }
                if !text.is_empty() {
                    out.push(PhraseSegment {
                        kind: "text".to_string(),
                        text: Some(text),
                        image_id: None,
                        image_path: None,
                    });
                }
            }
        }
    }
    out
}

pub fn summary_from_segments(segments: &[PhraseSegment]) -> String {
    segments
        .iter()
        .filter_map(|segment| match segment.kind.as_str() {
            "image" => Some("[图片]".to_string()),
            _ => {
                let text = segment.text.as_deref().unwrap_or("").trim();
                if text.is_empty() {
                    None
                } else {
                    Some(text.to_string())
                }
            }
        })
        .collect::<Vec<_>>()
        .join("")
}

pub fn collect_image_ids(segments: &[PhraseSegment]) -> Vec<String> {
    segments
        .iter()
        .filter(|segment| segment.kind == "image")
        .filter_map(|segment| segment.image_id.clone())
        .filter(|id| !id.trim().is_empty())
        .collect()
}

pub fn default_title(title: &str, segments: &[PhraseSegment]) -> String {
    let trimmed = title.trim();
    if !trimmed.is_empty() {
        return trimmed.to_string();
    }
    let summary = summary_from_segments(segments);
    let first_line = summary.lines().next().unwrap_or("").trim();
    if first_line.is_empty() {
        "未命名常用语".to_string()
    } else {
        first_line.chars().take(32).collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn text(value: &str) -> PhraseSegment {
        PhraseSegment {
            kind: "text".to_string(),
            text: Some(value.to_string()),
            image_id: None,
            image_path: None,
        }
    }

    fn image(id: &str) -> PhraseSegment {
        PhraseSegment {
            kind: "image".to_string(),
            text: None,
            image_id: Some(id.to_string()),
            image_path: None,
        }
    }

    #[test]
    fn summary_mixes_text_and_image_tokens() {
        let segments = vec![text("你好"), image("a.png"), text("世界")];
        assert_eq!(summary_from_segments(&segments), "你好[图片]世界");
    }

    #[test]
    fn normalize_merges_adjacent_text() {
        let segments = vec![text("foo"), text("bar"), image("a.png")];
        let normalized = normalize_segments(&segments);
        assert_eq!(normalized.len(), 2);
        assert_eq!(normalized[0].text.as_deref(), Some("foobar"));
        assert_eq!(normalized[1].image_id.as_deref(), Some("a.png"));
    }

    #[test]
    fn default_title_falls_back_to_first_text() {
        let segments = vec![text("第一行\n第二行"), image("a.png")];
        assert_eq!(default_title("  ", &segments), "第一行");
    }
}
