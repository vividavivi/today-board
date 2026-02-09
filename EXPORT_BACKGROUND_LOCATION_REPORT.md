# 终结任务：黑板背景来源 + 导出马赛克/纯黑/断层 — 定位报告

## 第 1 步：定位报告

### 1.1 影响背景的选择器与属性（文件 + 行号）

#### background-image / background-color

| 来源 | 选择器/位置 | 说明 |
|------|-------------|------|
| **styles-v2.css** | | |
| 37 | `:root` | `--bg: #1B1B1B` |
| 70-73 | `body` | `background-color: var(--bg);` + `background-image: url("./assets/bg/bg_blackboard_main.webp");` |
| 386 | `.tb-record.is-selected` | `background-image: url("./assets/bg/bg_blackboard_main_lite.webp");` |
| 491-498 | `.tb-actionsbar` | `background-color: var(--bg);` + `background-image: url("./assets/bg/bg_blackboard_main.webp");` |
| 606 | `.tb-editor-overlay` | `background-image: url("./assets/bg/bg_blackboard_main.webp");` |
| 1121 | `.tb-preview-overlay` | `background-image: url("./assets/bg/bg_blackboard_main.webp");` |
| 1430-1432 | `.tb-card-view` | `background-image: url("./assets/bg/bg_blackboard_main.webp");` |
| 1458-1464 | `body.is-exporting` | `background-color: var(--bg);` + `background-image: url("./assets/bg/bg_blackboard_main.webp");` |
| 1477-1479 | `.is-exporting .tb-card-view *` | `background-image: none !important;` |
| 1482-1487 | `.is-exporting .tb-card-view` | `background-image: url("./assets/bg/bg_blackboard_main.webp");` |
| **styles-enhanced.css** | | |
| 99-100 | `.tb-editor-input` | `background-image: url("./assets/bg/bg_blackboard_main.webp");` |
| 195 | (某选择器) | `background-image: url("./assets/bg/bg_blackboard_main_lite.webp");` |
| 336 | (某选择器) | `background-image: url("./assets/bg/bg_blackboard_main_lite.webp");` |
| 408-410 | `.tb-card-view` | `background-color: #0f1216;` + `background-image: url("./assets/bg/bg_blackboard_main.webp");` |
| 424-425 | `.is-exporting .tb-card-view` | `background-image: url("./assets/bg/bg_blackboard_main.webp");` |
| **app.js (onclone)** | 776-777, 5660-5661, 5962-5963 | 注入 `.tb-card-view { background-image: url(blackboardUrl) }` + 内联 clonedContainer.style.backgroundImage |
| **app.js (onclone)** | 790 等 | `.tb-export-mode { background-image: url(blackboardUrl) }` 压扁样式内 |

#### ::before / ::after 遮罩层（全屏或大范围）

| 来源 | 选择器 | 说明 |
|------|--------|------|
| **styles-enhanced.css** | | |
| 9-27 | `body::before` | **全屏 fixed**，粉笔灰斑点径向渐变，z-index: -1，opacity: 0.6 |
| 62-72 | `.tb-btn::after` | 渐变高光覆盖按钮 |
| 207-217 | `.tb-record::before` | 高光覆盖单条记录 |
| 244-260 | `.tb-divider::after` | 分隔线动画/装饰 |
| 283-285 | `.tb-empty::before` | 占位图标 '✏️' |
| 313-323 | `.tb-pin-btn::before` | 图钉装饰 |
| 392-402 | `.tb-thumb::before` | 缩略图高光 |
| **styles-v2.css** | 1539-1542 | `.is-exporting .tb-divider::before/::after` 已隐藏 |
| **app.js onclone** | 790 等 | 隐藏 .tb-record::before/after, .tb-export-record, .tb-divider, .tb-btn::after, .tb-empty::before, .tb-pin-btn::before, .tb-thumb::before |

#### filter / backdrop-filter / mix-blend-mode / mask

| 来源 | 选择器/行号 | 属性 |
|------|-------------|------|
| **styles-v2.css** | 183, 337, 502, 610, 832, 1052, 1125, 1280, 1361, 1703, 1834 | `backdrop-filter: blur(...)`（多处弹窗、操作栏、列表） |
| **styles-v2.css** | 1451-1455 | `.is-exporting, .is-exporting *`：filter/backdrop-filter/mix-blend-mode 已 none/normal |
| **styles-enhanced.css** | 304, 430, 445, 460, 582 | backdrop-filter / filter（.tb-preview-image: contrast/brightness） |
| **app.js onclone** | 790 等 | `.tb-export-mode, .tb-export-mode *`：filter/backdrop-filter/mix-blend-mode/mask/transform 全禁用 |

---

### 1.2 黑板纹理 bg_blackboard_main.webp 当前挂在何处

- **html/body**  
  - **body**：styles-v2.css 第 72-73 行，`background-color: var(--bg)` + `background-image: url("./assets/bg/bg_blackboard_main.webp");`，`background-size: cover`。  
  - 即：**页面常态下黑板纹理已在 body 上，且 body 为整页背景。**

- **页面 root / 内容容器**  
  - **.tb-main**：无 background-image，仅 padding，透明，所以**主内容区背景就是 body 的黑板**。  
  - **.tb-records**：半透明 `rgba(32,32,32,0.3)` + `backdrop-filter: blur(0.5px)`，不挂黑板图。  
  - **.tb-card-view**：styles-v2.css 1431、styles-enhanced.css 410 都挂了 **同一张** `bg_blackboard_main.webp`，且带 `background-color: #0f1216`（enhanced）。  
  - **.tb-actionsbar**：styles-v2.css 497-498，**第二处黑板图** + `backdrop-filter: blur(10px)`。  
  - **.tb-editor-overlay / .tb-preview-overlay**：606、1121 行各自再挂**第三、第四处**黑板图 + backdrop-filter。

