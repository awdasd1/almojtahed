/**
 * theme_manager.js — محرك الثيمات الحديث المتكامل للمكتبة الشاملة
 * يدعم تصميم واجهة كلاود (Claude Web) الدافئ والداكن + تصدير واستيراد الثيمات كـ JSON
 */

var THEME_PRESETS = window.THEME_PRESETS || {
    "claude-warm": {
        id: "claude-warm",
        name: "كلاود دافئ (Claude Warm — الافتراضي)",
        type: "light",
        colors: {
            "--bg-primary": "#FAF9F5",
            "--bg-secondary": "#F4F1EA",
            "--bg-card": "#FFFFFF",
            "--bg-card-hover": "#FAF8F4",
            "--bg-glass": "rgba(250, 249, 245, 0.96)",
            "--bg-input": "#FFFFFF",
            "--bg-container": "#F4F1EA",
            "--bg-container-secondary": "#EAE5DB",
            "--border-color": "#E8E4DC",
            "--border-strong": "#D8D2C5",
            "--border-glow": "rgba(218, 119, 86, 0.25)",
            "--border-container": "#E2DDD3",
            "--color-dark-container-1": "#F4F1EA",
            "--color-dark-container-2": "#EAE5DB",
            "--color-dark-container-3": "#7D786F",
            "--text-main": "#201F1D",
            "--text-muted": "#6B6862",
            "--text-dim": "#9E9A92",
            "--bg-pill": "rgba(218, 119, 86, 0.08)",
            "--text-pill": "#DA7756",
            "--accent-emerald": "#DA7756",
            "--accent-emerald-dark": "#C56545",
            "--accent-emerald-glow": "rgba(218, 119, 86, 0.12)",
            "--accent-gold": "#C56545",
            "--accent-gold-glow": "rgba(218, 119, 86, 0.1)",
            "--accent-cyan": "#2B78E4",
            "--accent-sky": "#DA7756",
            "--mark-bg": "rgba(218, 119, 86, 0.18)",
            "--mark-text": "#7A351E"
        }
    },
    "claude-dark": {
        id: "claude-dark",
        name: "كلاود داكن (Claude Dark)",
        type: "dark",
        colors: {
            "--bg-primary": "#1B1A18",
            "--bg-secondary": "#161513",
            "--bg-card": "#242320",
            "--bg-card-hover": "#2B2925",
            "--bg-glass": "rgba(27, 26, 24, 0.94)",
            "--bg-input": "#23221F",
            "--bg-container": "#1E1D1A",
            "--bg-container-secondary": "#292723",
            "--border-color": "#33312C",
            "--border-strong": "#45423C",
            "--border-glow": "rgba(224, 130, 99, 0.3)",
            "--border-container": "#38352F",
            "--color-dark-container-1": "#1E1D1A",
            "--color-dark-container-2": "#292723",
            "--color-dark-container-3": "#8F8A7F",
            "--text-main": "#ECE8E0",
            "--text-muted": "#A49F95",
            "--text-dim": "#726E65",
            "--bg-pill": "rgba(224, 130, 99, 0.12)",
            "--text-pill": "#E08263",
            "--accent-emerald": "#E08263",
            "--accent-emerald-dark": "#EC9273",
            "--accent-emerald-glow": "rgba(224, 130, 99, 0.2)",
            "--accent-gold": "#E08263",
            "--accent-gold-glow": "rgba(224, 130, 99, 0.15)",
            "--accent-cyan": "#38BDF8",
            "--accent-sky": "#E08263",
            "--mark-bg": "rgba(224, 130, 99, 0.25)",
            "--mark-text": "#FFF2EC"
        }
    },
    "emerald-dark": {
        id: "emerald-dark",
        name: "زمردي داكن (Modern Emerald)",
        type: "dark",
        colors: {
            "--bg-primary": "#070a11",
            "--bg-secondary": "#0d131f",
            "--bg-card": "rgba(15, 22, 35, 0.88)",
            "--bg-card-hover": "rgba(22, 32, 50, 0.95)",
            "--bg-glass": "rgba(10, 15, 25, 0.85)",
            "--bg-input": "#0b101b",
            "--bg-container": "#131b2e",
            "--bg-container-secondary": "#1a263d",
            "--border-color": "rgba(255, 255, 255, 0.08)",
            "--border-strong": "rgba(255, 255, 255, 0.16)",
            "--border-glow": "rgba(16, 185, 129, 0.35)",
            "--border-container": "rgba(255, 255, 255, 0.09)",
            "--color-dark-container-1": "#404553",
            "--color-dark-container-2": "#585C68",
            "--color-dark-container-3": "#94969E",
            "--text-main": "#f1f5f9",
            "--text-muted": "#94a3b8",
            "--text-dim": "#64748b",
            "--bg-pill": "rgba(255, 255, 255, 0.05)",
            "--text-pill": "#cbd5e1",
            "--accent-emerald": "#10b981",
            "--accent-emerald-dark": "#059669",
            "--accent-emerald-glow": "rgba(16, 185, 129, 0.2)",
            "--accent-gold": "#f59e0b",
            "--accent-gold-glow": "rgba(245, 158, 11, 0.16)",
            "--accent-cyan": "#06b6d4",
            "--accent-sky": "#38bdf8",
            "--mark-bg": "rgba(245, 158, 11, 0.22)",
            "--mark-text": "#fef08a"
        }
    },
    "heritage-amber": {
        id: "heritage-amber",
        name: "التراث الذهبي (Heritage Amber)",
        type: "dark",
        colors: {
            "--bg-primary": "#120e0a",
            "--bg-secondary": "#1a140e",
            "--bg-card": "rgba(28, 22, 16, 0.9)",
            "--bg-card-hover": "rgba(38, 30, 22, 0.95)",
            "--bg-glass": "rgba(20, 16, 12, 0.88)",
            "--bg-input": "#15100c",
            "--bg-container": "#241c14",
            "--bg-container-secondary": "#302419",
            "--border-color": "rgba(217, 119, 6, 0.18)",
            "--border-strong": "rgba(217, 119, 6, 0.32)",
            "--border-glow": "rgba(245, 158, 11, 0.4)",
            "--border-container": "rgba(217, 119, 6, 0.22)",
            "--color-dark-container-1": "#3a2c1f",
            "--color-dark-container-2": "#543f2c",
            "--color-dark-container-3": "#a3896b",
            "--text-main": "#fef3c7",
            "--text-muted": "#d97706",
            "--text-dim": "#92400e",
            "--bg-pill": "rgba(217, 119, 6, 0.12)",
            "--text-pill": "#fef3c7",
            "--accent-emerald": "#d97706",
            "--accent-emerald-dark": "#b45309",
            "--accent-emerald-glow": "rgba(217, 119, 6, 0.25)",
            "--accent-gold": "#fbbf24",
            "--accent-gold-glow": "rgba(251, 191, 36, 0.22)",
            "--accent-cyan": "#f59e0b",
            "--accent-sky": "#fcd34d",
            "--mark-bg": "rgba(251, 191, 36, 0.25)",
            "--mark-text": "#fef3c7"
        }
    },
    "midnight-cyan": {
        id: "midnight-cyan",
        name: "سماء نيلية (Midnight Ocean)",
        type: "dark",
        colors: {
            "--bg-primary": "#040914",
            "--bg-secondary": "#081224",
            "--bg-card": "rgba(12, 24, 46, 0.9)",
            "--bg-card-hover": "rgba(18, 34, 64, 0.95)",
            "--bg-glass": "rgba(6, 15, 32, 0.88)",
            "--bg-input": "#071328",
            "--bg-container": "#0e1c35",
            "--bg-container-secondary": "#142749",
            "--border-color": "rgba(56, 189, 248, 0.15)",
            "--border-strong": "rgba(56, 189, 248, 0.28)",
            "--border-glow": "rgba(56, 189, 248, 0.42)",
            "--border-container": "rgba(56, 189, 248, 0.18)",
            "--color-dark-container-1": "#1b2e50",
            "--color-dark-container-2": "#294779",
            "--color-dark-container-3": "#7db0dc",
            "--text-main": "#f0f9ff",
            "--text-muted": "#7dd3fc",
            "--text-dim": "#38bdf8",
            "--bg-pill": "rgba(56, 189, 248, 0.12)",
            "--text-pill": "#e0f2fe",
            "--accent-emerald": "#0284c7",
            "--accent-emerald-dark": "#0369a1",
            "--accent-emerald-glow": "rgba(2, 132, 199, 0.25)",
            "--accent-gold": "#38bdf8",
            "--accent-gold-glow": "rgba(56, 189, 248, 0.2)",
            "--accent-cyan": "#38bdf8",
            "--accent-sky": "#7dd3fc",
            "--mark-bg": "rgba(56, 189, 248, 0.22)",
            "--mark-text": "#f0f9ff"
        }
    },
    "obsidian-minimal": {
        id: "obsidian-minimal",
        name: "سواد فاخر (Obsidian Minimal)",
        type: "dark",
        colors: {
            "--bg-primary": "#000000",
            "--bg-secondary": "#080808",
            "--bg-card": "rgba(18, 18, 18, 0.92)",
            "--bg-card-hover": "rgba(28, 28, 28, 0.98)",
            "--bg-glass": "rgba(10, 10, 10, 0.9)",
            "--bg-input": "#0d0d0d",
            "--bg-container": "#161616",
            "--bg-container-secondary": "#242424",
            "--border-color": "rgba(255, 255, 255, 0.12)",
            "--border-strong": "rgba(255, 255, 255, 0.26)",
            "--border-glow": "rgba(255, 255, 255, 0.3)",
            "--border-container": "rgba(255, 255, 255, 0.14)",
            "--color-dark-container-1": "#2e2e2e",
            "--color-dark-container-2": "#4a4a4a",
            "--color-dark-container-3": "#8e8e8e",
            "--text-main": "#ffffff",
            "--text-muted": "#a3a3a3",
            "--text-dim": "#737373",
            "--bg-pill": "rgba(255, 255, 255, 0.06)",
            "--text-pill": "#ffffff",
            "--accent-emerald": "#e5e5e5",
            "--accent-emerald-dark": "#d4d4d4",
            "--accent-emerald-glow": "rgba(255, 255, 255, 0.18)",
            "--accent-gold": "#a3a3a3",
            "--accent-gold-glow": "rgba(255, 255, 255, 0.12)",
            "--accent-cyan": "#e5e5e5",
            "--accent-sky": "#ffffff",
            "--mark-bg": "rgba(255, 255, 255, 0.2)",
            "--mark-text": "#ffffff"
        }
    },
    "clean-light": {
        id: "clean-light",
        name: "نهاري ناصع (Clean Light)",
        type: "light",
        colors: {
            "--bg-primary": "#f8fafc",
            "--bg-secondary": "#ffffff",
            "--bg-card": "#ffffff",
            "--bg-card-hover": "#f1f5f9",
            "--bg-glass": "rgba(255, 255, 255, 0.94)",
            "--bg-input": "#f8fafc",
            "--bg-container": "#f1f5f9",
            "--bg-container-secondary": "#e2e8f0",
            "--border-color": "rgba(0, 0, 0, 0.08)",
            "--border-strong": "rgba(0, 0, 0, 0.18)",
            "--border-glow": "rgba(16, 185, 129, 0.38)",
            "--border-container": "rgba(0, 0, 0, 0.08)",
            "--color-dark-container-1": "#f1f5f9",
            "--color-dark-container-2": "#e2e8f0",
            "--color-dark-container-3": "#64748b",
            "--text-main": "#0f172a",
            "--text-muted": "#475569",
            "--text-dim": "#94a3b8",
            "--bg-pill": "#f1f5f9",
            "--text-pill": "#1e293b",
            "--accent-emerald": "#059669",
            "--accent-emerald-dark": "#047857",
            "--accent-emerald-glow": "rgba(5, 150, 105, 0.15)",
            "--accent-gold": "#d97706",
            "--accent-gold-glow": "rgba(217, 119, 6, 0.15)",
            "--accent-cyan": "#0284c7",
            "--accent-sky": "#0369a1",
            "--mark-bg": "#fef08a",
            "--mark-text": "#854d0e"
        }
    },
    "desert-sand": {
        id: "desert-sand",
        name: "رمل الصحراء (Desert Warm)",
        type: "light",
        colors: {
            "--bg-primary": "#faf6ee",
            "--bg-secondary": "#f3ecdf",
            "--bg-card": "#ffffff",
            "--bg-card-hover": "#f7f2e7",
            "--bg-glass": "rgba(250, 246, 238, 0.94)",
            "--bg-input": "#f3ecdf",
            "--bg-container": "#f4ede0",
            "--bg-container-secondary": "#e8dfce",
            "--border-color": "rgba(180, 83, 9, 0.14)",
            "--border-strong": "rgba(180, 83, 9, 0.25)",
            "--border-glow": "rgba(180, 83, 9, 0.38)",
            "--border-container": "rgba(180, 83, 9, 0.16)",
            "--color-dark-container-1": "#f4ede0",
            "--color-dark-container-2": "#e8dfce",
            "--color-dark-container-3": "#78716c",
            "--text-main": "#292524",
            "--text-muted": "#57534e",
            "--text-dim": "#78716c",
            "--bg-pill": "#f4ede0",
            "--text-pill": "#292524",
            "--accent-emerald": "#b45309",
            "--accent-emerald-dark": "#92400e",
            "--accent-emerald-glow": "rgba(180, 83, 9, 0.16)",
            "--accent-gold": "#d97706",
            "--accent-gold-glow": "rgba(217, 119, 6, 0.16)",
            "--accent-cyan": "#b45309",
            "--accent-sky": "#92400e",
            "--mark-bg": "rgba(217, 119, 6, 0.18)",
            "--mark-text": "#451a03"
        }
    },
    "royal-purple": {
        id: "royal-purple",
        name: "الأندلسي الملكي (Royal Velvet)",
        type: "dark",
        colors: {
            "--bg-primary": "#0a0614",
            "--bg-secondary": "#120b22",
            "--bg-card": "rgba(26, 16, 48, 0.9)",
            "--bg-card-hover": "rgba(38, 24, 70, 0.95)",
            "--bg-glass": "rgba(14, 8, 28, 0.88)",
            "--bg-input": "#0f091c",
            "--bg-container": "#22133f",
            "--bg-container-secondary": "#2f1956",
            "--border-color": "rgba(168, 85, 247, 0.16)",
            "--border-strong": "rgba(168, 85, 247, 0.28)",
            "--border-glow": "rgba(168, 85, 247, 0.42)",
            "--border-container": "rgba(168, 85, 247, 0.22)",
            "--color-dark-container-1": "#331b5c",
            "--color-dark-container-2": "#4d298a",
            "--color-dark-container-3": "#b99be2",
            "--text-main": "#faf5ff",
            "--text-muted": "#c084fc",
            "--text-dim": "#a855f7",
            "--bg-pill": "rgba(168, 85, 247, 0.14)",
            "--text-pill": "#faf5ff",
            "--accent-emerald": "#a855f7",
            "--accent-emerald-dark": "#9333ea",
            "--accent-emerald-glow": "rgba(168, 85, 247, 0.25)",
            "--accent-gold": "#e9d5ff",
            "--accent-gold-glow": "rgba(233, 213, 255, 0.18)",
            "--accent-cyan": "#c084fc",
            "--accent-sky": "#d8b4fe",
            "--mark-bg": "rgba(168, 85, 247, 0.25)",
            "--mark-text": "#faf5ff"
        }
    }
};

