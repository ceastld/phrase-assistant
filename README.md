# 常用语助手

Windows 桌面常用语工具：每条常用语都是**文本 + 图片混排**。架构是 Tauri 2 + React TypeScript。

存储方式参考 [clip/main](https://github.com/) BetterClip：

- 结构存在 SQLite：`%LocalAppData%\PhraseAssistant\data.db`
- 图片落在临时目录：`%LocalAppData%\PhraseAssistant\Image\Temp\`
- 启动时清理库里已不再引用的临时图片

## 功能

- 新建 / 编辑 / 删除 / 搜索 / 分组 / 置顶
- 图文混排编辑：输入文字，粘贴、拖入或「插入图片」
- 复制整条常用语到系统剪贴板（纯文本 + HTML，图片用 data URI）

快捷键：`Ctrl+N` 新建，`Ctrl+S` 保存。

## 开发

需要 Node 22+ 与 Rust stable（Windows MSVC）。

```powershell
npm install
npm test
cd src-tauri
cargo test
cd ..
npm run tauri:dev
```

## 打包

本地打 Windows NSIS 安装包：

```powershell
.\scripts\build-windows.ps1
```

或：

```powershell
npm run tauri:build
```

产物在 `src-tauri/target/release/bundle/nsis/`。

打 tag `v*` 或手动触发 GitHub Actions 也会走同一套 NSIS 打包。
