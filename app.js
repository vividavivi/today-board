/* Today Board - 完整整合版
 *  1. 修复空值、重复定义
 *  2. renderRecords 移入 IIFE，基于 TODAY_RECORDS
 *  3. 兼容无 cardView 时的记录区截图导出
 *  4. 欢迎层、卡片容器可选（HTML 中补齐）
 */
(function () {
    /* ---------- 常量 ---------- */
    const STORAGE_KEYS = {
        HAS_SEEN_GUIDE: 'hasSeenGuide',
        LAST_DATE: 'lastDate',
        TODAY_TEXT: 'todayText',
        TODAY_IMAGE: 'todayImage',
        TODAY_RECORDS: 'todayRecords',
    };
    const APP_VERSION = 'v0.2';
    const BUILD_DATE = '2025.12.31'; // P0修复：Build 日期常量
    // 导出图片规则｜最终统一版：基准宽度 1170px，scale 2/3，最终宽度≥2340px
    const EXPORT_WIDTH = 1170; // 导出 PNG 基准宽度（px）
    const EXPORT_BOTTOM_PADDING = 20; // 底部最大留白 ≤20px
    // 导出裁剪：记录 clone 中的 footer 位置与整体高度，供 canvas 裁剪使用
    let lastExportCloneMetrics = null;
    // v1规范：功能开关
    const FEATURE_COLOR = true; // 字体颜色功能（已恢复）
    
    // 拍照文件输入（按需创建）
    let cameraInputEl = null;
    // 文本样式档位 - 3档滑杆
    const FONT_SIZE_STEPS = [14, 16, 20]; // 3档：小/中/大
    // 当前编辑记录的样式状态（每条记录独立保存）
    let editingStyle = {
        fontSize: 16,
        fontWeight: 400,
        fontStyle: 'normal',
        textDecoration: 'none',
        fontColor: '#FFFFFF',
    };
    
    // ========== 字体系统架构重构 v3：状态驱动模型（P0）==========
    // 核心原则：
    // 1. 单一可信状态源（Single Source of Truth）
    // 2. Selection ≠ Caret，逻辑必须分离
    // 3. B/I/U 必须是状态切换，不是 DOM 操作
    // 4. 颜色必须即时显现（WYSIWYG）
    
    // 编辑模式状态
    let isStyleEditMode = false; // Style Mode: true, Input Mode: false
    
    // P0修复：唯一可信状态源（editorStyleState）
    const editorStyleState = {
        // selectionStyle：只读，从 DOM 读取当前选区的样式状态
        selectionStyle: {
            bold: false,
            italic: false,
            underline: false,
            fontSize: 16,
            fontColor: '#FFFFFF'
        },
        // typingStyle：可写，光标后输入的样式状态（不依附 DOM）
        typingStyle: {
            bold: false,
            italic: false,
            underline: false,
            fontSize: 16, // 默认字号
            fontColor: '#FFFFFF' // 默认颜色
        }
    };
    
    // 兼容性：保留 typingStyleState 引用，指向 editorStyleState.typingStyle
    const typingStyleState = editorStyleState.typingStyle;
    
    // 调试日志
    const DEBUG_BIU = true;
    function debugLog(...args) {
        if (DEBUG_BIU) console.log('[BIU]', ...args);
    }
    
    // 输入模式：记录输入前的光标位置（用于包裹新文本）
    let inputStartRange = null;

    /* ---------- 元素缓存 ---------- */
    const els = {
        todayDate: document.getElementById('todayDate'),
        guideOverlay: document.getElementById('guideOverlay'),
        guideConfirmBtn: document.getElementById('guideConfirmBtn'),
        todayText: document.getElementById('todayText'),
        addImageBtn: document.getElementById('addImageBtn'),
        imageInput: document.getElementById('imageInput'),
        cameraInput: document.getElementById('cameraInput'),
        imagePreview: document.getElementById('imagePreview'),
        writeBtn: document.getElementById('writeBtn'),
        generateCardBtn: document.getElementById('generateCardBtn'),
        clearBtn: document.getElementById('clearBtn'),
        addFooterImageBtn: document.getElementById('addFooterImageBtn'),
        cardView: document.getElementById('cardView'),
        cardDate: document.getElementById('cardDate'),
        cardText: document.getElementById('cardText'),
        cardImages: document.getElementById('cardImages'),
        cardTime: document.getElementById('cardTime'),
        main: document.querySelector('.tb-main'),
        recordsList: document.getElementById('recordsList'),
        recordsEmpty: document.getElementById('recordsEmpty'),
  
  
        editorOverlay: document.getElementById('editorOverlay'),
        editorBackBtn: document.getElementById('editorBackBtn'),
        editorStatus: document.getElementById('editorStatus'),
        editorText: document.getElementById('editorText'),
        editorAddImageBtn: document.getElementById('editorAddImageBtn'),
        editorChecklistBtn: document.getElementById('editorChecklistBtn'),
        editorStyleBtn: document.getElementById('editorStyleBtn'),
        editorStyleBar: document.getElementById('editorStyleBar'),
        editorStyleBarCloseBtn: document.getElementById('editorStyleBarCloseBtn'),
        editorSubmitBtn: document.getElementById('editorSubmitBtn'),
        // 文本样式控件
        editorBoldBtn: document.getElementById('editorBoldBtn'),
        editorItalicBtn: document.getElementById('editorItalicBtn'),
        editorUnderlineBtn: document.getElementById('editorUnderlineBtn'),
        editorColorBtn: document.getElementById('editorColorBtn'),
        editorColorPalette: document.getElementById('editorColorPalette'),
        editorFontSize: document.getElementById('editorFontSize'),
        editorUndoBtn: document.getElementById('editorUndoBtn'),
        editorRedoBtn: document.getElementById('editorRedoBtn'),
        // 多选模式相关元素
        topActionBar: document.getElementById('topActionBar'),
        bottomActionBar: document.getElementById('bottomActionBar'),
        btnCancel: document.getElementById('btnCancel'),
        btnSelectAll: document.getElementById('btnSelectAll'),
        selectedCount: document.getElementById('selectedCount'),
        btnDelete: document.getElementById('btnDelete'),
        btnEdit: document.getElementById('btnEdit'),
        btnExport: document.getElementById('btnExport'),
        btnPin: document.getElementById('btnPin'),
        // 清空确认弹窗
        confirmClearOverlay: document.getElementById('confirmClearOverlay'),
        confirmClearConfirmBtn: document.getElementById('confirmClearConfirmBtn'),
        confirmClearCancelBtn: document.getElementById('confirmClearCancelBtn'),
        confirmRestoreOverlay: document.getElementById('confirmRestoreOverlay'),
        confirmRestoreConfirmBtn: document.getElementById('confirmRestoreConfirmBtn'),
        confirmRestoreCancelBtn: document.getElementById('confirmRestoreCancelBtn'),
        jsonInput: document.getElementById('jsonInput'),
    };

    // 多选模式：选择集与栏显示逻辑
    const selectedSet = new Set();
    function showToast(message) {
        try {
            const toast = document.createElement('div');
            toast.className = 'tb-toast';
            toast.textContent = message;
            document.body.appendChild(toast);
            // 强制重绘后添加打开态
            requestAnimationFrame(() => {
                toast.classList.add('is-open');
            });
            setTimeout(() => {
                toast.classList.remove('is-open');
                setTimeout(() => toast.remove(), 200);
            }, 2000);
        } catch (e) { console.warn('Toast 显示失败', e); }
    }
    // 样式工具：应用到编辑器输入区
    function applyEditorStyle() {
        if (!els.editorText) return;
        const s = editingStyle || {};
        els.editorText.style.fontSize = `${s.fontSize || 16}px`;
        els.editorText.style.fontWeight = String(s.fontWeight || 400);
        els.editorText.style.fontStyle = s.fontStyle || 'normal';
        els.editorText.style.transform = 'none';
        els.editorText.style.textDecoration = s.textDecoration || 'none';
        els.editorText.style.color = s.fontColor || '#FFFFFF';
    }
    function applyUnderlineExtras(el, styleObj) {
        try {
            if (!el || !styleObj || styleObj.textDecoration !== 'underline') return;
            el.style.textDecorationColor = el.style.color || 'currentColor';
            el.style.textDecorationSkipInk = 'auto';
            el.style.textUnderlineOffset = '0.12em';
            el.style.textDecorationThickness = 'from-font';
        } catch {}
    }
    // 样式工具：转换为内联 style 字符串（用于列表与导出）
    function styleToInline(styleObj) {
        const s = styleObj || {};
        const fs = Number(s.fontSize) || 16;
        const fw = s.fontWeight != null ? String(s.fontWeight) : '400';
        const fst = s.fontStyle || 'normal';
        const td = s.textDecoration || 'none';
        const fc = s.fontColor || '#FFFFFF';
        const transform = (fst === 'italic') ? 'skew(-10deg)' : 'none';
        return `font-size:${fs}px;font-weight:${fw};font-style:${fst};text-decoration:${td};color:${fc};transform:${transform};`;
    }
    // 检查选区中的所有文本节点是否都具有指定样式（必须全部都有才返回true）
    function isStyleActiveInAllSelection(fragment, styleObj) {
        try {
            // 收集所有文本节点及其父元素
            const textNodes = [];
            const walker = document.createTreeWalker(fragment, NodeFilter.SHOW_TEXT, null);
            let node;
            while ((node = walker.nextNode())) {
                const text = node.nodeValue || '';
                if (text.trim()) {
                    textNodes.push({
                        textNode: node,
                        parent: node.parentElement
                    });
                }
            }
            
            // 如果没有文本节点，返回false
            if (textNodes.length === 0) {
                return false;
            }
            
            // 检查每个文本节点是否都有指定样式
            for (const { textNode, parent } of textNodes) {
                let hasStyle = false;
                let currentParent = parent;
                
                // 向上遍历DOM树查找样式（在fragment内部查找）
                while (currentParent && fragment.contains(currentParent)) {
                    const s = currentParent.style || {};
                    const tag = currentParent.tagName || '';
                    
                    // 检查粗体
                    if (styleObj.fontWeight != null) {
                        const fw = String(s.fontWeight || '');
                        if (tag === 'B' || tag === 'STRONG' || fw === 'bold' || (Number(fw) || 0) >= 600) {
                            hasStyle = true;
                            break;
                        }
                    }
                    
                    // 检查斜体
                    if (styleObj.fontStyle) {
                        const fst = String(s.fontStyle || '');
                        const tf = String(s.transform || '');
                        if (tag === 'I' || tag === 'EM' || fst === 'italic' || /skew\(/.test(tf)) {
                            hasStyle = true;
                            break;
                        }
                    }
                    
                    // 检查下划线
                    if (styleObj.textDecoration) {
                        const td = String(s.textDecoration || '');
                        // P0修复：更彻底地检测下划线（包括所有下划线相关属性）
                        const hasTextDecoration = td.indexOf('underline') !== -1;
                        const hasTextDecorationColor = s.textDecorationColor && s.textDecorationColor !== 'currentColor';
                        const hasTextDecorationThickness = s.textDecorationThickness && s.textDecorationThickness !== 'from-font';
                        if (tag === 'U' || hasTextDecoration || hasTextDecorationColor || hasTextDecorationThickness) {
                            hasStyle = true;
                            break;
                        }
                    }
                    
                    currentParent = currentParent.parentElement;
                    // 如果parent不在fragment中，停止查找
                    if (!currentParent || !fragment.contains(currentParent)) {
                        break;
                    }
                }
                
                // 如果任何一个文本节点没有样式，返回false
                if (!hasStyle) {
                    return false;
                }
            }
            
            // 所有文本节点都有样式，返回true
            return true;
        } catch (e) {
            console.warn('isStyleActiveInAllSelection error:', e);
            return false;
        }
    }

    // P0修复：基于状态驱动模型计算当前样式状态
    // 核心原则：
    // 1. Selection 模式：读取 DOM 并更新 editorStyleState.selectionStyle（只读）
    // 2. Caret 模式：直接返回 editorStyleState.typingStyle（可写）
    // 3. 严禁依赖 DOM span 是否存在来判断按钮状态
    function getCurrentStyleAtCursor() {
        if (!editorIsCE() || !els.editorText) {
            return { bold: false, italic: false, underline: false, fontSize: 16, fontColor: '#FFFFFF' };
        }
        try {
            const sel = window.getSelection();
            if (!sel || sel.rangeCount === 0) {
                // 无 selection：返回 typingStyle
                return {
                    bold: editorStyleState.typingStyle.bold,
                    italic: editorStyleState.typingStyle.italic,
                    underline: editorStyleState.typingStyle.underline,
                    fontSize: editorStyleState.typingStyle.fontSize,
                    fontColor: editorStyleState.typingStyle.fontColor
                };
            }
            const range = sel.getRangeAt(0);
            const hasSel = !range.collapsed;
            
            if (hasSel) {
                // Selection 模式：读取 DOM 并更新 selectionStyle（只读）
                const textNodes = [];
                const walker = document.createTreeWalker(range.commonAncestorContainer, NodeFilter.SHOW_TEXT, null);
                let node;
                while ((node = walker.nextNode())) {
                    if (range.intersectsNode(node) && node.textContent.trim()) {
                        textNodes.push(node);
                    }
                }
                
                if (textNodes.length === 0) {
                    editorStyleState.selectionStyle = {
                        bold: false,
                        italic: false,
                        underline: false,
                        fontSize: 16,
                        fontColor: '#FFFFFF'
                    };
                    return editorStyleState.selectionStyle;
                }
                
                // 检查每个文本节点是否都有样式
                let allBold = true, allItalic = true, allUnderline = true;
                let fontSize = 16, fontColor = '#FFFFFF';
                
                for (const textNode of textNodes) {
                    let hasBold = false, hasItalic = false, hasUnderline = false;
                    let nodeFontSize = 16, nodeFontColor = '#FFFFFF';
                    let parent = textNode.parentElement;
                    
                    while (parent && els.editorText.contains(parent)) {
                        const style = parent.style || {};
                        const tag = parent.tagName || '';
                        
                        if (!hasBold) {
                            const fw = String(style.fontWeight || '');
                            if (tag === 'B' || tag === 'STRONG' || fw === 'bold' || (Number(fw) || 0) >= 600) {
                                hasBold = true;
                            }
                        }
                        
                        if (!hasItalic) {
                            const fs = String(style.fontStyle || '');
                            const tf = String(style.transform || '');
                            if (tag === 'I' || tag === 'EM' || fs === 'italic' || /skew\(/.test(tf)) {
                                hasItalic = true;
                            }
                        }
                        
                        if (!hasUnderline) {
                            const td = String(style.textDecoration || '');
                            // P0修复：更彻底地检测下划线（包括所有下划线相关属性）
                            const hasTextDecoration = td.indexOf('underline') !== -1;
                            const hasTextDecorationColor = style.textDecorationColor && style.textDecorationColor !== 'currentColor';
                            const hasTextDecorationThickness = style.textDecorationThickness && style.textDecorationThickness !== 'from-font';
                            if (tag === 'U' || hasTextDecoration || hasTextDecorationColor || hasTextDecorationThickness) {
                                hasUnderline = true;
                            }
                        }
                        
                        // 读取字号和颜色（取第一个找到的值）
                        if (style.fontSize && nodeFontSize === 16) {
                            const fsMatch = String(style.fontSize).match(/(\d+)px/);
                            if (fsMatch) nodeFontSize = parseInt(fsMatch[1], 10);
                        }
                        if (style.color && nodeFontColor === '#FFFFFF') {
                            nodeFontColor = style.color;
                        }
                        
                        if (hasBold && hasItalic && hasUnderline && nodeFontSize !== 16 && nodeFontColor !== '#FFFFFF') break;
                        
                        parent = parent.parentElement;
                        if (parent === els.editorText) break;
                    }
                    
                    if (!hasBold) allBold = false;
                    if (!hasItalic) allItalic = false;
                    if (!hasUnderline) allUnderline = false;
                    if (nodeFontSize !== 16) fontSize = nodeFontSize;
                    if (nodeFontColor !== '#FFFFFF') fontColor = nodeFontColor;
                    
                    if (!allBold && !allItalic && !allUnderline) break;
                }
                
                // 更新 selectionStyle（只读）
                editorStyleState.selectionStyle = {
                    bold: allBold,
                    italic: allItalic,
                    underline: allUnderline,
                    fontSize: fontSize,
                    fontColor: fontColor
                };
                
                return editorStyleState.selectionStyle;
            } else {
                // Caret 模式：直接返回 typingStyle（可写）
                return {
                    bold: editorStyleState.typingStyle.bold,
                    italic: editorStyleState.typingStyle.italic,
                    underline: editorStyleState.typingStyle.underline,
                    fontSize: editorStyleState.typingStyle.fontSize,
                    fontColor: editorStyleState.typingStyle.fontColor
                };
            }
        } catch (e) {
            debugLog('getCurrentStyleAtCursor error:', e);
            return { bold: false, italic: false, underline: false, fontSize: 16, fontColor: '#FFFFFF' };
        }
    }
    

    // P0修复：更新样式控件 UI - caret 模式下使用 typingStyleState
    function updateStyleControlsUI() {
        const s = editingStyle || {};
        
        // 重构 v2：基于 selection 计算样式状态
        const sel = window.getSelection();
        const hasSel = sel && sel.rangeCount > 0 && !sel.getRangeAt(0).collapsed;
        
        // P0修复：基于 selection 计算当前样式状态（不操作 DOM）
        // 在 caret 模式下，getCurrentStyleAtCursor() 会返回 typingStyleState
        const currentStyle = getCurrentStyleAtCursor();
        const boldActive = currentStyle.bold;
        const italicActive = currentStyle.italic;
        const underlineActive = currentStyle.underline;
        
        // P0修复：调试日志（caret 模式下）
        if (!hasSel && DEBUG_BIU) {
            debugLog('updateStyleControlsUI (caret mode)', {
                typingStyleState,
                currentStyle,
                boldActive,
                italicActive,
                underlineActive
            });
        }
        
        // 更新按钮状态 - 使用remove/add而不是toggle，确保状态准确
        if (els.editorBoldBtn) {
            if (boldActive) {
                els.editorBoldBtn.classList.add('is-active');
            } else {
                els.editorBoldBtn.classList.remove('is-active');
            }
        }
        if (els.editorItalicBtn) {
            if (italicActive) {
                els.editorItalicBtn.classList.add('is-active');
            } else {
                els.editorItalicBtn.classList.remove('is-active');
            }
        }
        if (els.editorUnderlineBtn) {
            if (underlineActive) {
                els.editorUnderlineBtn.classList.add('is-active');
            } else {
                els.editorUnderlineBtn.classList.remove('is-active');
        }
        }
        
        // P0修复：颜色功能 - 完全基于状态
        if (FEATURE_COLOR && els.editorColorPalette) {
            const swatches = els.editorColorPalette.querySelectorAll('.tb-color-swatch');
            // 基于 getCurrentStyleAtCursor() 返回的状态（selectionStyle 或 typingStyle）
            const currentColor = currentStyle.fontColor || '#FFFFFF';
            swatches.forEach(btn => {
                const c = btn.getAttribute('data-color');
                btn.classList.toggle('is-active', c === currentColor);
            });
        }
        // P0修复：字号滑杆 - 完全基于状态
        if (els.editorFontSize) {
            // 基于 getCurrentStyleAtCursor() 返回的状态（selectionStyle 或 typingStyle）
            const currentSize = currentStyle.fontSize || 16;
            const idx = FONT_SIZE_STEPS.indexOf(currentSize);
            els.editorFontSize.value = String(idx >= 0 ? (idx + 1) : 2);
        }
    }
    const HISTORY_LIMIT = 20;
    let editorHistory = [];
    let historyIndex = -1;
    function pushEditorHistory() {
        try {
            const snapshot = {
                ce: editorIsCE(),
                html: editorIsCE() ? (getEditorHTML() || '') : null,
                text: editorIsCE() ? null : (getEditorPlainText() || ''),
                images: Array.isArray(editingImages) ? editingImages.slice() : [],
                imageNames: Array.isArray(editingImageNames) ? editingImageNames.slice() : [],
                style: { ...editingStyle },
            };
            if (historyIndex < editorHistory.length - 1) {
                editorHistory = editorHistory.slice(0, historyIndex + 1);
            }
            editorHistory.push(snapshot);
            historyIndex++;
            if (editorHistory.length > HISTORY_LIMIT) {
                editorHistory.shift();
                historyIndex = Math.max(-1, historyIndex - 1);
            }
        } catch {}
    }
    function applyEditorSnapshot(s) {
        if (!s) return;
        try {
            if (els.editorText) {
                if (s.ce) setEditorHTML(s.html || ''); else setEditorPlainText(s.text || '');
            }
            editingImages = Array.isArray(s.images) ? s.images.slice() : [];
            editingImageNames = Array.isArray(s.imageNames) ? s.imageNames.slice() : [];
            editingStyle = s.style || editingStyle;
            applyEditorStyle();
            ensureEditorImageControls();
            updateStyleControlsUI();
            updateEditorSubmitState();
        } catch {}
    }
    function handleUndo() {
        try {
            if (historyIndex <= 0) return;
            historyIndex--;
            applyEditorSnapshot(editorHistory[historyIndex]);
        } catch {}
    }
    function handleRedo() {
        try {
            if (historyIndex >= editorHistory.length - 1) return;
            historyIndex++;
            applyEditorSnapshot(editorHistory[historyIndex]);
        } catch {}
    }
    function updateMultiSelectUI() {
        const list = loadRecords();
        const count = selectedSet.size;
        const hasSelection = count > 0;
        if (els.selectedCount) els.selectedCount.textContent = `已选中 ${count} 条`;
        const allSelected = list.length > 0 && count === list.length;
        if (els.btnSelectAll) els.btnSelectAll.textContent = allSelected ? '取消全选' : '全选';
        // 修改与置顶按钮：仅单选可用
        const single = count === 1;
        if (els.btnEdit) {
            els.btnEdit.classList.toggle('is-disabled', !single);
            els.btnEdit.disabled = !single;
        }
        if (els.btnPin) {
            els.btnPin.classList.toggle('is-disabled', !single);
            els.btnPin.disabled = !single;
            // 根据选中记录状态切换文案与高亮
            if (single) {
                const idx = Array.from(selectedSet)[0];
                const rec = list[idx];
                const pinned = !!(rec && rec.pinned);
                // 文案与图标状态
                const labelEl = els.btnPin.querySelector('.tb-pin-label');
                if (labelEl) labelEl.textContent = pinned ? '取消置顶' : '置顶';
                els.btnPin.setAttribute('data-tooltip', pinned ? '取消当前置顶' : '置顶到顶部');
                els.btnPin.classList.toggle('is-active', pinned);
                // 单选且记录已置顶：临时隐藏红钉图标（选中视觉），退出选中后自动恢复
                els.btnPin.dataset.state = pinned ? 'selected' : 'idle';
            } else {
                const labelEl = els.btnPin.querySelector('.tb-pin-label');
                if (labelEl) labelEl.textContent = '置顶';
                els.btnPin.setAttribute('data-tooltip', '置顶到顶部');
                els.btnPin.classList.remove('is-active');
                // 修改：退出选中后根据当前是否存在置顶记录恢复为圆圈或红钉
                const anyPinned = list.some(r => r && r.pinned);
                els.btnPin.dataset.state = anyPinned ? 'pinned' : 'idle';
            }
        }
        const toggleBar = (barEl, open) => {
            if (!barEl) return;
            if (open) {
                barEl.classList.add('is-open');
                barEl.setAttribute('aria-hidden','false');
                document.body.classList.add('is-multi-select');
            } else {
                barEl.classList.remove('is-open');
                barEl.setAttribute('aria-hidden','true');
                document.body.classList.remove('is-multi-select');
            }
        };
        toggleBar(els.topActionBar, hasSelection);
        toggleBar(els.bottomActionBar, hasSelection);
    }
    function toggleSelected(idx) {
        if (selectedSet.has(idx)) selectedSet.delete(idx); else selectedSet.add(idx);
        renderRecords();
        updateMultiSelectUI();
    }
    function cancelSelection() {
        selectedSet.clear();
        renderRecords();
        updateMultiSelectUI();
    }
    function selectAllToggle() {
        const list = loadRecords();
        if (selectedSet.size === list.length) {
            selectedSet.clear();
        } else {
            selectedSet.clear();
            list.forEach((_, idx) => selectedSet.add(idx));
        }
        renderRecords();
        updateMultiSelectUI();
    }
    function deleteSelected() {
        const list = loadRecords();
        const count = selectedSet.size;
        if (count === 0) { return; }
        const remain = list.filter((_, idx) => !selectedSet.has(idx));
        saveRecords(remain);
        // 删除完成后清空选择并刷新 UI（若无选中项则隐藏浮动栏）
        selectedSet.clear();
        renderRecords();
        updateMultiSelectUI();
        // 显示删除成功提示
        showToast(`已删除 ${count} 条记录`);
    }
    async function exportSelected() {
        try {
            const exportContainer = els.cardView;
            const cardDate = els.cardDate;
            const cardText = els.cardText;
            const cardImages = els.cardImages;
            const cardTime = els.cardTime;
            if (!exportContainer || !cardDate || !cardText || !cardTime) {
                alert('导出容器缺失');
                return;
            }
            const all = loadRecords();
            const mapped = all.map((rec, baseIndex) => ({ rec, baseIndex }));
            mapped.sort((a, b) => {
                const ap = a.rec && a.rec.pinned ? 1 : 0;
                const bp = b.rec && b.rec.pinned ? 1 : 0;
                if (ap !== bp) return bp - ap;
                return a.baseIndex - b.baseIndex;
            });
            const display = selectedSet.size ? mapped.filter(m => selectedSet.has(m.baseIndex)).map(m => m.rec) : mapped.map(m => m.rec);
            const dateStr = formatDateYMD(new Date());
            const timeStr = formatTimeHM(new Date());
            cardDate.textContent = dateStr;
            cardTime.textContent = `生成时间：${timeStr}`;
            
            // P0：导出内容区宽度 = 黑板内容区宽度（页面展示用），导出 PNG 宽度固定为 EXPORT_WIDTH
            const boardWidth = getBoardContentWidth();
            exportContainer.style.width = `${boardWidth}px`;
            exportContainer.style.maxWidth = `${boardWidth}px`;
            
            // P0：复用黑板记录的DOM结构和样式
            let contentHTML = '';
            display.forEach((record, i) => {
                const hasHtml = (typeof record.textHtml === 'string' && record.textHtml.trim().length > 0);
                const textHtmlOrPlain = hasHtml ? record.textHtml : (record.text || '');
                // 使用与黑板记录相同的结构：tb-record + tb-record-head + tb-record-content
                contentHTML += `<div class="tb-record">`;
                contentHTML += `<div class="tb-record-head">`;
                contentHTML += `<div style="display: inline-flex; gap: 8px;">`;
                contentHTML += `<span class="tb-record-index">${i + 1}.</span>`;
                contentHTML += `<span class="tb-record-time">${record.time || ''}</span>`;
                contentHTML += `</div></div>`;
                if (hasHtml) {
                    contentHTML += `<div class="tb-record-content">${textHtmlOrPlain}</div>`;
                } else {
                    const inlineStyle = styleToInline(record.textStyle || null);
                    contentHTML += `<div class="tb-record-content" style="${inlineStyle}">${textHtmlOrPlain}</div>`;
                }
                // P0修复：添加分割线（最后一条记录不添加）
                if (i < display.length - 1) {
                    contentHTML += `<div class="tb-divider"></div>`;
                }
                contentHTML += `</div>`;
            });
            cardText.innerHTML = contentHTML;
            cardImages.innerHTML = '';
            
            // P0修复：确保卡片内容字体与编辑器一致（强制覆盖内联样式）
            (function normalizeCardFonts(container) {
                const allElements = container.querySelectorAll('*');
                allElements.forEach(el => {
                    if (el.style && el.style.fontFamily) {
                        el.style.fontFamily = '';
                    }
                });
            })(cardText);
            
            // 确保图片样式与黑板一致
            (function normalizeExportImages(container) {
                // 查找所有图片（包括可能没有 todayboard-img class 的）
                const allImgs = Array.from(container.querySelectorAll('img'));
                allImgs.forEach(img => {
                    // 确保图片有 todayboard-img class
                    if (!img.classList.contains('todayboard-img')) {
                        img.classList.add('todayboard-img');
                    }
                    // 清除内联样式，让CSS规则生效
                    try { 
                        img.style.width = ''; 
                        img.style.height = ''; 
                        img.style.maxWidth = '';
                    } catch {}
                    // 确保图片被包裹在 .tb-img-wrapper 中
                    const already = img.closest('.tb-img-wrapper');
                    if (!already) {
                        const wrap = document.createElement('span');
                        wrap.className = 'tb-img-wrapper';
                        img.parentNode.insertBefore(wrap, img);
                        wrap.appendChild(img);
                    }
                });
            })(cardText);

            // === 新版导出逻辑：直接简单截图 cardView，废弃旧的高度/裁剪规则 ===
            exportContainer.classList.remove('visually-hidden');
            // P0：添加 is-exporting class 以启用导出态图片样式规则
            exportContainer.classList.add('is-exporting');
            const simpleCanvas = await renderCardCanvasSimple(exportContainer);
            console.log('[TB-RESULT] finalCanvas=' + simpleCanvas.width + ' x ' + simpleCanvas.height);
            let dataUrl;
            try {
                dataUrl = simpleCanvas.toDataURL('image/png');
            } catch (e) {
                if (e.name === 'SecurityError' || (e.message && e.message.includes('tainted'))) {
                    throw new Error('导出失败：图片包含跨域内容，请确保所有图片来自本应用');
                }
                throw e;
            }
            const filename = generateTBFileName('png');
            showCardPreview(dataUrl, filename, { width: simpleCanvas.width, height: simpleCanvas.height });
            exportContainer.classList.add('visually-hidden');
            exportContainer.classList.remove('export-mode');
            exportContainer.classList.remove('is-exporting');
            exportContainer.classList.remove('tb-export-natural-height');
            exportContainer.style.width = '';
            exportContainer.style.maxWidth = '';
            return;

            await ensureHtml2Canvas();
            exportContainer.classList.remove('visually-hidden');
            exportContainer.classList.add('export-mode');
            // P0：添加 is-exporting class 禁用所有遮罩层和滤镜
            exportContainer.classList.add('is-exporting');
            exportContainer.classList.add('tb-export-natural-height');
            await waitForImages(exportContainer);
            await new Promise(function (r) { requestAnimationFrame(function () { requestAnimationFrame(r); }); });
            var naturalHeightCss = exportContainer.scrollHeight || exportContainer.offsetHeight;
            naturalHeightCss = Math.max(1, Math.ceil(naturalHeightCss));

            // 基于 footer（生成时间）计算一个「内容实际高度」用于后裁剪，避免底部大片空黑板
            var exportCropMetrics = null;
            try {
                var footerEl = exportContainer.querySelector('#exportGeneratedAt') || exportContainer.querySelector('.tb-card-footer');
                if (footerEl) {
                    var padCss = 24;
                    var footerBottomCss = footerEl.offsetTop + footerEl.offsetHeight;
                    var targetCssHeight = Math.min(naturalHeightCss, footerBottomCss + padCss);
                    exportCropMetrics = {
                        rootScrollHeightCss: naturalHeightCss,
                        targetCssHeight: targetCssHeight
                    };
                    console.log('[TB-Export-Metrics]', exportCropMetrics);
                }
            } catch (e) {
                console.warn('[TB-Export-Metrics] compute failed', e);
            }

            console.log('[TB-Export] naturalHeightCss=', naturalHeightCss, '（直接按卡片自然高度截图，之后按 footer 精剪底部空白）');

            // P0修复：背景图转为 data URL 再绘制；file:// 下强制纯色，避免画布被污染导致 toDataURL 报错
            const isFileProtocol = window.location.protocol === 'file:';
            const bgImageAbsoluteUrl = new URL('./assets/bg/bg_blackboard_main.webp', window.location.href).href;
            let bgDataUrl = null;
            try {
                bgDataUrl = await imageUrlToDataUrl(bgImageAbsoluteUrl);
            } catch (e) {
                console.error('导出背景图转 data URL 失败，将使用纯色背景导出', { url: bgImageAbsoluteUrl, message: e && e.message, exception: e });
                if (isFileProtocol) {
                    try { showToast('当前为本地文件打开，导出为纯色背景；通过 http 访问页面可获得黑板纹理'); } catch (_) {}
                }
            }
            const exportWidth = EXPORT_WIDTH;
            var scale = Math.max(2, window.devicePixelRatio || 2);
            var MAX_PX = 8000;
            scale = Math.min(scale, MAX_PX / exportWidth, MAX_PX / naturalHeightCss);
            var pxW = Math.round(exportWidth * scale);
            var pxH = Math.round(naturalHeightCss * scale);
            console.log('[TB-Export-Scale] scale=', scale, 'pxW=', pxW, 'pxH=', pxH);

            try {
                var diagnostic = getExportCompositeDiagnostic(exportContainer);
                console.log('[TB-Export-Composite] root及祖先:', diagnostic.ancestors, '子树非默认:', diagnostic.subtree);
            } catch (e) {
                console.warn('[TB-Export-Composite] 诊断失败', e);
            }

            const canvas = await html2canvas(exportContainer, { 
                backgroundColor: null,
                useCORS: true, 
                allowTaint: true,
                scale: scale,
                logging: false,
                width: exportWidth,
                windowWidth: exportWidth,
                height: naturalHeightCss,
                ignoreElements: (element) => {
                    return element.classList && (
                        element.classList.contains('tb-editor-overlay') ||
                        element.classList.contains('tb-preview-overlay') ||
                        element.classList.contains('tb-confirm-overlay') ||
                        element.classList.contains('tb-guide-overlay') ||
                        element.classList.contains('tb-popover-overlay')
                    );
                },
                onclone: (function (naturalH) {
                    return function oncloneExport(clonedDoc) {
                    var head = clonedDoc.head || clonedDoc.createElement('head');
                    if (!clonedDoc.head && clonedDoc.documentElement) {
                        try { clonedDoc.documentElement.insertBefore(head, clonedDoc.body || clonedDoc.documentElement.firstChild); } catch (e) {}
                    }
                    var cloneBgSolid = '#1B1B1B';
                    if (clonedDoc.documentElement) {
                        clonedDoc.documentElement.style.background = cloneBgSolid;
                        clonedDoc.documentElement.style.backgroundImage = 'none';
                    }
                    if (clonedDoc.body) {
                        clonedDoc.body.style.background = cloneBgSolid;
                        clonedDoc.body.style.backgroundImage = 'none';
                    }
                    if (isFileProtocol) {
                        clonedDoc.querySelectorAll('link[rel="stylesheet"]').forEach(function (link) { link.remove(); });
                    }
                    var fallbackUrl = (window.location.origin + window.location.pathname).replace(/\/[^/]*$/, '') + '/assets/bg/bg_blackboard_main.webp';
                    var exportBgUrl = (typeof bgDataUrl === 'string' && bgDataUrl) ? bgDataUrl : fallbackUrl;
                    var exportBgUrlCss = exportBgUrl.indexOf('data:') === 0 ? ('url("' + exportBgUrl.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '")') : ('url(' + exportBgUrl + ')');
                    var containerBg = '.tb-card-view { background-image: ' + exportBgUrlCss + ' !important; background-size: cover !important; background-position: center !important; background-repeat: no-repeat !important; }';
                    var rootSolid = 'html, body { background: #1B1B1B !important; background-image: none !important; }';
                    var textVisible = '.tb-record-content, .tb-export-content, .tb-record-head, .tb-export-head, .tb-record-index, .tb-export-index, .tb-record-time, .tb-export-time, .tb-card-title, .tb-card-date, .tb-card-footer { color: #EAEAEA !important; -webkit-text-fill-color: #EAEAEA !important; }';
                    var exportFonts = '.tb-card-title { font-family: "Kalam", "TodayBoardHandwriting", "Segoe Script", "Bradley Hand", "Comic Sans MS", "Caveat", cursive !important; font-size: 32px !important; } .tb-card-date { font-family: "Kalam", "TodayBoardHandwriting", "Segoe Script", "Bradley Hand", "Comic Sans MS", "Caveat", cursive !important; font-size: 16px !important; } .tb-card-footer { font-size: 14px !important; }';
                    var overrideStyle = clonedDoc.createElement('style');
                    overrideStyle.setAttribute('data-export-override', '1');
                    overrideStyle.textContent = rootSolid + (isFileProtocol ? '* { background-image: none !important; }' : '') + containerBg + textVisible + exportFonts;
                    head.appendChild(overrideStyle);
                    var clonedContainer = clonedDoc.querySelector('.tb-card-view');
                    if (clonedContainer) {
                        clonedContainer.classList.add('tb-export-mode');
                        var exportModeStyle = clonedDoc.createElement('style');
                        exportModeStyle.setAttribute('data-export-mode', '1');
                        exportModeStyle.textContent = '.tb-export-mode { min-height: 0 !important; height: auto !important; max-height: none !important; padding-bottom: 0 !important; }\n.tb-export-mode .tb-export-record,\n.tb-export-mode .tb-record-list { min-height: 0 !important; height: auto !important; max-height: none !important; flex: none !important; flex-grow: 0 !important; padding-bottom: 0 !important; }\n.tb-export-mode, .tb-export-mode * { filter: none !important; backdrop-filter: none !important; -webkit-backdrop-filter: none !important; mix-blend-mode: normal !important; mask: none !important; -webkit-mask: none !important; background-blend-mode: normal !important; transform: none !important; }\n.tb-export-mode .tb-record::before, .tb-export-mode .tb-record::after, .tb-export-mode .tb-export-record::before, .tb-export-mode .tb-export-record::after, .tb-export-mode .tb-divider::before, .tb-export-mode .tb-divider::after, .tb-export-mode .tb-btn::after, .tb-export-mode .tb-empty::before, .tb-export-mode .tb-pin-btn::before, .tb-export-mode .tb-thumb::before { display: none !important; content: none !important; }\n.tb-export-mode { background-image: ' + exportBgUrlCss + ' !important; background-size: cover !important; background-position: center !important; background-repeat: no-repeat !important; }';
                        head.appendChild(exportModeStyle);
                        clonedContainer.style.backgroundImage = exportBgUrl.indexOf('data:') === 0 ? ('url("' + exportBgUrl.replace(/"/g, '\\"') + '")') : ('url(' + exportBgUrl + ')');
                        clonedContainer.style.backgroundSize = 'cover';
                        clonedContainer.style.backgroundPosition = 'center';
                        clonedContainer.style.backgroundRepeat = 'no-repeat';
                        if (isFileProtocol) {
                            clonedContainer.querySelectorAll('*').forEach(function (el) { el.style.backgroundImage = 'none'; });
                        } else {
                            clonedContainer.querySelectorAll('.tb-record, .tb-export-record').forEach(function (el) { el.style.backgroundImage = 'none'; });
                        }
                        clonedContainer.style.width = exportWidth + 'px';
                        clonedContainer.style.maxWidth = exportWidth + 'px';
                        clonedContainer.style.minWidth = exportWidth + 'px';
                        clonedContainer.style.height = naturalH + 'px';
                        clonedContainer.style.minHeight = naturalH + 'px';
                        clonedContainer.style.boxSizing = 'border-box';
                        var allImgs = clonedContainer.querySelectorAll('img.todayboard-img');
                        var maxWidthPx = Math.floor(exportWidth * 0.7);
                        allImgs.forEach(function (img) {
                            img.style.maxWidth = maxWidthPx + 'px';
                            img.style.width = 'auto';
                            img.style.height = 'auto';
                            img.style.maxHeight = '300px';
                            img.style.objectFit = 'contain';
                            img.style.display = 'inline-block';
                            img.style.verticalAlign = 'middle';
                            img.style.borderRadius = '8px';
                            img.style.margin = '0';
                            img.style.border = '1px dashed rgba(255,255,255,0.35)';
                        });
                        
                        var imgWrappers = clonedContainer.querySelectorAll('.tb-img-wrapper');
                        imgWrappers.forEach(function (wrap) {
                            wrap.style.display = 'block';
                            wrap.style.width = '100%';
                            wrap.style.margin = '8px 0 12px 0';
                        });
                        
                        var dividers = clonedContainer.querySelectorAll('.tb-divider');
                        dividers.forEach(function (divider) {
                            divider.style.display = 'block';
                            divider.style.visibility = 'visible';
                            divider.style.opacity = '1';
                            divider.style.borderTop = '1px dashed rgba(255,255,255,0.35)';
                            divider.style.borderBottom = 'none';
                            divider.style.height = '0';
                            divider.style.marginTop = '12px';
                            divider.style.marginBottom = '0';
                            divider.style.width = '100%';
                            divider.style.background = 'none';
                            divider.style.backgroundImage = 'none';
                        });
                        var cloneRootBg = clonedDoc.defaultView ? clonedDoc.defaultView.getComputedStyle(clonedContainer).backgroundImage : '';
                        console.log('[TB-VERIFY] cloneRoot bg =', cloneRootBg);
                        if (!cloneRootBg || cloneRootBg.indexOf('data:image/') === -1) { console.log('[TB-FAIL] cloneRoot bg is not data url'); }
                        var verifyPxW = Math.round(exportWidth * scale);
                        var verifyPxH = Math.round(naturalH * scale);
                        console.log('[TB-VERIFY] scale=', scale, 'pxW=', verifyPxW, 'pxH=', verifyPxH);
                        if (verifyPxW > 8000 || verifyPxH > 8000) { console.log('[TB-FAIL] canvas too large'); }
                        try { dumpExportComputedStyles(clonedContainer, 'clone', clonedDoc.defaultView); } catch (e) { console.warn('[TB-Export-Dump] clone', e); }
                    }
                    };
                })(naturalHeightCss)
            });

            // 若已记录 footer 位置，则在 canvas 层按 footer+24px 精准裁高，去掉多余黑板留白
            var exportedCanvas = canvas;
            try {
                if (exportCropMetrics && typeof cropCanvasByFooter === 'function') {
                    exportedCanvas = cropCanvasByFooter(canvas, exportCropMetrics) || canvas;
                }
            } catch (e) {
                console.warn('[TB-Export-Crop] cropCanvasByFooter failed, use original canvas', e);
                exportedCanvas = canvas;
            }

            console.log('[TB-RESULT] finalCanvas=' + exportedCanvas.width + ' x ' + exportedCanvas.height);
            // 注意：此分支已不再走正常流程，仅保留作为兼容备用逻辑，避免与前面的 dataUrl 重复声明
            var legacyDataUrl;
            try {
                legacyDataUrl = exportedCanvas.toDataURL('image/png');
            } catch (e) {
                if (e.name === 'SecurityError' || (e.message && e.message.includes('tainted'))) {
                    throw new Error('导出失败：图片包含跨域内容，请确保所有图片来自本应用');
                }
                throw e;
            }
            const legacyFilename = generateTBFileName('png');
            showCardPreview(legacyDataUrl, legacyFilename, { width: exportedCanvas.width, height: exportedCanvas.height });
            exportContainer.classList.add('visually-hidden');
            exportContainer.classList.remove('export-mode');
            exportContainer.classList.remove('is-exporting');
            exportContainer.classList.remove('tb-export-natural-height');
            exportContainer.style.width = '';
            exportContainer.style.maxWidth = '';
        } catch (err) {
            console.error(err);
            alert(err && err.message ? err.message : '导出失败，请稍后重试');
            exportContainer.classList.remove('is-exporting');
            exportContainer.classList.remove('tb-export-natural-height');
        }
    }

    /* ---------- 编辑模式（二级界面） ---------- */
    let editingIndex = null; // null=新增；数字=修改
    let editingImages = [];
    let editingImageNames = [];
    // 记录编辑区“最后一次非空”的快照，用于取消删除时恢复
    let editorLastNonEmpty = { text: '', html: '', images: [], imageNames: [] };
    let editorDirty = false; // 编辑器内容是否已修改（dirty状态）
    let isComposing = false; // P0修复：IME输入状态标记
    let compositionEndHandled = false; // P0修复：标记compositionend是否已处理，避免重复记录历史
    // isStyleEditMode 已在顶部定义，此处移除重复声明
    let isMouseDown = false; // 跟踪鼠标是否按下（用于区分单击和拖选）

    // —— contenteditable 适配 ——
    function editorIsCE() {
        return !!(els.editorText && els.editorText.getAttribute('contenteditable') === 'true');
    }
    
    // —— 编辑器dirty状态管理 ——
    function markEditorDirty() {
        editorDirty = true;
    }
    
    function hasEditorChanges() {
        if (!editorDirty) return false;
        // 检查内容是否有实际变化
        const currentText = editorIsCE() ? (els.editorText.innerText || '').trim() : (els.editorText.value || '').trim();
        const currentHtml = editorIsCE() ? (getEditorHTML() || '') : '';
        const currentImages = Array.isArray(editingImages) ? editingImages.slice() : [];
        
        const lastText = editorLastNonEmpty.text || '';
        const lastHtml = editorLastNonEmpty.html || '';
        const lastImages = Array.isArray(editorLastNonEmpty.images) ? editorLastNonEmpty.images.slice() : [];
        
        // 比较文本内容
        if (currentText !== lastText) return true;
        // 比较HTML内容（用于富文本）
        if (currentHtml !== lastHtml) return true;
        // 比较图片数组
        if (currentImages.length !== lastImages.length) return true;
        for (let i = 0; i < currentImages.length; i++) {
            if (currentImages[i] !== lastImages[i]) return true;
        }
        return false;
    }
    function getEditorPlainText() {
        if (!els.editorText) return '';
        return (editorIsCE() ? (els.editorText.innerText || '') : (els.editorText.value || ''));
    }
    function setEditorPlainText(text) {
        if (!els.editorText) return;
        if (editorIsCE()) {
            els.editorText.textContent = text || '';
        } else {
            els.editorText.value = text || '';
        }
    }

    // 在光标位置插入图片（仅编辑器 contenteditable 模式）
    // v1规范：插入图片到编辑器（使用系统源图）
    function insertNoteImageAtCursor(sourceImage, imageName, displayWidth, displayHeight, aspect) {
        if (!els.editorText || !editorIsCE()) return;
        const img = document.createElement('img');
        img.src = sourceImage; // v1规范：统一使用系统源图
        img.alt = imageName || '';
        img.className = 'todayboard-img';
        if (aspect) img.setAttribute('data-aspect', String(aspect));

        const removeBtn = document.createElement('span');
        removeBtn.className = 'tb-inline-image-remove';
        removeBtn.textContent = '✕';
        removeBtn.title = '删除图片';
        removeBtn.setAttribute('contenteditable', 'false');
        removeBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const idx = editingImages.indexOf(sourceImage);
            if (idx > -1) {
                editingImages.splice(idx, 1);
                editingImageNames.splice(idx, 1);
                updateEditorSubmitState();
                updateEditorSubmitState();
            }
            const wrap = e.target.closest('.tb-img-wrapper');
            if (wrap) {
                // P0修复：删除图片后，将光标定位到图片后的可编辑段落中
                const nextSibling = wrap.nextSibling;
                wrap.remove();
                
                // 尝试将光标定位到图片后的段落中
                setTimeout(() => {
                    const sel = window.getSelection();
                    if (sel && sel.rangeCount === 0) {
                        // 如果没有选择，尝试定位到下一个可编辑位置
                        if (nextSibling && nextSibling.nodeType === 1) {
                            // 如果下一个节点是div段落，定位到其中
                            const range = document.createRange();
                            const brInPara = nextSibling.querySelector('br');
                            if (brInPara) {
                                range.setStartAfter(brInPara);
                                range.setEndAfter(brInPara);
                            } else {
                                range.setStart(nextSibling, 0);
                                range.setEnd(nextSibling, 0);
                            }
                            sel.removeAllRanges();
                            sel.addRange(range);
                            els.editorText.focus();
                        } else {
                            // 否则定位到编辑器末尾
                            placeCaretAtEnd(els.editorText);
                        }
                    }
                }, 0);
            }
            // P0-1修复：删除图片后同步images数组并推入撤销栈
            syncEditingImagesFromDOM();
            pushEditorHistory();
            // 删除图片后更新dirty状态
            markEditorDirty();
        });

        // P0修复：使用div作为wrapper，确保块级显示
        const wrap = document.createElement('div');
        wrap.className = 'tb-img-wrapper';
        wrap.setAttribute('contenteditable', 'false');
        wrap.appendChild(img);
        wrap.appendChild(removeBtn);

        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
            const range = sel.getRangeAt(0);
            try {
                // P0修复：确保图片独占一行，前后都有段落分隔
                // 检查当前位置是否在行首（前面是否有文本节点）
                const startContainer = range.startContainer;
                const startOffset = range.startOffset;
                let needsLeadingPara = false;
                
                // 如果当前不在行首，需要在图片前插入段落分隔
                if (startContainer.nodeType === 3) { // 文本节点
                    const textBefore = startContainer.textContent.substring(0, startOffset);
                    if (textBefore.trim().length > 0) {
                        needsLeadingPara = true;
                    }
                } else if (startContainer.nodeType === 1) { // 元素节点
                    // 检查前面是否有非空文本节点或非空段落
                    const prevSibling = startContainer.previousSibling;
                    if (prevSibling) {
                        if (prevSibling.nodeType === 3) {
                            needsLeadingPara = true;
                        } else if (prevSibling.nodeType === 1) {
                            const prevText = prevSibling.textContent || '';
                            if (prevText.trim().length > 0 && !prevSibling.classList.contains('tb-img-wrapper')) {
                                needsLeadingPara = true;
                            }
                        }
                    }
                }
                
                // 在图片前插入段落分隔（如果需要）
                if (needsLeadingPara) {
                    const leadingPara = document.createElement('div');
                    leadingPara.appendChild(document.createElement('br'));
                    range.insertNode(leadingPara);
                    // 调整range位置到leadingPara之后
                    range.setStartAfter(leadingPara);
                    range.setEndAfter(leadingPara);
                }
                
                // 插入图片块
                range.insertNode(wrap);
                
                // P0修复：在图片后插入空段落，并定位光标到空段落起始位置
                const trailingPara = document.createElement('div');
                trailingPara.appendChild(document.createElement('br'));
                range.setStartAfter(wrap);
                range.setEndAfter(wrap);
                range.insertNode(trailingPara);
                // 将光标定位到空段落内的br之后
                const brInPara = trailingPara.querySelector('br');
                if (brInPara) {
                    range.setStartAfter(brInPara);
                    range.setEndAfter(brInPara);
                } else {
                    range.setStart(trailingPara, 0);
                    range.setEnd(trailingPara, 0);
                }
                sel.removeAllRanges();
                sel.addRange(range);
            } catch (e) {
                console.warn('图片插入失败，使用fallback方案:', e);
                // 如果插入失败，在末尾添加图片和空段落
                els.editorText.appendChild(wrap);
                const trailingPara = document.createElement('div');
                trailingPara.appendChild(document.createElement('br'));
                els.editorText.appendChild(trailingPara);
                // 定位光标到空段落
                const range = document.createRange();
                const brInPara = trailingPara.querySelector('br');
                if (brInPara) {
                    range.setStartAfter(brInPara);
                    range.setEndAfter(brInPara);
                } else {
                    range.setStart(trailingPara, 0);
                    range.setEnd(trailingPara, 0);
                }
                const sel = window.getSelection();
                sel.removeAllRanges();
                sel.addRange(range);
            }
        } else {
            // 如果没有选择，在末尾添加图片和空段落
            els.editorText.appendChild(wrap);
            const trailingPara = document.createElement('div');
            trailingPara.appendChild(document.createElement('br'));
            els.editorText.appendChild(trailingPara);
            // 定位光标到空段落
            const range = document.createRange();
            const brInPara = trailingPara.querySelector('br');
            if (brInPara) {
                range.setStartAfter(brInPara);
                range.setEndAfter(brInPara);
            } else {
                range.setStart(trailingPara, 0);
                range.setEnd(trailingPara, 0);
            }
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
        }
        // P0-1修复：插入图片后同步images数组并推入撤销栈
        syncEditingImagesFromDOM();
        pushEditorHistory();
        // 插入图片后更新dirty状态
        markEditorDirty();
    }

    function selectionIntersectsInlineImage() {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return false;
        const range = sel.getRangeAt(0);
        const nodes = els.editorText ? els.editorText.querySelectorAll('.tb-img-wrapper') : [];
        for (const n of nodes) {
            try { if (range.intersectsNode(n)) return true; } catch {}
        }
        return false;
    }
    let editorLastRange = null;
    function captureEditorSelection() {
        try {
            const sel = window.getSelection();
            if (sel && sel.rangeCount > 0) {
                const r = sel.getRangeAt(0);
                if (els.editorText && els.editorText.contains(r.commonAncestorContainer)) {
                    editorLastRange = r.cloneRange();
                }
            }
        } catch {}
    }
    function restoreEditorSelection() {
        try {
            if (editorLastRange) {
                const sel = window.getSelection();
                sel.removeAllRanges();
                sel.addRange(editorLastRange);
            }
        } catch {}
    }

    // 原图预览弹窗（编辑器）
    function openImageModal(originalSrc) {
        const existing = document.getElementById('tbImagePreviewOverlay');
        if (existing) existing.remove();
        const overlay = document.createElement('div');
        overlay.id = 'tbImagePreviewOverlay';
        overlay.className = 'tb-preview-overlay is-open';
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
        const modal = document.createElement('div');
        modal.className = 'tb-preview-dialog';
        const img = document.createElement('img');
        img.className = 'tb-preview-image';
        img.src = originalSrc;
        img.alt = '';
        const actions = document.createElement('div');
        actions.className = 'tb-preview-actions';
        const btnDownload = document.createElement('button');
        btnDownload.className = 'tb-btn tb-secondary';
        btnDownload.textContent = '下载原图';
        btnDownload.addEventListener('click', () => {
            const a = document.createElement('a');
            a.href = originalSrc; a.download = generateTBFileName('png'); a.click();
        });
        const btnClose = document.createElement('button');
        btnClose.className = 'tb-btn';
        btnClose.textContent = '关闭';
        btnClose.addEventListener('click', () => overlay.remove());
        actions.appendChild(btnDownload);
        actions.appendChild(btnClose);
        modal.appendChild(img);
        modal.appendChild(actions);
        overlay.appendChild(modal);
        document.body.appendChild(overlay);
    }
    // 读取/设置编辑器 HTML（仅在 contenteditable 模式下使用）
    function getEditorHTML() {
        if (!els.editorText) return '';
        return editorIsCE() ? (els.editorText.innerHTML || '') : (els.editorText.value || '');
    }
function setEditorHTML(html) {
        if (!els.editorText) return;
        if (editorIsCE()) {
            els.editorText.innerHTML = html || '';
            // P0修复：normalize历史数据，修复图文同行问题
            normalizeEditorImages();
            // P0修复：normalize历史数据，修复任务行问题（竖体显示）
            normalizeTaskLines();
        } else {
            // 非 CE 环境，回退为纯文本
            const div = document.createElement('div');
            div.innerHTML = html || '';
            setEditorPlainText(div.textContent || '');
        }
}
    
    // P0修复：normalize编辑器中的图片，确保图片独占一行
    function normalizeEditorImages() {
        if (!els.editorText || !editorIsCE()) return;
        
        // 查找所有图片（可能没有wrapper或wrapper不是div）
        const allImgs = Array.from(els.editorText.querySelectorAll('img.todayboard-img'));
        
        allImgs.forEach(img => {
            let wrap = img.closest('.tb-img-wrapper');
            
            // 如果图片没有wrapper，或者wrapper不是div，需要修复
            if (!wrap || wrap.tagName !== 'DIV') {
                // 创建新的div wrapper
                const newWrap = document.createElement('div');
                newWrap.className = 'tb-img-wrapper';
                newWrap.setAttribute('contenteditable', 'false');
                
                // 如果有旧的wrapper，先移除图片
                if (wrap) {
                    const parent = wrap.parentNode;
                    parent.insertBefore(newWrap, wrap);
                    wrap.remove();
                } else {
                    // 如果没有wrapper，在图片位置插入新wrapper
                    const parent = img.parentNode;
                    parent.insertBefore(newWrap, img);
                }
                
                // 移动图片到新wrapper
                newWrap.appendChild(img);
                
                // 添加删除按钮（如果不存在）
                let removeBtn = newWrap.querySelector('.tb-inline-image-remove');
                if (!removeBtn) {
                    removeBtn = document.createElement('span');
                    removeBtn.className = 'tb-inline-image-remove';
                    removeBtn.textContent = '✕';
                    removeBtn.title = '删除图片';
                    removeBtn.setAttribute('contenteditable', 'false');
                    newWrap.appendChild(removeBtn);
                }
                
                wrap = newWrap;
            }
            
            // 检查图片后是否有文本节点或inline元素（图文同行问题）
            const nextSibling = wrap.nextSibling;
            if (nextSibling) {
                if (nextSibling.nodeType === 3) {
                    // 文本节点：需要移到下一行
                    const textContent = nextSibling.textContent;
                    if (textContent.trim().length > 0) {
                        // 创建新段落包裹文本
                        const newPara = document.createElement('div');
                        newPara.textContent = textContent;
                        wrap.parentNode.insertBefore(newPara, nextSibling);
                        nextSibling.remove();
                    }
                } else if (nextSibling.nodeType === 1) {
                    // 元素节点：检查是否是inline元素
                    const computedStyle = window.getComputedStyle(nextSibling);
                    const display = computedStyle.display;
                    if (display === 'inline' || display === 'inline-block') {
                        // inline元素：需要移到下一行
                        const newPara = document.createElement('div');
                        newPara.appendChild(nextSibling.cloneNode(true));
                        wrap.parentNode.insertBefore(newPara, nextSibling);
                        nextSibling.remove();
                    }
                }
            }
            
            // 确保图片后有段落分隔
            const afterWrap = wrap.nextSibling;
            if (!afterWrap || (afterWrap.nodeType === 1 && afterWrap.tagName !== 'DIV')) {
                const trailingPara = document.createElement('div');
                trailingPara.appendChild(document.createElement('br'));
                wrap.parentNode.insertBefore(trailingPara, afterWrap);
            }
        });
}

    function sanitizeEditorHTML(html) {
        if (!html || typeof html !== 'string') return '';
        const container = document.createElement('div');
        container.innerHTML = html;
        container.querySelectorAll('.tb-inline-image-remove').forEach(el => el.remove());
        container.querySelectorAll('.tb-img-wrapper, .tb-inline-image-wrapper').forEach(wrap => {
            wrap.removeAttribute('contenteditable');
        });
        // 删除与图片相邻的 <br> 与纯空白文本节点，避免大间距
        Array.from(container.querySelectorAll('br')).forEach(br => {
            const prev = br.previousSibling;
            const next = br.nextSibling;
            const nearImg = (prev && prev.nodeType === 1 && (prev.classList.contains('tb-img-wrapper') || prev.tagName === 'IMG')) ||
                            (next && next.nodeType === 1 && (next.classList.contains('tb-img-wrapper') || next.tagName === 'IMG'));
            if (nearImg) br.remove();
        });
        const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);
        const blanks = [];
        while (walker.nextNode()) {
            const t = walker.currentNode;
            if ((t.textContent || '').trim() === '') {
                const prev = t.previousSibling;
                const next = t.nextSibling;
                const nearImg = (prev && prev.nodeType === 1 && (prev.classList && prev.classList.contains('tb-img-wrapper') || prev.tagName === 'IMG')) ||
                                (next && next.nodeType === 1 && (next.classList && next.classList.contains('tb-img-wrapper') || next.tagName === 'IMG'));
                if (nearImg) blanks.push(t);
            }
        }
        blanks.forEach(n => n.parentNode && n.parentNode.removeChild(n));
        return container.innerHTML;
    }
    // 是否存在“有意义”的编辑内容（考虑勾选行占位）
    function hasMeaningfulEditorContent() {
        if (!els.editorText) return false;
        if (editorIsCE()) {
            const text = (els.editorText.innerText || '').replace(/\u00A0/g, '').trim();
            const hasLines = !!els.editorText.querySelector('.tb-check-line');
            return text.length > 0 || hasLines;
        }
        return ((els.editorText.value || '').trim().length > 0);
    }
    function placeCaretAtEnd(el) {
        try {
            el.focus();
            const sel = window.getSelection();
            const range = document.createRange();
            if (editorIsCE()) {
                range.selectNodeContents(el);
                range.collapse(false);
                sel.removeAllRanges();
                sel.addRange(range);
            } else {
                const len = el.value.length;
                el.setSelectionRange(len, len);
            }
        } catch {}
    }

    function updateEditorSubmitState() {
        const hasText = hasMeaningfulEditorContent();
        const hasImages = Array.isArray(editingImages) && editingImages.length > 0;
        const enabled = hasText || hasImages;
        if (els.editorSubmitBtn) {
            try { els.editorSubmitBtn.disabled = !enabled; } catch {}
            if (enabled) {
                els.editorSubmitBtn.classList.remove('is-disabled');
            } else {
                els.editorSubmitBtn.classList.add('is-disabled');
            }
        }
        // 维护“最后一次非空状态”
        if (enabled) {
            editorLastNonEmpty = {
                text: getEditorPlainText(),
                html: getEditorHTML(),
                images: Array.isArray(editingImages) ? editingImages.slice() : [],
                imageNames: Array.isArray(editingImageNames) ? editingImageNames.slice() : [],
            };
        }
    }
    // —— 勾选项工具函数 ——
    function getLineRange(text, pos) {
        let start = pos;
        let end = pos;
        while (start > 0 && text[start - 1] !== '\n') start--;
        while (end < text.length && text[end] !== '\n') end++;
        return { start, end };
    }
    function isChecklistLine(line) {
        return /^\s*[☐☑]\s/.test(line);
    }
    // v1规范：任务框 - 独立可点击元素
    function createChecklistLine(initialText) {
        const line = document.createElement('div');
        line.className = 'tb-check-line';
        line.setAttribute('data-state', 'unchecked');
        
        // v1规范：checkbox必须是独立可点击元素
        const checkbox = document.createElement('span');
        checkbox.className = 'tb-check';
        checkbox.setAttribute('role', 'checkbox');
        checkbox.setAttribute('aria-checked', 'false');
        checkbox.setAttribute('aria-label', '任务完成状态');
        checkbox.setAttribute('tabindex', '0');
        checkbox.textContent = '☐';
        
        const text = document.createElement('span');
        text.className = 'tb-check-text';
        text.setAttribute('contenteditable', 'true');
        text.textContent = (initialText && initialText.length ? initialText : '\u00A0');
        
        line.appendChild(checkbox);
        line.appendChild(text);
        return line;
    }
    
    // v1规范：任务框toggle函数（只toggle当前行的data-state）
    function toggleChecklistItem(line) {
        if (!line || !line.classList.contains('tb-check-line')) return;
        const checkbox = line.querySelector('.tb-check');
        if (!checkbox) return;
        
        const currentState = line.getAttribute('data-state');
        const isCompleted = currentState === 'checked';
        
        // v1规范：只toggle当前行的data-state，不重建DOM
        const newState = isCompleted ? 'unchecked' : 'checked';
        line.setAttribute('data-state', newState);
        checkbox.setAttribute('aria-checked', newState === 'checked' ? 'true' : 'false');
        checkbox.textContent = isCompleted ? '☐' : '☑';
        line.classList.toggle('tb-checked', !isCompleted);
        
        pushEditorHistory();
        updateEditorSubmitState();
    }
    
    // P0修复：首页轻编辑 - 切换任务状态并保存
    function toggleBoardChecklistItem(taskLine, recordIdx) {
        if (!taskLine || !taskLine.classList.contains('tb-check-line')) return;
        const checkbox = taskLine.querySelector('.tb-check');
        if (!checkbox) return;
        
        const currentState = taskLine.getAttribute('data-state');
        const isCompleted = currentState === 'checked';
        
        // 切换状态
        const newState = isCompleted ? 'unchecked' : 'checked';
        taskLine.setAttribute('data-state', newState);
        checkbox.setAttribute('aria-checked', newState === 'checked' ? 'true' : 'false');
        checkbox.textContent = isCompleted ? '☐' : '☑';
        taskLine.classList.toggle('tb-checked', !isCompleted);
        
        // 保存到数据层
        const list = loadRecords();
        if (recordIdx >= 0 && recordIdx < list.length) {
            const rec = list[recordIdx];
            // 更新 HTML 中的任务状态
            if (rec.textHtml && rec.textHtml.trim().length > 0) {
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = rec.textHtml;
                // 查找对应的任务行（通过文本内容匹配）
                const htmlTaskLines = Array.from(tempDiv.querySelectorAll('.tb-check-line'));
                const htmlTaskLine = htmlTaskLines.find(line => {
                    const textEl = line.querySelector('.tb-check-text');
                    const taskTextEl = taskLine.querySelector('.tb-check-text');
                    return textEl && taskTextEl && textEl.textContent.trim() === taskTextEl.textContent.trim();
                });
                
                if (htmlTaskLine) {
                    htmlTaskLine.setAttribute('data-state', newState);
                    const htmlCheckbox = htmlTaskLine.querySelector('.tb-check');
                    if (htmlCheckbox) {
                        htmlCheckbox.setAttribute('aria-checked', newState === 'checked' ? 'true' : 'false');
                        htmlCheckbox.textContent = isCompleted ? '☐' : '☑';
                    }
                    rec.textHtml = tempDiv.innerHTML;
                    saveRecords(list);
                }
            }
        }
    }
    
    // P0修复：首页轻编辑 - 将文本行转换为任务行
    function convertTextLineToTaskLine(textLine, recordIdx) {
        if (!textLine) return;
        
        const textContent = textLine.textContent || textLine.innerText || '';
        if (textContent.trim().length === 0) return;
        
        // 创建任务行
        const taskLine = createChecklistLine(textContent.trim());
        
        // 替换文本行
        const parent = textLine.parentNode;
        if (parent) {
            parent.replaceChild(taskLine, textLine);
            
            // 保存到数据层
            const list = loadRecords();
            if (recordIdx >= 0 && recordIdx < list.length) {
                const rec = list[recordIdx];
                if (rec.textHtml && rec.textHtml.trim().length > 0) {
                    const tempDiv = document.createElement('div');
                    tempDiv.innerHTML = rec.textHtml;
                    
                    // 查找对应的文本行并替换
                    const htmlTextLine = Array.from(tempDiv.querySelectorAll('div')).find(div => {
                        return div.textContent.trim() === textContent.trim() && 
                               !div.classList.contains('tb-check-line') &&
                               !div.classList.contains('tb-img-wrapper');
                    });
                    
                    if (htmlTextLine) {
                        const htmlTaskLine = createChecklistLine(textContent.trim());
                        htmlTextLine.parentNode.replaceChild(htmlTaskLine, htmlTextLine);
                        rec.textHtml = tempDiv.innerHTML;
                        saveRecords(list);
                        
                        // 重新渲染以更新 UI
                        renderRecords();
                    }
                } else if (rec.text && rec.text.trim() === textContent.trim()) {
                    // 纯文本记录，转换为任务行
                    const htmlTaskLine = createChecklistLine(textContent.trim());
                    rec.textHtml = htmlTaskLine.outerHTML;
                    rec.text = ''; // 清空纯文本，使用 HTML
                    saveRecords(list);
                    
                    // 重新渲染以更新 UI
                    renderRecords();
                }
            }
        }
    }
    
    // P0修复：将任务行转换为普通文本行（整行结构替换，彻底修复竖排）
    function convertTaskLineToTextLine(taskLine) {
        if (!taskLine || !taskLine.classList.contains('tb-check-line')) return null;
        
        const textEl = taskLine.querySelector('.tb-check-text');
        if (!textEl) return null;
        
        // 获取当前光标位置（在替换前保存）
        const sel = window.getSelection();
        let savedRange = null;
        let cursorOffset = 0;
        let wasInTaskLine = false;
        
        if (sel && sel.rangeCount > 0) {
            const range = sel.getRangeAt(0);
            // 检查光标是否在 taskLine 内
            if (taskLine.contains(range.startContainer) || taskLine.contains(range.commonAncestorContainer)) {
                wasInTaskLine = true;
                // 计算光标在文本中的相对位置
                const textContent = textEl.textContent || '';
                if (range.collapsed) {
                    // 光标模式：计算在文本中的偏移
                    const rangeClone = range.cloneRange();
                    rangeClone.setStart(textEl, 0);
                    rangeClone.setEnd(range.startContainer, range.startOffset);
                    cursorOffset = rangeClone.toString().length;
                } else {
                    // 选中模式：使用选区开始位置
                    const rangeClone = range.cloneRange();
                    rangeClone.setStart(textEl, 0);
                    rangeClone.setEnd(range.startContainer, range.startOffset);
                    cursorOffset = rangeClone.toString().length;
                }
                savedRange = range.cloneRange();
            }
        }
        
        // 获取文本内容（保留格式）
        const textContent = textEl.textContent || textEl.innerText || '';
        const textHtml = textEl.innerHTML || '';
        
        // 创建普通文本行（div），确保是块级元素，完全移除任务行结构
        const textLine = document.createElement('div');
        textLine.setAttribute('contenteditable', 'true');
        // 彻底移除所有任务行相关的类和属性，确保不会继承任务行样式（修复竖排）
        textLine.className = '';
        textLine.removeAttribute('data-state');
        textLine.removeAttribute('data-type');
        textLine.removeAttribute('role');
        
        // 如果文本为空，添加一个br
        if (textContent.trim().length === 0) {
            textLine.appendChild(document.createElement('br'));
        } else {
            // 保留文本内容（包括格式），确保所有文本节点都迁移到新行
            textLine.innerHTML = textHtml || textContent;
        }
        
        // 整行替换：用普通文本行替换整个任务行容器
        const parent = taskLine.parentNode;
        if (parent) {
            parent.replaceChild(textLine, taskLine);
            
            // 定位光标：如果之前在任务行内，尽量保持相对位置
            setTimeout(() => {
                try {
                    const range = document.createRange();
                    const sel = window.getSelection();
                    
                    if (wasInTaskLine && cursorOffset >= 0) {
                        // 尝试恢复到相对位置
                        let targetNode = textLine;
                        let targetOffset = 0;
                        
                        // 查找文本节点并定位光标
                        const walker = document.createTreeWalker(
                            textLine,
                            NodeFilter.SHOW_TEXT,
                            null,
                            false
                        );
                        
                        let currentOffset = 0;
                        let found = false;
                        let node = walker.nextNode();
                        
                        while (node && !found) {
                            const nodeLength = node.textContent.length;
                            if (currentOffset + nodeLength >= cursorOffset) {
                                targetNode = node;
                                targetOffset = cursorOffset - currentOffset;
                                found = true;
                            } else {
                                currentOffset += nodeLength;
                                node = walker.nextNode();
                            }
                        }
                        
                        if (found) {
                            range.setStart(targetNode, Math.min(targetOffset, targetNode.textContent.length));
                            range.setEnd(targetNode, Math.min(targetOffset, targetNode.textContent.length));
                        } else {
                            // 如果找不到，放到行尾
                            if (textLine.lastChild && textLine.lastChild.nodeType === 3) {
                                const lastText = textLine.lastChild;
                                range.setStart(lastText, lastText.textContent.length);
                                range.setEnd(lastText, lastText.textContent.length);
                            } else {
                                range.setStart(textLine, textLine.childNodes.length);
                                range.setEnd(textLine, textLine.childNodes.length);
                            }
                        }
                    } else {
                        // 如果光标不在任务行内，放到新文本行的开头
                        if (textLine.firstChild) {
                            if (textLine.firstChild.nodeType === 3) {
                                range.setStart(textLine.firstChild, 0);
                                range.setEnd(textLine.firstChild, 0);
                            } else {
                                range.setStart(textLine, 0);
                                range.setEnd(textLine, 0);
                            }
                        } else {
                            range.setStart(textLine, 0);
                            range.setEnd(textLine, 0);
                        }
                    }
                    
                    sel.removeAllRanges();
                    sel.addRange(range);
                    els.editorText.focus();
                } catch (e) {
                    console.warn('光标定位失败:', e);
                    // 失败时至少确保焦点在编辑器
                    try {
                        els.editorText.focus();
                    } catch {}
                }
            }, 0);
        }
        
        return textLine;
    }
    
    // P0修复：normalize旧数据中的任务行问题（修复竖体显示，处理所有边界情况）
    function normalizeTaskLines() {
        if (!els.editorText || !editorIsCE()) return;
        
        // 查找所有任务行
        const taskLines = Array.from(els.editorText.querySelectorAll('.tb-check-line'));
        
        taskLines.forEach(taskLine => {
            const checkbox = taskLine.querySelector('.tb-check');
            const textEl = taskLine.querySelector('.tb-check-text');
            
            // 情况1：任务行没有checkbox，说明是旧数据，需要转换为普通文本行
            if (!checkbox && textEl) {
                const textLine = convertTaskLineToTextLine(taskLine);
                if (textLine) {
                    console.log('Normalized task line without checkbox');
                }
            }
            // 情况2：任务行没有文本元素，但还有checkbox，也需要修复
            else if (checkbox && !textEl) {
                // 创建文本元素
                const newTextEl = document.createElement('span');
                newTextEl.className = 'tb-check-text';
                newTextEl.setAttribute('contenteditable', 'true');
                newTextEl.appendChild(document.createElement('br'));
                taskLine.appendChild(newTextEl);
            }
            // 情况3：任务行后面紧贴文本节点/inline元素（会造成同行挤压或竖排）
            else if (checkbox && textEl) {
                // 检查 taskLine 后面是否有紧贴的文本节点或 inline 元素
                const nextSibling = taskLine.nextSibling;
                if (nextSibling) {
                    // 如果是文本节点或 inline 元素，需要拆到下一段
                    if (nextSibling.nodeType === 3 || 
                        (nextSibling.nodeType === 1 && 
                         (nextSibling.tagName === 'SPAN' || 
                          nextSibling.tagName === 'A' || 
                          nextSibling.tagName === 'STRONG' || 
                          nextSibling.tagName === 'EM' || 
                          nextSibling.tagName === 'U' ||
                          (!nextSibling.classList.contains('tb-check-line') && 
                           !nextSibling.classList.contains('tb-img-wrapper'))))) {
                        // 创建新的段落来容纳这些内容
                        const newPara = document.createElement('div');
                        newPara.setAttribute('contenteditable', 'true');
                        if (nextSibling.nodeType === 3) {
                            newPara.appendChild(nextSibling.cloneNode(true));
                            nextSibling.remove();
                        } else {
                            newPara.appendChild(nextSibling);
                        }
                        taskLine.parentNode.insertBefore(newPara, taskLine.nextSibling);
                        console.log('Normalized task line with trailing inline content');
                    }
                }
            }
        });
        
        // 额外检查：查找所有残留的 .tb-check-line 类但结构不完整的元素
        const allCheckLines = Array.from(els.editorText.querySelectorAll('.tb-check-line'));
        allCheckLines.forEach(line => {
            const checkbox = line.querySelector('.tb-check');
            const textEl = line.querySelector('.tb-check-text');
            // 如果既没有 checkbox 也没有 textEl，说明结构完全损坏，转换为普通文本行
            if (!checkbox && !textEl) {
                const textLine = document.createElement('div');
                textLine.setAttribute('contenteditable', 'true');
                textLine.innerHTML = line.innerHTML || '<br>';
                line.parentNode.replaceChild(textLine, line);
                console.log('Normalized corrupted task line structure');
            }
        });
    }
    function insertChecklistAtCaret() {
        if (!els.editorText) return;
        if (editorIsCE()) {
            pushEditorHistory();
            const sel = window.getSelection();
            if (!sel || sel.rangeCount === 0) { 
                els.editorText.focus();
                // 如果没有选择，创建一个新的range
                const range = document.createRange();
                range.selectNodeContents(els.editorText);
                range.collapse(false); // 折叠到末尾
                sel.removeAllRanges();
                sel.addRange(range);
            }
            const range = sel && sel.rangeCount ? sel.getRangeAt(0) : null;
            if (!range) return;
            
            const line = createChecklistLine('');
            
            // 获取当前光标所在的块级元素
                let node = range.startContainer;
            if (node.nodeType === 3) node = node.parentElement;
            
            // 找到最近的块级元素（div, p等）
                let block = node;
                while (block && block.parentElement && block.parentElement !== els.editorText) {
                if (block.tagName === 'DIV' || block.tagName === 'P') break;
                    block = block.parentElement;
                }
            
            // 如果当前行有内容，需要先换行
                if (block && block !== els.editorText) {
                const blockText = block.textContent.trim();
                if (blockText.length > 0) {
                    // 当前行有内容，在下一行插入
                    block.insertAdjacentElement('afterend', line);
                } else {
                    // 当前行为空，替换当前行
                    block.replaceWith(line);
                }
            } else {
                // 没有找到块级元素，直接追加
                els.editorText.appendChild(line);
            }
            
            // 将光标定位到任务文本输入位置
            try {
                const textEl = line.querySelector('.tb-check-text');
                if (textEl) {
                    const newRange = document.createRange();
                    // 如果文本是占位符，光标放在开头；否则放在末尾
                    if (textEl.textContent === '\u00A0') {
                newRange.setStart(textEl, 0);
                newRange.setEnd(textEl, 0);
                    } else {
                        newRange.setStart(textEl, textEl.textContent.length);
                        newRange.setEnd(textEl, textEl.textContent.length);
                    }
                sel.removeAllRanges();
                sel.addRange(newRange);
                    els.editorText.focus();
                }
            } catch (e) {
                console.warn('定位光标失败', e);
            }
            updateEditorSubmitState();
            return;
        }
        // 兼容旧 textarea 逻辑
        const el = els.editorText;
        const text = el.value || '';
        const start = el.selectionStart;
        const end = el.selectionEnd;
        const range = getLineRange(text, start);
        const atLineStart = start === range.start;
        const prefix = atLineStart ? '' : '\n';
        const item = '☐ ';
        const newText = text.slice(0, start) + prefix + item + text.slice(end);
        el.value = newText;
        const caret = start + prefix.length + item.length;
        try { el.setSelectionRange(caret, caret); } catch {}
        updateEditorSubmitState();
    }
function openEditor(mode, idx) {
        // ========== 统一初始化：重置所有编辑页面 UI 状态 ==========
        // 重置dirty状态
        editorDirty = false;
        // 确保退出多选模式（关闭 action bar）
        selectedSet.clear();
        updateMultiSelectUI();
        // 确保样式栏关闭并退出样式编辑模式
        try { closeStyleBar(); } catch {}
        isStyleEditMode = false; // 确保状态重置
        // 重置样式按钮激活状态
        if (els.editorBoldBtn) els.editorBoldBtn.classList.remove('is-active');
        if (els.editorItalicBtn) els.editorItalicBtn.classList.remove('is-active');
        if (els.editorUnderlineBtn) els.editorUnderlineBtn.classList.remove('is-active');
        // 重置样式按钮的 tb-active 状态（样式栏按钮）
        if (els.editorStyleBtn) els.editorStyleBtn.classList.remove('tb-active');
        // 清空图片预览区域
        if (els.imagePreview) els.imagePreview.innerHTML = '';
        // P0修复：重置 editorStyleState（状态驱动模型）
        editorStyleState.typingStyle = {
            bold: false,
            italic: false,
            underline: false,
            fontSize: 16,
            fontColor: '#FFFFFF'
        };
        editorStyleState.selectionStyle = {
            bold: false,
            italic: false,
            underline: false,
            fontSize: 16,
            fontColor: '#FFFFFF'
        };
        // ========== 统一初始化完成 ==========
        
        const isEdit = mode === 'edit';
        const list = loadRecords();
        editingIndex = isEdit ? idx : null;
        let text = '';
        let textHtml = '';
        let styleFromRec = null;
        if (isEdit) {
            if (idx == null || idx < 0 || idx >= list.length) return;
            const rec = list[idx];
            text = rec.text || '';
            textHtml = rec.textHtml || '';
            styleFromRec = rec.textStyle || null;
            editingImages = Array.isArray(rec.images) ? rec.images.slice() : [];
            // 初始化图片文件名（老记录可能没有 imageNames）
            if (Array.isArray(rec.imageNames) && rec.imageNames.length === editingImages.length) {
                editingImageNames = rec.imageNames.slice();
            } else {
                editingImageNames = (editingImages || []).map(u => {
                    const ext = getExtFromDataUrl(u) || 'png';
                    return generateTBFileName(ext);
                });
            }
        } else {
            // 新建模式：如果主输入框有内容则带入
            text = (els.todayText && els.todayText.value) ? els.todayText.value : '';
            editingImages = [];
            editingImageNames = [];
            styleFromRec = null;
        }
        if (els.editorText) {
            try { els.editorText.setAttribute('contenteditable','true'); } catch {}
            // P0修复：监听IME输入事件，确保中文输入一次Undo撤销一个完整步骤
            els.editorText.addEventListener('compositionstart', (e) => {
                // P0修复：样式编辑模式 - 阻止IME输入
                if (isStyleEditMode) {
                    e.preventDefault();
                    e.stopPropagation();
                    return;
                }
                isComposing = true;
                compositionEndHandled = false; // 重置标记
            });
            els.editorText.addEventListener('compositionupdate', (e) => {
                // 重构 v2：Style Mode - 彻底禁止 composition 事件
                if (isStyleEditMode) {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    return;
                }
                // compositionupdate期间不记录历史
                isComposing = true;
            });
            els.editorText.addEventListener('compositionend', (e) => {
                // 重构 v2：Style Mode - 彻底禁止 composition 事件
                if (isStyleEditMode) {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    return;
                }
                isComposing = false;
                compositionEndHandled = true; // 标记compositionend已处理
                // P0修复：仅在compositionend时记录一次历史，代表"一个中文输入步骤"
                // 使用setTimeout确保在input事件之前执行
                setTimeout(() => {
                    pushEditorHistory();
                    compositionEndHandled = false; // 重置标记
                    // P0修复：中文输入完成后更新提交按钮状态
                    updateEditorSubmitState();
                }, 0);
            });
            
            els.editorText.addEventListener('beforeinput', (e) => {
                // 重构 v2：Style Mode - 彻底禁止 beforeinput 事件
                if (isStyleEditMode) {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    return;
                }
                
                const t = e.inputType || '';
                
                // P0修复：检测删除checkbox操作
                if (t.indexOf('delete') !== -1) {
                    const sel = window.getSelection();
                    if (sel && sel.rangeCount > 0) {
                        const range = sel.getRangeAt(0);
                        let targetCheckbox = null;
                        
                        if (range.collapsed) {
                            // 光标模式：检查删除目标（包括光标在 checkbox 后的情况）
                            const startContainer = range.startContainer;
                            const startOffset = range.startOffset;
                            
                            // P0修复：检查光标是否在任务行内，如果是，检查是否在 checkbox 后
                            const taskLine = startContainer.nodeType === 1 
                                ? (startContainer.classList.contains('tb-check-line') ? startContainer : startContainer.closest('.tb-check-line'))
                                : startContainer.parentElement?.closest('.tb-check-line');
                            
                            if (taskLine) {
                                const checkbox = taskLine.querySelector('.tb-check');
                                if (checkbox) {
                                    // 检查光标是否紧跟在 checkbox 后面
                                    if (t.indexOf('deleteContentBackward') !== -1) {
                                        // Backspace：检查光标前是否是 checkbox
                                        if (startContainer.nodeType === 3 && startOffset === 0) {
                                            const prevSibling = startContainer.previousSibling;
                                            if (prevSibling === checkbox) {
                                                targetCheckbox = checkbox;
                                            }
                                        } else if (startContainer.nodeType === 1) {
                                            const prevSibling = startContainer.previousSibling;
                                            if (prevSibling === checkbox) {
                                                targetCheckbox = checkbox;
                                            }
                                        }
                                        // 如果光标在 checkbox 后的文本节点开头，也触发
                                        const textEl = taskLine.querySelector('.tb-check-text');
                                        if (textEl && textEl.contains(startContainer) && startOffset === 0) {
                                            const textPrevSibling = startContainer.previousSibling;
                                            if (!textPrevSibling || textPrevSibling === checkbox) {
                                                targetCheckbox = checkbox;
                                            }
                                        }
                                    } else if (t.indexOf('deleteContentForward') !== -1) {
                                        // Delete：检查光标后是否是 checkbox
                                        if (startContainer.nodeType === 3) {
                                            const nextSibling = startContainer.nextSibling;
                                            if (nextSibling === checkbox) {
                                                targetCheckbox = checkbox;
                                            }
                                        } else if (startContainer.nodeType === 1) {
                                            const nextSibling = startContainer.nextSibling;
                                            if (nextSibling === checkbox) {
                                                targetCheckbox = checkbox;
                                            }
                                        }
                                    }
                                }
                            }
                            
                            // 原有的检测逻辑（作为兜底）
                            if (!targetCheckbox) {
                                if (t.indexOf('deleteContentBackward') !== -1) {
                                    // Backspace
                                    if (startContainer.nodeType === 3 && startOffset === 0) {
                                        const prevSibling = startContainer.previousSibling;
                                        if (prevSibling && prevSibling.nodeType === 1 && prevSibling.classList.contains('tb-check')) {
                                            targetCheckbox = prevSibling;
                                        }
                                    } else if (startContainer.nodeType === 1) {
                                        const prevSibling = startContainer.previousSibling;
                                        if (prevSibling && prevSibling.nodeType === 1 && prevSibling.classList.contains('tb-check')) {
                                            targetCheckbox = prevSibling;
                                        }
                                    }
                                } else if (t.indexOf('deleteContentForward') !== -1) {
                                    // Delete
                                    if (startContainer.nodeType === 3) {
                                        const nextSibling = startContainer.nextSibling;
                                        if (nextSibling && nextSibling.nodeType === 1 && nextSibling.classList.contains('tb-check')) {
                                            targetCheckbox = nextSibling;
                                        }
                                    } else if (startContainer.nodeType === 1) {
                                        const nextSibling = startContainer.nextSibling;
                                        if (nextSibling && nextSibling.nodeType === 1 && nextSibling.classList.contains('tb-check')) {
                                            targetCheckbox = nextSibling;
                                        }
                                    }
                                }
                            }
                        } else {
                            // 选中模式：检查选区内是否包含checkbox
                            const commonAncestor = range.commonAncestorContainer;
                            const container = commonAncestor.nodeType === 3 ? commonAncestor.parentElement : commonAncestor;
                            const checkbox = container.querySelector('.tb-check');
                            if (checkbox && range.intersectsNode(checkbox)) {
                                targetCheckbox = checkbox;
                            }
                        }
                        
                        // 如果检测到删除checkbox，转换为普通文本行
                        if (targetCheckbox && targetCheckbox.classList.contains('tb-check')) {
                            e.preventDefault();
                            e.stopPropagation();
                            const taskLine = targetCheckbox.closest('.tb-check-line');
                            if (taskLine) {
                                const textLine = convertTaskLineToTextLine(taskLine);
                                if (textLine) {
                                    pushEditorHistory();
                                    markEditorDirty();
                                    updateEditorSubmitState();
                                    return;
                                }
                            }
                        }
                    }
                }
                
                if (t.indexOf('delete') !== -1 && selectionIntersectsInlineImage()) {
                    e.preventDefault();
                }
                // P0修复：不在IME组合输入期间记录历史，也不在compositionend刚结束时重复记录
                if (!isComposing && !compositionEndHandled) {
                pushEditorHistory();
                }
            });
            els.editorText.addEventListener('keydown', (e) => {
                // 重构 v2：Style Mode - 彻底禁止 keydown，但允许ESC关闭字体栏
                if (isStyleEditMode) {
                    // 允许ESC键关闭字体栏
                    if (e.key === 'Escape') {
                        closeStyleBar();
                        return;
                    }
                    // 阻止其他所有键盘输入
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    return;
                }
                
                // P0修复：在删除操作时标记dirty状态
                if (e.key === 'Backspace' || e.key === 'Delete') {
                    const sel = window.getSelection();
                    if (sel && sel.rangeCount > 0) {
                        const range = sel.getRangeAt(0);
                        
                        // P0修复：检测是否删除checkbox，如果是则转换为普通文本行（包括光标在 checkbox 后的情况）
                        if (range.collapsed) {
                            // 光标模式：检查光标前（Backspace）或后（Delete）是否是checkbox
                            let targetNode = null;
                            
                            // P0修复：先检查光标是否在任务行内
                            const startContainer = range.startContainer;
                            const startOffset = range.startOffset;
                            const taskLine = startContainer.nodeType === 1 
                                ? (startContainer.classList.contains('tb-check-line') ? startContainer : startContainer.closest('.tb-check-line'))
                                : startContainer.parentElement?.closest('.tb-check-line');
                            
                            if (taskLine) {
                                const checkbox = taskLine.querySelector('.tb-check');
                                if (checkbox) {
                                    if (e.key === 'Backspace') {
                                        // Backspace：检查光标前是否是 checkbox
                                        if (startContainer.nodeType === 3 && startOffset === 0) {
                                            const prevSibling = startContainer.previousSibling;
                                            if (prevSibling === checkbox) {
                                                targetNode = checkbox;
                                            }
                                        } else if (startContainer.nodeType === 1) {
                                            const prevSibling = startContainer.previousSibling;
                                            if (prevSibling === checkbox) {
                                                targetNode = checkbox;
                                            }
                                        }
                                        // 如果光标在 checkbox 后的文本节点开头，也触发
                                        const textEl = taskLine.querySelector('.tb-check-text');
                                        if (textEl && textEl.contains(startContainer) && startOffset === 0) {
                                            const textPrevSibling = startContainer.previousSibling;
                                            if (!textPrevSibling || textPrevSibling === checkbox) {
                                                targetNode = checkbox;
                                            }
                                        }
                                    } else if (e.key === 'Delete') {
                                        // Delete：检查光标后是否是 checkbox
                                        if (startContainer.nodeType === 3) {
                                            const nextSibling = startContainer.nextSibling;
                                            if (nextSibling === checkbox) {
                                                targetNode = checkbox;
                                            }
                                        } else if (startContainer.nodeType === 1) {
                                            const nextSibling = startContainer.nextSibling;
                                            if (nextSibling === checkbox) {
                                                targetNode = checkbox;
                                            }
                                        }
                                    }
                                }
                            }
                            
                            // 原有的检测逻辑（作为兜底）
                            if (!targetNode) {
                                if (e.key === 'Backspace') {
                                    // Backspace：检查光标前的节点
                                    if (startContainer.nodeType === 3) {
                                        // 文本节点
                                        if (startOffset === 0) {
                                            // 光标在文本节点开头，检查前一个兄弟节点
                                            const prevSibling = startContainer.previousSibling;
                                            if (prevSibling && prevSibling.nodeType === 1 && prevSibling.classList.contains('tb-check')) {
                                                targetNode = prevSibling;
                                            } else {
                                                const parent = startContainer.parentElement;
                                                if (parent && parent.classList.contains('tb-check-line')) {
                                                    const checkbox = parent.querySelector('.tb-check');
                                                    if (checkbox && checkbox === prevSibling) {
                                                        targetNode = checkbox;
                                                    }
                                                }
                                            }
                                        }
                                    } else if (startContainer.nodeType === 1) {
                                        // 元素节点
                                        const prevSibling = startContainer.previousSibling;
                                        if (prevSibling && prevSibling.nodeType === 1 && prevSibling.classList.contains('tb-check')) {
                                            targetNode = prevSibling;
                                        }
                                    }
                                } else if (e.key === 'Delete') {
                                    // Delete：检查光标后的节点
                                    if (startContainer.nodeType === 3) {
                                        // 文本节点
                                        const nextSibling = startContainer.nextSibling;
                                        if (nextSibling && nextSibling.nodeType === 1 && nextSibling.classList.contains('tb-check')) {
                                            targetNode = nextSibling;
                                        }
                                    } else if (startContainer.nodeType === 1) {
                                        // 元素节点
                                        const nextSibling = startContainer.nextSibling;
                                        if (nextSibling && nextSibling.nodeType === 1 && nextSibling.classList.contains('tb-check')) {
                                            targetNode = nextSibling;
                                        }
                                    }
                                }
                            }
                            
                            // 如果检测到删除checkbox，转换为普通文本行
                            if (targetNode && targetNode.classList.contains('tb-check')) {
                    e.preventDefault();
                                e.stopPropagation();
                                const taskLine = targetNode.closest('.tb-check-line');
                                if (taskLine) {
                                    const textLine = convertTaskLineToTextLine(taskLine);
                                    if (textLine) {
                                        pushEditorHistory();
                                        markEditorDirty();
                                        updateEditorSubmitState();
                                        return;
                                    }
                                }
                            }
                        } else {
                            // 选中模式：检查选区内是否包含checkbox
                            const commonAncestor = range.commonAncestorContainer;
                            const container = commonAncestor.nodeType === 3 ? commonAncestor.parentElement : commonAncestor;
                            const checkbox = container.querySelector('.tb-check');
                            if (checkbox && range.intersectsNode(checkbox)) {
                                // 如果选中了checkbox，转换为普通文本行
                                e.preventDefault();
                                e.stopPropagation();
                                const taskLine = checkbox.closest('.tb-check-line');
                                if (taskLine) {
                                    const textLine = convertTaskLineToTextLine(taskLine);
                                    if (textLine) {
                                        pushEditorHistory();
                                        markEditorDirty();
                                        updateEditorSubmitState();
                                        return;
                                    }
                                }
                            }
                        }
                        
                        // 如果删除操作会删除内容（不是空删除），标记dirty
                        if (!range.collapsed || els.editorText.textContent.trim().length > 0) {
                            markEditorDirty();
                        }
                    }
                    
                    // 如果选择与图片相交，阻止删除（避免误删图片）
                    if (selectionIntersectsInlineImage()) {
                        e.preventDefault();
                    }
                }
            });
            els.editorText.addEventListener('mousedown', (e) => {
                // v1规范：样式编辑模式 - 允许原生mousedown进行选择
                if (isStyleEditMode) {
                    // 标记鼠标按下，用于区分单击和拖选
                    isMouseDown = true;
                    // 关键：完全不阻止mousedown，允许浏览器原生selection
                    // 不调用preventDefault()，不调用stopPropagation()
                    // 让浏览器原生处理：拖选、双击选词等
                    // focus事件会在focus事件处理中被拦截
                }
            });
            els.editorText.addEventListener('mousemove', (e) => {
                // v1规范：拖选过程中，标记为拖选状态
                if (isStyleEditMode && isMouseDown) {
                    // 拖选中，不关闭字体栏
                }
            });
            els.editorText.addEventListener('mouseup', (e) => { 
                // v1规范：样式编辑模式 - 允许原生mouseup完成选择
                if (isStyleEditMode) {
                    // 延迟检查是否有selection，如果有说明是拖选或双击，不关闭字体栏
                    setTimeout(() => {
                        const sel = window.getSelection();
                        const hasSel = sel && sel.rangeCount > 0 && !sel.getRangeAt(0).collapsed;
                        // 如果有selection，说明是拖选或双击，不关闭字体栏
                        if (!hasSel) {
                            // 没有selection，可能是单击，但延迟关闭，让双击有机会触发
                            setTimeout(() => {
                                if (!isMouseDown) {
                                    // 鼠标已释放，且没有selection，可能是单击
                                    // 但为了支持双击，再延迟一点
                                }
                            }, 100);
                        }
                        captureEditorSelection(); 
                        updateStyleControlsUI();
                        // v1规范：移动端延迟blur防止键盘，桌面端允许保持焦点显示光标
                        if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) {
                            // 移动端：延迟blur防止键盘弹出
                            if (els.editorText && document.activeElement === els.editorText) {
                                setTimeout(() => {
                                    if (els.editorText && document.activeElement === els.editorText) {
                                        els.editorText.blur();
                                    }
                                }, 150);
                            }
                        }
                        // 桌面端：允许保持焦点，显示光标，不blur
                    }, 50);
                    // 标记鼠标释放
                    isMouseDown = false;
                } else {
                    // 非样式编辑模式：正常处理
                    captureEditorSelection(); 
                    updateStyleControlsUI();
                }
            });
            els.editorText.addEventListener('keyup', () => { captureEditorSelection(); updateStyleControlsUI(); });
            // P0修复：移动端触摸事件支持 - 允许长按选择
            els.editorText.addEventListener('touchstart', (e) => {
                // 样式编辑模式下允许触摸选择
                if (isStyleEditMode) {
                    // 不阻止touchstart，允许长按选择
                }
            });
            els.editorText.addEventListener('touchend', (e) => {
                // v1规范：样式编辑模式 - 触摸选择完成后延迟blur，防止键盘闪现
                if (isStyleEditMode) {
                    // 检查是否有selection（长按选择会产生selection）
                    setTimeout(() => {
                        const sel = window.getSelection();
                        const hasSel = sel && sel.rangeCount > 0 && !sel.getRangeAt(0).collapsed;
                        
                        if (els.editorText && document.activeElement === els.editorText) {
                            // 延迟blur，给selection时间完成，但防止键盘弹出
                            setTimeout(() => {
                                if (els.editorText && document.activeElement === els.editorText) {
                                    els.editorText.blur();
                                }
                            }, hasSel ? 200 : 150);
                        }
                        updateStyleControlsUI();
                    }, 50);
                }
            });
            // ========== 输入模式：beforeinput捕获新文本并包裹 ==========
            els.editorText.addEventListener('beforeinput', (e) => {
                // P0修复：样式编辑模式 - 阻止所有输入操作
                if (isStyleEditMode) {
                    e.preventDefault();
                    e.stopPropagation();
                    return;
                }
                
                if (!editorIsCE()) return;
                
                const sel = window.getSelection();
                if (!sel || sel.rangeCount === 0) return;
                
                const range = sel.getRangeAt(0);
                // P0修复：只处理输入模式（无选区）
                // 注意：允许所有 inputType（包括 'insertText', 'insertCompositionText' 等）
                if (!range.collapsed) return;
                
                // P0修复：检查 typingStyle（包括所有样式：B/I/U/颜色/字号）
                // 使用 editorStyleState.typingStyle（typingStyleState 是它的引用）
                const typingStyle = editorStyleState.typingStyle;
                const needsStyle = typingStyle.bold || typingStyle.italic || typingStyle.underline;
                const needsFontSize = typingStyle.fontSize && typingStyle.fontSize !== 16;
                const needsColor = typingStyle.fontColor && typingStyle.fontColor !== '#FFFFFF';
                
                // P0修复：保存输入前的range位置（关键：必须在 beforeinput 时保存）
                // 即使没有样式需要应用，也要保存 range（用于后续输入）
                // 注意：每次输入前都要重新保存range，因为DOM结构可能已经改变
                try {
                    inputStartRange = {
                        startContainer: range.startContainer,
                        startOffset: range.startOffset
                    };
                } catch (err) {
                    debugLog('beforeinput: failed to save range', err);
                    inputStartRange = null;
                    return;
                }
                
                // 如果没有样式需要应用，提前返回（但已保存 range）
                if (!needsStyle && !needsFontSize && !needsColor) {
                    return;
                }
            });
            
            // 重构 v2：处理粘贴事件
            els.editorText.addEventListener('paste', (e) => {
                // 重构 v2：Style Mode - 彻底禁止 paste 事件
                if (isStyleEditMode) {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    return;
                }
                // 粘贴操作会触发input事件，但为了确保dirty状态，这里也标记一次
                setTimeout(() => {
                    markEditorDirty();
                    updateEditorSubmitState();
                }, 0);
            });
            
            els.editorText.addEventListener('input', (e) => {
                // 重构 v2：Style Mode - 彻底禁止 input 事件
                if (isStyleEditMode) {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    return;
                }
                // P0修复：IME输入结束后才标记dirty
                // 注意：历史记录已在compositionend时处理，这里不再重复记录
                if (!isComposing) {
                    // 标记编辑器内容已修改
                    markEditorDirty();
                }
                // P0修复：输入内容后更新提交按钮状态
                updateEditorSubmitState();
                if (!editorIsCE()) {
                    captureEditorSelection();
                    updateStyleControlsUI();
                    return;
                }
                
                const sel = window.getSelection();
                if (!sel || sel.rangeCount === 0) {
                    captureEditorSelection();
                    updateStyleControlsUI();
                    return;
                }
                
                const range = sel.getRangeAt(0);
                // 只处理输入模式（无选区）
                if (!range.collapsed) {
                    captureEditorSelection();
                    updateStyleControlsUI();
                    return;
                }
                
                // P0修复：基于 typingStyleState 包裹新输入的字符（包括颜色）
                const needsStyle = typingStyleState.bold || typingStyleState.italic || typingStyleState.underline;
                const needsFontSize = typingStyleState.fontSize && typingStyleState.fontSize !== 16;
                const needsColor = typingStyleState.fontColor && typingStyleState.fontColor !== '#FFFFFF';
                
                // P0修复：如果没有样式需要应用，清空 inputStartRange 并返回
                if (!needsStyle && !needsFontSize && !needsColor) {
                    inputStartRange = null;
                    captureEditorSelection();
                    updateStyleControlsUI();
                    return;
                }
                
                // P0修复：如果没有保存的 range，无法应用样式，返回
                if (!inputStartRange) {
                    captureEditorSelection();
                    updateStyleControlsUI();
                    return;
                }
                
                try {
                    // P0修复：使用更通用的方法找到新输入的文本
                    // 创建一个range从保存的位置到当前光标位置
                    const inputRange = document.createRange();
                    try {
                        inputRange.setStart(inputStartRange.startContainer, inputStartRange.startOffset);
                        inputRange.setEnd(range.startContainer, range.startOffset);
                    } catch (err) {
                        // 如果range无效（DOM结构已变化），清空并返回
                        debugLog('input wrap: range invalid, DOM may have changed');
                        inputStartRange = null;
                        captureEditorSelection();
                        updateStyleControlsUI();
                        return;
                    }
                    
                    // 检查range是否有效（有内容）
                    if (inputRange.collapsed) {
                        // range已折叠，没有新文本
                        inputStartRange = null;
                        captureEditorSelection();
                        updateStyleControlsUI();
                        return;
                    }
                    
                    // 提取新输入的文本内容
                    const newText = inputRange.toString();
                    if (!newText || newText.length === 0) {
                        inputStartRange = null;
                        captureEditorSelection();
                        updateStyleControlsUI();
                        return;
                    }
                    
                    // P0修复：创建样式span包裹新字符（基于 typingStyleState）
                    const styleSpan = document.createElement('span');
                    if (typingStyleState.bold) styleSpan.style.fontWeight = '600';
                    if (typingStyleState.italic) {
                        styleSpan.style.fontStyle = 'italic';
                        styleSpan.style.transform = 'skew(-10deg)';
                    }
                    if (typingStyleState.underline) {
                        // P0修复：光标模式下也使用 data-tb="u" 标记
                        styleSpan.setAttribute('data-tb', 'u');
                        styleSpan.style.textDecoration = 'underline';
                        applyUnderlineExtras(styleSpan, { textDecoration: 'underline' });
                    }
                    if (typingStyleState.fontSize && typingStyleState.fontSize !== 16) {
                        styleSpan.style.fontSize = `${typingStyleState.fontSize}px`;
                    }
                    if (typingStyleState.fontColor && typingStyleState.fontColor !== '#FFFFFF') {
                        styleSpan.style.color = typingStyleState.fontColor;
                    }
                    
                    // 提取range的内容（包括所有文本节点）
                    const contents = inputRange.extractContents();
                    
                    // 将提取的内容放入样式span
                    styleSpan.appendChild(contents);
                    
                    // 在range位置插入样式span
                    inputRange.insertNode(styleSpan);
                    
                    // 恢复光标位置（在样式span之后）
                    try {
                        const newRange = document.createRange();
                        newRange.setStartAfter(styleSpan);
                        newRange.collapse(true);
                        sel.removeAllRanges();
                        sel.addRange(newRange);
                    } catch (err) {
                        debugLog('input wrap: failed to restore cursor position', err);
                    }
                } catch (err) {
                    debugLog('input wrap error:', err);
                    // 出错时清空 inputStartRange，让下次输入重新开始
                    inputStartRange = null;
                }
                
                inputStartRange = null;
                captureEditorSelection();
                updateStyleControlsUI();
            });
            // 图片删除按钮与原图预览
            els.editorText.addEventListener('click', (e) => {
                // v1规范：字体栏打开时，点击编辑器任意区域关闭字体栏
                if (isStyleEditMode) {
                    // 检查点击目标是否是字体栏本身
                    const clickedStyleBar = e.target.closest && e.target.closest('#editorStyleBar');
                    const clickedStyleBtn = e.target.closest && e.target.closest('#editorStyleBtn');
                    const clickedStyleCloseBtn = e.target.closest && e.target.closest('#editorStyleBarCloseBtn');
                    
                    // 如果点击的是字体栏内的元素，不关闭
                    if (clickedStyleBar || clickedStyleBtn || clickedStyleCloseBtn) {
                        // 不关闭字体栏，允许操作字体栏内的按钮
                        return;
                    }
                    
                    // 检查是否有selection（拖选或双击会产生selection）
                    const sel = window.getSelection();
                    const hasSel = sel && sel.rangeCount > 0 && !sel.getRangeAt(0).collapsed;
                    
                    // 如果有selection，说明是拖选或双击，不关闭字体栏
                    if (hasSel) {
                        // 不关闭字体栏，允许选择文字
                        return;
                    }
                    
                    // 延迟关闭，给双击选词机会（双击会先触发一次click，然后触发dblclick）
                    setTimeout(() => {
                        // 再次检查是否有selection（双击可能已经产生selection）
                        const checkSel = window.getSelection();
                        const checkHasSel = checkSel && checkSel.rangeCount > 0 && !checkSel.getRangeAt(0).collapsed;
                        if (!checkHasSel && isStyleEditMode) {
                            // 没有selection，且字体栏仍然打开，关闭字体栏
                            closeStyleBar();
                        }
                    }, 200); // 延迟200ms，给双击机会
                    // 不阻止事件，允许浏览器原生selection和后续输入
                    return;
                }
                
                const rm = e.target.closest && e.target.closest('.tb-inline-image-remove');
                if (rm) {
                    pushEditorHistory();
                    e.preventDefault();
                    e.stopPropagation();
                    const wrap = rm.closest('.tb-img-wrapper');
                    const img = wrap ? wrap.querySelector('img.todayboard-img') : null;
                    const src = img ? img.src : null;
                    if (wrap) {
                        // P0修复：删除图片后，将光标定位到图片后的可编辑段落中
                        const nextSibling = wrap.nextSibling;
                        wrap.remove();
                        
                        // 尝试将光标定位到图片后的段落中
                        setTimeout(() => {
                            const sel = window.getSelection();
                            if (sel && sel.rangeCount === 0) {
                                // 如果没有选择，尝试定位到下一个可编辑位置
                                if (nextSibling && nextSibling.nodeType === 1) {
                                    // 如果下一个节点是div段落，定位到其中
                                    const range = document.createRange();
                                    const brInPara = nextSibling.querySelector('br');
                                    if (brInPara) {
                                        range.setStartAfter(brInPara);
                                        range.setEndAfter(brInPara);
                                    } else {
                                        range.setStart(nextSibling, 0);
                                        range.setEnd(nextSibling, 0);
                                    }
                                    sel.removeAllRanges();
                                    sel.addRange(range);
                                    els.editorText.focus();
                                } else {
                                    // 否则定位到编辑器末尾
                                    placeCaretAtEnd(els.editorText);
                                }
                            }
                        }, 0);
                    }
                    if (src) {
                        const idx = editingImages.indexOf(src);
                        if (idx > -1) {
                            editingImages.splice(idx, 1);
                            editingImageNames.splice(idx, 1);
                        }
                    }
                    // P0-1修复：删除图片后同步images数组并推入撤销栈
                    syncEditingImagesFromDOM();
                    pushEditorHistory();
                    // 删除图片后标记dirty状态
                    markEditorDirty();
                    updateEditorSubmitState();
                    return;
                }
                const img = e.target.closest && e.target.closest('img.todayboard-img');
                if (!img) return;
                const sourceImage = img.src;
                openImageModal(sourceImage);
            });
        }
        document.addEventListener('selectionchange', () => {
            if (editorIsCE()) {
                captureEditorSelection();
                updateStyleControlsUI();
            }
        });
        if (els.editorText) {
            // P0修复：确保编辑器在设置内容前是可编辑的
            try { 
                els.editorText.setAttribute('contenteditable', 'true');
                els.editorText.removeAttribute('readonly');
                els.editorText.removeAttribute('disabled');
            } catch {}
            
            if (textHtml && editorIsCE()) {
                setEditorHTML(textHtml);
            } else {
                setEditorPlainText(text);
            }
            
            // P0修复：设置内容后，再次确保编辑器是可编辑的（防止setEditorHTML影响状态）
            if (editorIsCE()) {
                try { 
                    els.editorText.setAttribute('contenteditable', 'true');
                    els.editorText.removeAttribute('readonly');
                    els.editorText.removeAttribute('disabled');
                } catch {}
                
                // P0修复：normalize历史数据，修复图文同行问题
                normalizeEditorImages();
                // P0修复：normalize历史数据，修复任务行问题（竖体显示）
                normalizeTaskLines();
                ensureEditorImageControls();
                syncEditingImagesFromDOM();
                // 延迟再次确保图片删除按钮绑定生效（修改页回填后）
                setTimeout(() => {
                    // P0修复：再次normalize，确保所有图片都正确格式化
                    normalizeEditorImages();
                    // P0修复：再次normalize任务行
                    normalizeTaskLines();
                    ensureEditorImageControls();
                    // P0修复：确保编辑器仍然可编辑，并获得焦点
                    try { 
                        els.editorText.setAttribute('contenteditable', 'true');
                        els.editorText.removeAttribute('readonly');
                        els.editorText.removeAttribute('disabled');
                        // 确保编辑器获得焦点，光标可见
                        if (document.activeElement !== els.editorText) {
                            els.editorText.focus();
                        }
                    } catch {}
                }, 0);
            }
            placeCaretAtEnd(els.editorText);
            // 初始化样式：编辑模式用记录样式；新建用默认
            editingStyle = {
                fontSize: (styleFromRec && Number(styleFromRec.fontSize)) || 16,
                fontWeight: (styleFromRec && (styleFromRec.fontWeight != null)) ? Number(styleFromRec.fontWeight) : 400,
                fontStyle: (styleFromRec && styleFromRec.fontStyle) || 'normal',
                textDecoration: (styleFromRec && styleFromRec.textDecoration) || 'none',
                fontColor: (styleFromRec && styleFromRec.fontColor) || '#FFFFFF',
            };
            
            // pendingStyle 已在函数开头统一重置，此处不再重复设置
            
            applyEditorStyle();
            // 延迟更新按钮状态，确保DOM已完全加载
            setTimeout(() => {
            updateStyleControlsUI();
            }, 0);
            editorHistory = []; historyIndex = -1; pushEditorHistory();
        }
        if (els.editorStatus) els.editorStatus.textContent = isEdit ? '修改' : '新增';
        updateEditorSubmitState();
        if (els.editorOverlay) {
            els.editorOverlay.classList.remove('visually-hidden');
            els.editorOverlay.setAttribute('aria-hidden','false');
            els.editorOverlay.classList.add('is-open');
        }
        
        // P0修复：确保编辑器在打开后能获得焦点，光标可见
        setTimeout(() => {
            if (els.editorText && editorIsCE()) {
                try {
                    // 再次确保编辑器是可编辑的
                    els.editorText.setAttribute('contenteditable', 'true');
                    els.editorText.removeAttribute('readonly');
                    els.editorText.removeAttribute('disabled');
                    // 确保编辑器获得焦点
                    if (document.activeElement !== els.editorText) {
                        els.editorText.focus();
                    }
                    // 确保光标可见（如果内容为空，光标应该在开头）
                    if (els.editorText.textContent.trim() === '') {
                        placeCaretAtEnd(els.editorText);
                    }
                } catch (e) {
                    console.warn('编辑器焦点设置失败:', e);
                }
            }
        }, 100);
        // 初始化非空快照与发送按钮状态
        editorLastNonEmpty = {
            text: text || '',
            html: textHtml || '',
            images: Array.isArray(editingImages) ? editingImages.slice() : [],
            imageNames: Array.isArray(editingImageNames) ? editingImageNames.slice() : [],
        };
        updateEditorSubmitState();
        
        // ========== 调试：打印刚进入编辑页的 DOM 状态 ==========
        setTimeout(() => {
            console.log('[EDITOR DEBUG] ====== 刚点修改进入编辑页（错误态） ======');
            const editorOverlay = els.editorOverlay;
            const editorPage = document.querySelector('.tb-editor');
            const editorHeader = document.querySelector('.tb-editor-header');
            const editorToolbar = document.querySelector('.tb-editor-toolbar');
            const editorStyleBar = els.editorStyleBar;
            const topActionBar = els.topActionBar;
            const bottomActionBar = els.bottomActionBar;
            const bodyEl = document.body;
            
            if (editorOverlay) {
                console.log('editorOverlay.className:', editorOverlay.className);
                console.log('editorOverlay.classList:', Array.from(editorOverlay.classList));
                console.log('editorOverlay.style.display:', editorOverlay.style.display);
                console.log('editorOverlay.style.visibility:', editorOverlay.style.visibility);
                console.log('editorOverlay.style.transform:', editorOverlay.style.transform);
                console.log('editorOverlay.getAttribute("aria-hidden"):', editorOverlay.getAttribute('aria-hidden'));
            }
            if (editorPage) {
                console.log('editorPage.className:', editorPage.className);
                console.log('editorPage.classList:', Array.from(editorPage.classList));
                console.log('editorPage.style.display:', editorPage.style.display);
            }
            if (editorHeader) {
                console.log('editorHeader.className:', editorHeader.className);
                console.log('editorHeader.classList:', Array.from(editorHeader.classList));
                console.log('editorHeader.style.display:', editorHeader.style.display);
            }
            if (editorToolbar) {
                console.log('editorToolbar.className:', editorToolbar.className);
                console.log('editorToolbar.classList:', Array.from(editorToolbar.classList));
                console.log('editorToolbar.style.display:', editorToolbar.style.display);
            }
            if (editorStyleBar) {
                console.log('editorStyleBar.className:', editorStyleBar.className);
                console.log('editorStyleBar.classList:', Array.from(editorStyleBar.classList));
                console.log('editorStyleBar.style.display:', editorStyleBar.style.display);
                console.log('editorStyleBar.getAttribute("aria-hidden"):', editorStyleBar.getAttribute('aria-hidden'));
            }
            if (topActionBar) {
                console.log('topActionBar.className:', topActionBar.className);
                console.log('topActionBar.classList:', Array.from(topActionBar.classList));
                console.log('topActionBar.style.display:', topActionBar.style.display);
            }
            if (bottomActionBar) {
                console.log('bottomActionBar.className:', bottomActionBar.className);
                console.log('bottomActionBar.classList:', Array.from(bottomActionBar.classList));
                console.log('bottomActionBar.style.display:', bottomActionBar.style.display);
            }
            if (bodyEl) {
                console.log('body.className:', bodyEl.className);
                console.log('body.classList:', Array.from(bodyEl.classList));
                console.log('body.classList.contains("is-multi-select"):', bodyEl.classList.contains('is-multi-select'));
            }
            console.log('mode:', mode, 'isEdit:', isEdit, 'editingIndex:', editingIndex);
            console.log('selectedSet.size:', selectedSet.size);
            console.log('[EDITOR DEBUG] ===========================================');
        }, 100);
    }
    function ensureEditorImageControls() {
        if (!els.editorText) return;
        const imgs = Array.from(els.editorText.querySelectorAll('img'));
        imgs.forEach(img => {
            if (!img.classList.contains('todayboard-img')) img.classList.add('todayboard-img');
            let wrap = img.closest('.tb-img-wrapper');
            
            // P0修复：如果图片已有wrapper，检查删除按钮是否存在并绑定事件
            if (wrap) {
                let removeBtn = wrap.querySelector('.tb-inline-image-remove');
                // 如果删除按钮不存在，创建它
                if (!removeBtn) {
                    removeBtn = document.createElement('span');
                    removeBtn.className = 'tb-inline-image-remove';
                    removeBtn.textContent = '✕';
                    removeBtn.title = '删除图片';
                    removeBtn.setAttribute('contenteditable', 'false');
                    wrap.appendChild(removeBtn);
                }
                // P0修复：确保删除按钮的事件监听器已绑定（移除旧监听器并重新绑定）
                // 注意：由于无法直接移除匿名函数监听器，我们使用事件委托或确保事件正确绑定
                // 这里通过检查是否有data-listener标记来判断，如果没有则绑定
                if (!removeBtn.hasAttribute('data-listener-bound')) {
                    // 移除可能存在的旧监听器（通过克隆节点）
                    const newRemoveBtn = removeBtn.cloneNode(true);
                    removeBtn.parentNode.replaceChild(newRemoveBtn, removeBtn);
                    removeBtn = newRemoveBtn;
                    
                    removeBtn.addEventListener('click', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const wrapEl = e.target.closest('.tb-img-wrapper');
                        const imgEl = wrapEl ? wrapEl.querySelector('img.todayboard-img') : img;
                        const src = imgEl ? imgEl.src : null;
                        if (wrapEl) {
                            // P0修复：删除图片后，将光标定位到图片后的可编辑段落中
                            const nextSibling = wrapEl.nextSibling;
                            wrapEl.remove();
                            
                            // 尝试将光标定位到图片后的段落中
                            setTimeout(() => {
                                const sel = window.getSelection();
                                if (sel && sel.rangeCount === 0) {
                                    // 如果没有选择，尝试定位到下一个可编辑位置
                                    if (nextSibling && nextSibling.nodeType === 1) {
                                        // 如果下一个节点是div段落，定位到其中
                                        const range = document.createRange();
                                        const brInPara = nextSibling.querySelector('br');
                                        if (brInPara) {
                                            range.setStartAfter(brInPara);
                                            range.setEndAfter(brInPara);
                                        } else {
                                            range.setStart(nextSibling, 0);
                                            range.setEnd(nextSibling, 0);
                                        }
                                        sel.removeAllRanges();
                                        sel.addRange(range);
                                        els.editorText.focus();
                                    } else {
                                        // 否则定位到编辑器末尾
                                        placeCaretAtEnd(els.editorText);
                                    }
                                }
                            }, 0);
                        }
                        if (src) {
                            const idx = editingImages.indexOf(src);
                            if (idx > -1) {
                                editingImages.splice(idx, 1);
                                editingImageNames.splice(idx, 1);
                            }
                        }
                        // P0-1修复：删除图片后同步images数组并推入撤销栈
                        syncEditingImagesFromDOM();
                        pushEditorHistory();
                        // 删除图片后标记dirty状态
                        markEditorDirty();
                        updateEditorSubmitState();
                    });
                    removeBtn.setAttribute('data-listener-bound', 'true');
                }
                return;
            }
            
            // 如果图片没有wrapper，创建wrapper和删除按钮
            const removeBtn = document.createElement('span');
            removeBtn.className = 'tb-inline-image-remove';
            removeBtn.textContent = '✕';
            removeBtn.title = '删除图片';
            removeBtn.setAttribute('contenteditable', 'false');
            removeBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const wrapEl = e.target.closest('.tb-img-wrapper');
                const imgEl = wrapEl ? wrapEl.querySelector('img.todayboard-img') : img;
                const src = imgEl ? imgEl.src : null;
                if (wrapEl) wrapEl.remove();
                if (src) {
                    const idx = editingImages.indexOf(src);
                    if (idx > -1) {
                        editingImages.splice(idx, 1);
                        editingImageNames.splice(idx, 1);
                    }
                }
                // 删除图片后标记dirty状态
                markEditorDirty();
                updateEditorSubmitState();
            });
            removeBtn.setAttribute('data-listener-bound', 'true');
            
            wrap = document.createElement('span');
            wrap.className = 'tb-img-wrapper';
            wrap.setAttribute('contenteditable', 'false');
            img.parentNode.insertBefore(wrap, img);
            wrap.appendChild(img);
            wrap.appendChild(removeBtn);
        });
    }
    function syncEditingImagesFromDOM() {
        if (!els.editorText) return;
        const imgs = Array.from(els.editorText.querySelectorAll('img.todayboard-img'));
        const urls = imgs.map(i => i.src);
        editingImages = urls.slice();
        if (!Array.isArray(editingImageNames) || editingImageNames.length !== editingImages.length) {
            editingImageNames = editingImages.map(u => {
                const ext = getExtFromDataUrl(u) || 'png';
                return generateTBFileName(ext);
            });
        }
    }
    function exitEditor() {
        // ========== 调试：打印退出编辑页前的 DOM 状态（如果编辑页仍打开） ==========
        const editorOverlayBefore = els.editorOverlay;
        if (editorOverlayBefore && editorOverlayBefore.classList.contains('is-open') && !editorOverlayBefore.classList.contains('visually-hidden')) {
            console.log('[EDITOR DEBUG] ====== 退出编辑页前的状态（如果编辑页仍打开） ======');
            const editorPageBefore = document.querySelector('.tb-editor');
            const editorHeaderBefore = document.querySelector('.tb-editor-header');
            const editorToolbarBefore = document.querySelector('.tb-editor-toolbar');
            const editorStyleBarBefore = els.editorStyleBar;
            
            if (editorOverlayBefore) {
                console.log('editorOverlay.className:', editorOverlayBefore.className);
                console.log('editorOverlay.classList:', Array.from(editorOverlayBefore.classList));
                console.log('editorOverlay.style.display:', editorOverlayBefore.style.display);
            }
            if (editorPageBefore) {
                console.log('editorPage.className:', editorPageBefore.className);
                console.log('editorPage.classList:', Array.from(editorPageBefore.classList));
            }
            if (editorHeaderBefore) {
                console.log('editorHeader.className:', editorHeaderBefore.className);
                console.log('editorHeader.classList:', Array.from(editorHeaderBefore.classList));
            }
            if (editorToolbarBefore) {
                console.log('editorToolbar.className:', editorToolbarBefore.className);
                console.log('editorToolbar.classList:', Array.from(editorToolbarBefore.classList));
            }
            if (editorStyleBarBefore) {
                console.log('editorStyleBar.className:', editorStyleBarBefore.className);
                console.log('editorStyleBar.classList:', Array.from(editorStyleBarBefore.classList));
            }
            console.log('[EDITOR DEBUG] ===========================================');
        }
        
        editingIndex = null;
        editingImages = [];
        editingImageNames = [];
        editorLastNonEmpty = { text: '', html: '', images: [], imageNames: [] };
        editorDirty = false; // 重置dirty状态
        // 重置样式为默认
        editingStyle = { fontSize: 16, fontWeight: 400, fontStyle: 'normal', textDecoration: 'none', fontColor: '#FFFFFF' };
        // 收起字体样式浮动栏
        try { closeStyleBar(); } catch {}
        if (els.editorOverlay) {
            els.editorOverlay.classList.add('visually-hidden');
            els.editorOverlay.setAttribute('aria-hidden','true');
            els.editorOverlay.classList.remove('is-open');
        }
        if (els.editorText) setEditorHTML('');
        if (els.imagePreview) els.imagePreview.innerHTML = '';
        localStorage.removeItem(STORAGE_KEYS.TODAY_IMAGE);
        // 退出编辑时同时清空选中并刷新列表，以反映未选中状态
        selectedSet.clear();
        renderRecords();
        updateMultiSelectUI();
    }
    // —— 字体样式浮动栏 ——
    // P0修复：样式编辑模式 - 锁定字体栏，禁止自动切换键盘
    function openStyleBar() {
        if (!els.editorStyleBar) return;
        // v1规范：进入样式编辑模式，允许选择文字和显示光标，但禁止输入
        if (els.editorText) {
            // 确保contenteditable为true，允许选择文字
            try { 
                els.editorText.setAttribute('contenteditable', 'true');
                // 确保编辑器可以接收鼠标事件（桌面端关键）
                els.editorText.style.pointerEvents = 'auto';
                els.editorText.style.userSelect = 'text';
                els.editorText.style.cursor = 'text';
            } catch {}
            // v1规范：桌面端主动focus编辑器，显示光标，允许选择文字
            // 移动端不主动focus，避免键盘弹出
            if (!/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) {
                // 桌面端：主动focus，显示光标
                setTimeout(() => {
                    if (els.editorText && document.activeElement !== els.editorText) {
                        try {
                            els.editorText.focus();
                        } catch {}
                    }
                }, 50);
            }
        }
        // 进入样式编辑模式
        isStyleEditMode = true;
        // 显示字体栏
        els.editorStyleBar.classList.remove('visually-hidden');
        els.editorStyleBar.setAttribute('aria-hidden', 'false');
        els.editorStyleBar.classList.add('is-open');
        if (els.editorStyleBtn) els.editorStyleBtn.classList.add('tb-active');
    }
    function closeStyleBar() {
        if (!els.editorStyleBar) return;
        // 退出样式编辑模式
        isStyleEditMode = false;
        // 隐藏字体栏
        els.editorStyleBar.classList.add('visually-hidden');
        els.editorStyleBar.setAttribute('aria-hidden', 'true');
        els.editorStyleBar.classList.remove('is-open');
        if (els.editorStyleBtn) els.editorStyleBtn.classList.remove('tb-active');
        // P0修复：恢复键盘输入 - 重新focus编辑器（可选，让用户主动点击）
        // 不自动focus，让用户自己决定是否需要输入
    }
    function toggleStyleBar() {
        if (!els.editorStyleBar) return;
        const isOpen = els.editorStyleBar.classList.contains('is-open');
        if (isOpen) closeStyleBar(); else openStyleBar();
    }
    function styleChangeFeedback() {
        if (!els.editorStyleBtn) return;
        try {
            els.editorStyleBtn.classList.add('is-pulse');
            setTimeout(() => els.editorStyleBtn.classList.remove('is-pulse'), 1000);
        } catch {}
    }
    // —— 富文本样式提取（保存/回显用） ——
    function cssColorToHex(c) {
        try {
            if (!c) return '#FFFFFF';
            if (c[0] === '#') return c.toUpperCase();
            const m = c.match(/rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
            if (!m) return c;
            const r = Number(m[1]);
            const g = Number(m[2]);
            const b = Number(m[3]);
            const toHex = (n) => ('0' + Math.max(0, Math.min(255, n)).toString(16)).slice(-2).toUpperCase();
            return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
        } catch { return '#FFFFFF'; }
    }
    function extractRichTextFromHtml(rootEl) {
        const segments = [];
        try {
            const walker = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT, null);
            let node;
            while ((node = walker.nextNode())) {
                const t = node.nodeValue || '';
                if (!t.trim()) continue;
                const parent = node.parentElement;
                const fontAttr = parent && parent.getAttribute ? (parent.getAttribute('data-font') || '') : '';
                const cssColor = parent ? getComputedStyle(parent).color : '#FFFFFF';
                const colorHex = cssColorToHex(cssColor);
                const fontName = fontAttr || 'PingFang SC';
                const seg = { text: t, font: fontName, color: colorHex };
                const last = segments[segments.length - 1];
                if (last && last.font === seg.font && last.color === seg.color) {
                    last.text += seg.text;
                } else {
                    segments.push(seg);
                }
            }
        } catch {}
        return segments;
    }
    function sanitizeFragmentStyles(fragment, styleObj) {
        try {
            const props = [];
            if (styleObj) {
                if (styleObj.color) props.push('color');
                if (styleObj.fontWeight != null) props.push('fontWeight');
                if (styleObj.fontStyle) { props.push('fontStyle'); props.push('transform'); }
                if (styleObj.textDecoration) {
                    props.push('textDecoration');
                    props.push('textDecorationColor');
                    props.push('textUnderlineOffset');
                    props.push('textDecorationThickness');
                    props.push('textDecorationSkipInk');
                }
                if (styleObj.fontSize) props.push('fontSize');
            }
            const walker = document.createTreeWalker(fragment, NodeFilter.SHOW_ELEMENT, null);
            let node;
            while ((node = walker.nextNode())) {
                props.forEach(p => { try { node.style[p] = ''; } catch {} });
                try { if (node.getAttribute && node.getAttribute('style') === '') node.removeAttribute('style'); } catch {}
            }
        } catch {}
    }
    function isStyleActiveInFragment(fragment, styleObj) {
        try {
            const walker = document.createTreeWalker(fragment, NodeFilter.SHOW_ELEMENT, null);
            let node;
            while ((node = walker.nextNode())) {
                const s = node.style || {};
                const tag = node.tagName || '';
                
                if (styleObj.fontWeight != null) {
                    const w = String(s.fontWeight || '');
                    if (tag === 'B' || tag === 'STRONG' || w === 'bold' || (Number(w) || 0) >= 600) return true;
                }
                if (styleObj.fontStyle) {
                    const fst = String(s.fontStyle || '');
                    const tf = String(s.transform || '');
                    if (tag === 'I' || tag === 'EM' || fst === 'italic' || /skew\(/.test(tf)) return true;
                }
                if (styleObj.textDecoration) {
                    const td = String(s.textDecoration || '');
                    // P0修复：更彻底地检测下划线（包括U标签和所有下划线相关属性）
                    const hasTextDecoration = td.indexOf('underline') !== -1;
                    const hasTextDecorationColor = s.textDecorationColor && s.textDecorationColor !== 'currentColor';
                    const hasTextDecorationThickness = s.textDecorationThickness && s.textDecorationThickness !== 'from-font';
                    if (tag === 'U' || hasTextDecoration || hasTextDecorationColor || hasTextDecorationThickness) return true;
                }
            }
        } catch {}
        return false;
    }
    // ========== BIU 核心函数（完全重写 - 最小可靠结构） ==========
    
    // 选区模式：规范化选区（去除嵌套，必须在toggle前执行）
    function normalizeSelectionForStyle(styleType) {
        if (!editorIsCE() || !els.editorText) return false;
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return false;
        const range = sel.getRangeAt(0);
        if (range.collapsed) return false;
        
        try {
            // 保存原始selection边界（unwrap前）
            const startContainer = range.startContainer;
            const startOffset = range.startOffset;
            const endContainer = range.endContainer;
            const endOffset = range.endOffset;
            
            // 收集选区范围内的所有同类样式元素（包括选区本身可能所在的样式span）
            const container = range.commonAncestorContainer;
            const root = container.nodeType === 3 ? container.parentElement : container;
            
            const toUnwrap = [];
            const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, null);
            let node;
            while ((node = walker.nextNode())) {
                if (!range.intersectsNode(node)) continue;
                
                const tag = node.tagName;
                const style = node.style || {};
                let match = false;
                
                if (styleType === 'bold') {
                    const fw = String(style.fontWeight || '');
                    match = tag === 'B' || tag === 'STRONG' || fw === 'bold' || (Number(fw) || 0) >= 600;
                } else if (styleType === 'italic') {
                    const fs = String(style.fontStyle || '');
                    match = tag === 'I' || tag === 'EM' || fs === 'italic';
                } else if (styleType === 'underline') {
                    const td = String(style.textDecoration || '');
                    // P0修复：更彻底地检测下划线（包括所有下划线相关属性）
                    const hasTextDecoration = td.indexOf('underline') !== -1;
                    const hasTextDecorationColor = style.textDecorationColor && style.textDecorationColor !== 'currentColor';
                    const hasTextDecorationThickness = style.textDecorationThickness && style.textDecorationThickness !== 'from-font';
                    match = tag === 'U' || hasTextDecoration || hasTextDecorationColor || hasTextDecorationThickness;
                }
                
                if (match) {
                    toUnwrap.push(node);
                }
            }
            
            if (toUnwrap.length === 0) return true; // 没有样式，无需normalize
            
            // 从内到外unwrap（深度大的先处理）
            toUnwrap.sort((a, b) => {
                let depthA = 0, depthB = 0;
                let currA = a, currB = b;
                while (currA && currA !== els.editorText) { depthA++; currA = currA.parentElement; }
                while (currB && currB !== els.editorText) { depthB++; currB = currB.parentElement; }
                return depthB - depthA;
            });
            
            // 执行unwrap
            toUnwrap.forEach(u => {
                if (u.parentNode) {
                    const parent = u.parentNode;
                    const nextSibling = u.nextSibling;
                    while (u.firstChild) {
                        parent.insertBefore(u.firstChild, nextSibling);
                    }
                    parent.removeChild(u);
                }
            });
            
            // 恢复selection：找到unwrap后的文本节点
            // 如果原始边界节点还在，且不在样式元素中，直接使用
            // 否则，找到对应的文本节点
            
            let newStartContainer = null;
            let newStartOffset = 0;
            let newEndContainer = null;
            let newEndOffset = 0;
            
            // 处理start边界
            if (startContainer.nodeType === 3) {
                // 文本节点：检查是否还在DOM中，且不在样式元素中
                if (startContainer.parentNode && els.editorText.contains(startContainer)) {
                    // 检查是否在样式元素中
                    let parent = startContainer.parentElement;
                    let inStyle = false;
                    while (parent && els.editorText.contains(parent)) {
                        const style = parent.style || {};
                        const tag = parent.tagName || '';
                        let match = false;
                        if (styleType === 'bold') {
                            const fw = String(style.fontWeight || '');
                            match = tag === 'B' || tag === 'STRONG' || fw === 'bold' || (Number(fw) || 0) >= 600;
                        } else if (styleType === 'italic') {
                            const fs = String(style.fontStyle || '');
                            match = tag === 'I' || tag === 'EM' || fs === 'italic';
                        } else if (styleType === 'underline') {
                            const td = String(style.textDecoration || '');
                            // P0修复：更彻底地检测下划线（包括所有下划线相关属性）
                            const hasTextDecoration = td.indexOf('underline') !== -1;
                            const hasTextDecorationColor = style.textDecorationColor && style.textDecorationColor !== 'currentColor';
                            const hasTextDecorationThickness = style.textDecorationThickness && style.textDecorationThickness !== 'from-font';
                            match = tag === 'U' || hasTextDecoration || hasTextDecorationColor || hasTextDecorationThickness;
                        }
                        if (match) {
                            inStyle = true;
                            break;
                        }
                        parent = parent.parentElement;
                    }
                    if (!inStyle) {
                        newStartContainer = startContainer;
                        newStartOffset = startOffset;
                    }
                }
            }
            
            // 如果start边界无效，使用文本搜索
            if (!newStartContainer) {
                const originalText = range.toString();
                const editorText = els.editorText.innerText || '';
                const index = editorText.indexOf(originalText);
                if (index !== -1) {
                    const textWalker = document.createTreeWalker(els.editorText, NodeFilter.SHOW_TEXT, null);
                    let currentPos = 0;
                    let textNode;
                    while ((textNode = textWalker.nextNode())) {
                        const nodeLength = textNode.textContent.length;
                        const nodeStart = currentPos;
                        const nodeEnd = currentPos + nodeLength;
                        if (newStartContainer === null && nodeEnd > index) {
                            newStartContainer = textNode;
                            newStartOffset = Math.max(0, index - nodeStart);
                        }
                        if (nodeEnd >= index + originalText.length) {
                            newEndContainer = textNode;
                            newEndOffset = Math.min(nodeLength, (index + originalText.length) - nodeStart);
                            break;
                        }
                        currentPos = nodeEnd;
                    }
                }
            } else {
                // start边界有效，处理end边界
                if (endContainer.nodeType === 3) {
                    if (endContainer.parentNode && els.editorText.contains(endContainer)) {
                        let parent = endContainer.parentElement;
                        let inStyle = false;
                        while (parent && els.editorText.contains(parent)) {
                            const style = parent.style || {};
                            const tag = parent.tagName || '';
                            let match = false;
                            if (styleType === 'bold') {
                                const fw = String(style.fontWeight || '');
                                match = tag === 'B' || tag === 'STRONG' || fw === 'bold' || (Number(fw) || 0) >= 600;
                            } else if (styleType === 'italic') {
                                const fs = String(style.fontStyle || '');
                                match = tag === 'I' || tag === 'EM' || fs === 'italic';
                            } else if (styleType === 'underline') {
                                const td = String(style.textDecoration || '');
                                // P0修复：更彻底地检测下划线（包括所有下划线相关属性）
                                const hasTextDecoration = td.indexOf('underline') !== -1;
                                const hasTextDecorationColor = style.textDecorationColor && style.textDecorationColor !== 'currentColor';
                                const hasTextDecorationThickness = style.textDecorationThickness && style.textDecorationThickness !== 'from-font';
                                match = tag === 'U' || hasTextDecoration || hasTextDecorationColor || hasTextDecorationThickness;
                            }
                            if (match) {
                                inStyle = true;
                                break;
                            }
                            parent = parent.parentElement;
                        }
                        if (!inStyle) {
                            newEndContainer = endContainer;
                            newEndOffset = endOffset;
                        }
                    }
                }
                
                // 如果end边界无效，使用文本搜索
                if (!newEndContainer) {
                    const originalText = range.toString();
                    const editorText = els.editorText.innerText || '';
                    const index = editorText.indexOf(originalText);
                    if (index !== -1) {
                        const textWalker = document.createTreeWalker(els.editorText, NodeFilter.SHOW_TEXT, null);
                        let currentPos = 0;
                        let textNode;
                        while ((textNode = textWalker.nextNode())) {
                            const nodeLength = textNode.textContent.length;
                            const nodeEnd = currentPos + nodeLength;
                            if (nodeEnd >= index + originalText.length) {
                                newEndContainer = textNode;
                                newEndOffset = Math.min(nodeLength, (index + originalText.length) - (currentPos));
                                break;
                            }
                            currentPos = nodeEnd;
                        }
                    }
                }
            }
            
            if (newStartContainer && newEndContainer) {
                sel.removeAllRanges();
                const newRange = document.createRange();
                newRange.setStart(newStartContainer, newStartOffset);
                newRange.setEnd(newEndContainer, newEndOffset);
                sel.addRange(newRange);
            return true;
        }
            
            // Fallback: 使用文本搜索
            try {
                const originalText = range.toString();
                if (!originalText) return false;
                
                const editorText = els.editorText.innerText || '';
                const index = editorText.indexOf(originalText);
                if (index === -1) return false;
                
                const textWalker = document.createTreeWalker(els.editorText, NodeFilter.SHOW_TEXT, null);
                let currentPos = 0;
                let startNode = null, startOff = 0;
                let endNode = null, endOff = 0;
                let textNode;
                
                while ((textNode = textWalker.nextNode())) {
                    const nodeLength = textNode.textContent.length;
                    const nodeStart = currentPos;
                    const nodeEnd = currentPos + nodeLength;
                    
                    if (startNode === null && nodeEnd > index) {
                        startNode = textNode;
                        startOff = Math.max(0, index - nodeStart);
                    }
                    
                    if (nodeEnd >= index + originalText.length) {
                        endNode = textNode;
                        endOff = Math.min(nodeLength, (index + originalText.length) - nodeStart);
                        break;
                    }
                    
                    currentPos = nodeEnd;
                }
                
                if (startNode && endNode) {
                sel.removeAllRanges();
                    const newRange = document.createRange();
                    newRange.setStart(startNode, startOff);
                    newRange.setEnd(endNode, endOff);
                    sel.addRange(newRange);
                    return true;
                }
            } catch (e) {
                debugLog('normalizeSelectionForStyle: text search fallback failed', e);
            }
            
            // 如果直接恢复失败，使用文本搜索方式（fallback）
            const originalText = range.toString();
            if (!originalText) return false;
            
            const editorText = els.editorText.innerText || '';
            const index = editorText.indexOf(originalText);
            if (index === -1) return false;
            
            const textWalker = document.createTreeWalker(els.editorText, NodeFilter.SHOW_TEXT, null);
            let currentPos = 0;
            let startNode = null, startOff = 0;
            let endNode = null, endOff = 0;
            let textNode;
            
            while ((textNode = textWalker.nextNode())) {
                const nodeLength = textNode.textContent.length;
                const nodeStart = currentPos;
                const nodeEnd = currentPos + nodeLength;
                
                if (startNode === null && nodeEnd > index) {
                    startNode = textNode;
                    startOff = Math.max(0, index - nodeStart);
                }
                
                if (nodeEnd >= index + originalText.length) {
                    endNode = textNode;
                    endOff = Math.min(nodeLength, (index + originalText.length) - nodeStart);
                    break;
                }
                
                currentPos = nodeEnd;
            }
            
            if (startNode && endNode) {
                sel.removeAllRanges();
                const newRange = document.createRange();
                newRange.setStart(startNode, startOff);
                newRange.setEnd(endNode, endOff);
                sel.addRange(newRange);
                return true;
            }
            
            return false;
        } catch (e) {
            debugLog('normalizeSelectionForStyle error:', e);
            return false;
        }
    }
    
    // 选区模式：检测样式是否全部应用（normalize后检测）
    function checkStyleActive(styleType) {
        if (!editorIsCE() || !els.editorText) return false;
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return false;
        const range = sel.getRangeAt(0);
        if (range.collapsed) return false;
        
        try {
            // 收集选区内的所有文本节点
            const textNodes = [];
            const walker = document.createTreeWalker(range.commonAncestorContainer, NodeFilter.SHOW_TEXT, null);
            let node;
            while ((node = walker.nextNode())) {
                if (range.intersectsNode(node) && node.textContent.trim()) {
                    textNodes.push(node);
                }
            }
            
            if (textNodes.length === 0) return false;
            
            // 检查每个文本节点是否都有样式
            for (const textNode of textNodes) {
                let hasStyle = false;
                let parent = textNode.parentElement;
                
                while (parent && els.editorText.contains(parent)) {
                    const style = parent.style || {};
                    const tag = parent.tagName || '';
                    
                    if (styleType === 'bold') {
                        const fw = String(style.fontWeight || '');
                        if (tag === 'B' || tag === 'STRONG' || fw === 'bold' || (Number(fw) || 0) >= 600) {
                            hasStyle = true;
                            break;
                }
                    } else if (styleType === 'italic') {
                        const fs = String(style.fontStyle || '');
                        if (tag === 'I' || tag === 'EM' || fs === 'italic') {
                            hasStyle = true;
                            break;
                        }
                    } else if (styleType === 'underline') {
                        const td = String(style.textDecoration || '');
                        // P0修复：更彻底地检测下划线（包括所有下划线相关属性）
                        const hasTextDecoration = td.indexOf('underline') !== -1;
                        const hasTextDecorationColor = style.textDecorationColor && style.textDecorationColor !== 'currentColor';
                        const hasTextDecorationThickness = style.textDecorationThickness && style.textDecorationThickness !== 'from-font';
                        if (tag === 'U' || hasTextDecoration || hasTextDecorationColor || hasTextDecorationThickness) {
                            hasStyle = true;
                            break;
                        }
                    }
                    
                    parent = parent.parentElement;
                    if (parent === els.editorText) break;
                }
                
                if (!hasStyle) return false;
            }
            
            return true;
        } catch (e) {
            debugLog('checkStyleActive error:', e);
            return false;
        }
    }
    
    // P0修复：参考参考文件实现 - 按属性级别应用样式（支持多属性叠加）
    function applyStyleToSelection(styleType) {
        if (!editorIsCE() || !els.editorText) return false;
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return false;
        const range = sel.getRangeAt(0);
        if (range.collapsed) return false;
        
        try {
            // 提取内容
            const contents = range.extractContents();
            
            // 创建样式对象
            let styleObj = {};
            if (styleType === 'bold') {
                styleObj.fontWeight = 600;
            } else if (styleType === 'italic') {
                styleObj.fontStyle = 'italic';
            } else if (styleType === 'underline') {
                styleObj.textDecoration = 'underline';
            }
            
            // 清理内容中可能存在的同类样式（sanitize）
            sanitizeFragmentStyles(contents, styleObj);
            
            // 创建样式 span
            const wrap = document.createElement('span');
            if (styleObj.fontWeight != null) wrap.style.fontWeight = String(styleObj.fontWeight);
            if (styleObj.fontStyle) {
                wrap.style.fontStyle = styleObj.fontStyle;
                wrap.style.transform = (styleObj.fontStyle === 'italic') ? 'skew(-10deg)' : 'none';
            }
            if (styleObj.textDecoration) {
                // P0修复：下划线使用 data-tb="u" 标记，便于结构化移除
                wrap.setAttribute('data-tb', 'u');
                wrap.style.textDecoration = styleObj.textDecoration;
                applyUnderlineExtras(wrap, styleObj);
            }
            
            wrap.appendChild(contents);
            range.insertNode(wrap);
            
            // 重新选择 wrap 节点
            sel.removeAllRanges();
            const r = document.createRange();
            r.selectNodeContents(wrap);
            sel.addRange(r);
            
            markEditorDirty();
            debugLog('APPLIED style', { styleType });
            return true;
        } catch (e) {
            debugLog('applyStyleToSelection error:', e);
            return false;
        }
    }
    
    // P0修复：参考参考文件实现 - 按属性级别移除样式（支持多属性独立移除）
    function removeStyleFromSelection(styleType) {
        if (!editorIsCE() || !els.editorText) return false;
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return false;
        const range = sel.getRangeAt(0);
        if (range.collapsed) return false;
        
        try {
            // 提取内容
            const contents = range.extractContents();
            
            // 创建样式对象（用于 sanitize）
            let styleObj = {};
            if (styleType === 'bold') {
                styleObj.fontWeight = 600;
            } else if (styleType === 'italic') {
                styleObj.fontStyle = 'italic';
            } else if (styleType === 'underline') {
                styleObj.textDecoration = 'underline';
            }
            
            // 清理内容中的样式（sanitize）
            sanitizeFragmentStyles(contents, styleObj);
            
            // P0修复：结构化移除下划线（unwrap data-tb="u" 和 <u> 标签）
            if (styleType === 'underline') {
                try {
                    // 1. Unwrap 所有 [data-tb="u"] 标记的 span（结构化移除）
                    const unwrapByAttribute = (root, attr, value) => {
                        const it = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, null);
                        let n;
                        const toUnwrap = [];
                        while ((n = it.nextNode())) {
                            if (n.getAttribute && n.getAttribute(attr) === value) {
                                toUnwrap.push(n);
                            }
                        }
                        toUnwrap.forEach(u => {
                            const p = u.parentNode;
                            while (u.firstChild) {
                                p.insertBefore(u.firstChild, u);
                            }
                            p.removeChild(u);
                        });
                    };
                    unwrapByAttribute(contents, 'data-tb', 'u');
                    
                    // 2. Unwrap 所有 <u> 标签（兼容历史内容）
                    const unwrapByTag = (root, tag) => {
                        const it = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, null);
                        let n;
                        const toUnwrap = [];
                        while ((n = it.nextNode())) {
                            if (n.tagName === tag) toUnwrap.push(n);
                        }
                        toUnwrap.forEach(u => {
                            const p = u.parentNode;
                            while (u.firstChild) {
                                p.insertBefore(u.firstChild, u);
                            }
                            p.removeChild(u);
                        });
                    };
                    unwrapByTag(contents, 'U');
                    
                    // 3. 处理混合样式：如果 span 同时承载其他属性，只移除 underline 相关属性
                    const walker = document.createTreeWalker(contents, NodeFilter.SHOW_ELEMENT, null);
                    let node;
                    while ((node = walker.nextNode())) {
                        const hasUnderline = node.style.textDecoration && 
                            (node.style.textDecoration.indexOf('underline') !== -1 ||
                             node.style.textDecorationLine && node.style.textDecorationLine.indexOf('underline') !== -1);
                        
                        if (hasUnderline) {
                            // 检查是否有其他样式属性（颜色、字号等）
                            const hasOtherStyles = node.style.color || 
                                node.style.fontSize || 
                                node.style.fontWeight || 
                                node.style.fontStyle ||
                                node.style.fontFamily;
                            
                            if (hasOtherStyles) {
                                // 只移除 underline 相关属性，保留其他属性
                                node.style.textDecoration = node.style.textDecoration.replace(/underline/g, '').trim() || '';
                                node.style.textDecorationColor = '';
                                node.style.textDecorationThickness = '';
                                node.style.textDecorationSkipInk = '';
                                node.style.textUnderlineOffset = '';
                                node.style.textDecorationLine = node.style.textDecorationLine ? 
                                    node.style.textDecorationLine.replace(/underline/g, '').trim() || '' : '';
                                
                                // 如果 textDecoration 为空，移除它
                                if (!node.style.textDecoration) {
                                    node.style.textDecoration = '';
                                }
                                
                                // 清理空的 style 属性
                                if (node.getAttribute && node.getAttribute('style') === '') {
                                    node.removeAttribute('style');
                                }
                            } else {
                                // 如果没有其他样式，unwrap 整个 span
                                const p = node.parentNode;
                                if (p) {
                                    while (node.firstChild) {
                                        p.insertBefore(node.firstChild, node);
                                    }
                                    p.removeChild(node);
                                }
                            }
                        }
                    }
                    
                    debugLog('removeStyleFromSelection: underline structured removal completed');
                } catch (e) {
                    debugLog('removeStyleFromSelection: underline cleanup error', e);
                }
            }
            
            // 使用临时容器插入内容（参考参考文件的实现）
            const temp = document.createElement('span');
            temp.className = 'tb-style-temp-select';
            temp.appendChild(contents);
            range.insertNode(temp);
            
            // 将内容移出临时容器
            const moved = [];
            while (temp.firstChild) {
                moved.push(temp.firstChild);
                temp.parentNode.insertBefore(temp.firstChild, temp);
            }
            temp.remove();
            
            // 重新选择
            const first = moved[0];
            const last = moved[moved.length - 1];
            sel.removeAllRanges();
            const r = document.createRange();
            if (first && last) {
                r.setStartBefore(first);
                r.setEndAfter(last);
            } else {
                r.setStart(range.startContainer, range.startOffset);
                r.setEnd(range.endContainer, range.endOffset);
            }
            sel.addRange(r);
            
            markEditorDirty();
            debugLog('REMOVED style', { styleType });
            return true;
        } catch (e) {
            debugLog('removeStyleFromSelection error:', e);
            return false;
        }
    }
    
    // 选区模式：toggle样式（最小可靠实现 - normalize → 检测 → toggle）
    function toggleSelectionStyle(styleType) {
        if (!editorIsCE() || !els.editorText) return false;
        
        // 重新获取Selection和Range（不复用旧对象）
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return false;
        const range = sel.getRangeAt(0);
        if (range.collapsed) return false;
        
        const selectedText = range.toString();
        debugLog('toggleSelectionStyle START', {
            styleType,
            textLength: selectedText.length,
            text: selectedText.substring(0, 20)
        });
        
        // 第一步：normalize（去除嵌套，清理DOM）
        const normalized = normalizeSelectionForStyle(styleType);
        if (!normalized) {
            debugLog('ERROR: normalizeSelectionForStyle failed');
            return false;
        }
        
        // 重新获取range（normalize后已恢复selection）
        const newSel = window.getSelection();
        if (!newSel || newSel.rangeCount === 0) {
            debugLog('ERROR: selection lost after normalize');
            return false;
        }
        const newRange = newSel.getRangeAt(0);
        if (newRange.collapsed) {
            debugLog('ERROR: range collapsed after normalize');
            return false;
        }
        
        // 调试：检查normalize后的selection是否还在样式元素中
        const startParent = newRange.startContainer.nodeType === 3 ? newRange.startContainer.parentElement : newRange.startContainer;
        const endParent = newRange.endContainer.nodeType === 3 ? newRange.endContainer.parentElement : newRange.endContainer;
        let startInStyle = false, endInStyle = false;
        let parent = startParent;
        while (parent && els.editorText.contains(parent)) {
            const style = parent.style || {};
            const tag = parent.tagName || '';
            if (styleType === 'bold') {
                const fw = String(style.fontWeight || '');
                if (tag === 'B' || tag === 'STRONG' || fw === 'bold' || (Number(fw) || 0) >= 600) {
                    startInStyle = true;
                    break;
                }
            }
            parent = parent.parentElement;
        }
        parent = endParent;
        while (parent && els.editorText.contains(parent)) {
            const style = parent.style || {};
            const tag = parent.tagName || '';
            if (styleType === 'bold') {
                const fw = String(style.fontWeight || '');
                if (tag === 'B' || tag === 'STRONG' || fw === 'bold' || (Number(fw) || 0) >= 600) {
                    endInStyle = true;
                    break;
                }
            }
            parent = parent.parentElement;
        }
        debugLog('after normalize check:', { startInStyle, endInStyle, startParentTag: startParent.tagName, endParentTag: endParent.tagName });
        
        // 第二步：检测当前样式状态（normalize后检测）
        const isActive = checkStyleActive(styleType);
        debugLog('current state (after normalize):', { isActive, willToggle: !isActive });
        
        // 第三步：toggle（isActive=true则移除，false则应用）
        const success = isActive ? removeStyleFromSelection(styleType) : applyStyleToSelection(styleType);
        
        if (success) {
            // 验证
            setTimeout(() => {
                const verifySel = window.getSelection();
                if (verifySel && verifySel.rangeCount > 0) {
                    const verifyRange = verifySel.getRangeAt(0);
                    if (!verifyRange.collapsed) {
                        const verifyActive = checkStyleActive(styleType);
                        debugLog('VERIFY after toggle:', { 
                            verifyActive, 
                            expected: !isActive,
                            match: verifyActive === !isActive ? '✓' : '✗'
                        });
                    }
                }
            }, 10);
        }
        
        return success;
    }
    
    // 重构 v2：移除 removeStyleAtCaret 函数
    // Input Mode 下光标样式只来自 typingStyleState，不操作 DOM
    
    // P0修复：应用内联样式到选区 - 应用后保持选区选中状态（即时显色）
    function applyInlineStyleToSelection(styleObj) {
        if (!editorIsCE()) return;
        if (!els.editorText) return;
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return;
        const range = sel.getRangeAt(0);
        if (range.collapsed) return;
        
        const wrap = document.createElement('span');
        if (styleObj.fontFamily) wrap.style.fontFamily = styleObj.fontFamily;
        if (styleObj.fontSize) wrap.style.fontSize = `${styleObj.fontSize}px`;
        if (styleObj.fontWeight != null) wrap.style.fontWeight = String(styleObj.fontWeight);
        if (styleObj.fontStyle) {
            wrap.style.fontStyle = styleObj.fontStyle;
            wrap.style.transform = (styleObj.fontStyle === 'italic') ? 'skew(-10deg)' : 'none';
        }
        if (styleObj.textDecoration) { 
            wrap.style.textDecoration = styleObj.textDecoration; 
            applyUnderlineExtras(wrap, styleObj); 
        }
        if (styleObj.color) wrap.style.color = styleObj.color;
        
        const contents = range.extractContents();
        sanitizeFragmentStyles(contents, styleObj);
        wrap.appendChild(contents);
        range.insertNode(wrap);
        
        // P0修复：恢复选区到包裹后的内容（确保选区保持选中状态，即时显色）
        try {
            const newRange = document.createRange();
            newRange.setStartBefore(wrap);
            newRange.setEndAfter(wrap);
            sel.removeAllRanges();
            sel.addRange(newRange);
        } catch {}
        
        markEditorDirty();
    }
    // P0修复：在光标位置插入样式span（参考参考文件实现）
    // 这样后续输入会自动继承这个span的样式
    function insertStyledSpanAtCaret(styleObj) {
        if (!editorIsCE()) return;
        if (!els.editorText) return;
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return;
        const range = sel.getRangeAt(0);
        if (!range.collapsed) return; // 只在光标模式下使用
        
        const wrap = document.createElement('span');
        if (styleObj.fontFamily) wrap.style.fontFamily = styleObj.fontFamily;
        if (styleObj.fontSize) wrap.style.fontSize = `${styleObj.fontSize}px`;
        if (styleObj.fontWeight != null) wrap.style.fontWeight = String(styleObj.fontWeight);
        if (styleObj.fontStyle) {
            wrap.style.fontStyle = styleObj.fontStyle;
            wrap.style.transform = (styleObj.fontStyle === 'italic') ? 'skew(-10deg)' : 'none';
        }
        if (styleObj.textDecoration) { 
            // P0修复：下划线使用 data-tb="u" 标记，便于结构化移除
            wrap.setAttribute('data-tb', 'u');
            wrap.style.textDecoration = styleObj.textDecoration; 
            applyUnderlineExtras(wrap, styleObj); 
        }
        if (styleObj.color) wrap.style.color = styleObj.color;
        
        // 插入零宽空格，这样后续输入会自动继承样式
        const textNode = document.createTextNode('\u200B');
        wrap.appendChild(textNode);
        range.insertNode(wrap);
        
        // 将光标定位到span内的文本节点末尾
        try {
            sel.removeAllRanges();
            const r = document.createRange();
            r.setStart(wrap.firstChild, 1);
            r.setEnd(wrap.firstChild, 1);
            sel.addRange(r);
        } catch {}
    }
    
    // —— 编辑保存确认弹窗（返回时提示是否保存） ——
    function showEditSaveConfirm(onSave, onDiscard) {
        const overlay = document.createElement('section');
        overlay.className = 'tb-confirm-overlay is-open';
        overlay.setAttribute('aria-hidden', 'false');

        const dialog = document.createElement('div');
        dialog.className = 'tb-confirm-dialog';
        dialog.setAttribute('role', 'dialog');
        dialog.setAttribute('aria-labelledby', 'editSaveConfirmTitle');

        const title = document.createElement('h3');
        title.id = 'editSaveConfirmTitle';
        title.className = 'tb-confirm-title';
        title.textContent = '是否保存修改？';

        const desc = document.createElement('p');
        desc.className = 'tb-confirm-desc';
        desc.textContent = '当前内容已修改，返回将丢弃未保存的更改。';

        const actions = document.createElement('div');
        actions.className = 'tb-confirm-actions';
        const btnSave = document.createElement('button');
        btnSave.className = 'tb-btn tb-btn-chalk-white';
        btnSave.textContent = '保存';
        const btnDiscard = document.createElement('button');
        btnDiscard.className = 'tb-btn tb-btn-chalk-white';
        btnDiscard.textContent = '不保存';

        actions.appendChild(btnSave);
        actions.appendChild(btnDiscard);
        dialog.appendChild(title);
        dialog.appendChild(desc);
        dialog.appendChild(actions);
        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        const close = () => {
            overlay.classList.remove('is-open');
            overlay.setAttribute('aria-hidden', 'true');
            setTimeout(() => overlay.remove(), 300);
        };

        btnSave.addEventListener('click', () => {
            close();
            if (onSave) onSave();
        });
        btnDiscard.addEventListener('click', () => {
            close();
            if (onDiscard) onDiscard();
        });
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                close();
                if (onDiscard) onDiscard();
            }
        });
    }
    
    // —— 编辑清空确认弹窗（编辑场景专用，不影响"清空黑板"） ——
    function showEditEmptyConfirm(onConfirm, onDiscard) {
        const overlay = document.createElement('section');
        overlay.className = 'tb-confirm-overlay is-open';
        overlay.setAttribute('aria-hidden', 'false');

        const dialog = document.createElement('div');
        dialog.className = 'tb-confirm-dialog';
        dialog.setAttribute('role', 'dialog');
        dialog.setAttribute('aria-labelledby', 'editConfirmTitle');

        const title = document.createElement('h3');
        title.id = 'editConfirmTitle';
        title.className = 'tb-confirm-title';
        title.textContent = '是否保存更改？';

        const desc = document.createElement('p');
        desc.className = 'tb-confirm-desc';
        desc.textContent = '当前内容已被清空，确认后将删除此记录。';

        const actions = document.createElement('div');
        actions.className = 'tb-confirm-actions';
        const btnConfirm = document.createElement('button');
        btnConfirm.className = 'tb-btn tb-btn-chalk-white';
        btnConfirm.textContent = '保存';
        const btnDiscard = document.createElement('button');
        btnDiscard.className = 'tb-btn tb-btn-chalk-white';
        btnDiscard.textContent = '不保存';

        actions.appendChild(btnConfirm);
        actions.appendChild(btnDiscard);
        dialog.appendChild(title);
        dialog.appendChild(desc);
        dialog.appendChild(actions);
        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        const close = () => { overlay.remove(); };
        btnConfirm.addEventListener('click', () => { try { onConfirm && onConfirm(); } finally { close(); } });
        btnDiscard.addEventListener('click', () => { try { onDiscard && onDiscard(); } finally { close(); } });
        // 点击遮罩空白区域视为“不保存”
        overlay.addEventListener('click', (e) => { if (e.target === overlay) { try { onDiscard && onDiscard(); } finally { close(); } } });
    }
    function applyEdit() {
        const txtRaw = getEditorPlainText() || '';
        const txt = txtRaw.trim();
        const htmlRaw = getEditorHTML() || '';
        const htmlSanitized = sanitizeEditorHTML(htmlRaw);
        const list = loadRecords();

        // 新建
        if (editingIndex == null) {
            // 文本与图片都为空（考虑 CE 下的勾选行占位）→ 不保存，直接返回一级界面
            if (!hasMeaningfulEditorContent() && editingImages.length === 0) {
                exitEditor();
                if (els.todayText) els.todayText.value = '';
                return;
            }
            // 有文本或有图片 → 允许保存（纯图片记录也可）
            addRecord(txt, editingImages.slice(), editingImageNames.slice(), editorIsCE() ? htmlSanitized : '');
            editorDirty = false; // 保存后重置dirty状态
            exitEditor();
            if (els.todayText) els.todayText.value = '';
            return;
        }

        // 修改
        if (editingIndex < 0 || editingIndex >= list.length) { exitEditor(); return; }
        const rec = list[editingIndex];

        // 编辑后变成空内容（文本与图片都空）→ 直接删除并返回（提交不弹窗）
        if (!hasMeaningfulEditorContent() && editingImages.length === 0) {
            const remain = list.filter((_, i) => i !== editingIndex);
            saveRecords(remain);
            renderRecords();
            editorDirty = false; // 删除后重置dirty状态
            exitEditor();
            return;
        }

        // 正常修改（有内容）→ 保存并返回一级界面
        list[editingIndex] = { 
            ...rec,
            text: txt,
            textHtml: (editorIsCE() ? htmlSanitized : (rec.textHtml || '')),
            images: editingImages.slice(),
            imageNames: editingImageNames.slice(),
            textStyle: { 
                fontSize: editingStyle.fontSize,
                fontWeight: editingStyle.fontWeight,
                fontStyle: editingStyle.fontStyle,
                textDecoration: editingStyle.textDecoration,
                fontColor: editingStyle.fontColor,
            },
            richText: (() => {
                try {
                    if (editorIsCE() && els.editorText) return extractRichTextFromHtml(els.editorText);
                    if (htmlRaw && htmlRaw.trim().length > 0) {
                        const tmp = document.createElement('div');
                        tmp.innerHTML = htmlRaw;
                        return extractRichTextFromHtml(tmp);
                    }
                    return rec.richText || [];
                } catch { return rec.richText || []; }
            })(),
        };
        saveRecords(list);
        renderRecords();
        editorDirty = false; // 保存后重置dirty状态
        exitEditor();
        if (els.todayText) els.todayText.value = '';
    }

    /* ---------- 工具函数 ---------- */
    const formatDateYMD = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const formatTimeHM = d => `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
    const parseHMToMinutes = (hm) => {
        if (!hm || typeof hm !== 'string') return null;
        const parts = hm.split(':');
        if (parts.length !== 2) return null;
        const h = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10);
        if (Number.isNaN(h) || Number.isNaN(m)) return null;
        return h * 60 + m;
    };

    // ---- 图片文件命名工具 ----
    const formatDateCompact = d => `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
    const formatTimeHMSCompact = d => `${String(d.getHours()).padStart(2,'0')}${String(d.getMinutes()).padStart(2,'0')}${String(d.getSeconds()).padStart(2,'0')}`;
    const randomAlphaNum4 = () => {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let s = '';
        for (let i = 0; i < 4; i++) s += chars[Math.floor(Math.random() * chars.length)];
        return s;
    };
    const sanitizeFilename = name => name.replace(/[^A-Za-z0-9_\.-]/g, '');
    const getExtFromMime = (mime) => {
        if (!mime || typeof mime !== 'string') return 'png';
        const m = mime.toLowerCase();
        if (m.includes('jpeg') || m.includes('jpg')) return 'jpg';
        if (m.includes('png')) return 'png';
        if (m.includes('gif')) return 'gif';
        if (m.includes('webp')) return 'webp';
        return 'png';
    };
    const getExtFromDataUrl = (dataUrl) => {
        if (!dataUrl || typeof dataUrl !== 'string') return null;
        const m = dataUrl.match(/^data:image\/(\w+)/i);
        if (!m) return null;
        return getExtFromMime(`image/${m[1]}`);
    };
    const generateTBFileName = (ext) => {
        try {
            const now = new Date();
            const ymd = formatDateCompact(now);
            const hms = formatTimeHMSCompact(now);
            let tries = 0;
            while (tries < 3) {
                const rand = randomAlphaNum4();
                const name = sanitizeFilename(`todayboard_${ymd}_${hms}_${rand}.${ext || 'png'}`);
                if (name && name.length > 0) return name;
                tries++;
            }
            return sanitizeFilename(`todayboard_${ymd}_${hms}.${ext || 'png'}`);
        } catch {
            const now = new Date();
            const ymd = formatDateCompact(now);
            const hms = formatTimeHMSCompact(now);
            return sanitizeFilename(`todayboard_${ymd}_${hms}.${ext || 'png'}`);
        }
    };

    function getBoardContentWidth() {
        try {
            const main = document.querySelector('.tb-main');
            const editorOpen = !!(els.editorOverlay && els.editorOverlay.classList.contains('is-open'));
            if (editorOpen && els.editorText && els.editorText.offsetWidth) return els.editorText.offsetWidth;
            if (main && main.offsetWidth) return main.offsetWidth;
        } catch {}
        return 600;
    }

    function setTodayDate() {
        const todayStr = formatDateYMD(new Date());
        if (els.todayDate) els.todayDate.textContent = todayStr;
        if (els.cardDate) els.cardDate.textContent = todayStr;
        return todayStr;
    }

    /* ---------- 欢迎层 ---------- */
    function openGuideIfNeeded() {
        const hasSeen = localStorage.getItem(STORAGE_KEYS.HAS_SEEN_GUIDE) === 'true';
        if (!els.guideOverlay) return;
        if (!hasSeen) {
            els.guideOverlay.classList.add('is-open');
            els.guideOverlay.setAttribute('aria-hidden','false');
        } else {
            els.guideOverlay.classList.remove('is-open');
            els.guideOverlay.setAttribute('aria-hidden','true');
        }
    }
    function confirmGuide() {
        localStorage.setItem(STORAGE_KEYS.HAS_SEEN_GUIDE, 'true');
        if (!els.guideOverlay) return;
        els.guideOverlay.classList.remove('is-open');
        els.guideOverlay.setAttribute('aria-hidden','true');
    }

    /* ---------- 记录读写 ---------- */
    function loadRecords() {
        try {
            const raw = localStorage.getItem(STORAGE_KEYS.TODAY_RECORDS);
            return raw ? JSON.parse(raw) : [];
        } catch { return []; }
    }
    function saveRecords(list) {
        localStorage.setItem(STORAGE_KEYS.TODAY_RECORDS, JSON.stringify(list));
    }

    /* ---------- JSON 备份/恢复 ---------- */
    // 导出 JSON 备份
    function exportBackup() {
        try {
            const lastDate = localStorage.getItem(STORAGE_KEYS.LAST_DATE) || '';
            const todayRecords = loadRecords();
            
            const backup = {
                app: 'TodayBoard',
                schema: 'todayboard.backup.v1',
                build: BUILD_DATE,
                exportedAt: new Date().toISOString(),
                device: {
                    ua: navigator.userAgent || ''
                },
                data: {
                    lastDate: lastDate,
                    todayRecords: todayRecords
                }
            };
            
            const jsonStr = JSON.stringify(backup, null, 2);
            const blob = new Blob([jsonStr], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            
            // 生成文件名：todayboard_backup_YYYY-MM-DD_HHMM.json
            const now = new Date();
            const year = now.getFullYear();
            const month = String(now.getMonth() + 1).padStart(2, '0');
            const day = String(now.getDate()).padStart(2, '0');
            const hours = String(now.getHours()).padStart(2, '0');
            const minutes = String(now.getMinutes()).padStart(2, '0');
            const filename = `todayboard_backup_${year}-${month}-${day}_${hours}${minutes}.json`;
            
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            showToast('备份已导出');
        } catch (e) {
            console.error('导出备份失败', e);
            showToast('导出失败：' + (e.message || '未知错误'));
        }
    }

    // 导入 JSON 备份
    let pendingRestoreData = null;
    
    function importBackup() {
        if (!els.jsonInput) {
            showToast('文件选择器未找到');
            return;
        }
        els.jsonInput.click();
    }
    
    function handleJsonFileSelect(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const jsonStr = e.target.result;
                const backup = JSON.parse(jsonStr);
                
                // 校验备份格式
                if (!backup.app || backup.app !== 'TodayBoard') {
                    showToast('无效的备份文件：app 字段不匹配');
                    return;
                }
                if (!backup.schema || backup.schema !== 'todayboard.backup.v1') {
                    showToast('无效的备份文件：schema 字段不匹配');
                    return;
                }
                if (!backup.data || typeof backup.data !== 'object') {
                    showToast('无效的备份文件：data 字段缺失');
                    return;
                }
                if (!Array.isArray(backup.data.todayRecords)) {
                    showToast('无效的备份文件：todayRecords 必须是数组');
                    return;
                }
                
                // 保存待恢复的数据
                pendingRestoreData = backup.data;
                
                // 显示确认弹窗
                openConfirmRestore();
            } catch (e) {
                console.error('解析备份文件失败', e);
                showToast('解析失败：' + (e.message || '文件格式错误'));
            }
        };
        reader.onerror = function() {
            showToast('读取文件失败');
        };
        reader.readAsText(file);
        
        // 清空文件选择，以便可以重复选择同一文件
        event.target.value = '';
    }
    
    function openConfirmRestore() {
        if (!els.confirmRestoreOverlay) {
            // 如果没有弹窗，直接恢复
            performRestore();
            return;
        }
        els.confirmRestoreOverlay.classList.remove('visually-hidden');
        els.confirmRestoreOverlay.setAttribute('aria-hidden', 'false');
        els.confirmRestoreOverlay.classList.add('is-open');
    }
    
    function closeConfirmRestore() {
        if (!els.confirmRestoreOverlay) return;
        els.confirmRestoreOverlay.classList.add('visually-hidden');
        els.confirmRestoreOverlay.setAttribute('aria-hidden', 'true');
        els.confirmRestoreOverlay.classList.remove('is-open');
        pendingRestoreData = null;
    }
    
    function performRestore() {
        if (!pendingRestoreData) {
            showToast('没有待恢复的数据');
            return;
        }
        
        try {
            const { lastDate, todayRecords } = pendingRestoreData;
            
            // 写入 localStorage
            if (lastDate !== undefined && lastDate !== null) {
                localStorage.setItem(STORAGE_KEYS.LAST_DATE, String(lastDate));
            }
            if (Array.isArray(todayRecords)) {
                saveRecords(todayRecords);
            }
            
            // 刷新 UI
            renderRecords();
            
            // 关闭确认弹窗
            closeConfirmRestore();
            
            showToast('数据恢复成功');
        } catch (e) {
            console.error('恢复数据失败', e);
            if (e.name === 'QuotaExceededError' || e.code === 22) {
                showToast('空间不足，无法恢复数据');
            } else {
                showToast('恢复失败：' + (e.message || '未知错误'));
            }
            closeConfirmRestore();
        }
    }
    function addRecord(text, images, imageNames, textHtml) {
        const now = new Date();
        const nowHM = formatTimeHM(now);
        const list = loadRecords();

        const incomingText = (text || '').trim();
        const incomingImages = Array.isArray(images) ? images : [];
        const incomingNames = Array.isArray(imageNames) ? imageNames : [];
        const incomingHtml = typeof textHtml === 'string' ? textHtml : '';
        // 若名称数量与图片不一致，则为每张图片生成规范文件名
        const normalizedNames = incomingImages.map((u, i) => {
            if (incomingNames[i] && typeof incomingNames[i] === 'string') return incomingNames[i];
            const ext = getExtFromDataUrl(u) || 'png';
            return generateTBFileName(ext);
        });
        // 生成富文本结构
        let richText = [];
        try {
            if (incomingHtml && incomingHtml.trim().length > 0) {
                const tmp = document.createElement('div');
                tmp.innerHTML = incomingHtml;
                richText = extractRichTextFromHtml(tmp);
            } else if (editorIsCE() && els.editorText) {
                richText = extractRichTextFromHtml(els.editorText);
            } else {
                richText = [{ text: incomingText || '', font: 'PingFang SC', color: editingStyle.fontColor || '#FFFFFF' }];
            }
        } catch {
            richText = [{ text: incomingText || '', font: 'PingFang SC', color: editingStyle.fontColor || '#FFFFFF' }];
        }
        // 始终新建记录：移除 1 分钟合并逻辑
        list.push({
            time: nowHM,
            text: incomingText || '',
            textHtml: incomingHtml || '',
            images: incomingImages,
            imageNames: normalizedNames,
            pinned: false,
            textStyle: {
                fontSize: editingStyle.fontSize,
                fontWeight: editingStyle.fontWeight,
                fontStyle: editingStyle.fontStyle,
                textDecoration: editingStyle.textDecoration,
                fontColor: editingStyle.fontColor,
            },
            richText: richText,
        });
        saveRecords(list);
        renderRecords();
    }

    /* ---------- 渲染记录 ---------- */
    function renderRecords() {
        const list = loadRecords();
        if (!els.recordsList) return;
        if (!els.recordsEmpty) return;
        if (list.length === 0) {
            els.recordsList.innerHTML = '';
            els.recordsEmpty.style.display = 'block';
            selectedSet.clear();
            updateMultiSelectUI();
            return;
        }
        els.recordsEmpty.style.display = 'none';
        const frag = document.createDocumentFragment();
        els.recordsList.innerHTML = '';
        // 置顶优先的稳定排序：先置顶，再按原始索引升序
        const mapped = list.map((rec, baseIndex) => ({ rec, baseIndex }));
        mapped.sort((a, b) => {
            const ap = a.rec && a.rec.pinned ? 1 : 0;
            const bp = b.rec && b.rec.pinned ? 1 : 0;
            if (ap !== bp) return bp - ap; // 置顶在前
            return a.baseIndex - b.baseIndex; // 稳定原始顺序
        });
        mapped.forEach((entry, displayIdx) => {
            const rec = entry.rec;
            const idx = entry.baseIndex; // 底层索引用于选择/编辑
            const item = document.createElement('article');
            item.className = 'tb-record' + (rec.pinned ? ' is-pinned' : '');
            if (selectedSet.has(idx)) {
                item.classList.add('is-selected');
            }

            const head = document.createElement('div');
            head.className = 'tb-record-head';
            const left = document.createElement('div');
            left.style.display = 'inline-flex';
            left.style.gap = '8px';
            left.innerHTML = `<span class="tb-record-index">${displayIdx + 1}.</span>
                              <span class="tb-record-time">${rec.time}</span>`;
            const actions = document.createElement('div');
            actions.className = 'tb-record-actions';

            // 置顶优先：
            // - 置顶且未选中：显示红色图钉，点击进入选中态（✓），并出现浮动栏
            // - 置顶且已选中：显示✓，点击取消选中，恢复红色图钉
            // - 非置顶：保持圆圈/勾选逻辑
            if (rec.pinned) {
                const pressed = selectedSet.has(idx);
                if (pressed) {
                    const selectBtn = document.createElement('button');
                    selectBtn.className = 'tb-record-select';
                    selectBtn.setAttribute('aria-pressed', 'true');
                    selectBtn.textContent = '✓';
                    selectBtn.removeAttribute('title');
                    selectBtn.setAttribute('data-tooltip', '已选中');
                    selectBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        toggleSelected(idx); // 取消选中，恢复为红色图钉
                    });
                    actions.appendChild(selectBtn);
                } else {
                    const pinIcon = document.createElement('button');
                    pinIcon.className = 'tb-record-pin';
                    pinIcon.setAttribute('aria-pressed', 'false');
                    const glyph = document.createElement('span');
                    glyph.className = 'tb-pin-glyph';
                    glyph.textContent = '📌';
                    pinIcon.appendChild(glyph);
                    pinIcon.addEventListener('click', (e) => {
                        e.stopPropagation();
                        toggleSelected(idx); // 进入选中态，显示✓并打开浮动栏
                    });
                    actions.appendChild(pinIcon);
                }
            } else {
                const selectBtn = document.createElement('button');
                selectBtn.className = 'tb-record-select';
                const pressed = selectedSet.has(idx);
                selectBtn.setAttribute('aria-pressed', pressed ? 'true' : 'false');
                selectBtn.textContent = pressed ? '✓' : '○';
                selectBtn.removeAttribute('title');
                selectBtn.setAttribute('data-tooltip', pressed ? '已选中' : '选择');
                selectBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    toggleSelected(idx);
                });
                actions.appendChild(selectBtn);
            }

            head.appendChild(left);
            head.appendChild(actions);

            item.appendChild(head);

            if (rec.text || (rec.textHtml && rec.textHtml.trim().length > 0)) {
                const content = document.createElement('div');
                content.className = 'tb-record-content';
                // 当存在富文本时，样式由富文本内联节点决定，不再对容器整体应用 textStyle，避免“部分斜体导致整体斜体”
                if (!(rec.textHtml && rec.textHtml.trim().length > 0) && rec.textStyle) {
                    content.setAttribute('style', styleToInline(rec.textStyle));
                }
                if (rec.textHtml && rec.textHtml.trim().length > 0) {
                    content.innerHTML = rec.textHtml;
                    (function normalizeImages(container){
                        const imgsInline = Array.from(container.querySelectorAll('img.todayboard-img'));
                        imgsInline.forEach(img => {
                            try { img.style.width = ''; img.style.height = ''; } catch {}
                            const already = img.closest('.tb-img-wrapper');
                            if (!already) {
                                const wrap = document.createElement('span');
                                wrap.className = 'tb-img-wrapper';
                                img.parentNode.insertBefore(wrap, img);
                                wrap.appendChild(img);
                            }
                        });
                    })(content);
                    (function normalizeImageLines(container){
                        const nodes = Array.from(container.childNodes);
                        for (let i = 0; i < nodes.length; i++) {
                            const n = nodes[i];
                            if (n.nodeType === 1 && (n.tagName === 'P' || n.tagName === 'DIV')) {
                                const isImgOnly = Array.from(n.childNodes).every(ch => {
                                    if (ch.nodeType === 3) return ch.textContent.trim() === '';
                                    if (ch.nodeType !== 1) return false;
                                    const el = ch;
                                    return (el.classList && el.classList.contains('tb-img-wrapper')) || (el.tagName === 'IMG' && el.classList.contains('todayboard-img'));
                                });
                                if (isImgOnly) {
                                    n.classList.add('tb-image-line');
                                    let j = i + 1;
                                    while (j < nodes.length) {
                                        const m = nodes[j];
                                        const mImgOnly = m && m.nodeType === 1 && (m.tagName === 'P' || m.tagName === 'DIV') && Array.from(m.childNodes).every(ch => {
                                            if (ch.nodeType === 3) return ch.textContent.trim() === '';
                                            if (ch.nodeType !== 1) return false;
                                            const el = ch;
                                            return (el.classList && el.classList.contains('tb-img-wrapper')) || (el.tagName === 'IMG' && el.classList.contains('todayboard-img'));
                                        });
                                        if (!mImgOnly) break;
                                        Array.from(m.childNodes).forEach(ch => n.appendChild(ch));
                                        m.remove();
                                        nodes.splice(j,1);
                                    }
                                }
                            }
                        }
                    })(content);
                    
                    // P0修复：首页轻编辑 - 为任务行添加勾选功能，禁止编辑文本内容
                    (function setupBoardLightEdit(container, recordIdx) {
                        // 移除所有 contenteditable，确保首页不能编辑文本
                        const allEditable = container.querySelectorAll('[contenteditable="true"]');
                        allEditable.forEach(el => {
                            el.removeAttribute('contenteditable');
                            el.setAttribute('contenteditable', 'false');
                        });
                        
                        // 为任务行添加轻编辑支持（勾选/取消任务）
                        const taskLines = Array.from(container.querySelectorAll('.tb-check-line'));
                        taskLines.forEach(taskLine => {
                            const checkbox = taskLine.querySelector('.tb-check');
                            const textEl = taskLine.querySelector('.tb-check-text');
                            
                            if (checkbox) {
                                // 确保 checkbox 可点击
                                checkbox.style.cursor = 'pointer';
                                checkbox.setAttribute('tabindex', '0');
                                
                                // 点击 checkbox 切换任务状态
                                checkbox.addEventListener('click', (e) => {
                                    e.stopPropagation();
                                    toggleBoardChecklistItem(taskLine, recordIdx);
                                });
                                
                                // 键盘支持（空格/回车）
                                checkbox.addEventListener('keydown', (e) => {
                                    if (e.key === ' ' || e.key === 'Enter') {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        toggleBoardChecklistItem(taskLine, recordIdx);
                                    }
                                });
                            }
                            
                            // 确保文本不可编辑
                            if (textEl) {
                                textEl.removeAttribute('contenteditable');
                                textEl.setAttribute('contenteditable', 'false');
                                textEl.style.cursor = 'default';
                            }
                        });
                        
                        // 为普通文本行添加双击转换为任务行的功能
                        const textLines = Array.from(container.querySelectorAll('div:not(.tb-check-line):not(.tb-img-wrapper)'));
                        textLines.forEach(textLine => {
                            // 跳过图片行和空行
                            if (textLine.classList.contains('tb-image-line') || 
                                textLine.textContent.trim().length === 0) {
                                return;
                            }
                            
                            textLine.style.cursor = 'pointer';
                            textLine.setAttribute('title', '双击转换为任务');
                            
                            let doubleClickTimer = null;
                            textLine.addEventListener('dblclick', (e) => {
                                e.stopPropagation();
                                convertTextLineToTaskLine(textLine, recordIdx);
                            });
                        });
                    })(content, idx);
                } else {
                    // 纯文本记录：允许应用整体样式
                    content.textContent = rec.text;
                    
                    // 为纯文本记录添加双击转换为任务行的功能
                    content.style.cursor = 'pointer';
                    content.setAttribute('title', '双击转换为任务');
                    content.addEventListener('dblclick', (e) => {
                        e.stopPropagation();
                        convertTextLineToTaskLine(content, idx);
                    });
                }
                item.appendChild(content);
            }

            const divider = document.createElement('div');
            divider.className = 'tb-divider';
            item.appendChild(divider);
            frag.appendChild(item);
        });
        els.recordsList.appendChild(frag);
        updateMultiSelectUI();
    }

    /* ---------- 图片压缩（v1规范：统一源图原则） ---------- */
    // 系统源图配置：只处理一次，所有页面复用
    const SOURCE_IMAGE_COMPRESS = {
        maxEdge: 1600, // 最大边长 1600px（更稳定），推荐值：1600px 或 2048px
        quality: 0.85, // JPEG quality ≈ 0.85
        mimeType: 'image/jpeg', // 无透明需求时使用 JPEG
        fillColor: '#1B1B1B', // 填充色（黑板背景）
        maxImages: 6, // 单次最多插入图片数
    };
    // v1规范：统一源图处理函数（只处理一次，保持等比例）
    function processSourceImage(file, { maxEdge, quality, mimeType, fillColor }) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                const img = new Image();
                img.onload = () => {
                    // v1规范：保持等比例，计算缩放比例
                    const maxDimension = Math.max(img.width, img.height);
                    const scale = maxDimension > maxEdge ? maxEdge / maxDimension : 1;
                    const w = Math.round(img.width * scale);
                    const h = Math.round(img.height * scale);
                    
                    const canvas = document.createElement('canvas');
                    canvas.width = w;
                    canvas.height = h;
                    const ctx = canvas.getContext('2d');
                    
                    // 填充背景色（仅 JPEG 需要）
                    if (mimeType === 'image/jpeg' && fillColor) {
                        ctx.fillStyle = fillColor;
                    ctx.fillRect(0, 0, w, h);
                    }
                    
                    // v1规范：等比例绘制，禁止变形
                    ctx.drawImage(img, 0, 0, w, h);
                    
                    try {
                        resolve(canvas.toDataURL(mimeType || 'image/jpeg', quality));
                    } catch (e) { reject(e); }
                };
                img.onerror = reject;
                img.src = reader.result;
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    // v1规范：不再读取原图，统一使用系统源图
    // 此函数保留用于兼容性，但不再使用

    /* ---------- 拍照便签：主界面拍照后直接作为新便签 ---------- */
    async function handleCameraPhoto(ev) {
        // #region agent log
        const input = ev && ev.target;
        const fileList = input && input.files;
        const captureAttr = input ? input.getAttribute('capture') : null;
        const isCameraInput = input && input.id === 'cameraInput';
        fetch('http://127.0.0.1:7243/ingest/a11b6c32-3942-4660-9c8b-9fa7d3127c4a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app.js:handleCameraPhoto',message:'cameraInput change fired',data:{fileCount:fileList?fileList.length:0,inputId:input?input.id:null,captureAttr:captureAttr,isCameraInput:isCameraInput,accept:input?input.accept:null},timestamp:Date.now(),hypothesisId:'H4'})}).catch(function(){});
        // #endregion
        if (!fileList || fileList.length === 0) {
            if (els.cameraInput) els.cameraInput.value = '';
            return;
        }
        const file = Array.from(fileList).find(f => f.type.startsWith('image/'));
        if (els.cameraInput) els.cameraInput.value = '';
        if (!file) {
            showToast('请拍摄或选择一张图片');
            return;
        }
        try {
            showToast('正在处理…');
            const sourceImage = await processSourceImage(file, SOURCE_IMAGE_COMPRESS);
            const ext = getExtFromMime(file.type);
            const name = generateTBFileName(ext);
            const escapedSrc = (sourceImage || '').replace(/"/g, '&quot;');
            const textHtml = '<p><span class="tb-img-wrapper"><img src="' + escapedSrc + '" class="todayboard-img" alt="" /></span></p>';
            const nowHM = formatTimeHM(new Date());
            const list = loadRecords();
            list.push({
                time: nowHM,
                text: '',
                textHtml: textHtml,
                images: [sourceImage],
                imageNames: [name],
                pinned: false,
                textStyle: {},
                richText: [],
            });
            saveRecords(list);
            renderRecords();
            showToast('已添加拍照便签');
        } catch (err) {
            console.error('拍照便签处理失败', err);
            showToast('添加失败，请重试');
        }
    }

    /* ---------- 图片选择（v1规范：统一源图原则） ---------- */
    async function handleSelectedImages(fileList) {
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/a11b6c32-3942-4660-9c8b-9fa7d3127c4a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app.js:handleSelectedImages',message:'imageInput change fired (gallery/import)',data:{fileCount:fileList?fileList.length:0},timestamp:Date.now(),hypothesisId:'H4'})}).catch(function(){});
        // #endregion
        if (!fileList || fileList.length === 0) {
            if (els.imagePreview) els.imagePreview.innerHTML = '';
            return;
        }
        const files = Array.from(fileList).filter(f => f.type.startsWith('image/')).slice(0, SOURCE_IMAGE_COMPRESS.maxImages);
        try {
            // v1规范：为每个文件只生成一张系统源图（唯一一次像素处理）
            const items = [];
            for (const file of files) {
                // 生成系统源图（最大边长 1600px，保持等比例）
                const sourceImage = await processSourceImage(file, SOURCE_IMAGE_COMPRESS);
                
                // 计算显示尺寸：黑板内容区宽度的 32%（仅用于 CSS，不修改图片像素）
                const baseW = getBoardContentWidth();
                const targetW = Math.max(1, Math.round(baseW * 0.32));
                // 用系统源图比例估算显示高度
                const probe = await new Promise((resolve) => {
                    const img = new Image();
                    img.onload = () => resolve({ w: img.naturalWidth || img.width, h: img.naturalHeight || img.height });
                    img.onerror = () => resolve({ w: SOURCE_IMAGE_COMPRESS.maxEdge, h: SOURCE_IMAGE_COMPRESS.maxEdge });
                    img.src = sourceImage;
                });
                const ratio = probe && probe.w ? (probe.h / probe.w) : 1;
                const targetH = Math.max(1, Math.round(targetW * ratio));
                const ext = getExtFromMime(file.type);
                const name = generateTBFileName(ext);
                // v1规范：只保存系统源图，不保存原图和缩略图
                items.push({ sourceImage, name, ext, displayWidth: targetW, displayHeight: targetH, aspect: ratio });
            }

            // P1规则：允许不同便签插入相同图片（跨便签不去重）
            // P2规则：同一便签内图片去重（默认）
            // 只检查当前编辑区已有的图片集合（同一便签内去重）
            const existingEditorUrls = new Set(Array.isArray(editingImages) ? editingImages : []);
            const existingEditorNames = new Set(Array.isArray(editingImageNames) ? editingImageNames : []);

            // P2规则：同一便签内图片去重（默认）
            // 过滤：批内去重 + 编辑区去重（同一便签内）
            const seenBatchUrls = new Set();
            const filteredItems = items.filter(it => {
                const u = it.sourceImage;
                if (!u || seenBatchUrls.has(u)) return false;
                seenBatchUrls.add(u);
                // 只检查编辑区（同一便签内去重），不检查当天其他便签（允许跨便签重复）
                if (existingEditorUrls.has(u)) return false;
                return true;
            }).map(it => {
                // 保证生成文件名在编辑区内唯一。如冲突则重试随机或回退时间戳。
                let candidate = it.name;
                let tries = 0;
                while (existingEditorNames.has(candidate) && tries < 3) {
                    candidate = generateTBFileName(it.ext);
                    tries++;
                }
                if (existingEditorNames.has(candidate)) {
                    candidate = sanitizeFilename(`todayboard_${formatDateCompact(new Date())}_${formatTimeHMSCompact(new Date())}.${it.ext}`);
                }
                // v1规范：只返回系统源图，不返回原图
                return { sourceImage: it.sourceImage, name: candidate, aspect: it.aspect };
            });

            // 判断当前是否处于编辑覆盖层打开状态
            const inEditor = !!(els.editorOverlay && els.editorOverlay.classList.contains('is-open') && !els.editorOverlay.classList.contains('visually-hidden'));

            if (filteredItems.length === 0) {
                // P2规则：同一便签内重复图片提示
                showToast('该便签已插入过此图片');
                if (inEditor) {
                    updateEditorSubmitState();
                }
            } else {
                // 进入编辑模式并合并图片到预览（不自动发布到黑板）
                if (!inEditor) {
                    openEditor('new');
                }
                // v1规范：合并到编辑区（使用系统源图），名称保持与图片一一对应
                const newUrls = filteredItems.map(x => x.sourceImage);
                const newNames = filteredItems.map(x => x.name);
                editingImages = [ ...(Array.isArray(editingImages) ? editingImages : []), ...newUrls ];
                editingImageNames = [ ...(Array.isArray(editingImageNames) ? editingImageNames : []), ...newNames ];
                // v1规范：插入到编辑器光标位置（仅 CE），使用系统源图
                // 确保编辑器已正确初始化为 contenteditable 模式
                if (els.editorText) {
                    try {
                        els.editorText.setAttribute('contenteditable', 'true');
                    } catch {}
                }
                // 使用 setTimeout 确保编辑器 DOM 已完全初始化
                setTimeout(() => {
                    if (editorIsCE() && els.editorText) {
                        filteredItems.forEach(item => insertNoteImageAtCursor(item.sourceImage, item.name, null, null, item.aspect));
                }
                updateEditorSubmitState();
                }, 0);
            }
        } catch (err) {
            console.error('图片处理失败', err);
            alert('图片处理失败，请减少数量或换一张试试');
        } finally {
            if (els.imageInput) els.imageInput.value = '';
        }
    }

    /* ---------- 添加图片弹出菜单 ---------- */
    async function checkCameraSupport() {
        const nav = navigator;
        // 检查是否在微信小程序环境中
        const isWeChat = typeof wx !== 'undefined' && wx.chooseImage;
        if (isWeChat) {
            return true; // 微信小程序支持拍照
        }
        // 检查是否在微信浏览器中
            const ua = nav.userAgent || '';
        const isWeChatBrowser = /MicroMessenger/i.test(ua);
        if (isWeChatBrowser) {
            // 微信浏览器中，检查是否有摄像头权限
            if (!nav.mediaDevices || !nav.mediaDevices.enumerateDevices) {
                return /Android|iPhone|iPad|iPod/i.test(ua);
            }
            try {
                const devices = await nav.mediaDevices.enumerateDevices();
                return devices.some(d => d.kind === 'videoinput');
            } catch (e) {
                return !!(nav.mediaDevices && nav.mediaDevices.getUserMedia);
            }
        }
        // 其他浏览器环境
        if (!nav.mediaDevices || !nav.mediaDevices.enumerateDevices) {
            return /Android|iPhone|iPad|iPod/i.test(ua);
        }
        try {
            const devices = await nav.mediaDevices.enumerateDevices();
            return devices.some(d => d.kind === 'videoinput');
        } catch (e) {
            return !!(nav.mediaDevices && nav.mediaDevices.getUserMedia);
        }
    }

    function openGalleryPicker() {
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/a11b6c32-3942-4660-9c8b-9fa7d3127c4a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app.js:openGalleryPicker',message:'openGalleryPicker called (will trigger imageInput)',data:{},timestamp:Date.now(),hypothesisId:'H3-H4'})}).catch(function(){});
        // #endregion
        if (!els.imageInput) return;
        try {
            els.imageInput.removeAttribute('capture');
            els.imageInput.multiple = true;
            els.imageInput.accept = 'image/*';
            els.imageInput.click();
        } catch (e) { console.error(e); }
    }

    function ensureCameraInput() {
        if (cameraInputEl) return cameraInputEl;
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        // 优先使用后置摄像头
        input.setAttribute('capture', 'environment');
        input.style.display = 'none';
        input.addEventListener('change', e => {
            if (e.target.files && e.target.files.length > 0) {
                handleSelectedImages(e.target.files);
            }
        });
        document.body.appendChild(input);
        cameraInputEl = input;
        return input;
    }

    async function openCameraCapture() {
        // 检查是否在微信小程序环境中
        const isWeChat = typeof wx !== 'undefined' && wx.chooseImage;
        if (isWeChat) {
            try {
                // 使用微信小程序的API
                wx.chooseImage({
                    count: 9, // 最多可以选择的图片张数
                    sizeType: ['original', 'compressed'], // 可以指定是原图还是压缩图，默认二者都有
                    sourceType: ['camera'], // 可以指定来源是相册还是相机，默认二者都有
                    success: function(res) {
                        // 将微信小程序的临时文件路径转换为File对象
                        const tempFilePaths = res.tempFilePaths;
                        if (tempFilePaths && tempFilePaths.length > 0) {
                            // 使用微信小程序的getFileSystemManager读取文件
                            const fs = wx.getFileSystemManager();
                            const files = [];
                            let loadedCount = 0;
                            tempFilePaths.forEach((path, index) => {
                                fs.readFile({
                                    filePath: path,
                                    success: (fileRes) => {
                                        // 创建File对象
                                        const blob = new Blob([fileRes.data], { type: 'image/jpeg' });
                                        const file = new File([blob], `camera_${Date.now()}_${index}.jpg`, { type: 'image/jpeg' });
                                        files.push(file);
                                        loadedCount++;
                                        if (loadedCount === tempFilePaths.length) {
                                            // 所有文件加载完成后处理
                                            handleSelectedImages(files);
                                        }
                                    },
                                    fail: (err) => {
                                        console.error('读取文件失败:', err);
                                        loadedCount++;
                                        if (loadedCount === tempFilePaths.length && files.length > 0) {
                                            handleSelectedImages(files);
                                        }
                                    }
                                });
                            });
                        }
                    },
                    fail: function(err) {
                        console.error('选择图片失败:', err);
                        showToast('拍照失败，请重试');
                    }
                });
                return;
            } catch (e) {
                console.error('微信小程序API调用失败:', e);
                // 降级到普通方式
            }
        }
        
        // 普通浏览器环境或降级处理
        try {
        const supported = await checkCameraSupport();
            if (!supported) {
                showToast('无法使用相机，请授权相机权限或使用相册选择');
                return;
            }
        const input = ensureCameraInput();
            // 确保使用摄像头模式
            input.setAttribute('capture', 'environment');
            input.accept = 'image/*';
            input.click();
        } catch (e) {
            console.error('打开摄像头失败:', e);
            showToast('无法使用相机，请授权相机权限或使用相册选择');
        }
    }

    async function openAddImageMenu(anchorEl) {
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/a11b6c32-3942-4660-9c8b-9fa7d3127c4a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app.js:openAddImageMenu',message:'openAddImageMenu called',data:{anchorId:anchorEl?anchorEl.id:null,isFooterBtn:!!(anchorEl&&els.addFooterImageBtn&&anchorEl===els.addFooterImageBtn)},timestamp:Date.now(),hypothesisId:'H3'})}).catch(function(){});
        // #endregion
        if (!anchorEl) return;
        // 背景遮罩用于点击空白处关闭
        const overlay = document.createElement('div');
        overlay.className = 'tb-popover-overlay is-open';
        overlay.style.pointerEvents = 'auto'; // P0修复：确保遮罩可以接收点击事件
        overlay.addEventListener('click', (e) => {
            // P0修复：只有点击遮罩本身（不是菜单）时才关闭
            if (e.target === overlay) {
                overlay.remove();
            }
        });

        // 菜单主体
        const menu = document.createElement('div');
        menu.className = 'tb-popover-menu';
        // P0修复：只在菜单容器上阻止冒泡，不影响按钮点击
        menu.addEventListener('click', e => {
            // 如果点击的是按钮，不阻止冒泡，让按钮的点击事件正常触发
            if (e.target.tagName === 'BUTTON' || e.target.closest('button')) {
                return; // 让按钮的点击事件正常处理
            }
            e.stopPropagation(); // 其他区域点击才阻止冒泡
        });
        menu.style.position = 'fixed';
        // 确保菜单有足够的宽度以容纳两个按钮平行显示
        menu.style.minWidth = '200px';
        // 使用!important确保覆盖CSS中的display:block
        menu.style.setProperty('display', 'flex', 'important');
        menu.style.setProperty('flex-direction', 'column', 'important');
        menu.style.setProperty('gap', '4px', 'important');
        // P0修复：确保菜单可以接收点击事件
        menu.style.pointerEvents = 'auto';

        // 选项：拍照添加
        const cameraItem = document.createElement('button');
        cameraItem.className = 'tb-popover-item';
        cameraItem.textContent = '📸 拍照';
        cameraItem.style.width = '100%';
        cameraItem.style.margin = '0';
        cameraItem.style.pointerEvents = 'auto'; // P0修复：确保按钮可以点击
        cameraItem.addEventListener('click', async (e) => {
            e.stopPropagation(); // 阻止冒泡到 overlay
            overlay.remove();
            try {
                await openCameraCapture();
            } catch (e) {
                console.error('拍照失败:', e);
                showToast('无法使用相机，请检查权限设置');
            }
        });

        // 选项：从相册选择
        const galleryItem = document.createElement('button');
        galleryItem.className = 'tb-popover-item';
        galleryItem.textContent = '🖼 从相册选择';
        galleryItem.style.width = '100%';
        galleryItem.style.margin = '0';
        galleryItem.style.pointerEvents = 'auto'; // P0修复：确保按钮可以点击
        galleryItem.addEventListener('click', (e) => {
            e.stopPropagation(); // 阻止冒泡到 overlay
            overlay.remove();
            openGalleryPicker();
        });

        // 始终显示两个按钮（同级、同风格、同宽度、同圆角）
        menu.appendChild(cameraItem);
        menu.appendChild(galleryItem);

        // 先插入到文档中以便测量尺寸；如果在编辑覆盖层中触发，则挂载到编辑覆盖层并提升层级
        overlay.appendChild(menu);
        const inEditor = !!(els.editorOverlay && !els.editorOverlay.classList.contains('visually-hidden') && els.editorOverlay.contains(anchorEl));
        if (inEditor) {
            els.editorOverlay.appendChild(overlay);
            overlay.style.zIndex = '1001';
            menu.style.zIndex = '1002';
        } else {
            document.body.appendChild(overlay);
            overlay.style.zIndex = '';
            menu.style.zIndex = '';
        }

        // 计算位置，保证在页面右侧边框内
        const rect = anchorEl.getBoundingClientRect();
        const vw = window.innerWidth || document.documentElement.clientWidth;
        const vh = window.innerHeight || document.documentElement.clientHeight;
        const menuW = Math.max(menu.offsetWidth, 180);
        const menuH = Math.max(menu.offsetHeight, 80);

        // 默认靠锚点右侧对齐：右下弹出
        let left = rect.right - menuW; // 使菜单右边缘与按钮右边缘对齐
        let top = rect.bottom + 6;

        // 水平方向：约束在视口内（左右至少留 8px 边距）
        left = Math.max(8, Math.min(left, vw - menuW - 8));

        // 垂直方向：若下方空间不足则向上弹出
        if (top + menuH > vh - 8) {
            top = rect.top - menuH - 6;
        }
        top = Math.max(8, Math.min(top, vh - menuH - 8));

        menu.style.left = `${Math.round(left)}px`;
        menu.style.top = `${Math.round(top)}px`;
    }

    /* ---------- 语音输入功能已移除 ---------- */

    /* ---------- 导出（截图） ---------- */
    async function ensureHtml2Canvas() {
        if (window.html2canvas) return;
        const tryLoad = (src) => new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = src; s.referrerPolicy = 'no-referrer';
            s.crossOrigin = 'anonymous';
            s.onload = () => resolve();
            s.onerror = () => reject(new Error('load failed'));
            document.head.appendChild(s);
        });
        try {
            await tryLoad('https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js');
        } catch {
            await tryLoad('https://unpkg.com/html2canvas@1.4.1/dist/html2canvas.min.js');
        }
    }
    // 等待导出容器内的所有图片加载完成，保证截图时比例与布局稳定
    async function waitForImages(container) {
        const imgs = Array.from(container.querySelectorAll('img'));
        if (imgs.length === 0) return;
        await Promise.all(imgs.map(img => {
            if (img.complete && img.naturalWidth > 0) return Promise.resolve();
            return new Promise(resolve => {
                const done = () => resolve();
                img.addEventListener('load', done, { once: true });
                img.addEventListener('error', done, { once: true });
            });
        }));
    }
    // 新版导出：遵循《导出图片规则｜最终统一版》- 基准1170px、scale 2/3、高度以内容为准、黑板 data URL、便签图 width 100% height auto
    async function renderCardCanvasSimple(exportContainer) {
        if (!exportContainer) throw new Error('导出容器不存在');
        await ensureHtml2Canvas();
        await waitForImages(exportContainer);
        // 等两帧，确保布局/字体/图片稳定
        await new Promise(function (r) { requestAnimationFrame(function () { requestAnimationFrame(r); }); });
        // 优先使用调用方已设置的宽度（如 generateTodayCard 的 getBoardContentWidth），适应手机宽度
        var callerWidth = (exportContainer.style && exportContainer.style.width) ? parseInt(exportContainer.style.width, 10) : 0;
        var exportWidth = (callerWidth > 0 && callerWidth <= 2000) ? callerWidth : EXPORT_WIDTH;
        // 综合版本：添加 tb-export-natural-height 让容器高度由内容撑开，避免父级 min-height 造成多余空白
        exportContainer.classList.add('tb-export-natural-height');
        // 导出前将容器设为 exportWidth，以正确测量内容高度与 footer 位置
        exportContainer.style.width = exportWidth + 'px';
        exportContainer.style.maxWidth = exportWidth + 'px';
        exportContainer.style.minWidth = exportWidth + 'px';
        await new Promise(function (r) { requestAnimationFrame(function () { requestAnimationFrame(r); }); });
        // 658c934 (19:02) 正确高度版本：测量前临时加 tb-export-mode 样式，确保容器按内容撑开
        exportContainer.classList.add('tb-export-mode');
        var exportModeMeasureStyle = document.createElement('style');
        exportModeMeasureStyle.setAttribute('data-export-mode-measure', '1');
        exportModeMeasureStyle.textContent = '.tb-export-mode { min-height: 0 !important; height: auto !important; max-height: none !important; padding-bottom: 0 !important; }\n.tb-export-mode .tb-export-record,\n.tb-export-mode .tb-record-list { min-height: 0 !important; height: auto !important; max-height: none !important; flex: none !important; flex-grow: 0 !important; padding-bottom: 0 !important; }';
        document.head.appendChild(exportModeMeasureStyle);
        var contentBottomCss = getVisibleContentBottom(exportContainer);
        // PAD 需包含：card-view padding-bottom(24) + footer border-bottom(2) + 安全区(10-20)
        var PAD = 46;
        var targetCssHeight = contentBottomCss + PAD;
        exportContainer.classList.remove('tb-export-mode');
        exportModeMeasureStyle.remove();
        var naturalHeightCss = targetCssHeight;
        var exportCropMetrics = { rootScrollHeightCss: naturalHeightCss, targetCssHeight: targetCssHeight };
        console.log('[TB-Export-Metrics] contentBottomCss=' + contentBottomCss + ' targetCssHeight=' + targetCssHeight + ' naturalHeightCss=' + naturalHeightCss);
        // #region agent log
        try {
            var footerEl = exportContainer.querySelector('#exportGeneratedAt, .tb-card-footer');
            var footerBottom = footerEl ? footerEl.getBoundingClientRect().bottom - exportContainer.getBoundingClientRect().top : 0;
            var expectedFullH = contentBottomCss + 24 + 2;
            fetch('http://127.0.0.1:7243/ingest/a11b6c32-3942-4660-9c8b-9fa7d3127c4a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app.js:renderCardCanvasSimple','message':'height calc H2',data:{contentBottomCss:contentBottomCss,PAD:32,targetCssHeight:targetCssHeight,naturalHeightCss:naturalHeightCss,footerBottom:footerBottom,expectedFullH:expectedFullH},timestamp:Date.now(),hypothesisId:'H2'})}).catch(function(){});
        } catch (e) {}
        // #endregion
        var scale = Math.min(3, Math.max(2, Math.round(window.devicePixelRatio || 2)));

        // 预先获取一张 live 样本图片的关键样式，用于 clone 对比日志
        var liveImgMetrics = null;
        try {
            var liveImg = exportContainer.querySelector('img.todayboard-img');
            if (liveImg && window.getComputedStyle) {
                var liveCs = window.getComputedStyle(liveImg);
                liveImgMetrics = {
                    width: liveImg.offsetWidth,
                    height: liveImg.offsetHeight,
                    objectFit: liveCs.objectFit,
                    borderRadius: liveCs.borderRadius,
                    overflow: liveCs.overflow,
                    padding: liveCs.paddingTop + ' ' + liveCs.paddingRight + ' ' + liveCs.paddingBottom + ' ' + liveCs.paddingLeft,
                    margin: liveCs.marginTop + ' ' + liveCs.marginRight + ' ' + liveCs.marginBottom + ' ' + liveCs.marginLeft,
                    boxShadow: liveCs.boxShadow
                };
            }
        } catch (e) {
            console.warn('[TB-IMG-VERIFY] capture live metrics failed', e);
        }

        // 准备黑板背景 dataURL（优先）用于 clone 中注入
        var isFileProtocol = window.location.protocol === 'file:';
        var bgImageAbsoluteUrl = new URL('./assets/bg/bg_blackboard_main.webp', window.location.href).href;
        var bgDataUrl = null;
        try {
            bgDataUrl = await imageUrlToDataUrl(bgImageAbsoluteUrl);
        } catch (e) {
            console.error('导出背景图转 data URL 失败，导出终止（规则禁止纯色背景）', { url: bgImageAbsoluteUrl, message: e && e.message, exception: e });
            throw new Error('导出背景图 bg_blackboard_main.webp 无法转为 data URL，请使用 http(s) 协议打开页面后重试');
        }

        // 诊断：列出导出目标及祖先上的合成属性
        try {
            var diagnostic = getExportCompositeDiagnostic(exportContainer);
            console.log('[TB-Export-Composite] root及祖先:', diagnostic.ancestors, '子树非默认:', diagnostic.subtree);
        } catch (e) {
            console.warn('[TB-Export-Composite] 诊断失败', e);
        }

        var canvas = await html2canvas(exportContainer, {
            backgroundColor: null,
            useCORS: true,
            allowTaint: true,
            scale: scale,
            logging: false,
            width: exportWidth,
            windowWidth: exportWidth,
            height: naturalHeightCss,
            ignoreElements: (element) => {
                return element.classList && (
                    element.classList.contains('tb-editor-overlay') ||
                    element.classList.contains('tb-preview-overlay') ||
                    element.classList.contains('tb-confirm-overlay') ||
                    element.classList.contains('tb-guide-overlay') ||
                    element.classList.contains('tb-popover-overlay')
                );
            },
            onclone: (clonedDoc) => {
                try {
                    var head = clonedDoc.head || clonedDoc.createElement('head');
                    if (!clonedDoc.head && clonedDoc.documentElement) {
                        try { clonedDoc.documentElement.insertBefore(head, clonedDoc.body || clonedDoc.documentElement.firstChild); } catch (e) {}
                    }
                    var clonedContainer = clonedDoc.querySelector('.tb-card-view');
                    if (!clonedContainer) return;

                    var win = clonedDoc.defaultView || clonedDoc.parentWindow;

                    // 去掉顶部白色：document 背景设为黑板色
                    var docEl = clonedDoc.documentElement;
                    if (docEl) {
                        docEl.style.background = '#1B1B1B';
                        docEl.style.backgroundImage = 'none';
                    }
                    if (clonedDoc.body) {
                        clonedDoc.body.style.background = '#1B1B1B';
                        clonedDoc.body.style.backgroundImage = 'none';
                    }

                    // P0：确保克隆容器有 is-exporting class，以启用导出态图片样式规则
                    clonedContainer.classList.add('is-exporting');

                    // A) 背景：必须使用 data URL，禁止纯色
                    var exportBgUrl = (typeof bgDataUrl === 'string' && bgDataUrl.indexOf('data:') === 0)
                        ? bgDataUrl
                        : null;
                    if (!exportBgUrl) {
                        throw new Error('导出背景必须为 data URL，当前 bgDataUrl 无效');
                    }
                    var safeUrl = exportBgUrl.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
                    clonedContainer.style.backgroundImage = 'url("' + safeUrl + '")';
                    clonedContainer.style.backgroundSize = 'cover';
                    clonedContainer.style.backgroundPosition = 'center';
                    clonedContainer.style.backgroundRepeat = 'no-repeat';

                    var bgComputed = (win && win.getComputedStyle) ? win.getComputedStyle(clonedContainer).backgroundImage : '';
                    console.log('[TB-VERIFY-BG] cloneRoot bg=', bgComputed);
                    if (bgComputed.indexOf('data:image') !== -1) {
                        console.log('[TB-VERIFY-BG] ✓ 使用 dataURL 黑板背景');
                    } else {
                        console.error('[TB-VERIFY-BG] FAIL 背景非 data URL，导出不合格');
                    }

                    // B) 导出态：遵循改变高度前规则，强制 clone 固定宽度 EXPORT_WIDTH、高度 naturalHeightCss
                    clonedContainer.classList.add('tb-export-mode');
                    clonedContainer.style.width = exportWidth + 'px';
                    clonedContainer.style.maxWidth = exportWidth + 'px';
                    clonedContainer.style.minWidth = exportWidth + 'px';
                    clonedContainer.style.height = naturalHeightCss + 'px';
                    clonedContainer.style.minHeight = naturalHeightCss + 'px';
                    clonedContainer.style.boxSizing = 'border-box';
                    clonedContainer.style.margin = '0';
                    clonedContainer.style.outline = 'none';
                    clonedContainer.style.boxShadow = 'none';
                    // 内联强制边框，防止 base 样式叠加导致顶部重叠
                    clonedContainer.style.border = 'none';
                    clonedContainer.style.borderTop = '2px dashed rgba(255,255,255,0.6)';
                    clonedContainer.style.borderRight = '2px dashed rgba(255,255,255,0.6)';
                    clonedContainer.style.borderLeft = '2px dashed rgba(255,255,255,0.6)';
                    clonedContainer.style.borderBottom = 'none';
                    var cloneFooter = clonedContainer.querySelector('.tb-card-footer');
                    if (cloneFooter) {
                        cloneFooter.style.borderBottom = '2px dashed rgba(255,255,255,0.6)';
                        // 增加 padding-bottom 保证 border 在安全区内，防止 html2canvas 边界裁剪
                        cloneFooter.style.paddingBottom = '24px';
                    }
                    
                    // 关键修复：基于封口线真实位置重新计算容器高度（确定性规则）
                    var footerRect = cloneFooter ? cloneFooter.getBoundingClientRect() : null;
                    var containerRect = clonedContainer.getBoundingClientRect();
                    var sealBottomCss = footerRect ? (footerRect.bottom - containerRect.top) : contentBottomCss;
                    var SEAL_PAD = 8; // 封口线安全区：固定 8px
                    var finalCssH = Math.max(contentBottomCss + 46, sealBottomCss + SEAL_PAD);
                    
                    // 更新 clone 容器高度为确定值（包含封口线 + 安全区）
                    clonedContainer.style.height = finalCssH + 'px';
                    clonedContainer.style.minHeight = finalCssH + 'px';
                    // #region agent log
                    try {
                        var cloneCs = win && win.getComputedStyle ? win.getComputedStyle(clonedContainer) : null;
                        var footerCs = cloneFooter && win.getComputedStyle ? win.getComputedStyle(cloneFooter) : null;
                        var logData = {
                            hasIsExporting: clonedContainer.classList.contains('is-exporting'),
                            footerBorderBottom: footerCs ? footerCs.borderBottom : 'n/a',
                            footerPaddingBottom: footerCs ? footerCs.paddingBottom : 'n/a',
                            contentBottomCss: contentBottomCss,
                            sealBottomCss: sealBottomCss,
                            SEAL_PAD: 8,
                            finalCssH: finalCssH,
                            safetyMargin: finalCssH - sealBottomCss,
                            originalNaturalH: naturalHeightCss
                        };
                        fetch('http://127.0.0.1:7243/ingest/a11b6c32-3942-4660-9c8b-9fa7d3127c4a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app.js:onclone-SEAL',message:'[TB-SEAL] deterministic',data:logData,timestamp:Date.now(),runId:'seal-fix'})}).catch(function(){});
                    } catch (e) {}
                    // #endregion
                    var exportModeStyle = clonedDoc.createElement('style');
                    exportModeStyle.setAttribute('data-export-mode', '1');
                    exportModeStyle.textContent =
                        '.tb-export-mode, .tb-export-mode * {' +
                            'filter: none !important;' +
                            'backdrop-filter: none !important;' +
                            '-webkit-backdrop-filter: none !important;' +
                            'mix-blend-mode: normal !important;' +
                            'mask: none !important;' +
                            '-webkit-mask: none !important;' +
                            'background-blend-mode: normal !important;' +
                            'transform: none !important;' +
                        '}' +
                        '.tb-export-mode .tb-record::before, .tb-export-mode .tb-record::after,' +
                        '.tb-export-mode .tb-export-record::before, .tb-export-mode .tb-export-record::after,' +
                        '.tb-export-mode .tb-divider::before, .tb-export-mode .tb-divider::after,' +
                        '.tb-export-mode .tb-btn::after,' +
                        '.tb-export-mode .tb-empty::before,' +
                        '.tb-export-mode .tb-pin-btn::before,' +
                        '.tb-export-mode .tb-thumb::before {' +
                            'display: none !important;' +
                            'content: none !important;' +
                        '}';
                    head.appendChild(exportModeStyle);

                    // B2) 便签图片：不覆盖样式，100% 复用页面态布局（max-width:70% / width:auto / height:auto 来自 styles-v2.css）
                    // 禁止在 clone 中重新计算图片尺寸，导出 = 高分辨率截图

                    // C) 记录 live vs clone 的图片关键样式对比日志
                    try {
                        var cloneImg = clonedContainer.querySelector('img.todayboard-img');
                        if (cloneImg && win && win.getComputedStyle) {
                            var cloneCs = win.getComputedStyle(cloneImg);
                            var cloneImgMetrics = {
                                width: cloneImg.offsetWidth,
                                height: cloneImg.offsetHeight,
                                objectFit: cloneCs.objectFit,
                                borderRadius: cloneCs.borderRadius,
                                overflow: cloneCs.overflow,
                                padding: cloneCs.paddingTop + ' ' + cloneCs.paddingRight + ' ' + cloneCs.paddingBottom + ' ' + cloneCs.paddingLeft,
                                margin: cloneCs.marginTop + ' ' + cloneCs.marginRight + ' ' + cloneCs.marginBottom + ' ' + cloneCs.marginLeft,
                                boxShadow: cloneCs.boxShadow
                            };
                            // 同时记录 wrapper 的样式
                            var cloneWrapper = cloneImg.closest('.tb-img-wrapper');
                            var cloneWrapperMetrics = null;
                            if (cloneWrapper && win.getComputedStyle) {
                                var wrapperCs = win.getComputedStyle(cloneWrapper);
                                cloneWrapperMetrics = {
                                    width: cloneWrapper.offsetWidth,
                                    padding: wrapperCs.paddingTop + ' ' + wrapperCs.paddingRight + ' ' + wrapperCs.paddingBottom + ' ' + wrapperCs.paddingLeft,
                                    margin: wrapperCs.marginTop + ' ' + wrapperCs.marginRight + ' ' + wrapperCs.marginBottom + ' ' + wrapperCs.marginLeft,
                                    overflow: wrapperCs.overflow,
                                    borderRadius: wrapperCs.borderRadius
                                };
                            }
                            console.log('[TB-IMG-VERIFY]', { 
                                liveImg: liveImgMetrics, 
                                cloneImg: cloneImgMetrics,
                                cloneWrapper: cloneWrapperMetrics
                            });
                        }
                    } catch (e) {
                        console.warn('[TB-IMG-VERIFY] capture clone metrics failed', e);
                    }
                } catch (e) {
                    console.error('[TB-EXPORT-ONCLONE] failed', e);
                    // 抛出错误让 html2canvas 失败，从而在外层被捕获并反馈给用户
                    throw e;
                }
            }
        });
        // 按 footer+24px 裁高，去掉底部大片空白（与旧版一致）
        var exportedCanvas = canvas;
        try {
            if (exportCropMetrics && typeof cropCanvasByFooter === 'function') {
                exportedCanvas = cropCanvasByFooter(canvas, exportCropMetrics) || canvas;
            }
        } catch (e) {
            console.warn('[TB-Export-Crop] cropCanvasByFooter failed, use original canvas', e);
        }
        return exportedCanvas;
    }
    // 判断 CSS background-image 是否为会 taint 画布的位图 url（.webp/.png/.jpg/.jpeg），data: 与渐变保留
    function isTaintingBackgroundValue(bgImageValue) {
        if (!bgImageValue || typeof bgImageValue !== 'string') return false;
        var match = bgImageValue.match(/url\s*\(\s*["']?([^"')]+)["']?\s*\)/g);
        if (!match) return false;
        for (var i = 0; i < match.length; i++) {
            var url = match[i].replace(/url\s*\(\s*["']?|["']?\s*\)/g, '').trim();
            if (url.indexOf('data:') === 0) continue;
            if (/\.(webp|png|jpg|jpeg)(\?|$)/i.test(url)) return true;
        }
        return false;
    }
    // 将图片 URL 转为 data URL，避免 html2canvas 因跨域背景图污染画布导致导出失败
    function imageUrlToDataUrl(url) {
        return fetch(url)
            .then(r => { if (!r.ok) throw new Error('fetch failed'); return r.blob(); })
            .then(blob => new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            }))
            .catch(() => {
                // 同源回退：用 Image+canvas（file:// 或无 CORS 时 fetch 会失败）
                return new Promise((resolve, reject) => {
                    const img = new Image();
                    img.onload = () => {
                        const c = document.createElement('canvas');
                        c.width = img.naturalWidth;
                        c.height = img.naturalHeight;
                        const ctx = c.getContext('2d');
                        ctx.drawImage(img, 0, 0);
                        try {
                            resolve(c.toDataURL('image/png'));
                        } catch (e) {
                            reject(e);
                        }
                    };
                    img.onerror = () => reject(new Error('image load failed'));
                    img.src = url;
                });
            });
    }
    /** 
     * 根据“生成时间”行（或 footer / 最后一条记录）计算导出区域的大致内容高度，
     * 用于限制 html2canvas 的渲染高度，最终精确裁剪在 canvas 层完成。
     */
    function getExportContentHeight(container) {
        if (!container || !container.getBoundingClientRect) return null;
        const rect = container.getBoundingClientRect();
        const containerTop = rect.top;
        let contentBottom = rect.top;

        // 优先：根据“生成时间”这一行来裁剪高度
        const generatedAt = container.querySelector('#cardTime, .export-generated-at');
        if (generatedAt && generatedAt.getBoundingClientRect) {
            const gr = generatedAt.getBoundingClientRect();
            if (gr.bottom > contentBottom) contentBottom = gr.bottom;
        }

        // 兜底：footer 或最后一条记录
        const footer = container.querySelector('.tb-card-footer');
        if (footer && footer.getBoundingClientRect) {
            const fr = footer.getBoundingClientRect();
            if (fr.bottom > contentBottom) contentBottom = fr.bottom;
        }
        const records = container.querySelectorAll('.tb-record, .tb-export-record');
        if (records.length) {
            const lastR = records[records.length - 1];
            if (lastR && lastR.getBoundingClientRect) {
                const rr = lastR.getBoundingClientRect();
                if (rr.bottom > contentBottom) contentBottom = rr.bottom;
            }
        }
        if (contentBottom <= containerTop) {
            var dateEl = container.querySelector('.tb-card-date');
            if (dateEl && dateEl.getBoundingClientRect) {
                contentBottom = dateEl.getBoundingClientRect().bottom;
            }
            else {
                var titleEl = container.querySelector('.tb-card-title');
                if (titleEl && titleEl.getBoundingClientRect) {
                    contentBottom = titleEl.getBoundingClientRect().bottom;
                }
            }
        }
        // 在 DOM 层留出一定冗余高度，避免内容被截断；精确裁剪在 canvas 层完成
        var contentH = Math.ceil(contentBottom - containerTop) + EXPORT_BOTTOM_PADDING;
        var scrollH = container.scrollHeight || container.offsetHeight;
        var out = Math.min(contentH, scrollH);
        try {
            console.log('[TB-ContentHeight]', { contentH, scrollH, out });
            localStorage.setItem('tb_content_height_debug', JSON.stringify({ contentH, scrollH, out }));
        } catch (e) {}
        return out;
    }
    /**
     * 从导出容器计算「生成时间」元素底部相对容器顶部的 CSS 高度（px）。
     * 使用 getBoundingClientRect 保证与视口/布局一致（offsetTop 沿 parent 累加会因 offsetParent 不同而错误）。
     */
    function getExportFooterBottom(container) {
        if (!container || !container.getBoundingClientRect) return null;
        var el = container.querySelector('#cardTime') || container.querySelector('.tb-card-footer');
        if (!el || !el.getBoundingClientRect) return null;
        var cr = container.getBoundingClientRect();
        var er = el.getBoundingClientRect();
        var result = Math.ceil(er.bottom - cr.top);
        // #region agent log
        // #endregion
        return result;
    }
    /**
     * 导出目标容器及祖先中影响合成的 CSS 清单（onclone 中通过 .tb-export-mode 压扁）：
     * - backdrop-filter: styles-v2 / styles-enhanced 多处（.tb-action-bar、.tb-record 相关等）→ 最易导致马赛克透明块
     * - filter: .tb-preview-image contrast/brightness、.is-exporting 已有 none
     * - mix-blend-mode: .is-exporting 已有 normal
     * - ::before/::after: body::before(粉笔斑点)、.tb-record::before(高光)、.tb-divider::after(动画线)、.tb-btn::after 等 → 叠加/透明易导致块状空白
     * - body 多层 background-image（径向渐变+黑板图）→ clone 中改为透明，仅卡片单层黑板
     * 结论：backdrop-filter 与 伪元素遮罩 最可能导致“马赛克/块状空白”；onclone 内对 .tb-export-mode 禁用上述并隐藏伪元素。
     */
    /**
     * 可验证定位：对导出根节点及关键子节点抓取 getComputedStyle（含 ::before/::after），
     * 输出 selector + 关键字段，便于对比「常态 vs clone」找出马赛克/黑块来源。
     * @param {Element} root - 导出根节点（html2canvas 的 element）
     * @param {string} label - 如 "live" 或 "clone"
     * @param {Window|null} win - 用于 getComputedStyle 的 window（clone 时传 clonedDoc.defaultView）
     */
    function dumpExportComputedStyles(root, label, win) {
        if (!root) {
            console.log('[TB-Export-Dump]', label, 'skip (no root)');
            return;
        }
        if (label === 'clone' && !win) {
            console.log('[TB-Export-Dump]', label, 'skip (clone has no defaultView)');
            return;
        }
        win = win || (root.ownerDocument && root.ownerDocument.defaultView) || (typeof window !== 'undefined' ? window : null);
        if (!win || typeof win.getComputedStyle !== 'function') {
            console.log('[TB-Export-Dump]', label, 'skip (no getComputedStyle)');
            return;
        }
        var keys = ['backgroundImage', 'backgroundColor', 'filter', 'backdropFilter', 'WebkitBackdropFilter', 'mixBlendMode', 'backgroundBlendMode', 'maskImage', 'WebkitMaskImage', 'transform', 'position', 'overflow', 'opacity'];
        var pseudoKeys = ['content', 'backgroundImage', 'backgroundColor', 'opacity', 'position', 'inset', 'top', 'left', 'right', 'bottom', 'filter', 'backdropFilter', 'transform', 'display'];
        function getSelector(el) {
            if (!el) return '';
            var s = el.tagName || '';
            if (el.id) s += '#' + el.id;
            if (el.className && typeof el.className === 'string') s += '.' + el.className.trim().replace(/\s+/g, '.');
            return s;
        }
        function pick(style, kList) {
            var out = {};
            kList.forEach(function (k) {
                var v = style[k];
                if (v === undefined || v === null) {
                    var dashed = k.replace(/([A-Z])/g, '-$1').toLowerCase();
                    if (k.indexOf('Webkit') === 0 || k.indexOf('webkit') === 0) dashed = '-' + dashed;
                    v = style.getPropertyValue ? style.getPropertyValue(dashed) : '';
                }
                if (v !== undefined && v !== null && v !== '') out[k] = String(v);
            });
            return out;
        }
        var nodes = [];
        nodes.push({ el: root, sel: 'root(' + getSelector(root) + ')' });
        if (root.querySelector) {
            var cardText = root.querySelector('#cardText');
            if (cardText) nodes.push({ el: cardText, sel: '#cardText' });
            var cardHeader = root.querySelector('.tb-card-header');
            if (cardHeader) nodes.push({ el: cardHeader, sel: '.tb-card-header' });
            var cardFooter = root.querySelector('.tb-card-footer');
            if (cardFooter) nodes.push({ el: cardFooter, sel: '.tb-card-footer' });
            var firstRecord = root.querySelector('.tb-export-record, .tb-record');
            if (firstRecord) nodes.push({ el: firstRecord, sel: '.tb-export-record/.tb-record' });
            var firstDivider = root.querySelector('.tb-divider');
            if (firstDivider) nodes.push({ el: firstDivider, sel: '.tb-divider' });
        }
        var out = { label: label, nodes: [] };
        nodes.forEach(function (n) {
            var el = n.el;
            var sel = n.sel;
            var entry = { selector: sel, computed: null, before: null, after: null };
            try {
                var style = win.getComputedStyle(el);
                entry.computed = pick(style, keys);
            } catch (e) {
                entry.computed = { _error: String(e && e.message) };
            }
            try {
                var beforeStyle = win.getComputedStyle(el, '::before');
                entry.before = pick(beforeStyle, pseudoKeys);
            } catch (e) {
                entry.before = { _error: String(e && e.message) };
            }
            try {
                var afterStyle = win.getComputedStyle(el, '::after');
                entry.after = pick(afterStyle, pseudoKeys);
            } catch (e) {
                entry.after = { _error: String(e && e.message) };
            }
            out.nodes.push(entry);
        });
        console.log('[TB-Export-Dump]', label, JSON.stringify(out, null, 2));
    }
    /**
     * 诊断：列出导出目标 root 及祖先、子树节点上非默认的合成相关 computed 样式（只读，不修改 DOM）。
     * 用于定位导致导出黑块/马赛克的选择器。
     */
    function getExportCompositeDiagnostic(root) {
        var keys = ['backdropFilter', 'filter', 'mixBlendMode', 'mask', 'webkitMaskImage', 'transform', 'backgroundBlendMode'];
        var defaults = { backdropFilter: 'none', filter: 'none', mixBlendMode: 'normal', mask: 'none', webkitMaskImage: 'none', transform: 'none', backgroundBlendMode: 'normal' };
        function isNonDefault(style) {
            var out = {};
            keys.forEach(function (k) {
                var v = style[k] || style.getPropertyValue ? style.getPropertyValue(k.replace(/([A-Z])/g, '-$1').toLowerCase().replace(/^-/, '')) : '';
                if (!v) v = style[k] || '';
                if (v && String(v).toLowerCase() !== (defaults[k] || 'none').toLowerCase()) out[k] = v;
            });
            return Object.keys(out).length ? out : null;
        }
        function record(el) {
            var style = window.getComputedStyle(el);
            var non = isNonDefault(style);
            if (!non) return null;
            return { tag: el.tagName, id: el.id || '', class: (el.className && typeof el.className === 'string') ? el.className : '', props: non };
        }
        var ancestors = [];
        var el = root;
        while (el && el !== document.body) {
            var r = record(el);
            if (r) ancestors.push(r);
            el = el.parentElement;
        }
        if (document.body) {
            var br = record(document.body);
            if (br) ancestors.push(br);
        }
        var subtree = [];
        if (root && root.querySelectorAll) {
            root.querySelectorAll('*').forEach(function (child) {
                var sr = record(child);
                if (sr) subtree.push(sr);
            });
        }
        return { ancestors: ancestors, subtree: subtree };
    }
    /**
     * 导出高度规则：以最后一个内容元素（含 footer/生成时间）的 getBoundingClientRect().bottom 为准。
     * 禁止 scrollHeight/offsetHeight/100vh，只使用 getBoundingClientRect。
     */
    function getVisibleContentBottom(root) {
        var rootRect = root.getBoundingClientRect();
        var rootTop = rootRect.top;
        var used = 'none';
        var bottom = 0;
        var footer = root.querySelector('#exportGeneratedAt, .tb-card-footer');
        if (footer) {
            var fr = footer.getBoundingClientRect();
            if (fr.height >= 2) {
                bottom = fr.bottom - rootTop;
                used = 'footer';
            }
        }
        if (used !== 'footer') {
            var records = root.querySelectorAll('.tb-export-record, .tb-record');
            if (records.length > 0) {
                var lastRecord = records[records.length - 1];
                var r = lastRecord.getBoundingClientRect();
                if (r.height >= 2) {
                    bottom = r.bottom - rootTop;
                    used = 'record';
                }
            }
        }
        if (bottom <= 0) {
            var children = root.children || [];
            for (var i = 0; i < children.length; i++) {
                var cr = children[i].getBoundingClientRect();
                var b = cr.bottom - rootTop;
                if (b > bottom) { bottom = b; used = 'lastChild'; }
            }
        }
        var contentBottomCss = Math.max(1, Math.ceil(bottom));
        console.log('[TB-ANCHOR] used=' + used + ' bottom=' + bottom + ' rootTop=' + rootTop + ' contentBottomCss=' + contentBottomCss);
        return contentBottomCss;
    }
    var CROP_PAD = 24;
    /**
     * 以 contentBottomCss 为基准裁短 canvas 高度，导出紧贴内容底部 + 留白，不做大块空白。
     * finalCssH = min(targetCss, contentBottomCss + CROP_PAD)，且 <= rootCss；
     * finalH = round(canvasH * (finalCssH/rootCss))，真实裁剪到新 canvas。
     */
    function cropCanvasToTarget(canvas, rootCss, targetCss, contentBottomCss, contentPad) {
        if (!canvas) return canvas;
        if (!Number.isFinite(rootCss) || rootCss <= 0) return canvas;
        var pad = (contentPad != null && Number.isFinite(contentPad)) ? contentPad : CROP_PAD;
        var finalCssH;
        if (contentBottomCss != null && Number.isFinite(contentBottomCss)) {
            finalCssH = Math.min(contentBottomCss + pad, rootCss);
        } else {
            finalCssH = Math.min(targetCss != null ? targetCss : rootCss, rootCss);
        }
        if (!finalCssH || finalCssH <= 0) return canvas;
        var canvasH = canvas.height;
        var ratio = finalCssH / rootCss;
        var finalH = Math.round(canvasH * ratio);
        finalH = Math.max(1, Math.min(canvas.height, finalH));
        var out = document.createElement('canvas');
        out.width = canvas.width;
        out.height = finalH;
        var ctx = out.getContext('2d');
        if (!ctx) return canvas;
        ctx.drawImage(canvas, 0, 0, canvas.width, finalH, 0, 0, canvas.width, finalH);
        var ratioActual = finalH / canvasH;
        var ratioErr = ratio > 0 ? Math.abs(ratioActual - ratio) / ratio : 0;
        console.log('[TB-CROP-FINAL] finalCssH=' + finalCssH + ' finalH=' + finalH + ' canvasH=' + canvasH + ' ratio=' + ratio.toFixed(4));
        if (ratioErr > 0.02) {
            console.warn('[TB-CROP-FINAL] finalH 与 contentBottomCss 对齐偏差 >2% ratioErr=' + (ratioErr * 100).toFixed(2) + '%');
        }
        return out;
    }

    /**
     * 在 canvas 层，基于 onclone 阶段记录的 metrics（纯数值）按「生成时间 + 20px」精确裁高。
     * 只裁剪纵向高度，宽度保持不变；metrics 非法时直接返回原始 canvas。
     */
    function cropCanvasByFooter(canvas, metrics) {
        try {
            if (!canvas) {
                console.warn('[TB-Export-Crop] canvas 不存在，跳过裁剪');
                return canvas;
            }
            const m = metrics || (typeof window !== 'undefined' ? window.__TB_EXPORT_METRICS__ : null) || {};
            const rootScrollHeightCss = m.rootScrollHeightCss;
            const targetCssHeight = m.targetCssHeight;

            if (!Number.isFinite(rootScrollHeightCss) || rootScrollHeightCss <= 0 ||
                !Number.isFinite(targetCssHeight) || targetCssHeight <= 0) {
                console.warn('[TB-Export-Crop] invalid metrics, skip', m);
                return canvas;
            }

            const canvasHeight = canvas.height || 1;
            const scaleY = canvasHeight / rootScrollHeightCss;
            if (!Number.isFinite(scaleY) || scaleY <= 0) {
                console.warn('[TB-Export-Crop] invalid scaleY, skip', { scaleY, metrics: m });
                return canvas;
            }

            let targetCanvasHeight = Math.ceil(targetCssHeight * scaleY);
            // clamp 到 [1, canvasHeight]
            targetCanvasHeight = Math.max(1, Math.min(canvasHeight, targetCanvasHeight));

            const cropDebug = {
                rootScrollHeightCss,
                targetCssHeight,
                canvasHeight,
                scaleY,
                targetCanvasHeight
            };
            console.log('[TB-Export-Crop]', cropDebug);
            // #region agent log
            try { fetch('http://127.0.0.1:7243/ingest/a11b6c32-3942-4660-9c8b-9fa7d3127c4a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app.js:cropCanvasByFooter','message':'crop H2',data:cropDebug,timestamp:Date.now(),hypothesisId:'H2'})}).catch(function(){}); } catch (e) {}
            // #endregion

            // 若等于原高度，直接返回（说明 DOM 本身就只到 footer+20）
            if (targetCanvasHeight === canvasHeight) return canvas;

            const out = document.createElement('canvas');
            out.width = canvas.width;
            out.height = targetCanvasHeight;
            const ctx = out.getContext('2d');
            if (!ctx) {
                console.warn('[TB-Export-Crop] 无法获取 2D context，使用完整画布高度');
                return canvas;
            }
            ctx.drawImage(
                canvas,
                0, 0, canvas.width, targetCanvasHeight,
                0, 0, canvas.width, targetCanvasHeight
            );
            console.log('[TB-Export-Crop] returning cropped canvas', { width: out.width, height: out.height });
            return out;
        } catch (err) {
            console.warn('[TB-Export-Crop] 裁剪异常，使用完整画布高度', err);
            return canvas;
        }
    }
    // P0修复：裁剪图片的空白区域。options: { paddingBottom, maxHeightCanvas } 可选，maxHeightCanvas 限制裁剪后高度，强制裁掉底部多余空白
    async function cropImageWhitespace(canvas, padding = 20, options) {
        try {
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                console.warn('无法获取 canvas context');
                return canvas;
            }
            
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data = imageData.data;
            
            let minX = canvas.width;
            let minY = canvas.height;
            let maxX = 0;
            let maxY = 0;
            
            // 背景色 #1B1B1B；深色 (r,g,b<=70) 视为背景；纹理较亮处可能>55，提高阈值以裁掉底部空白
            const bgR = 27, bgG = 27, bgB = 27;
            const tolerance = 18;
            const maxDark = 70;
            
            for (let y = 0; y < canvas.height; y++) {
                for (let x = 0; x < canvas.width; x++) {
                    const idx = (y * canvas.width + x) * 4;
                    const r = data[idx];
                    const g = data[idx + 1];
                    const b = data[idx + 2];
                    const a = data[idx + 3];
                    
                    const isBackground = a === 0 || (
                        a > 0 && (
                            (Math.abs(r - bgR) <= tolerance && Math.abs(g - bgG) <= tolerance && Math.abs(b - bgB) <= tolerance) ||
                            (r <= maxDark && g <= maxDark && b <= maxDark)
                        )
                    );
                    
                    if (!isBackground) {
                        // 找到非空白像素，更新边界
                        if (x < minX) minX = x;
                        if (x > maxX) maxX = x;
                        if (y < minY) minY = y;
                        if (y > maxY) maxY = y;
                    }
                }
            }
            
            // 当提供了 maxHeightCanvas 时，即使未找到内容也按内容高度裁剪，避免整图都是纹理时不裁
            var forceMaxH = (options && options.maxHeightCanvas != null && options.maxHeightCanvas > 0) ? options.maxHeightCanvas : 0;
            if (minX >= maxX || minY >= maxY || minX === canvas.width || minY === canvas.height) {
                if (forceMaxH > 0) {
                    minX = 0; maxX = canvas.width; minY = 0; maxY = Math.min(canvas.height, forceMaxH);
                } else {
                    console.log('未找到内容区域，返回原图');
                    return canvas;
                }
            } else {
                const paddingBottom = (options && options.paddingBottom != null) ? options.paddingBottom : 20;
                minX = Math.max(0, minX - padding);
                minY = Math.max(0, minY - padding);
                maxX = Math.min(canvas.width, maxX + padding);
                maxY = Math.min(canvas.height, maxY + paddingBottom);
                if (forceMaxH > 0) {
                    // 强制按内容高度封顶，避免纹理被识别为内容导致 maxY=canvas.height 而不裁
                    maxY = Math.min(maxY, minY + Math.min(forceMaxH, canvas.height - minY));
                }
            }
            
            const width = maxX - minX;
            const height = maxY - minY;
            
            // 确保裁剪后的尺寸合理
            if (width <= 0 || height <= 0 || width > canvas.width || height > canvas.height) {
                console.warn('裁剪尺寸异常，返回原图', { width, height, canvasWidth: canvas.width, canvasHeight: canvas.height });
                return canvas;
            }
            
            try {
                var cropLog = { canvasW: canvas.width, canvasH: canvas.height, cropH: height, maxHeightCanvas: options && options.maxHeightCanvas };
                console.log('[TB-Crop]', cropLog);
                localStorage.setItem('tb_export_crop_debug', JSON.stringify(cropLog));
            } catch (e) {}
            
            // 创建新的 canvas，只包含内容区域
            const croppedCanvas = document.createElement('canvas');
            croppedCanvas.width = width;
            croppedCanvas.height = height;
            const croppedCtx = croppedCanvas.getContext('2d');
            
            if (!croppedCtx) {
                console.warn('无法创建裁剪 canvas context');
                return canvas;
            }
            
            // 设置背景色（与原始背景一致）
            croppedCtx.fillStyle = '#1B1B1B';
            croppedCtx.fillRect(0, 0, width, height);
            
            // 绘制裁剪后的内容
            croppedCtx.drawImage(
                canvas,
                minX, minY, width, height,
                0, 0, width, height
            );
            
            console.log('图片裁剪完成', {
                原始尺寸: `${canvas.width}x${canvas.height}`,
                裁剪后尺寸: `${width}x${height}`,
                裁剪区域: `(${minX}, ${minY}) - (${maxX}, ${maxY})`
            });
            
            return croppedCanvas;
        } catch (err) {
            console.warn('裁剪图片失败，使用原图:', err);
            return canvas; // 如果裁剪失败，返回原 canvas
        }
    }
    
    function showCardPreview(dataUrl, filename, canvasSize) {
        const overlay = document.createElement('div');
        overlay.id = 'cardPreviewOverlay';
        overlay.className = 'tb-preview-overlay is-open';
        // 点击遮罩空白处关闭
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) overlay.remove();
        });

        const dialog = document.createElement('div');
        dialog.className = 'tb-preview-dialog';

        const img = document.createElement('img');
        img.className = 'tb-preview-image';
        img.src = dataUrl;
        img.alt = '今日黑板预览';

        const actions = document.createElement('div');
        actions.className = 'tb-preview-actions';

        const downloadBtn = document.createElement('button');
        downloadBtn.className = 'tb-btn tb-secondary';
        downloadBtn.textContent = '下载图片';
        downloadBtn.onclick = () => {
            if (canvasSize && (canvasSize.width != null || canvasSize.height != null)) {
                console.log('[TB-ASSERT] download uses canvas w/h', { w: canvasSize.width, h: canvasSize.height });
            }
            const a = document.createElement('a');
            a.href = dataUrl; a.download = filename;
            document.body.appendChild(a); a.click(); a.remove();
            // 下载触发后即关闭预览弹窗
            overlay.remove();
        };

        const closeBtn = document.createElement('button');
        closeBtn.className = 'tb-btn';
        closeBtn.textContent = '关闭';
        closeBtn.onclick = () => overlay.remove();

        actions.appendChild(downloadBtn);
        actions.appendChild(closeBtn);
        dialog.appendChild(img);
        dialog.appendChild(actions);
        overlay.appendChild(dialog);
        document.body.appendChild(overlay);
    }
    async function generateTodayCard() {
        // P0修复：添加加载提示，让用户知道导出正在进行
        try {
            showToast('正在生成图片，请稍候...');
        } catch {}
        
        // #region agent log
        (function () {
            var p = { sessionId: 'debug-session', runId: 'pre-fix-1', hypothesisId: 'H1', location: 'app.js:generateTodayCard:entry', message: 'generateTodayCard entry', data: { href: window.location.href, protocol: window.location.protocol }, timestamp: Date.now() };
            try { localStorage.setItem('todayboard_export_debug', JSON.stringify({ latest: p, all: (JSON.parse(localStorage.getItem('todayboard_export_debug') || '{}').all || []).concat(p) })); } catch (e) {}
            console.log('[TB-Export-Debug]', JSON.stringify(p));
        })();
        // #endregion
        
        try {
            const exportContainer = els.cardView;
            const cardDate = els.cardDate;
            const cardText = els.cardText;
            const cardImages = els.cardImages;
            const cardTime = els.cardTime;
            if (!exportContainer || !cardDate || !cardText || !cardTime) {
                showToast('导出容器缺失，请刷新页面重试');
                console.error('导出容器缺失:', { exportContainer, cardDate, cardText, cardTime });
                return;
            }
            const all = loadRecords();
            const mapped = all.map((rec, baseIndex) => ({ rec, baseIndex }));
            mapped.sort((a, b) => {
                const ap = a.rec && a.rec.pinned ? 1 : 0;
                const bp = b.rec && b.rec.pinned ? 1 : 0;
                if (ap !== bp) return bp - ap;
                return a.baseIndex - b.baseIndex;
            });
            const display = mapped.map(m => m.rec);
            const dateStr = formatDateYMD(new Date());
            const timeStr = formatTimeHM(new Date());
            cardDate.textContent = dateStr;
            cardTime.textContent = `生成时间：${timeStr}`;
            let contentHTML = '';
            display.forEach((record, i) => {
                const hasHtml = (typeof record.textHtml === 'string' && record.textHtml.trim().length > 0);
                const textHtmlOrPlain = hasHtml ? record.textHtml : (record.text || '');
                contentHTML += `<div class="tb-export-record">`;
                contentHTML += `<div class="tb-export-head"><span class="tb-export-index">${i + 1}.</span><span class="tb-export-time">${record.time || ''}</span></div>`;
                if (hasHtml) {
                    contentHTML += `<div class="tb-export-content">${textHtmlOrPlain}</div>`;
                } else {
                    const inlineStyle = styleToInline(record.textStyle || null);
                    contentHTML += `<div class="tb-export-content" style="${inlineStyle}">${textHtmlOrPlain}</div>`;
                }
                // P0修复：添加分割线（最后一条记录不添加）
                if (i < display.length - 1) {
                    contentHTML += `<div class="tb-divider"></div>`;
                }
                contentHTML += `</div>`;
            });
            cardText.innerHTML = contentHTML;
            cardImages.innerHTML = '';
            
            // P0修复：确保卡片内容字体与编辑器一致（强制覆盖内联样式）
            (function normalizeCardFonts(container) {
                const allElements = container.querySelectorAll('*');
                allElements.forEach(el => {
                    if (el.style && el.style.fontFamily) {
                        el.style.fontFamily = '';
                    }
                });
            })(cardText);

            // 新版导出路径：直接复用简单截图 helper，废弃下面旧的复杂规则
            // 1）设置卡片宽度与黑板内容区一致
            const simpleBoardWidth = getBoardContentWidth();
            exportContainer.style.width = `${simpleBoardWidth}px`;
            exportContainer.style.maxWidth = `${simpleBoardWidth}px`;

            // 2）显示导出容器并截图
            exportContainer.classList.remove('visually-hidden');
            // P0：添加 is-exporting class 以启用导出态图片样式规则
            exportContainer.classList.add('is-exporting');
            let simpleCanvas;
            try {
                simpleCanvas = await renderCardCanvasSimple(exportContainer);
                console.log('[TB-RESULT] finalCanvas=' + simpleCanvas.width + ' x ' + simpleCanvas.height);
                const dataUrl = simpleCanvas.toDataURL('image/png');
                const filename = generateTBFileName('png');
                showCardPreview(dataUrl, filename, { width: simpleCanvas.width, height: simpleCanvas.height });
            } finally {
                // 3）无论成功失败都恢复 DOM 状态
                exportContainer.classList.add('visually-hidden');
                exportContainer.classList.remove('export-mode');
                exportContainer.classList.remove('is-exporting');
                exportContainer.classList.remove('tb-export-natural-height');
                exportContainer.style.width = '';
                exportContainer.style.maxWidth = '';
            }
            return;
            
            // ===== 下面是旧的导出实现，已不再走到，仅保留作备用 =====
            // P0修复：确保 html2canvas 库已加载
            try {
                await ensureHtml2Canvas();
            } catch (e) {
                showToast('无法加载图片生成库，请检查网络连接');
                console.error('html2canvas 加载失败:', e);
                return;
            }
            
            exportContainer.classList.remove('visually-hidden');
            exportContainer.classList.add('export-mode');
            // P0：添加 is-exporting class 禁用所有遮罩层和滤镜
            exportContainer.classList.add('is-exporting');
            exportContainer.classList.add('tb-export-natural-height');
            // P0：获取黑板内容区宽度
            const boardWidth = getBoardContentWidth();
            exportContainer.style.width = `${boardWidth}px`;
            exportContainer.style.maxWidth = `${boardWidth}px`;
            try {
                await waitForImages(exportContainer);
            } catch (e) {
                console.warn('等待图片加载时出错:', e);
            }
            await new Promise(function (r) { requestAnimationFrame(function () { requestAnimationFrame(r); }); });
            var naturalHeightCss = exportContainer.scrollHeight || exportContainer.offsetHeight;
            naturalHeightCss = Math.max(1, Math.ceil(naturalHeightCss));
            console.log('[TB-Export] naturalHeightCss=', naturalHeightCss, '（直接按卡片自然高度截图，不裁剪）');

            const isFileProtocol = window.location.protocol === 'file:';
            const bgImageAbsoluteUrl = new URL('./assets/bg/bg_blackboard_main.webp', window.location.href).href;
            let bgDataUrl = null;
            try {
                bgDataUrl = await imageUrlToDataUrl(bgImageAbsoluteUrl);
            } catch (e) {
                console.error('导出背景图转 data URL 失败，将使用纯色背景导出', { url: bgImageAbsoluteUrl, message: e && e.message, exception: e });
                if (isFileProtocol) {
                    try { showToast('当前为本地文件打开，导出为纯色背景；通过 http 访问页面可获得黑板纹理'); } catch (_) {}
                }
            }
            const exportWidth = EXPORT_WIDTH;
            var scale = Math.max(2, window.devicePixelRatio || 2);
            var MAX_PX = 8000;
            scale = Math.min(scale, MAX_PX / exportWidth, MAX_PX / naturalHeightCss);
            console.log('[TB-Export-Scale] scale=', scale, 'naturalHeightCss=', naturalHeightCss);

            // 诊断：列出导出目标及祖先上的合成属性
            try {
                var diagnostic = getExportCompositeDiagnostic(exportContainer);
                console.log('[TB-Export-Composite] root及祖先:', diagnostic.ancestors, '子树非默认:', diagnostic.subtree);
            } catch (e) {
                console.warn('[TB-Export-Composite] 诊断失败', e);
            }

            const canvas = await html2canvas(exportContainer, {
                backgroundColor: null,
                useCORS: true,
                allowTaint: true,
                scale: scale,
                logging: false,
                width: exportWidth,
                windowWidth: exportWidth,
                height: naturalHeightCss,
                ignoreElements: (element) => {
                    // 忽略所有遮罩层和overlay
                    return element.classList && (
                        element.classList.contains('tb-editor-overlay') ||
                        element.classList.contains('tb-preview-overlay') ||
                        element.classList.contains('tb-confirm-overlay') ||
                        element.classList.contains('tb-guide-overlay') ||
                        element.classList.contains('tb-popover-overlay')
                    );
                },
                onclone: (clonedDoc) => {
                    var head = clonedDoc.head || clonedDoc.createElement('head');
                    if (!clonedDoc.head && clonedDoc.documentElement) {
                        try { clonedDoc.documentElement.insertBefore(head, clonedDoc.body || clonedDoc.documentElement.firstChild); } catch (e) {}
                    }
                    var cloneBgSolid = '#1B1B1B';
                    if (clonedDoc.documentElement) {
                        clonedDoc.documentElement.style.background = cloneBgSolid;
                        clonedDoc.documentElement.style.backgroundImage = 'none';
                    }
                    if (clonedDoc.body) {
                        clonedDoc.body.style.background = cloneBgSolid;
                        clonedDoc.body.style.backgroundImage = 'none';
                    }
                    if (isFileProtocol) {
                        clonedDoc.querySelectorAll('link[rel="stylesheet"]').forEach(function (link) { link.remove(); });
                    }
                    var fallbackUrl = (window.location.origin + window.location.pathname).replace(/\/[^/]*$/, '') + '/assets/bg/bg_blackboard_main.webp';
                    var exportBgUrl = (typeof bgDataUrl === 'string' && bgDataUrl) ? bgDataUrl : fallbackUrl;
                    var exportBgUrlCss = exportBgUrl.indexOf('data:') === 0 ? ('url("' + exportBgUrl.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '")') : ('url(' + exportBgUrl + ')');
                    var containerBg = '.tb-card-view { background-image: ' + exportBgUrlCss + ' !important; background-size: cover !important; background-position: center !important; background-repeat: no-repeat !important; }';
                    var rootSolid = 'html, body { background: #1B1B1B !important; background-image: none !important; }';
                    var textVisible = '.tb-record-content, .tb-export-content, .tb-record-head, .tb-export-head, .tb-record-index, .tb-export-index, .tb-record-time, .tb-export-time, .tb-card-title, .tb-card-date, .tb-card-footer { color: #EAEAEA !important; -webkit-text-fill-color: #EAEAEA !important; }';
                    var exportFonts = '.tb-card-title { font-family: "Kalam", "TodayBoardHandwriting", "Segoe Script", "Bradley Hand", "Comic Sans MS", "Caveat", cursive !important; font-size: 32px !important; } .tb-card-date { font-family: "Kalam", "TodayBoardHandwriting", "Segoe Script", "Bradley Hand", "Comic Sans MS", "Caveat", cursive !important; font-size: 16px !important; } .tb-card-footer { font-size: 14px !important; }';
                    var overrideStyle = clonedDoc.createElement('style');
                    overrideStyle.setAttribute('data-export-override', '1');
                    overrideStyle.textContent = rootSolid + (isFileProtocol ? '* { background-image: none !important; }' : '') + containerBg + textVisible + exportFonts;
                    head.appendChild(overrideStyle);
                    var clonedContainer = clonedDoc.querySelector('.tb-card-view');
                    if (clonedContainer) {
                        clonedContainer.classList.add('tb-export-mode');
                        var exportModeStyle = clonedDoc.createElement('style');
                        exportModeStyle.setAttribute('data-export-mode', '1');
                        exportModeStyle.textContent = '.tb-export-mode { min-height: 0 !important; height: auto !important; max-height: none !important; padding-bottom: 0 !important; }\n.tb-export-mode .tb-export-record,\n.tb-export-mode .tb-record-list { min-height: 0 !important; height: auto !important; max-height: none !important; flex: none !important; flex-grow: 0 !important; padding-bottom: 0 !important; }\n.tb-export-mode, .tb-export-mode * { filter: none !important; backdrop-filter: none !important; -webkit-backdrop-filter: none !important; mix-blend-mode: normal !important; mask: none !important; -webkit-mask: none !important; background-blend-mode: normal !important; transform: none !important; }\n.tb-export-mode .tb-record::before, .tb-export-mode .tb-record::after, .tb-export-mode .tb-export-record::before, .tb-export-mode .tb-export-record::after, .tb-export-mode .tb-divider::before, .tb-export-mode .tb-divider::after, .tb-export-mode .tb-btn::after, .tb-export-mode .tb-empty::before, .tb-export-mode .tb-pin-btn::before, .tb-export-mode .tb-thumb::before { display: none !important; content: none !important; }\n.tb-export-mode { background-image: ' + exportBgUrlCss + ' !important; background-size: cover !important; background-position: center !important; background-repeat: no-repeat !important; }';
                        head.appendChild(exportModeStyle);
                        clonedContainer.style.backgroundImage = exportBgUrl.indexOf('data:') === 0 ? ('url("' + exportBgUrl.replace(/"/g, '\\"') + '")') : ('url(' + exportBgUrl + ')');
                        clonedContainer.style.backgroundSize = 'cover';
                        clonedContainer.style.backgroundPosition = 'center';
                        clonedContainer.style.backgroundRepeat = 'no-repeat';
                        if (isFileProtocol) {
                            clonedContainer.querySelectorAll('*').forEach(function (el) { el.style.backgroundImage = 'none'; });
                        } else {
                            clonedContainer.querySelectorAll('.tb-record, .tb-export-record').forEach(function (el) { el.style.backgroundImage = 'none'; });
                        }
                        clonedContainer.style.width = exportWidth + 'px';
                        clonedContainer.style.maxWidth = exportWidth + 'px';
                        clonedContainer.style.minWidth = exportWidth + 'px';
                        clonedContainer.style.height = naturalHeightCss + 'px';
                        clonedContainer.style.minHeight = naturalHeightCss + 'px';
                        clonedContainer.style.boxSizing = 'border-box';
                        var allImgs = clonedContainer.querySelectorAll('img.todayboard-img');
                        var maxWidthPx = Math.floor(exportWidth * 0.7);
                        allImgs.forEach(img => {
                            img.style.maxWidth = `${maxWidthPx}px`;
                            img.style.width = 'auto';
                            img.style.height = 'auto';
                            img.style.maxHeight = '300px';
                            img.style.objectFit = 'contain';
                            img.style.display = 'inline-block';
                            img.style.verticalAlign = 'middle';
                            img.style.borderRadius = '8px';
                            img.style.margin = '0';
                            img.style.border = '1px dashed rgba(255,255,255,0.35)';
                        });
                        const imgWrappers = clonedContainer.querySelectorAll('.tb-img-wrapper');
                        imgWrappers.forEach(wrap => {
                            wrap.style.display = 'block';
                            wrap.style.width = '100%';
                            wrap.style.margin = '8px 0 12px 0';
                        });
                        const dividers = clonedContainer.querySelectorAll('.tb-divider');
                        dividers.forEach(divider => {
                            divider.style.display = 'block';
                            divider.style.visibility = 'visible';
                            divider.style.opacity = '1';
                            divider.style.borderTop = '1px dashed rgba(255,255,255,0.35)';
                            divider.style.borderBottom = 'none';
                            divider.style.height = '0';
                            divider.style.marginTop = '12px';
                            divider.style.marginBottom = '0';
                            divider.style.width = '100%';
                            divider.style.background = 'none';
                            divider.style.backgroundImage = 'none';
                        });
                        var cloneRootBg = clonedDoc.defaultView ? clonedDoc.defaultView.getComputedStyle(clonedContainer).backgroundImage : '';
                        console.log('[TB-VERIFY] cloneRoot bg =', cloneRootBg);
                        if (!cloneRootBg || cloneRootBg.indexOf('data:image/') === -1) { console.log('[TB-FAIL] cloneRoot bg is not data url'); }
                        var verifyPxW = Math.round(exportWidth * scale);
                        var verifyPxH = Math.round(naturalHeightCss * scale);
                        console.log('[TB-VERIFY] scale=', scale, 'pxW=', verifyPxW, 'pxH=', verifyPxH);
                        if (verifyPxW > 8000 || verifyPxH > 8000) { console.log('[TB-FAIL] canvas too large'); }
                        try { dumpExportComputedStyles(clonedContainer, 'clone', clonedDoc.defaultView); } catch (e) { console.warn('[TB-Export-Dump] clone', e); }
                    }
                }
            });
            var exportedCanvas = canvas;
            console.log('[TB-RESULT] direct natural height finalCanvas=' + exportedCanvas.width + ' x ' + exportedCanvas.height);
            // #region agent log
            (function () {
                var p = { sessionId: 'debug-session', runId: 'pre-fix-1', hypothesisId: 'H3', location: 'app.js:generateTodayCard:afterHtml2canvas', message: 'canvas returned from html2canvas', data: { width: exportedCanvas && exportedCanvas.width, height: exportedCanvas && exportedCanvas.height }, timestamp: Date.now() };
                try { var prev = JSON.parse(localStorage.getItem('todayboard_export_debug') || '{}'); prev.all = (prev.all || []).concat(p); prev.latest = p; localStorage.setItem('todayboard_export_debug', JSON.stringify(prev)); } catch (e) {}
                console.log('[TB-Export-Debug]', JSON.stringify(p));
            })();
            // #endregion
            // P0修复：检查 canvas 是否有效
            if (!exportedCanvas || exportedCanvas.width === 0 || exportedCanvas.height === 0) {
                throw new Error('生成的画布无效');
            }
            
            // P0修复：尝试导出图片数据，如果因跨域/污染失败则提示；预览与下载共用 exportedCanvas
            let dataUrl;
            try {
                dataUrl = exportedCanvas.toDataURL('image/png');
                // #region agent log
                (function () {
                    var p = { sessionId: 'debug-session', runId: 'pre-fix-1', hypothesisId: 'H4', location: 'app.js:generateTodayCard:toDataURL:success', message: 'toDataURL succeeded', data: { dataUrlPrefix: typeof dataUrl === 'string' ? dataUrl.slice(0, 30) : null }, timestamp: Date.now() };
                    try { var prev = JSON.parse(localStorage.getItem('todayboard_export_debug') || '{}'); prev.all = (prev.all || []).concat(p); prev.latest = p; localStorage.setItem('todayboard_export_debug', JSON.stringify(prev)); } catch (e) {}
                    console.log('[TB-Export-Debug]', JSON.stringify(p));
                })();
                // #endregion
            } catch (e) {
                // #region agent log
                (function () {
                    var p = { sessionId: 'debug-session', runId: 'pre-fix-1', hypothesisId: 'H4', location: 'app.js:generateTodayCard:toDataURL:error', message: 'toDataURL threw error', data: { name: e && e.name, message: e && e.message }, timestamp: Date.now() };
                    try { var prev = JSON.parse(localStorage.getItem('todayboard_export_debug') || '{}'); prev.all = (prev.all || []).concat(p); prev.latest = p; localStorage.setItem('todayboard_export_debug', JSON.stringify(prev)); } catch (e2) {}
                    console.log('[TB-Export-Debug]', JSON.stringify(p));
                })();
                // #endregion
                if (e.name === 'SecurityError' || e.message && e.message.includes('tainted')) {
                    throw new Error('导出失败：图片包含跨域内容，请确保所有图片来自本应用');
                }
                throw e;
            }
            if (!dataUrl || dataUrl === 'data:,') {
                throw new Error('图片数据生成失败');
            }
            
            const filename = generateTBFileName('png');
            showCardPreview(dataUrl, filename, { width: exportedCanvas.width, height: exportedCanvas.height });
            exportContainer.classList.add('visually-hidden');
            exportContainer.classList.remove('export-mode');
            exportContainer.classList.remove('is-exporting');
            exportContainer.classList.remove('tb-export-natural-height');
        } catch (err) {
            const errorMsg = err.message || '未知错误';
            showToast(`导出失败：${errorMsg}`);
            console.error('导出失败:', err);
            exportContainer.classList.remove('tb-export-natural-height');
            console.error('错误堆栈:', err.stack);
            
            // 确保清理状态
            const exportContainer = els.cardView;
            if (exportContainer) {
                exportContainer.classList.remove('is-exporting');
                exportContainer.classList.add('visually-hidden');
            }
        }
    }

    // 仅导出传入记录集合（支持导出选中）
    async function generateCardFromRecords(records, addSelectedSuffix) {
        try {
            const exportContainer = els.cardView;
            const cardDate = els.cardDate;
            const cardText = els.cardText;
            const cardImages = els.cardImages;
            const cardTime = els.cardTime;
            if (!exportContainer || !cardDate || !cardText || !cardTime) {
                alert('导出容器缺失');
                return;
            }
            const all = loadRecords();
            const baseSet = new Set(Array.isArray(records) ? records.map(r => all.indexOf(r)).filter(i => i >= 0) : []);
            const mapped = all.map((rec, baseIndex) => ({ rec, baseIndex }));
            mapped.sort((a, b) => {
                const ap = a.rec && a.rec.pinned ? 1 : 0;
                const bp = b.rec && b.rec.pinned ? 1 : 0;
                if (ap !== bp) return bp - ap;
                return a.baseIndex - b.baseIndex;
            });
            const display = baseSet.size ? mapped.filter(m => baseSet.has(m.baseIndex)).map(m => m.rec) : mapped.map(m => m.rec);
            const dateStr = formatDateYMD(new Date());
            const timeStr = formatTimeHM(new Date());
            cardDate.textContent = dateStr;
            cardTime.textContent = `生成时间：${timeStr}`;
            
            // P0：导出内容区宽度 = 黑板内容区宽度（强制同源渲染）
            const boardWidth = getBoardContentWidth();
            exportContainer.style.width = `${boardWidth}px`;
            exportContainer.style.maxWidth = `${boardWidth}px`;
            
            // P0：复用黑板记录的DOM结构和样式
            let contentHTML = '';
            display.forEach((record, i) => {
                const hasHtml = (typeof record.textHtml === 'string' && record.textHtml.trim().length > 0);
                const textHtmlOrPlain = hasHtml ? record.textHtml : (record.text || '');
                // 使用与黑板记录相同的结构：tb-record + tb-record-head + tb-record-content
                contentHTML += `<div class="tb-record">`;
                contentHTML += `<div class="tb-record-head">`;
                contentHTML += `<div style="display: inline-flex; gap: 8px;">`;
                contentHTML += `<span class="tb-record-index">${i + 1}.</span>`;
                contentHTML += `<span class="tb-record-time">${record.time || ''}</span>`;
                contentHTML += `</div></div>`;
                if (hasHtml) {
                    contentHTML += `<div class="tb-record-content">${textHtmlOrPlain}</div>`;
                } else {
                    const inlineStyle = styleToInline(record.textStyle || null);
                    contentHTML += `<div class="tb-record-content" style="${inlineStyle}">${textHtmlOrPlain}</div>`;
                }
                // P0修复：添加分割线（最后一条记录不添加）
                if (i < display.length - 1) {
                    contentHTML += `<div class="tb-divider"></div>`;
                }
                contentHTML += `</div>`;
            });
            cardText.innerHTML = contentHTML;
            cardImages.innerHTML = '';
            
            // P0修复：确保卡片内容字体与编辑器一致（强制覆盖内联样式）
            (function normalizeCardFonts(container) {
                const allElements = container.querySelectorAll('*');
                allElements.forEach(el => {
                    if (el.style && el.style.fontFamily) {
                        el.style.fontFamily = '';
                    }
                });
            })(cardText);
            
            // 确保图片样式与黑板一致
            (function normalizeExportImages(container) {
                // 查找所有图片（包括可能没有 todayboard-img class 的）
                const allImgs = Array.from(container.querySelectorAll('img'));
                allImgs.forEach(img => {
                    // 确保图片有 todayboard-img class
                    if (!img.classList.contains('todayboard-img')) {
                        img.classList.add('todayboard-img');
                    }
                    // 清除内联样式，让CSS规则生效
                    try { 
                        img.style.width = ''; 
                        img.style.height = ''; 
                        img.style.maxWidth = '';
                    } catch {}
                    // 确保图片被包裹在 .tb-img-wrapper 中
                    const already = img.closest('.tb-img-wrapper');
                    if (!already) {
                        const wrap = document.createElement('span');
                        wrap.className = 'tb-img-wrapper';
                        img.parentNode.insertBefore(wrap, img);
                        wrap.appendChild(img);
                    }
                });
            })(cardText);
            
            await ensureHtml2Canvas();
            exportContainer.classList.remove('visually-hidden');
            exportContainer.classList.add('export-mode');
            exportContainer.classList.add('is-exporting');
            exportContainer.classList.add('tb-export-natural-height');
            await waitForImages(exportContainer);
            await new Promise(function (r) { requestAnimationFrame(function () { requestAnimationFrame(r); }); });
            var naturalHeightCss = exportContainer.scrollHeight || exportContainer.offsetHeight;
            naturalHeightCss = Math.max(1, Math.ceil(naturalHeightCss));
            console.log('[TB-Export] naturalHeightCss=', naturalHeightCss, '（直接按卡片自然高度截图，不裁剪）');

            const isFileProtocol = window.location.protocol === 'file:';
            const bgImageAbsoluteUrl = new URL('./assets/bg/bg_blackboard_main.webp', window.location.href).href;
            let bgDataUrl = null;
            try {
                bgDataUrl = await imageUrlToDataUrl(bgImageAbsoluteUrl);
            } catch (e) {
                console.error('导出背景图转 data URL 失败，将使用纯色背景导出', { url: bgImageAbsoluteUrl, message: e && e.message, exception: e });
                if (isFileProtocol) {
                    try { showToast('当前为本地文件打开，导出为纯色背景；通过 http 访问页面可获得黑板纹理'); } catch (_) {}
                }
            }
            const exportWidth = EXPORT_WIDTH;
            var scale = Math.max(2, window.devicePixelRatio || 2);
            var MAX_PX = 8000;
            scale = Math.min(scale, MAX_PX / exportWidth, MAX_PX / naturalHeightCss);
            console.log('[TB-Export-Scale] scale=', scale, 'naturalHeightCss=', naturalHeightCss);

            // 诊断：列出导出目标及祖先上的合成属性
            try {
                var diagnostic = getExportCompositeDiagnostic(exportContainer);
                console.log('[TB-Export-Composite] root及祖先:', diagnostic.ancestors, '子树非默认:', diagnostic.subtree);
            } catch (e) {
                console.warn('[TB-Export-Composite] 诊断失败', e);
            }

            const canvas = await html2canvas(exportContainer, {
                backgroundColor: null,
                useCORS: true,
                allowTaint: true,
                scale: scale,
                logging: false,
                width: exportWidth,
                windowWidth: exportWidth,
                height: naturalHeightCss,
                ignoreElements: (element) => {
                    return element.classList && (
                        element.classList.contains('tb-editor-overlay') ||
                        element.classList.contains('tb-preview-overlay') ||
                        element.classList.contains('tb-confirm-overlay') ||
                        element.classList.contains('tb-guide-overlay') ||
                        element.classList.contains('tb-popover-overlay')
                    );
                },
                onclone: (function (naturalH) {
                    return function (clonedDoc) {
                    var head = clonedDoc.head || clonedDoc.createElement('head');
                    if (!clonedDoc.head && clonedDoc.documentElement) {
                        try { clonedDoc.documentElement.insertBefore(head, clonedDoc.body || clonedDoc.documentElement.firstChild); } catch (e) {}
                    }
                    var cloneBgSolid = '#1B1B1B';
                    if (clonedDoc.documentElement) {
                        clonedDoc.documentElement.style.background = cloneBgSolid;
                        clonedDoc.documentElement.style.backgroundImage = 'none';
                    }
                    if (clonedDoc.body) {
                        clonedDoc.body.style.background = cloneBgSolid;
                        clonedDoc.body.style.backgroundImage = 'none';
                    }
                    if (isFileProtocol) {
                        clonedDoc.querySelectorAll('link[rel="stylesheet"]').forEach(function (link) { link.remove(); });
                    }
                    var fallbackUrl = (window.location.origin + window.location.pathname).replace(/\/[^/]*$/, '') + '/assets/bg/bg_blackboard_main.webp';
                    var exportBgUrl = (typeof bgDataUrl === 'string' && bgDataUrl) ? bgDataUrl : fallbackUrl;
                    var exportBgUrlCss = exportBgUrl.indexOf('data:') === 0 ? ('url("' + exportBgUrl.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '")') : ('url(' + exportBgUrl + ')');
                    var containerBg = '.tb-card-view { background-image: ' + exportBgUrlCss + ' !important; background-size: cover !important; background-position: center !important; background-repeat: no-repeat !important; }';
                    var rootSolid = 'html, body { background: #1B1B1B !important; background-image: none !important; }';
                    var textVisible = '.tb-record-content, .tb-export-content, .tb-record-head, .tb-export-head, .tb-record-index, .tb-export-index, .tb-record-time, .tb-export-time, .tb-card-title, .tb-card-date, .tb-card-footer { color: #EAEAEA !important; -webkit-text-fill-color: #EAEAEA !important; }';
                    var exportFonts = '.tb-card-title { font-family: "Kalam", "TodayBoardHandwriting", "Segoe Script", "Bradley Hand", "Comic Sans MS", "Caveat", cursive !important; font-size: 32px !important; } .tb-card-date { font-family: "Kalam", "TodayBoardHandwriting", "Segoe Script", "Bradley Hand", "Comic Sans MS", "Caveat", cursive !important; font-size: 16px !important; } .tb-card-footer { font-size: 14px !important; }';
                    var overrideStyle = clonedDoc.createElement('style');
                    overrideStyle.setAttribute('data-export-override', '1');
                    overrideStyle.textContent = rootSolid + (isFileProtocol ? '* { background-image: none !important; }' : '') + containerBg + textVisible + exportFonts;
                    head.appendChild(overrideStyle);
                    var clonedContainer = clonedDoc.querySelector('.tb-card-view');
                    if (clonedContainer) {
                        clonedContainer.classList.add('tb-export-mode');
                        var exportModeStyle = clonedDoc.createElement('style');
                        exportModeStyle.setAttribute('data-export-mode', '1');
                        exportModeStyle.textContent = '.tb-export-mode { min-height: 0 !important; height: auto !important; max-height: none !important; padding-bottom: 0 !important; }\n.tb-export-mode .tb-export-record,\n.tb-export-mode .tb-record-list { min-height: 0 !important; height: auto !important; max-height: none !important; flex: none !important; flex-grow: 0 !important; padding-bottom: 0 !important; }\n.tb-export-mode, .tb-export-mode * { filter: none !important; backdrop-filter: none !important; -webkit-backdrop-filter: none !important; mix-blend-mode: normal !important; mask: none !important; -webkit-mask: none !important; background-blend-mode: normal !important; transform: none !important; }\n.tb-export-mode .tb-record::before, .tb-export-mode .tb-record::after, .tb-export-mode .tb-export-record::before, .tb-export-mode .tb-export-record::after, .tb-export-mode .tb-divider::before, .tb-export-mode .tb-divider::after, .tb-export-mode .tb-btn::after, .tb-export-mode .tb-empty::before, .tb-export-mode .tb-pin-btn::before, .tb-export-mode .tb-thumb::before { display: none !important; content: none !important; }\n.tb-export-mode { background-image: ' + exportBgUrlCss + ' !important; background-size: cover !important; background-position: center !important; background-repeat: no-repeat !important; }';
                        head.appendChild(exportModeStyle);
                        clonedContainer.style.backgroundImage = exportBgUrl.indexOf('data:') === 0 ? ('url("' + exportBgUrl.replace(/"/g, '\\"') + '")') : ('url(' + exportBgUrl + ')');
                        clonedContainer.style.backgroundSize = 'cover';
                        clonedContainer.style.backgroundPosition = 'center';
                        clonedContainer.style.backgroundRepeat = 'no-repeat';
                        if (isFileProtocol) {
                            clonedContainer.querySelectorAll('*').forEach(function (el) { el.style.backgroundImage = 'none'; });
                        } else {
                            clonedContainer.querySelectorAll('.tb-record, .tb-export-record').forEach(function (el) { el.style.backgroundImage = 'none'; });
                        }
                        clonedContainer.style.width = exportWidth + 'px';
                        clonedContainer.style.maxWidth = exportWidth + 'px';
                        clonedContainer.style.minWidth = exportWidth + 'px';
                        clonedContainer.style.height = naturalH + 'px';
                        clonedContainer.style.minHeight = naturalH + 'px';
                        clonedContainer.style.boxSizing = 'border-box';
                        var allImgs = clonedContainer.querySelectorAll('img.todayboard-img');
                        var maxWidthPx = Math.floor(exportWidth * 0.7);
                        allImgs.forEach(function (img) {
                            img.style.maxWidth = maxWidthPx + 'px';
                            img.style.width = 'auto';
                            img.style.height = 'auto';
                            img.style.maxHeight = '300px';
                            img.style.objectFit = 'contain';
                            img.style.display = 'inline-block';
                            img.style.verticalAlign = 'middle';
                            img.style.borderRadius = '8px';
                            img.style.margin = '0';
                            img.style.border = '1px dashed rgba(255,255,255,0.35)';
                        });
                        var imgWrappers = clonedContainer.querySelectorAll('.tb-img-wrapper');
                        imgWrappers.forEach(function (wrap) { wrap.style.display = 'block'; wrap.style.width = '100%'; wrap.style.margin = '8px 0 12px 0'; });
                        var dividers = clonedContainer.querySelectorAll('.tb-divider');
                        dividers.forEach(function (divider) {
                            divider.style.display = 'block';
                            divider.style.visibility = 'visible';
                            divider.style.opacity = '1';
                            divider.style.borderTop = '1px dashed rgba(255,255,255,0.35)';
                            divider.style.borderBottom = 'none';
                            divider.style.height = '0';
                            divider.style.marginTop = '12px';
                            divider.style.marginBottom = '0';
                            divider.style.width = '100%';
                            divider.style.background = 'none';
                            divider.style.backgroundImage = 'none';
                        });
                        var cloneRootBg = clonedDoc.defaultView ? clonedDoc.defaultView.getComputedStyle(clonedContainer).backgroundImage : '';
                        console.log('[TB-VERIFY] cloneRoot bg =', cloneRootBg);
                        if (!cloneRootBg || cloneRootBg.indexOf('data:image/') === -1) { console.log('[TB-FAIL] cloneRoot bg is not data url'); }
                        var verifyPxW = Math.round(exportWidth * scale);
                        var verifyPxH = Math.round(naturalH * scale);
                        console.log('[TB-VERIFY] scale=', scale, 'pxW=', verifyPxW, 'pxH=', verifyPxH);
                        if (verifyPxW > 8000 || verifyPxH > 8000) { console.log('[TB-FAIL] canvas too large'); }
                        try { dumpExportComputedStyles(clonedContainer, 'clone', clonedDoc.defaultView); } catch (e) { console.warn('[TB-Export-Dump] clone', e); }
                    }
                    };
                })(naturalHeightCss)
            });
            var exportedCanvas = canvas;
            console.log('[TB-RESULT] direct natural height finalCanvas=' + exportedCanvas.width + ' x ' + exportedCanvas.height);
            let dataUrl;
            try {
                dataUrl = exportedCanvas.toDataURL('image/png');
            } catch (e) {
                if (e.name === 'SecurityError' || (e.message && e.message.includes('tainted'))) {
                    throw new Error('导出失败：图片包含跨域内容，请确保所有图片来自本应用');
                }
                throw e;
            }
            const filename = generateTBFileName('png');
            showCardPreview(dataUrl, filename, { width: exportedCanvas.width, height: exportedCanvas.height });
            exportContainer.classList.add('visually-hidden');
            exportContainer.classList.remove('export-mode');
            exportContainer.classList.remove('is-exporting');
            exportContainer.classList.remove('tb-export-natural-height');
            exportContainer.style.width = '';
            exportContainer.style.maxWidth = '';
        } catch (err) {
            alert(err && err.message ? err.message : '生成黑板图片失败，请稍后重试');
            console.error(err);
            exportContainer.classList.remove('is-exporting');
            exportContainer.classList.remove('tb-export-natural-height');
        }
    }

    /* ---------- 清空 ---------- */
    function clearToday() {
        if (els.todayText) els.todayText.value = '';
        localStorage.removeItem(STORAGE_KEYS.TODAY_TEXT);
        localStorage.removeItem(STORAGE_KEYS.TODAY_IMAGE);
        // 获取当前记录并保留置顶项
        const currentRecords = loadRecords();
        const pinnedRecords = currentRecords.filter(record => record && record.pinned);
        
        // 只保存置顶记录，清空其他所有记录
        saveRecords(pinnedRecords);
        renderRecords();
        if (els.imagePreview) els.imagePreview.innerHTML = '';
        if (els.imageInput) els.imageInput.value = '';
        // 清空后退出多选模式
        selectedSet.clear();
        updateMultiSelectUI();
        const preservedCount = pinnedRecords.length;
        if (preservedCount > 0) {
            showToast(`已清空黑板，保留了 ${preservedCount} 条置顶记录`);
        } else {
            showToast('已清空黑板');
        }
    }

    function openConfirmClear() {
        if (!els.confirmClearOverlay) { clearToday(); return; }
        els.confirmClearOverlay.classList.remove('visually-hidden');
        els.confirmClearOverlay.setAttribute('aria-hidden', 'false');
        els.confirmClearOverlay.classList.add('is-open');
    }
    
    function openConfirmClearWithMessage(pinnedCount) {
        // 使用动态创建的确认弹窗
        const overlay = document.createElement('section');
        overlay.className = 'tb-confirm-overlay is-open';
        overlay.setAttribute('aria-hidden', 'false');

        const dialog = document.createElement('div');
        dialog.className = 'tb-confirm-dialog';
        dialog.setAttribute('role', 'dialog');
        dialog.setAttribute('aria-labelledby', 'clearConfirmTitle');

        const title = document.createElement('h3');
        title.id = 'clearConfirmTitle';
        title.className = 'tb-confirm-title';
        title.textContent = '确认清空今日黑板？';

        const desc = document.createElement('p');
        desc.className = 'tb-confirm-desc';
        if (pinnedCount > 0) {
            desc.textContent = `此操作不可撤销。将清空所有记录，但保留置顶记录。`;
        } else {
            desc.textContent = '此操作不可撤销，将清空所有记录。';
        }

        const actions = document.createElement('div');
        actions.className = 'tb-confirm-actions';
        const btnConfirm = document.createElement('button');
        btnConfirm.className = 'tb-btn tb-btn-chalk-white';
        btnConfirm.textContent = '确认清空';
        const btnCancel = document.createElement('button');
        btnCancel.className = 'tb-btn tb-btn-chalk-white';
        btnCancel.textContent = '取消';

        actions.appendChild(btnConfirm);
        actions.appendChild(btnCancel);
        dialog.appendChild(title);
        dialog.appendChild(desc);
        dialog.appendChild(actions);
        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        const close = () => {
            overlay.classList.remove('is-open');
            overlay.setAttribute('aria-hidden', 'true');
            setTimeout(() => overlay.remove(), 300);
        };

        btnConfirm.addEventListener('click', () => {
            close();
            clearToday();
        });
        btnCancel.addEventListener('click', () => {
            close();
        });
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                close();
            }
        });
    }
    function closeConfirmClear() {
        if (!els.confirmClearOverlay) return;
        els.confirmClearOverlay.classList.add('visually-hidden');
        els.confirmClearOverlay.setAttribute('aria-hidden', 'true');
        els.confirmClearOverlay.classList.remove('is-open');
    }

    /* ---------- 事件绑定 ---------- */
    function bindEvents() {
        const safe = (el, evt, fn, name) => {
            if (!el) { console.warn(`元素缺失：${name}`); return false; }
            el.addEventListener(evt, fn);
            console.log(`已绑定：${name}.${evt}`);
            return true;
        };
        safe(els.guideConfirmBtn, 'click', confirmGuide, 'guideConfirmBtn');
        // #region agent log
        (function () {
            var hasFooter = !!els.addFooterImageBtn; var hasCamera = !!els.cameraInput; var id = (els.addFooterImageBtn && els.addFooterImageBtn.id) || 'none';
            fetch('http://127.0.0.1:7243/ingest/a11b6c32-3942-4660-9c8b-9fa7d3127c4a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app.js:bind-footer',message:'init addFooterImageBtn and cameraInput',data:{addFooterImageBtnExists:hasFooter,cameraInputExists:hasCamera,footerId:id},timestamp:Date.now(),hypothesisId:'H1'})}).catch(function(){});
        })();
        // #endregion
        // 首页仅拍照：只调起 cameraInput（摄像头），绝不触发 imageInput（相册）
        safe(els.addFooterImageBtn, 'click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            if (!els.cameraInput) {
                // #region agent log
                fetch('http://127.0.0.1:7243/ingest/a11b6c32-3942-4660-9c8b-9fa7d3127c4a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app.js:addFooterImageBtn-click',message:'footer image btn clicked but cameraInput missing',data:{cameraInputExists:false},timestamp:Date.now(),hypothesisId:'H1-H2'})}).catch(function(){});
                // #endregion
                return;
            }
            els.cameraInput.value = '';
            els.cameraInput.setAttribute('capture', 'environment');
            els.cameraInput.removeAttribute('multiple');
            els.cameraInput.accept = 'image/*';
            const captureBefore = els.cameraInput.getAttribute('capture');
            const acceptBefore = els.cameraInput.accept;
            // #region agent log
            fetch('http://127.0.0.1:7243/ingest/a11b6c32-3942-4660-9c8b-9fa7d3127c4a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app.js:addFooterImageBtn-click',message:'footer image btn clicked, triggering cameraInput',data:{cameraInputExists:true,captureAttr:captureBefore,accept:acceptBefore,hasMultiple:els.cameraInput.hasAttribute('multiple')},timestamp:Date.now(),hypothesisId:'H1-H2'})}).catch(function(){});
            // #endregion
            els.cameraInput.click();
        }, 'addFooterImageBtn');
        safe(els.cameraInput, 'change', handleCameraPhoto, 'cameraInput');
        safe(els.imageInput, 'change', e => handleSelectedImages(e.target.files), 'imageInput');
        // JSON 文件选择器
        safe(els.jsonInput, 'change', handleJsonFileSelect, 'jsonInput');
        // 不再将输入内容持久化到 localStorage
        // safe(els.todayText, 'input', () => {}, 'todayText');
        // 主页面导出按钮：总是导出所有记录
        safe(els.generateCardBtn, 'click', (e) => {
            // P0修复：添加调试日志和错误处理
            console.log('导出按钮被点击');
            if (!els.generateCardBtn) {
                console.error('导出按钮元素不存在');
                showToast('导出按钮未找到，请刷新页面');
                return;
            }
            try {
                generateTodayCard();
            } catch (err) {
                console.error('导出按钮点击处理失败:', err);
                showToast('导出功能异常，请刷新页面重试');
            }
        }, 'generateCardBtn');
        // 清空按钮直接清空（保留置顶记录）
        // 清空按钮：弹出二次确认
        safe(els.clearBtn, 'click', () => {
            const list = loadRecords();
            const pinnedCount = list.filter(r => r && r.pinned).length;
            openConfirmClearWithMessage(pinnedCount);
        }, 'clearBtn');
        // 恢复数据确认弹窗按钮
        safe(els.confirmRestoreConfirmBtn, 'click', performRestore, 'confirmRestoreConfirmBtn');
        safe(els.confirmRestoreCancelBtn, 'click', closeConfirmRestore, 'confirmRestoreCancelBtn');
        // 恢复确认弹窗：点击遮罩关闭
        if (els.confirmRestoreOverlay) {
            els.confirmRestoreOverlay.addEventListener('click', (e) => {
                if (e.target === els.confirmRestoreOverlay) {
                    closeConfirmRestore();
                }
            });
        }
        // 多选模式按钮


        // 点击遮罩空白处关闭弹窗（仅遮罩非对话内容）

        // 多选模式按钮
        safe(els.btnCancel, 'click', cancelSelection, 'btnCancel');
        safe(els.btnSelectAll, 'click', selectAllToggle, 'btnSelectAll');
        safe(els.btnDelete, 'click', deleteSelected, 'btnDelete');
        safe(els.btnEdit, 'click', () => {
            if (selectedSet.size === 1) {
                const idx = Array.from(selectedSet)[0];
                openEditor('edit', idx);
            }
        }, 'btnEdit');
        safe(els.btnExport, 'click', exportSelected, 'btnExport');
        // 置顶：仅单选可用，点击切换，保证唯一置顶；并反馈与返回浏览态
        safe(els.btnPin, 'click', () => {
            const list = loadRecords();
            if (selectedSet.size !== 1) return;
            const idx = Array.from(selectedSet)[0];
            if (idx == null || idx < 0 || idx >= list.length) return;
            const isPinned = !!(list[idx] && list[idx].pinned);
            // 轻微放大动画
            try {
                els.btnPin.classList.add('is-bounce');
                setTimeout(() => els.btnPin.classList.remove('is-bounce'), 200);
            } catch {}
            if (isPinned) {
                // 取消置顶
                list[idx].pinned = false;
                saveRecords(list);
                // 返回浏览态：先清空选中并收起浮动栏，再刷新列表以确保图标正确
                selectedSet.clear();
                updateMultiSelectUI();
                renderRecords();
                showToast('📌 已取消置顶');
            } else {
                // 设为置顶，同时取消其他置顶
                list.forEach((r, i) => { if (r) r.pinned = (i === idx); });
                saveRecords(list);
                // 返回浏览态：先清空选中并收起浮动栏，再刷新列表以确保图标正确
                selectedSet.clear();
                updateMultiSelectUI();
                renderRecords();
                showToast('📌 已置顶到顶部');
            }
        }, 'btnPin');
        // 在主内容区域点击空白处时退出选中模式（不依赖“取消全选”）
        safe(els.main, 'click', (e) => {
            const t = e.target;
            // 忽略点击记录项、上/下浮动栏、编辑层
            if (t.closest('.tb-record') || t.closest('.tb-action-bar') || t.closest('.tb-editor-overlay')) return;
            if (selectedSet.size > 0) {
                cancelSelection();
            }
        }, 'mainBlankClick');
        // 主界面的“＋”进入编辑新建
        safe(els.writeBtn, 'click', () => openEditor('new'), 'writeBtn');
        // 编辑界面按钮
        const handleEditorBack = () => {
            const list = loadRecords();

            // 新建：如果有修改，提示是否保存
            if (editingIndex == null) {
                if (hasEditorChanges()) {
                    showEditSaveConfirm(
                        () => {
                            // 保存：提交新记录
                            if (els.editorSubmitBtn && !els.editorSubmitBtn.disabled) {
                                applyEdit();
                                editorHistory = []; historyIndex = -1;
                            } else {
                                exitEditor();
                            }
                        },
                        () => {
                            // 不保存：直接退出
                            exitEditor();
                        }
                    );
                } else {
                    exitEditor();
                }
                return;
            }

            // 修改：若当前内容被清空（文本与图片都空）→ 确认删除或取消恢复
            if (editingIndex < 0 || editingIndex >= list.length) { exitEditor(); return; }
            if (!hasMeaningfulEditorContent() && editingImages.length === 0) {
                showEditEmptyConfirm(
                    () => {
                        const remain = list.filter((_, i) => i !== editingIndex);
                        saveRecords(remain);
                        renderRecords();
                        exitEditor();
                    },
                    () => {
                        // 取消：恢复最后一次非空编辑状态并停留在编辑页
                        if (els.editorText) {
                            if (editorIsCE() && editorLastNonEmpty.html) {
                                setEditorHTML(editorLastNonEmpty.html || '');
                            } else {
                                setEditorPlainText(editorLastNonEmpty.text || '');
                            }
                        }
                        editingImages = Array.isArray(editorLastNonEmpty.images) ? editorLastNonEmpty.images.slice() : [];
                        editingImageNames = Array.isArray(editorLastNonEmpty.imageNames) ? editorLastNonEmpty.imageNames.slice() : [];
                        updateEditorSubmitState();
                        updateEditorSubmitState();
                    }
                );
                return;
            }
            
            // 修改模式：如果有修改，提示是否保存
            if (hasEditorChanges()) {
                showEditSaveConfirm(
                    () => {
                        // 保存：提交修改
                        if (els.editorSubmitBtn && !els.editorSubmitBtn.disabled) {
                            applyEdit();
                            editorHistory = []; historyIndex = -1;
                        } else {
            exitEditor();
                        }
                    },
                    () => {
                        // 不保存：直接退出，丢弃修改
                        exitEditor();
                    }
                );
            } else {
                // 无修改：直接退出
                exitEditor();
            }
        };
        safe(els.editorBackBtn, 'click', handleEditorBack, 'editorBackBtn');
        safe(els.editorAddImageBtn, 'click', () => { pushEditorHistory(); openAddImageMenu(els.editorAddImageBtn); }, 'editorAddImageBtn');
        safe(els.editorChecklistBtn, 'click', () => { pushEditorHistory(); insertChecklistAtCaret(); }, 'editorChecklistBtn');
        // 样式总按钮：开关浮动下栏
        safe(els.editorStyleBtn, 'click', () => toggleStyleBar(), 'editorStyleBtn');
        // P0修复：字体栏关闭按钮 - 唯一退出方式
        safe(els.editorStyleBarCloseBtn, 'click', () => closeStyleBar(), 'editorStyleBarCloseBtn');
        // P0修复：移除点击空白区域自动关闭字体栏的逻辑（字体栏必须显式关闭）
        // ESC 收起浮动栏（保留，作为快捷键）
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && isStyleEditMode) {
                closeStyleBar();
            }
        });
        // P0修复：文本样式：B/I/U 切换 - 必须保留选区
        // 关键：pointerdown/mousedown 时先保存选区，然后 preventDefault 阻止焦点转移
        safe(els.editorBoldBtn, 'pointerdown', (e) => { 
            e.preventDefault(); 
            e.stopPropagation();
            captureEditorSelection(); // 关键：在阻止焦点转移前保存选区
        }, 'editorBoldBtnPointer');
        safe(els.editorBoldBtn, 'mousedown', (e) => { 
            e.preventDefault(); 
            e.stopPropagation();
            captureEditorSelection(); // 关键：在阻止焦点转移前保存选区
        }, 'editorBoldBtnMouse');
        safe(els.editorBoldBtn, 'click', () => {
            pushEditorHistory();
            // 关键：应用样式前恢复选区
            restoreEditorSelection();
            
            const sel = window.getSelection();
            if (!sel || sel.rangeCount === 0) {
                debugLog('B click: no selection');
                return;
            }
            
            const range = sel.getRangeAt(0);
            const hasSel = !range.collapsed;
            
            debugLog('B click', {
                mode: hasSel ? 'selection' : 'caret',
                textLength: hasSel ? range.toString().length : 0
            });
            
            if (hasSel && editorIsCE()) {
                // P0修复：Selection 模式 - 参考参考文件实现
                debugLog('B: selection mode');
                const currentStyle = getCurrentStyleAtCursor(); // 读取并更新 selectionStyle
                const willBeBold = !currentStyle.bold;
                
                // 应用/移除样式到 DOM（函数内部会处理样式检测和应用）
                if (willBeBold) {
                    applyStyleToSelection('bold');
                } else {
                    removeStyleFromSelection('bold');
                }
                
                // 更新 selectionStyle 状态
                editorStyleState.selectionStyle.bold = willBeBold;
                
                markEditorDirty();
                // 关键：应用/移除样式后立即恢复选区（确保即时显色）
                restoreEditorSelection();
                updateStyleControlsUI();
            } else {
                // P0修复：Caret 模式 - 参考参考文件实现：插入样式span
                debugLog('B: caret mode');
                const currentStyle = getCurrentStyleAtCursor(); // 返回 typingStyle
                const willBeBold = !currentStyle.bold;
                
                // 更新 typingStyle 状态
                editorStyleState.typingStyle.bold = willBeBold;
                editingStyle.fontWeight = willBeBold ? 600 : 400;
                
                // P0修复：在光标位置插入样式span，后续输入会自动继承样式
                if (editorIsCE()) {
                    insertStyledSpanAtCaret({ fontWeight: willBeBold ? 600 : 400 });
                } else {
                    applyEditorStyle();
                }
                
                debugLog('B: typingStyle updated and span inserted', { bold: willBeBold, wasBold: currentStyle.bold, typingStyle: editorStyleState.typingStyle });
                
                markEditorDirty();
                // P0修复：立即更新 UI，确保按钮状态反映 typingStyle
                updateStyleControlsUI();
                debugLog('B: UI updated, button should be', willBeBold ? 'active' : 'inactive');
            }
            
            updateEditorSubmitState();
            styleChangeFeedback();
        }, 'editorBoldBtn');
        safe(els.editorItalicBtn, 'pointerdown', (e) => { 
            e.preventDefault(); 
            e.stopPropagation();
            captureEditorSelection();
        }, 'editorItalicBtnPointer');
        safe(els.editorItalicBtn, 'mousedown', (e) => { 
            e.preventDefault(); 
            e.stopPropagation();
            captureEditorSelection();
        }, 'editorItalicBtnMouse');
        safe(els.editorItalicBtn, 'click', () => {
            pushEditorHistory();
            restoreEditorSelection();
            
            const sel = window.getSelection();
            if (!sel || sel.rangeCount === 0) {
                debugLog('I click: no selection');
                return;
            }
            
            const range = sel.getRangeAt(0);
            const hasSel = !range.collapsed;
            
            debugLog('I click', {
                mode: hasSel ? 'selection' : 'caret',
                textLength: hasSel ? range.toString().length : 0
            });
            
            if (hasSel && editorIsCE()) {
                // P0修复：Selection 模式 - 参考参考文件实现
                debugLog('I: selection mode');
                const currentStyle = getCurrentStyleAtCursor(); // 读取并更新 selectionStyle
                const willBeItalic = !currentStyle.italic;
                
                // 应用/移除样式到 DOM（函数内部会处理样式检测和应用）
                if (willBeItalic) {
                    applyStyleToSelection('italic');
                } else {
                    removeStyleFromSelection('italic');
                }
                
                // 更新 selectionStyle 状态
                editorStyleState.selectionStyle.italic = willBeItalic;
                
                markEditorDirty();
                // 关键：应用/移除样式后立即恢复选区（确保即时显色）
                restoreEditorSelection();
                updateStyleControlsUI();
            } else {
                // P0修复：Caret 模式 - 参考参考文件实现：插入样式span
                debugLog('I: caret mode');
                const currentStyle = getCurrentStyleAtCursor(); // 返回 typingStyle
                const willBeItalic = !currentStyle.italic;
                
                // 更新 typingStyle 状态
                editorStyleState.typingStyle.italic = willBeItalic;
                editingStyle.fontStyle = willBeItalic ? 'italic' : 'normal';
                
                // P0修复：在光标位置插入样式span，后续输入会自动继承样式
                if (editorIsCE()) {
                    insertStyledSpanAtCaret({ fontStyle: willBeItalic ? 'italic' : 'normal' });
                } else {
                    applyEditorStyle();
                }
                
                debugLog('I: typingStyle updated and span inserted', { italic: willBeItalic, wasItalic: currentStyle.italic, typingStyle: editorStyleState.typingStyle });
                
                markEditorDirty();
                // P0修复：立即更新 UI，确保按钮状态反映 typingStyle
                updateStyleControlsUI();
                debugLog('I: UI updated, button should be', willBeItalic ? 'active' : 'inactive');
            }
            
            updateEditorSubmitState();
            styleChangeFeedback();
        }, 'editorItalicBtn');
        safe(els.editorUnderlineBtn, 'pointerdown', (e) => { 
            e.preventDefault(); 
            e.stopPropagation();
            captureEditorSelection();
        }, 'editorUnderlineBtnPointer');
        safe(els.editorUnderlineBtn, 'mousedown', (e) => { 
            e.preventDefault(); 
            e.stopPropagation();
            captureEditorSelection();
        }, 'editorUnderlineBtnMouse');
        safe(els.editorUnderlineBtn, 'click', () => {
            pushEditorHistory();
            restoreEditorSelection();
            
            const sel = window.getSelection();
            if (!sel || sel.rangeCount === 0) {
                debugLog('U click: no selection');
                return;
            }
            
            const range = sel.getRangeAt(0);
            const hasSel = !range.collapsed;
            
            debugLog('U click', {
                mode: hasSel ? 'selection' : 'caret',
                textLength: hasSel ? range.toString().length : 0
            });
            
            if (hasSel && editorIsCE()) {
                // P0修复：Selection 模式 - 参考参考文件实现
                debugLog('U: selection mode');
                
                // P0修复：参考参考文件 - 使用 isStyleActiveInFragment 检测
                const frag = sel.getRangeAt(0).cloneContents();
                const isUnderline = isStyleActiveInFragment(frag, { textDecoration: 'underline' });
                
                debugLog('U: current state', { 
                    isUnderline,
                    willBeUnderline: !isUnderline
                });
                
                let did = false;
                try {
                    if (isUnderline) {
                        // 如果已有下划线，移除（参考参考文件：使用 toggleStyleOnSelection 的逻辑）
                        did = removeStyleFromSelection('underline');
                    } else {
                        // 如果没有下划线，添加
                        did = applyStyleToSelection('underline');
                    }
                } catch (e) {
                    debugLog('U: toggle error', e);
                }
                
                if (!did) {
                    // Fallback: 使用 execCommand（参考参考文件）
                    try { 
                        document.execCommand('underline'); 
                        did = true;
                    } catch (e) {
                        debugLog('U: execCommand fallback failed', e);
                    }
                }
                
                if (did) {
                    // P0修复：移除/应用后恢复选区并更新状态
                    restoreEditorSelection();
                    
                    // P0修复：立即更新状态和UI（结构化移除后DOM已确定）
                    const updatedStyle = getCurrentStyleAtCursor();
                    editorStyleState.selectionStyle.underline = updatedStyle.underline;
                    
                    markEditorDirty();
                    updateStyleControlsUI();
                    
                    // P0修复：验证移除结果（调试用）
                    if (!isUnderline) {
                        const verifySel = window.getSelection();
                        if (verifySel && verifySel.rangeCount > 0) {
                            const verifyRange = verifySel.getRangeAt(0);
                            if (!verifyRange.collapsed) {
                                const frag = verifyRange.cloneContents();
                                const fragHtml = Array.from(frag.querySelectorAll('*')).map(el => el.outerHTML).join('');
                                const hasU = fragHtml.includes('<u') || fragHtml.includes('</u>');
                                const hasDataTb = fragHtml.includes('data-tb="u"');
                                const hasUnderlineStyle = fragHtml.includes('text-decoration: underline') || 
                                                       fragHtml.includes('text-decoration-line: underline');
                                debugLog('U: removal verification', {
                                    hasU,
                                    hasDataTb,
                                    hasUnderlineStyle,
                                    removed: !hasU && !hasDataTb && !hasUnderlineStyle ? '✓' : '✗'
                                });
                            }
                        }
                    }
                } else {
                    // 如果操作失败，也要更新UI
                    updateStyleControlsUI();
                }
            } else {
                // P0修复：Caret 模式 - 参考参考文件实现：插入样式span
                debugLog('U: caret mode');
                const currentStyle = getCurrentStyleAtCursor(); // 返回 typingStyle
                const willBeUnderline = !currentStyle.underline;
                
                // 更新 typingStyle 状态
                editorStyleState.typingStyle.underline = willBeUnderline;
                editingStyle.textDecoration = willBeUnderline ? 'underline' : 'none';
                
                // P0修复：在光标位置插入样式span，后续输入会自动继承样式
                if (editorIsCE()) {
                    insertStyledSpanAtCaret({ textDecoration: willBeUnderline ? 'underline' : 'none' });
                } else {
                    applyEditorStyle();
                }
                
                debugLog('U: typingStyle updated and span inserted', { underline: willBeUnderline, wasUnderline: currentStyle.underline, typingStyle: editorStyleState.typingStyle });
                
                markEditorDirty();
                // P0修复：立即更新 UI，确保按钮状态反映 typingStyle
                updateStyleControlsUI();
                debugLog('U: UI updated, button should be', willBeUnderline ? 'active' : 'inactive');
            }
            
            updateEditorSubmitState();
            styleChangeFeedback();
        }, 'editorUnderlineBtn');
        // P0修复：字体颜色功能 - 必须保留选区并即时显色
        if (FEATURE_COLOR && els.editorColorPalette) {
            // 颜色按钮：pointerdown/mousedown 时保存选区
            els.editorColorPalette.addEventListener('pointerdown', (e) => {
                const btn = e.target.closest('.tb-color-swatch');
                if (btn) {
                    e.preventDefault();
                    e.stopPropagation();
                    captureEditorSelection();
                }
            });
            els.editorColorPalette.addEventListener('mousedown', (e) => {
                const btn = e.target.closest('.tb-color-swatch');
                if (btn) {
                    e.preventDefault();
                    e.stopPropagation();
                    captureEditorSelection();
                }
            });
            // 颜色选择
            els.editorColorPalette.addEventListener('click', (e) => {
                const btn = e.target.closest('.tb-color-swatch');
                if (!btn) return;
                pushEditorHistory();
                // 关键：应用样式前恢复选区
                restoreEditorSelection();
                
                const c = btn.getAttribute('data-color');
                if (!c) return;
                const sel = window.getSelection();
                const hasSel = !!(sel && sel.rangeCount && !sel.getRangeAt(0).collapsed);
                
                if (hasSel && editorIsCE()) {
                    // P0修复：Selection 模式 - 即时显色
                    applyInlineStyleToSelection({ color: c });
                    // 更新 selectionStyle 状态
                    editorStyleState.selectionStyle.fontColor = c;
                    // 关键：应用样式后立即恢复选区（确保即时显色）
                    restoreEditorSelection();
                    updateStyleControlsUI();
                } else {
                    // P0修复：Caret 模式 - 参考参考文件实现：插入样式span
                    const currentStyle = getCurrentStyleAtCursor(); // 返回 typingStyle
                    const currentColor = currentStyle.fontColor || '#FFFFFF';
                    const willBeColor = (c === currentColor) ? '#FFFFFF' : c; // 点击相同颜色恢复默认
                    
                    // 更新 typingStyle 状态
                    editorStyleState.typingStyle.fontColor = willBeColor;
                    editingStyle.fontColor = willBeColor;
                    
                    // P0修复：在光标位置插入样式span，后续输入会自动继承样式
                    if (editorIsCE()) {
                        insertStyledSpanAtCaret({ color: willBeColor });
                    } else {
                        applyEditorStyle();
                    }
                    
                    markEditorDirty();
                    updateStyleControlsUI();
                }
                updateEditorSubmitState();
                styleChangeFeedback();
            });
        }
        
        // P0修复：字号滑杆 - 必须保留选区
        if (els.editorFontSize) {
            // 字号滑杆：pointerdown/mousedown 时保存选区（不阻止默认行为，允许滑杆滑动）
            els.editorFontSize.addEventListener('pointerdown', (e) => {
                // P0修复：不调用 preventDefault()，允许滑杆正常滑动
                e.stopPropagation();
                captureEditorSelection();
            });
            els.editorFontSize.addEventListener('mousedown', (e) => {
                // P0修复：不调用 preventDefault()，允许滑杆正常滑动
                e.stopPropagation();
                captureEditorSelection();
            });
            els.editorFontSize.addEventListener('input', (e) => {
                pushEditorHistory();
                // 关键：应用样式前恢复选区
                restoreEditorSelection();
                
                const step = Math.max(1, Math.min(3, Number(e.target.value) || 2));
                const size = FONT_SIZE_STEPS[step - 1] || 16;
                const sel = window.getSelection();
                const hasSel = !!(sel && sel.rangeCount && !sel.getRangeAt(0).collapsed);
                
                if (hasSel && editorIsCE()) {
                    // P0修复：Selection 模式 - 即时显色
                    applyInlineStyleToSelection({ fontSize: size });
                    // 更新 selectionStyle 状态
                    editorStyleState.selectionStyle.fontSize = size;
                    // 关键：应用样式后立即恢复选区（确保即时显色）
                    restoreEditorSelection();
                    updateStyleControlsUI();
                }
                
                editingStyle.fontSize = size;
                
                if (editorIsCE() && !hasSel) {
                    // P0修复：Caret 模式 - 参考参考文件实现：插入样式span
                    editorStyleState.typingStyle.fontSize = size;
                    // P0修复：在光标位置插入样式span，后续输入会自动继承样式
                    insertStyledSpanAtCaret({ fontSize: size });
                    markEditorDirty();
                    updateStyleControlsUI();
                } else if (!editorIsCE()) {
                    applyEditorStyle();
                    markEditorDirty();
                    updateStyleControlsUI();
                }
                updateEditorSubmitState();
                styleChangeFeedback();
            });
        }
        // 撤销/重做按钮 & 发送按钮
        safe(els.editorUndoBtn, 'click', handleUndo, 'editorUndoBtn');
        safe(els.editorRedoBtn, 'click', handleRedo, 'editorRedoBtn');
        // 发送按钮：仅在激活（未禁用）时响应
        safe(els.editorSubmitBtn, 'click', () => {
            if (!els.editorSubmitBtn || els.editorSubmitBtn.disabled) return;
            applyEdit();
            editorHistory = []; historyIndex = -1;
        }, 'editorSubmitBtn');

        // 回车提交文字
        if (els.todayText) {
            els.todayText.addEventListener('keydown', e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    // 主界面按回车也进入编辑界面（新建并带入文本）
                    openEditor('new');
                }
            });
        }
        if (els.editorText) {
            let currentRecognizer = null; // 语音识别实例，input/focus 时停止
            function setListeningIndicator(active, immediate) { /* no-op: 语音指示器 UI 未使用 */ }
            // v1规范：任务框点击处理 - 独立可点击元素
            els.editorText.addEventListener('click', (e) => {
                const checkbox = e.target && e.target.closest && e.target.closest('.tb-check');
                if (checkbox) {
                    e.preventDefault();
                    e.stopPropagation();
                    const line = checkbox.closest('.tb-check-line');
                    if (line) {
                        toggleChecklistItem(line);
                    }
                }
            });
            
            // v1规范：任务框键盘支持（空格键/Enter切换）
            els.editorText.addEventListener('keydown', (e) => {
                const checkbox = e.target && e.target.closest && e.target.closest('.tb-check');
                if (checkbox && (e.key === ' ' || e.key === 'Enter')) {
                    e.preventDefault();
                    e.stopPropagation();
                    const line = checkbox.closest('.tb-check-line');
                    if (line) {
                        toggleChecklistItem(line);
                    }
                }
            });
            els.editorText.addEventListener('keydown', e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    if (editorIsCE()) {
                        const sel = window.getSelection();
                        const node = sel && sel.anchorNode ? (sel.anchorNode.nodeType === 3 ? sel.anchorNode.parentElement : sel.anchorNode) : null;
                        const line = node ? node.closest('.tb-check-line') : null;
                        if (line) {
                            e.preventDefault();
                            const newLine = createChecklistLine('');
                            line.insertAdjacentElement('afterend', newLine);
                            try {
                                const textEl = newLine.querySelector('.tb-check-text');
                                const range = document.createRange();
                                range.setStart(textEl, 0);
                                range.setEnd(textEl, 0);
                                const sel2 = window.getSelection();
                                sel2.removeAllRanges();
                                sel2.addRange(range);
                            } catch {}
                            updateEditorSubmitState();
                            return;
                        }
                    } else {
                        const el = els.editorText;
                        const text = el.value || '';
                        const pos = el.selectionStart;
                        const { start, end } = getLineRange(text, pos);
                        const line = text.slice(start, end);
                        if (isChecklistLine(line)) {
                            e.preventDefault();
                            const before = text.slice(0, pos);
                            const after = text.slice(pos);
                            const insert = '\n☐ ';
                            el.value = before + insert + after;
                            const caret = pos + insert.length;
                            try { el.setSelectionRange(caret, caret); } catch {}
                            updateEditorSubmitState();
                            return;
                        }
                    }
                    // 非勾选行正常换行；不再在编辑页用 Enter 提交
                }
            });
            // 移除选区变化触发迷你浮动条
            // 切回文字输入时恢复话筒按钮样式并停止识别
            els.editorText.addEventListener('input', () => {
                if (currentRecognizer) { try { currentRecognizer.stop(); } catch {} currentRecognizer = null; }
                setListeningIndicator(false, true);
                updateEditorSubmitState();
                // 已移除迷你浮动条相关逻辑
            });
            els.editorText.addEventListener('focus', (e) => {
                // v1规范：样式编辑模式 - 阻止键盘弹出，但允许selection和光标显示
                if (isStyleEditMode) {
                    // v1规范：移动端立即阻止focus，防止键盘弹出
                    if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) {
                        // 移动端：立即阻止focus事件，防止键盘弹出
                        e.preventDefault();
                        e.stopImmediatePropagation();
                        // 立即blur，防止键盘弹出
                        if (els.editorText && document.activeElement === els.editorText) {
                            els.editorText.blur();
                        }
                        // 延迟再次检查，确保blur生效
                        setTimeout(() => {
                            if (els.editorText && document.activeElement === els.editorText) {
                                els.editorText.blur();
                            }
                            updateStyleControlsUI();
                        }, 0);
                    } else {
                        // 桌面端：允许保持焦点，显示光标，但不阻止selection
                        // 桌面端不会弹出键盘，所以不需要blur
                        updateStyleControlsUI();
                    }
                    return;
                }
                
                if (currentRecognizer) { try { currentRecognizer.stop(); } catch {} currentRecognizer = null; }
                setListeningIndicator(false, true);
                // 焦点时更新按钮状态
                setTimeout(() => {
                    updateStyleControlsUI();
                }, 0);
            });
            // 已清理迷你浮动条的事件绑定
        }
    }

    /* ---------- 初始化 ---------- */
    document.addEventListener('DOMContentLoaded', () => {
        const todayStr = setTodayDate();
        try { openGuideIfNeeded(); } catch (e) { console.error(e); }
        try {
            const last = localStorage.getItem(STORAGE_KEYS.LAST_DATE);
            if (last !== todayStr) {
                clearToday();
                localStorage.setItem(STORAGE_KEYS.LAST_DATE, todayStr);
            } else {
                // 不再恢复文本，保持为空
                if (els.todayText) els.todayText.value = '';
            }
            // 无论如何移除持久化文本，确保下次打开为空
            localStorage.removeItem(STORAGE_KEYS.TODAY_TEXT);
        } catch (e) { console.error(e); }
        renderRecords();
        bindEvents();
        // 版本角标
        // P0修复：移除版本号显示，改为「更多」按钮
        // 版本号已从HTML中移除，不再需要设置
        
        // P0修复：更多说明面板组件（MoreMenuModal）
        // 封装为独立组件，使用状态控制
        const MoreMenuModal = {
            isOpen: false,
            elements: {
                btn: null,
                overlay: null,
                closeBtn: null,
                backupBtn: null,
                restoreBtn: null,
                feedbackBtn: null,
                buildDate: null
            },
            
            init() {
                this.elements.btn = document.getElementById('moreBtn');
                this.elements.overlay = document.getElementById('moreOverlay');
                this.elements.closeBtn = document.getElementById('moreCloseBtn');
                this.elements.backupBtn = document.getElementById('moreBackupBtn');
                this.elements.restoreBtn = document.getElementById('moreRestoreBtn');
                this.elements.feedbackBtn = document.getElementById('moreFeedbackBtn');
                this.elements.buildDate = document.getElementById('moreBuildDate');
                
                if (!this.elements.btn || !this.elements.overlay) return;
                
                // 设置 Build 日期
                if (this.elements.buildDate) {
                    this.elements.buildDate.textContent = `Build ${BUILD_DATE}`;
                }
                
                // 打开弹窗
                this.elements.btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.open();
                });
                
                // 关闭按钮
                if (this.elements.closeBtn) {
                    this.elements.closeBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        this.close();
                    });
                }
                
                // 点击遮罩关闭
                this.elements.overlay.addEventListener('click', (e) => {
                    if (e.target === this.elements.overlay) {
                        this.close();
                    }
                });
                
                // ESC 键关闭
                document.addEventListener('keydown', (e) => {
                    if (e.key === 'Escape' && this.isOpen) {
                        this.close();
                    }
                });
                
                // 备份数据按钮
                if (this.elements.backupBtn) {
                    this.elements.backupBtn.addEventListener('click', () => {
                        this.close();
                        exportBackup();
                    });
                }
                
                // 恢复数据按钮
                if (this.elements.restoreBtn) {
                    this.elements.restoreBtn.addEventListener('click', () => {
                        this.close();
                        importBackup();
                    });
                }
                
                // 问题反馈按钮
                if (this.elements.feedbackBtn) {
                    this.elements.feedbackBtn.addEventListener('click', () => {
                        this.onFeedback();
                    });
                }
            },
            
            open() {
                if (!this.elements.overlay) return;
                this.isOpen = true;
                this.elements.overlay.classList.remove('visually-hidden');
                this.elements.overlay.setAttribute('aria-hidden', 'false');
                // 防止背景滚动
                document.body.style.overflow = 'hidden';
            },
            
            close() {
                if (!this.elements.overlay) return;
                this.isOpen = false;
                this.elements.overlay.classList.add('visually-hidden');
                this.elements.overlay.setAttribute('aria-hidden', 'true');
                // 恢复背景滚动
                document.body.style.overflow = '';
            },
            
            onFeedback() {
                // P0修复：问题反馈处理函数
                console.log('问题反馈');
                // 可以在这里添加实际的反馈逻辑，比如打开邮箱或跳转到反馈页面
                // 例如：window.open('mailto:feedback@example.com?subject=问题反馈');
                showToast('问题反馈功能开发中，敬请期待');
            }
        };
        
        // 初始化更多菜单弹窗
        MoreMenuModal.init();
        
        console.log('Today Board 初始化完成');
    });
})();