let activeThemePresetKey = "emerald-dark";
let customImportedThemeData = null;

// تطبيق خصائص الألوان مباشرة على جذر المستند وبطريقة حاسمة عبر Dynamic Style Tag
function applyThemeVariables(colors, type = "dark") {
    if (!colors) return;
    const root = document.documentElement;
    
    // 1. تحديث خصائص الـ CSS على documentElement مباشرة
    for (const [prop, val] of Object.entries(colors)) {
        root.style.setProperty(prop, val);
    }
    
    // 2. تحديث لون وخلفية الـ body إن وجد
    if (document.body && colors["--bg-primary"]) {
        document.body.style.backgroundColor = colors["--bg-primary"];
        if (colors["--text-main"]) document.body.style.color = colors["--text-main"];
    }

    // 3. استخراج وتأكيد الألوان الأساسية للحاويات
    const emeraldGlow = colors["--accent-emerald-glow"] || "rgba(218, 119, 86, 0.15)";
    const goldGlow = colors["--accent-gold-glow"] || "rgba(218, 119, 86, 0.1)";
    const bgPrimary = colors["--bg-primary"] || (type === "light" ? "#FAF9F5" : "#1B1A18");
    const textMain = colors["--text-main"] || (type === "light" ? "#201F1D" : "#ECE8E0");
    const textMuted = colors["--text-muted"] || (type === "light" ? "#6B6862" : "#A49F95");
    const bgCard = colors["--bg-card"] || (type === "light" ? "#FFFFFF" : "#242320");
    const borderColor = colors["--border-color"] || (type === "light" ? "#E8E4DC" : "#33312C");
    const bgContainer = colors["--bg-container"] || colors["--color-dark-container-1"] || (type === "light" ? "#F4F1EA" : "#1E1D1A");
    const bgContainerSec = colors["--bg-container-secondary"] || colors["--color-dark-container-2"] || (type === "light" ? "#EAE5DB" : "#292723");
    const borderContainer = colors["--border-container"] || (type === "light" ? "#E2DDD3" : "#38352F");
    const bgPill = colors["--bg-pill"] || bgContainerSec;
    const textPill = colors["--text-pill"] || (colors["--accent-emerald"] || "#DA7756");

    // 4. حقن عنصر <style id="shamela-dynamic-theme-vars"> لحسم كافة المتغيرات على جميع المستويات
    let styleTag = document.getElementById("shamela-dynamic-theme-vars");
    if (!styleTag) {
        styleTag = document.createElement("style");
        styleTag.id = "shamela-dynamic-theme-vars";
        document.head.appendChild(styleTag);
    }

    let cssRules = ":root, html, body, [data-theme], [data-mode] {\n";
    for (const [prop, val] of Object.entries(colors)) {
        cssRules += `  ${prop}: ${val} !important;\n`;
    }
    cssRules += "}\n";

    const isClaudeTheme = activeThemePresetKey && activeThemePresetKey.startsWith("claude");
    const bgImageRule = (isClaudeTheme || type === "light")
        ? "none !important"
        : `radial-gradient(circle at 15% 15%, ${emeraldGlow} 0%, transparent 45%), radial-gradient(circle at 85% 85%, ${goldGlow} 0%, transparent 45%) !important`;

    // تطبيق ألوان الحاويات والبطاقات ومستويات التباين
    cssRules += `
    body {
        background-color: ${bgPrimary} !important;
        color: ${textMain} !important;
        background-image: ${bgImageRule};
    }
    .stat-card, .result-card, .search-wrapper, .ai-chat-card, .settings-card, .assistant-card, .modal-dialog, .kpi-card, .pipeline-kpi-card, .chat-welcome-card {
        background: ${bgCard} !important;
        border-color: ${borderColor} !important;
        color: ${textMain} !important;
    }
    .scope-indicator-bar, .mode-selector, .snippet-box, .source-item-card, .settings-nav-ribbon, .pipeline-toolbar-bar,
    .assistant-card-header, .ast-model-selector-card, .ast-scope-summary-card, .ast-embedding-config-box, .ast-scope-box, .model-company-banner {
        background: ${bgContainer} !important;
        border-color: ${borderContainer} !important;
        color: ${textMain} !important;
    }
    .assistant-card-header:hover, .ast-model-selector-card:hover, .model-company-banner:hover {
        background: ${bgContainerSec} !important;
    }
    .ast-name-label, .ast-model-name-text {
        color: ${textMain} !important;
    }
    .company-logo-slot, .ast-icon-avatar {
        background: ${bgContainerSec} !important;
        border: 1px solid ${borderContainer} !important;
    }
    #activeModelFullTitle, .ast-model-id-text {
        color: ${textMuted} !important;
    }
    .ast-btn-toggle, .ast-btn-action {
        background: ${bgContainerSec} !important;
        border: 1px solid ${borderContainer} !important;
        color: ${textMain} !important;
    }
    .ast-scope-book-chip {
        background: ${bgPill} !important;
        color: ${textPill} !important;
        border: 1px solid ${borderContainer} !important;
    }
    .mode-chip {
        background: transparent !important;
        color: ${textMuted} !important;
    }
    .mode-chip.active {
        background: ${bgCard} !important;
        color: ${colors["--accent-emerald"] || "#DA7756"} !important;
        box-shadow: 0 1px 3px rgba(0,0,0,0.1) !important;
        border-color: ${borderContainer} !important;
    }
    .suggestion-pill {
        background: ${bgPill} !important;
        color: ${textPill} !important;
        border: 1px solid ${borderContainer} !important;
    }
    .stat-icon, .btn-select-books, .btn-prov-pill {
        background: ${bgContainerSec} !important;
        border-color: ${borderContainer} !important;
        color: ${textMain} !important;
    }
    .filter-select {
        background-color: ${bgContainer} !important;
        border-color: ${borderContainer} !important;
        color: ${textMain} !important;
    }
    .filter-select option {
        background-color: ${bgCard} !important;
        color: ${textMain} !important;
    }
    .msg-content blockquote, .msg-content pre {
        background: ${bgContainer} !important;
        border-color: ${borderContainer} !important;
        color: ${textMain} !important;
    }
    `;

    styleTag.textContent = cssRules;
}

