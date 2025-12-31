# 手写体字体文件说明

## 当前状态

已下载的字体文件（TTF 格式）：
- `kalam-light.ttf` - 细体（300）
- `kalam-regular.ttf` - 常规（400）
- `kalam-bold.ttf` - 粗体（700）

## 字体格式优先级

CSS 中定义的字体加载优先级：
1. **woff2**（最优，文件最小，现代浏览器支持）
2. **woff**（兜底，兼容性更好）
3. **ttf**（最终兜底，所有浏览器支持）

## 如何获取 woff2/woff 格式

### 方法 1：使用在线转换工具（推荐）

1. 访问 [CloudConvert](https://cloudconvert.com/ttf-to-woff2) 或 [FontSquirrel Webfont Generator](https://www.fontsquirrel.com/tools/webfont-generator)
2. 上传 `kalam-regular.ttf`、`kalam-light.ttf`、`kalam-bold.ttf`
3. 选择输出格式为 woff2 和 woff
4. 下载转换后的文件，重命名为：
   - `kalam-regular.woff2` / `kalam-regular.woff`
   - `kalam-light.woff2` / `kalam-light.woff`
   - `kalam-bold.woff2` / `kalam-bold.woff`
5. 将文件放入 `fonts/` 目录

### 方法 2：使用命令行工具

#### Windows（使用 Python + fonttools）

```powershell
pip install fonttools[woff]
pyftsubset kalam-regular.ttf --output-file=kalam-regular.woff2 --flavor=woff2
pyftsubset kalam-regular.ttf --output-file=kalam-regular.woff --flavor=woff
```

#### macOS/Linux

```bash
# 安装 fonttools
pip3 install fonttools[woff]

# 转换字体
pyftsubset kalam-regular.ttf --output-file=kalam-regular.woff2 --flavor=woff2
pyftsubset kalam-regular.ttf --output-file=kalam-regular.woff --flavor=woff
```

### 方法 3：从 Google Fonts 直接下载

访问 [Google Fonts - Kalam](https://fonts.google.com/specimen/Kalam)，使用 "Download family" 功能下载完整字体包，其中包含 woff2 格式。

## 字体使用说明

字体在 CSS 中的使用方式：

```css
font-family: "TodayBoardHandwriting", "Segoe Script", "Bradley Hand", "Comic Sans MS", "Kalam", "Caveat", cursive;
```

字体栈优先级：
1. **TodayBoardHandwriting** - 内置 webfont（Kalam）
2. **Segoe Script** - Windows 系统手写体
3. **Bradley Hand** - macOS 系统手写体
4. **Comic Sans MS** - 通用手写体
5. **Kalam** - Google Fonts 手写体（如果系统已安装）
6. **Caveat** - Google Fonts 手写体（如果系统已安装）
7. **cursive** - 系统默认手写体

## 注意事项

- 当前使用 TTF 格式作为兜底，所有现代浏览器都支持
- 添加 woff2/woff 文件后，浏览器会自动优先使用更优格式
- 字体文件路径为相对路径：`./fonts/kalam-*.woff2`
- 确保字体文件与 CSS 文件的相对路径正确