结论：  
- **当前黑板纹理同时挂在：body、.tb-card-view、.tb-actionsbar、.tb-editor-overlay、.tb-preview-overlay**，即**多源、多张**，不是“只在一处”。

---

### 1.3 为什么会出现“底部纯黑断层”和“导出马赛克/纯黑”

**底部纯黑断层（背景不铺满）**  
- body 使用 `background-size: cover`，但 **html/body 高度** 若未显式保证至少 100vh，在内容不足一屏或滚动后，底部可能露出“无图区域”，此时会显示 **background-color: var(--bg) (#1B1B1B)**，看起来像**底部一条纯黑带**。  
- 另外，**.tb-actionsbar** 为 `position: fixed; bottom: 0`，若其背后 body 未铺满视口高度，或 .tb-main 的 padding-bottom 与 actionsbar 之间有空隙，也会加重“断层”感。  
- **.tb-card-view** 在 enhanced 里还有 `background-color: #0f1216`，若该块高度计算与 body 不一致，或导出时只截到卡片而 clone 的 body 被设为透明且卡片背景未正确绘制，也会在**导出图底部**出现黑边/断层。

**导出马赛克/纯黑**  
- **马赛克/透明块**：clone 文档中若仍有 **backdrop-filter / filter / mix-blend-mode / 大面积伪元素**（如 body::before 全屏、.tb-record::before 等），html2canvas 对这类合成支持差，会变成块状透明或马赛克。当前 onclone 已对 `.tb-export-mode` 禁用并隐藏伪元素，但若 clone 内**背景图未成功加载**（如跨域、dataURL 未注入），则透明区域会与 **backgroundColor: null** 叠加，看起来像“马赛克”或“纯黑”（部分实现会把未绘制区域视为黑）。  
- **纯黑底**：  
  - 若曾用 **backgroundColor: '#0f1216'** 或 **#000**，整张 canvas 会先被填成纯色，再叠 DOM，容易盖住黑板纹理。  
  - 若 **clone 的 body** 被设为 `background: transparent; background-image: none`，而 **.tb-card-view** 的背景图在 clone 中未加载（URL 跨域、或未转 dataURL），则导出区域只有透明 + 默认黑底 → **整张导出图纯黑**。  
- **断层**：导出裁剪高度若按“内容底 + 20px”计算，而 html2canvas 的 height 或克隆容器高度与真实内容不一致，底部会多出一段无纹理区域（透明或黑），形成“断层”。

---

### 1.4 小结（当前问题根因）

| 现象 | 根因摘要 |
|------|----------|
| 底部纯黑断层 | body 未保证 min-height:100vh；多处 background 导致视觉不统一；.tb-card-view 在 enhanced 有 #0f1216 底色。 |
| 导出马赛克 | clone 内残留 backdrop-filter/filter/伪元素，或背景图未在 clone 中可用（未用 dataURL）。 |
| 导出纯黑 | 曾用纯色 backgroundColor；或 clone 仅 body 透明且 .tb-card-view 背景图未绘制成功。 |
| 导出断层 | 裁剪/高度计算与 clone 实际渲染不一致；或导出根节点背景未铺满裁剪区域。 |

---

## 第 2 步：已执行的结构性修复（按规则 A–E）

### 规则 A：黑板纹理只在一处
- **styles-v2.css**  
  - `body`：保留唯一 `background-image: url("./assets/bg/bg_blackboard_main.webp");`，并增加 `min-height: 100vh`，避免底部露出纯色。  
  - `.tb-actionsbar`：去掉 `background-image`，改为 `background-color: rgba(27,27,27,0.92); background-image: none`。  
  - `.tb-editor-overlay` / `.tb-preview-overlay`：去掉黑板图，改为 `background-color: rgba(15,18,22,0.94); background-image: none`。  
  - `.tb-card-view`：常态改为 `background: transparent`，由 body 透出；导出态仍由 `.is-exporting .tb-card-view` 与 onclone 注入黑板。  
- **styles-enhanced.css**  
  - `.tb-card-view`：去掉 `background-color` / `background-image`，改为 `background: transparent`。

### 规则 B：内容区仅半透明
- **styles-v2.css**  
  - `.tb-record.is-selected`：由 `background-image: url(...bg_blackboard_main_lite.webp)` 改为 `background: rgba(255,255,255,0.06)`。  
- **styles-enhanced.css**  
  - `.tb-editor-input`：由黑板图改为 `background-color: rgba(32,32,32,0.5); background-image: none`。

### 规则 C：全屏合成效果
- 未移除页面常态的 `backdrop-filter` / `body::before`；导出时继续在 onclone 中禁用（已有逻辑）。

### 规则 D–E：导出
- **app.js** 已满足：`backgroundColor: null`；onclone 中禁用 filter/backdrop/blend/mask/伪元素，并为导出根节点注入 `.tb-export-mode { background-image: url(blackboardUrl) }` + `clonedContainer.style.backgroundImage`，优先使用 dataURL。

---

## 第 3 步：验收标准

1. **页面**：黑板纹理从顶到底连续显示，不出现纯黑断层。  
2. **导出**：无马赛克透明块、无纯黑底、背景有纹理、内容完整。  
3. **导出裁剪**：底部留白 ≤ 约 20px（保持历史规则）。