// تهيئة الثيم عند تحميل الصفحة فوراً
function initTheme() {
    // 1. فحص ما إذا كان هناك ثيم مخصص مستورد مسبقاً
    const savedCustom = localStorage.getItem("shamela_custom_theme_json");
    if (savedCustom) {
        try {
            customImportedThemeData = JSON.parse(savedCustom);
            const opt = document.getElementById("customThemeOption");
            if (opt) {
                opt.style.display = "block";
                opt.innerText = `🎨 ${customImportedThemeData.name || "ثيم مخصص"}`;
            }
        } catch (e) {
            console.warn("Invalid saved custom theme:", e);
        }
    }

    // 2. فحص الثيم النشط المحفوظ وتعيين تصميم كلاود الدافئ (Claude Warm) كافتراضي أساسي
    let savedKey = localStorage.getItem("shamela_theme_active");
    if (!savedKey || !localStorage.getItem("shamela_claude_default_applied_v2")) {
        savedKey = "claude-warm";
        localStorage.setItem("shamela_theme_active", "claude-warm");
        localStorage.setItem("shamela_theme", "light");
        localStorage.setItem("shamela_claude_default_applied_v2", "true");
    }

    if (savedKey === "light" || savedKey === "claude-warm") {
        applyThemePreset("claude-warm");
    } else if (savedKey === "dark" || savedKey === "claude-dark") {
        applyThemePreset("claude-dark");
    } else if (savedKey === "custom" && customImportedThemeData) {
        applyCustomThemeData(customImportedThemeData);
    } else if (THEME_PRESETS[savedKey]) {
        applyThemePreset(savedKey);
    } else {
        applyThemePreset("claude-warm");
    }
}

