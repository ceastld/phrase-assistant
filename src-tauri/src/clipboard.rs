use base64::{engine::general_purpose::STANDARD, Engine as _};

use crate::images;
use crate::model::{summary_from_segments, Phrase};
use std::path::Path;

pub fn html_escape(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    for ch in input.chars() {
        match ch {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            _ => out.push(ch),
        }
    }
    out
}

pub fn build_plain_text(phrase: &Phrase) -> String {
    summary_from_segments(&phrase.segments)
}

pub fn build_html_fragment(data_root: &Path, phrase: &Phrase) -> Result<String, String> {
    let mut html = String::from("<div>");
    for segment in &phrase.segments {
        if segment.kind == "image" {
            let Some(image_id) = segment.image_id.as_deref() else {
                continue;
            };
            let bytes = images::read_image_bytes(data_root, image_id)?;
            let mime = images::mime_for_image_id(image_id);
            let encoded = STANDARD.encode(bytes);
            html.push_str(&format!(
                r#"<img src="data:{mime};base64,{encoded}" alt="" />"#
            ));
        } else {
            let text = segment.text.as_deref().unwrap_or("");
            let escaped = html_escape(text).replace('\n', "<br />");
            html.push_str(&escaped);
        }
    }
    html.push_str("</div>");
    Ok(html)
}

pub fn copy_phrase(data_root: &Path, phrase: &Phrase) -> Result<(), String> {
    let text = build_plain_text(phrase);
    let html = build_html_fragment(data_root, phrase)?;
    let mut clipboard = arboard::Clipboard::new().map_err(|e| e.to_string())?;
    clipboard
        .set_html(&html, Some(&text))
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::images::save_image;
    use crate::model::{Phrase, PhraseSegment};
    use tempfile::tempdir;

    const PNG_1X1: &[u8] = &[
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44,
        0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1F,
        0x15, 0xC4, 0x89, 0x00, 0x00, 0x00, 0x0A, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9C, 0x63, 0x00,
        0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00, 0x00, 0x00, 0x00, 0x49,
        0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82,
    ];

    #[test]
    fn html_contains_escaped_text_and_data_uri() {
        let dir = tempdir().unwrap();
        let image_id = save_image(dir.path(), PNG_1X1, Some("png")).unwrap();
        let phrase = Phrase {
            id: "1".to_string(),
            title: "t".to_string(),
            group_name: "默认".to_string(),
            segments: vec![
                PhraseSegment {
                    kind: "text".to_string(),
                    text: Some("A<B".to_string()),
                    image_id: None,
                    image_path: None,
                },
                PhraseSegment {
                    kind: "image".to_string(),
                    text: None,
                    image_id: Some(image_id),
                    image_path: None,
                },
            ],
            summary: String::new(),
            pinned: false,
            sort_order: 0,
            created_at: 0,
            updated_at: 0,
        };
        let html = build_html_fragment(dir.path(), &phrase).unwrap();
        assert!(html.contains("A&lt;B"));
        assert!(html.contains("data:image/png;base64,"));
        assert_eq!(build_plain_text(&phrase), "A<B[图片]");
    }
}
