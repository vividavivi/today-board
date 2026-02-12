# Today Board v1.0 - 最终发布文件结构说明

**版本**: v1.0  
**构建日期**: 2026-02-11

---

## 核心文件

| 文件 | 说明 |
|------|------|
| `index.html` | 桌面端入口页 |
| `mobile.html` | 移动端/主入口页 |
| `app.js` | 主应用逻辑（单文件整合，含导出、编辑、存储等） |
| `styles-v2.css` | 主样式表（黑板主题、导出态、组件样式） |
| `styles-enhanced.css` | 增强样式（粉笔效果、按钮等） |
| `sw.js` | Service Worker（PWA 离线支持） |
| `manifest.webmanifest` | PWA 清单 |

---

## 资源目录

### `assets/`
- **bg/** - 黑板背景图
  - `bg_blackboard_main.webp` - 主背景（导出必用）
  - `bg_blackboard_main_lite.webp` - 轻量版
- **ui/** - 图标、按钮等 UI 素材
- **logo/** - 品牌 Logo
- **pwa/** - PWA 图标（192x192, 512x512）

### `fonts/`
- Kalam 字体（Regular, Bold, Light）用于手写体

---

## 导出参数（已固化）

| 参数 | 值 | 说明 |
|------|-----|------|
| `EXPORT_WIDTH` | 1170 | 导出 PNG 基准宽度（px） |
| `EXPORT_BOTTOM_PADDING` | 20 | 底部最大留白 |
| `EXPORT_SCALE` | 2 | 导出缩放倍率（高清） |

---

## 导出逻辑要点

- **onclone** 仅修改 clone DOM，不影响主页面
- 黑板背景通过 data URL 注入，禁止纯色回退
- 封口线（底部粗虚线）由 footer 绘制，高度按 sealBottomCss 确定性计算
- 主导出路径：`renderCardCanvasSimple()` → `html2canvas()` → `cropCanvasByFooter()`

---

## 文档与配置

| 文件 | 说明 |
|------|------|
| `README.md` | 项目说明 |
| `GIT_SETUP.md` | Git 配置说明 |
| `EXPORT_BACKGROUND_LOCATION_REPORT.md` | 导出背景报告 |
| `.gitignore` | Git 忽略规则 |