// تطبيق ثيم مسبق الضبط
function applyThemePreset(presetKey) {
    const preset = THEME_PRESETS[presetKey];
    if (!preset) return;

    activeThemePresetKey = presetKey;
    
    // تعيين سمة المظهر العامة (dark / light) وسمة الثيم المحددة
    document.documentElement.setAttribute("data-theme", presetKey);
    document.documentElement.setAttribute("data-mode", preset.type);
    
    if (document.body) {
        if (preset.type === "light") {
            document.body.classList.add("theme-light");
            document.body.classList.remove("theme-dark");
        } else {
            document.body.classList.remove("theme-light");
            document.body.classList.add("theme-dark");
        }
        // إزالة أي فئات ثيمات سابقة وإضافة الفئة الحالية
        for (const k of Object.keys(THEME_PRESETS)) {
            document.body.classList.remove(`theme-${k}`);
        }
        document.body.classList.add(`theme-${presetKey}`);
    }

    // تطبيق خصائص الألوان مع التحديث الديناميكي
    applyThemeVariables(preset.colors, preset.type);

    // مزامنة القائمة المنسدلة
    const sel = document.getElementById("themePresetSelect");
    if (sel && sel.value !== presetKey) {
        sel.value = presetKey;
    }

    localStorage.setItem("shamela_theme_active", presetKey);
    localStorage.setItem("shamela_theme", preset.type);
    updateThemeIcon(preset.type);
}

