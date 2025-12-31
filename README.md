# Today Board - 微信小程序版本

## 📁 项目结构

### 核心文件
- `mobile.html` - 移动端主页面（微信小程序入口）
- `app.js` - 核心业务逻辑
- `styles-v2.css` - 主要样式文件
- `styles-enhanced.css` - 增强样式文件

### 资源文件
- `fonts/` - 手写体字体文件（Kalam 字体）

## 🚀 微信小程序对接说明

### 1. 文件结构
```
todayboard-mobile/
├── mobile.html          # 主页面
├── app.js               # 核心逻辑
├── styles-v2.css        # 主样式
├── styles-enhanced.css  # 增强样式
└── fonts/               # 字体文件
    ├── kalam-light.ttf
    ├── kalam-regular.ttf
    └── kalam-bold.ttf
```

### 2. 微信小程序适配建议

#### 2.1 页面转换
- 将 `mobile.html` 转换为小程序页面（`.wxml`）
- 将样式文件转换为小程序样式（`.wxss`）
- 将 `app.js` 中的 DOM 操作转换为小程序的数据绑定和 API 调用

#### 2.2 API 适配
- `localStorage` → `wx.setStorageSync()` / `wx.getStorageSync()`
- `FileReader` → `wx.chooseImage()` / `wx.chooseMedia()`
- `html2canvas` → `wx.canvasToTempFilePath()` / `canvas` API
- `window.getSelection()` → 小程序文本选择 API

#### 2.3 功能模块
- ✅ 文本编辑（富文本编辑器）
- ✅ 图片添加（拍照/相册）
- ✅ 数据持久化（本地存储）
- ✅ 导出图片功能
- ✅ 字体样式（粗体/斜体/下划线/颜色/大小）

### 3. 注意事项

#### 3.1 字体文件
- 字体文件需要转换为小程序支持的格式（`.woff` 或 `.woff2`）
- 或使用小程序内置字体

#### 3.2 样式适配
- 小程序不支持部分 CSS 属性（如 `backdrop-filter`）
- 需要替换为小程序支持的替代方案

#### 3.3 权限配置
- 需要在 `app.json` 中配置相机、相册等权限
- 需要在 `project.config.json` 中配置相关设置

## 📝 版本信息

- Build: 2025.12.22
- 数据仅保存在本地设备
- 导出图片将保存到系统相册/Downloads

## 🔧 开发说明

本项目已优化为微信小程序对接版本，删除了以下不需要的文件：
- ❌ `index.html` - 桌面端页面
- ❌ `styles.css` - 旧版样式文件
- ❌ 所有开发文档（`.md` 文件）
- ❌ 本地开发脚本（`.bat` / `.sh`）

保留的核心文件已准备好用于微信小程序转换。

