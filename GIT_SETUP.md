# Git 设置指南

## 当前项目状态

项目已完成以下功能：
- ✅ JSON 备份/恢复功能
- ✅ PWA 支持（manifest + service worker）
- ✅ UI 资源缓存配置

## Git 初始化步骤

如果项目尚未初始化 Git，请按以下步骤操作：

### 1. 初始化 Git 仓库

```bash
git init
```

### 2. 添加所有文件到暂存区

```bash
git add .
```

### 3. 创建首次提交

```bash
git commit -m "feat: 添加 JSON 备份/恢复功能和 PWA 支持

- 新增 JSON 备份/恢复功能（v1.0）
- 添加 PWA 支持（manifest + service worker）
- 更新缓存配置，包含 UI 资源
- 添加版本号查询参数控制缓存"
```

### 4. 添加远程仓库（如果使用 GitHub Pages）

```bash
git remote add origin https://github.com/你的用户名/你的仓库名.git
```

### 5. 推送到远程仓库

```bash
git branch -M main
git push -u origin main
```

## 后续提交建议

### 提交消息格式

使用约定式提交格式：

```
<type>(<scope>): <subject>

<body>

<footer>
```

### 常用类型

- `feat`: 新功能
- `fix`: 修复 bug
- `docs`: 文档更新
- `style`: 代码格式调整
- `refactor`: 重构
- `perf`: 性能优化
- `test`: 测试相关
- `chore`: 构建/工具相关

### 示例提交

```bash
# 功能更新
git commit -m "feat: 添加新功能描述"

# Bug 修复
git commit -m "fix: 修复某个问题"

# 文档更新
git commit -m "docs: 更新 README"
```

## GitHub Pages 部署

如果使用 GitHub Pages，确保：

1. 仓库设置为公开（Public）
2. 在 Settings > Pages 中：
   - Source: 选择 `main` 分支
   - Folder: 选择 `/ (root)`
3. 访问路径：`https://你的用户名.github.io/today-board/mobile.html`

## 注意事项

- `.gitignore` 已配置，排除不需要版本控制的文件
- 确保 `assets/` 目录下的所有 UI 资源都已提交
- PWA 图标文件（`pwa-192.png`, `pwa-512.png`）需要替换为实际图标