// معالج تغيير القائمة المنسدلة
function onThemePresetChanged(newKey) {
    if (newKey === "custom" && customImportedThemeData) {
        applyCustomThemeData(customImportedThemeData);
        if (typeof showToast === "function") showToast(`✓ تم تطبيق الثيم المخصص: ${customImportedThemeData.name}`);
        return;
    }
    applyThemePreset(newKey);
    const p = THEME_PRESETS[newKey];
    if (p && typeof showToast === "function") {
        showToast(`✓ تم تغيير المظهر: ${p.name}`);
    }
}

// زر التبديل السريع بين النهاري والليلي
function toggleTheme() {
    const curMode = document.documentElement.getAttribute("data-mode") || "dark";
    if (curMode === "dark") {
        applyThemePreset("clean-light");
        if (typeof showToast === "function") showToast("✓ تم التبديل إلى المظهر النهاري الناصع");
    } else {
        applyThemePreset("emerald-dark");
        if (typeof showToast === "function") showToast("✓ تم التبديل إلى المظهر الليلي الزمردي");
    }
}

// تحديث أيقونة الشمس/القمر في الهيدر
function updateThemeIcon(type) {
    const btn = document.getElementById("themeToggleBtn");
    if (btn) {
        btn.innerHTML = type === "dark" ? "☀️" : "🌙";
    }
}

