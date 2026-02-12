# Today Board - H5 + PWA 黑板记录工具

**Build**: 2026.02.12

---

## 项目结构说明

### 核心文件

| 文件 | 说明 |
|------|------|
| `mobile.html` | 移动端主页面 |
| `app.js` | 核心逻辑（导出、编辑、存储等） |
| `styles-v2.css` | 主样式表（黑板主题、导出态、组件样式） |
| `styles-enhanced.css` | 增强样式（粉笔效果、按钮等） |
| `sw.js` | PWA Service Worker（离线支持） |
| `manifest.webmanifest` | PWA 配置 |

### 资源目录

| 目录 | 说明 |
|------|------|
| `assets/` | 背景图、UI 素材、PWA 图标等 |
| `fonts/` | 手写体字体（Kalam） |

### assets/ 说明

- **bg/** - 黑板背景图（含 `bg_blackboard_main.webp`，导出必用）
- **pwa/** - PWA 图标（192x192、512x512 等）

---

## 导出参数（已固化）

| 参数 | 值 | 说明 |
|------|-----|------|
| `EXPORT_WIDTH` | 1170 | 导出 PNG 基准宽度（px） |
| `EXPORT_SCALE` | 2 | 导出缩放倍率（高清） |

---

## 导出逻辑要点

- **onclone** 仅修改 clone DOM，不影响主页面
- 黑板背景通过 data URL 注入
- 主导出路径：`renderCardCanvasSimple()` → `html2canvas()` → 裁剪/导出

---

## 未来计划

- 微信小程序版本（规划中）
- 国内云部署版本（规划中）

---

## 文档与配置

| 文件 | 说明 |
|------|------|
| `README.md` | 项目说明 |
| `EXPORT_BACKGROUND_LOCATION_REPORT.md` | 导出背景报告（可选查阅） |
| `.gitignore` | Git 忽略规则 |
