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

## 发版

版本源是 **Git tag**（`vMAJOR.MINOR.PATCH`）。[GitVersion](https://gitversion.net/)（`GitVersion.yml`，GitHub Flow）根据 tag 和 Conventional Commits 计算**建议的下一版**；真正上架的版本以 tag 为准。

三个清单必须同号，由脚本写入：`package.json`、`src-tauri/Cargo.toml`、`src-tauri/tauri.conf.json`。

### 推荐：本地打 tag 并推送

```powershell
# 预览下一版（不写文件、不打 tag）
.\scripts\release.ps1 -DryRun

# 按 GitVersion / 最新 tag 自动升一档，只打本地 tag
.\scripts\release.ps1

# 明确升 patch / minor / major，并推送（推 tag 即发 GitHub Release）
.\scripts\release.ps1 -Bump patch -Push
```

等价手打：

```powershell
git tag -a v0.1.0 -m "Release v0.1.0"
git push origin v0.1.0
```

推送匹配 `v*.*.*` 的 tag 后，`.github/workflows/release.yml` 会：

1. 用 tag 回写三个版本号
2. 跑测试
3. 打 Windows NSIS 包
4. 创建并发布 GitHub Release（预发布号如 `v0.2.0-beta.1` 会标成 prerelease）

重打已有 tag 的包：GitHub → Actions → Release → Run workflow，填 `v0.1.0`。