// تصدير وتحميل الثيم كملف JSON
function exportThemeToJson() {
    let themeObj;
    if (activeThemePresetKey === "custom" && customImportedThemeData) {
        themeObj = customImportedThemeData;
    } else {
        const p = THEME_PRESETS[activeThemePresetKey] || THEME_PRESETS["emerald-dark"];
        themeObj = {
            id: activeThemePresetKey,
            name: p.name,
            type: p.type,
            version: "1.0",
            author: "المكتبة الشاملة الذكية",
            colors: p.colors
        };
    }

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(themeObj, null, 2));
    const dlAnchor = document.createElement("a");
    dlAnchor.setAttribute("href", dataStr);
    dlAnchor.setAttribute("download", `shamela_theme_${themeObj.id || "preset"}.json`);
    document.body.appendChild(dlAnchor);
    dlAnchor.click();
    dlAnchor.remove();
    if (typeof showToast === "function") {
        showToast(`✓ تم تصدير وتحميل ملف الثيم: ${themeObj.name}`);
    }
}

// فتح نافذة اختيار ملف JSON للاستيراد
function triggerThemeJsonImport() {
    const fileInput = document.getElementById("themeJsonFileInput");
    if (fileInput) {
        fileInput.value = "";
        fileInput.click();
    }
}

// معالجة قراءة وتطبيق ملف الثيم المستورد
function handleThemeJsonImport(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const parsed = JSON.parse(e.target.result);
            if (!parsed.colors || typeof parsed.colors !== "object") {
                throw new Error("ملف JSON غير صالح أو لا يحتوي على كائن الألوان (colors)");
            }
            customImportedThemeData = parsed;
            localStorage.setItem("shamela_custom_theme_json", JSON.stringify(parsed));

            const opt = document.getElementById("customThemeOption");
            if (opt) {
                opt.style.display = "block";
                opt.innerText = `🎨 ${parsed.name || "ثيم مخصص"}`;
            }

            applyCustomThemeData(parsed);
            if (typeof showToast === "function") {
                showToast(`✓ تم استيراد وحفظ الثيم بنجاح: ${parsed.name || "ثيم مخصص"}`);
            }
        } catch (err) {
            console.error("Theme import error:", err);
            if (typeof showToast === "function") {
                showToast(`❌ خطأ في قراءة ملف الثيم: ${err.message}`);
            }
        }
    };
    reader.readAsText(file);
}

// تطبيق بيانات ثيم مخصص
function applyCustomThemeData(themeData) {
    activeThemePresetKey = "custom";
    const type = themeData.type === "light" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", "custom");
    document.documentElement.setAttribute("data-mode", type);
    if (document.body) {
        if (type === "light") {
            document.body.classList.add("theme-light");
            document.body.classList.remove("theme-dark");
        } else {
            document.body.classList.remove("theme-light");
            document.body.classList.add("theme-dark");
        }
        for (const k of Object.keys(THEME_PRESETS)) {
            document.body.classList.remove(`theme-${k}`);
        }
        document.body.classList.add("theme-custom");
    }

    applyThemeVariables(themeData.colors, type);

    const sel = document.getElementById("themePresetSelect");
    if (sel) sel.value = "custom";

    localStorage.setItem("shamela_theme_active", "custom");
    localStorage.setItem("shamela_theme", type);
    updateThemeIcon(type);
}

// إتاحة الدوال على كائن window العام لمنع مشاكل النطاق
window.onThemePresetChanged = onThemePresetChanged;
window.applyThemePreset = applyThemePreset;
window.toggleTheme = toggleTheme;
window.exportThemeToJson = exportThemeToJson;
window.triggerThemeJsonImport = triggerThemeJsonImport;
window.handleThemeJsonImport = handleThemeJsonImport;
window.initTheme = initTheme;

// تشغيل التهيئة فور تحميل ملف الجافاسكريبت مباشرة
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initTheme);
} else {
    initTheme();
}
