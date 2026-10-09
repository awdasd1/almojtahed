/**
 * MCP Scholarly Studio & Protocol Hub
 * إدارة واجهة محطة الـ MCP والتحقيق الشرعي التفاعلي المتقدم (8 أدوات متكاملة)
 */

let currentMcpTab = "text_search";

// تبديل التبويبات الداخلية في استوديو التحقيق
function switchMcpTab(tabName) {
    currentMcpTab = tabName;
    const tabs = ["text_search", "page_context", "book_details", "madhab", "narrator", "narrator_isnads", "takhrij", "quran", "root", "custom_tools"];
    
    tabs.forEach(t => {
        const btn = document.getElementById(`mcpTabBtn_${t}`);
        const panel = document.getElementById(`mcpPanel_${t}`);
        if (btn) btn.classList.toggle("active", t === tabName);
        if (panel) panel.style.display = (t === tabName) ? "block" : "none";
    });
}

// تهيئة واجهة الـ MCP عند الفتح
async function initMcpView() {
    try {
        const res = await fetch("/api/mcp/config");
        if (res.ok) {
            const data = await res.json();
            window.mcpConfigData = data;
            const codeBox = document.getElementById("mcpClaudeConfigBox");
            if (codeBox && data.claude_desktop) {
                codeBox.textContent = data.claude_desktop;
            }
        }
    } catch (e) {
        console.warn("Could not load MCP config", e);
    }
}

// نسخ إعدادات الربط
async function copyMcpConfig(type) {
    if (!window.mcpConfigData) {
        await initMcpView();
    }
    const data = window.mcpConfigData || {};
    let textToCopy = "";
    
    if (type === "claude") {
        textToCopy = data.claude_desktop || "";
    } else if (type === "cursor") {
        textToCopy = data.cursor || "";
    } else if (type === "path") {
        textToCopy = `${data.python_path} "${data.server_script}"`;
    }

    if (textToCopy) {
        navigator.clipboard.writeText(textToCopy).then(() => {
            showMcpToast("✓ تم نسخ إعدادات الـ MCP إلى الحافظة بنجاح!");
        }).catch(() => {
            prompt("انسخ الإعدادات يدوياً:", textToCopy);
        });
    }
}

function showMcpToast(msg) {
    const toast = document.getElementById("toast");
    if (toast) {
        toast.textContent = msg;
        toast.classList.add("show");
        setTimeout(() => toast.classList.remove("show"), 3200);
    } else {
        alert(msg);
    }
}

function logMcpInspector(toolName, args, result, durationMs) {
    const consoleBox = document.getElementById("mcpInspectorContent");
    const latencyEl = document.getElementById("mcpLatencyBadge");
    
    if (latencyEl) {
        latencyEl.textContent = `${durationMs} مللي ثانية ⚡`;
    }
    
    if (consoleBox) {
        const payload = {
            timestamp: new Date().toLocaleTimeString("ar-EG"),
            tool: toolName,
            duration_ms: durationMs,
            arguments: args,
            response: result
        };
        consoleBox.textContent = JSON.stringify(payload, null, 2);
    }
}

// -------------------------------------------------------------
// 1. أداة البحث الهجين في نصوص الشاملة (Qdrant + BM25)
// -------------------------------------------------------------
async function runMcpSearchText() {
    const queryInput = document.getElementById("mcpTextInput");
    const madhabSelect = document.getElementById("mcpTextMadhabSelect");
    const resultBox = document.getElementById("mcpTextResultBox");
    const runBtn = document.getElementById("btnRunTextSearchTool");

    const query = (queryInput ? queryInput.value : "").trim();
    if (!query) {
        showMcpToast("يرجى كتابة نص البحث أو المسألة المراد استخراجها.");
        if (queryInput) queryInput.focus();
        return;
    }

    const madhab = madhabSelect ? madhabSelect.value : "all";
    const limitInput = document.getElementById("mcpTextLimitInput");
    const limit = Math.min(Math.max(parseInt(limitInput ? limitInput.value : "20", 10) || 20, 1), 1000);

    if (runBtn) runBtn.disabled = true;
    if (resultBox) {
        resultBox.style.display = "block";
        resultBox.innerHTML = `
            <div class="mcp-loading-state">
                <span class="mcp-spinner"></span>
                <span>جاري البحث الهجين في ملايين الصفحات عبر Qdrant وتدقيق حتى ${limit} نتيجة...</span>
            </div>
        `;
    }

    try {
        const res = await fetch("/api/mcp/execute", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                tool: "search_shamela_text",
                arguments: { query, madhab, limit }
            })
        });
        const data = await res.json();
        const duration = data.duration_ms || 0;
        logMcpInspector("search_shamela_text", { query, madhab, limit }, data.result, duration);

        const r = data.result || {};
        const results = r.results || [];

        if (results.length === 0) {
            resultBox.innerHTML = `<div class="mcp-empty-box">لم يتم العثور على نصوص مطابقة لعبارة البحث. حاول تجريد أو تغيير الكلمات.</div>`;
            return;
        }

        let cardsHtml = results.map(item => `
            <div class="mcp-text-result-card">
                <div class="mcp-card-top-row">
                    <div class="mcp-citation-title">📖 ${escapeHtml(item.title || "")}</div>
                    <span class="mcp-part-page-badge">جـ ${item.part || "١"} / صـ ${item.page_num || "-"}</span>
                </div>
                <div class="mcp-author-meta">
                    <span>✍️ ${escapeHtml(item.author || "")}</span>
                    ${item.author_death_hijri ? `<span class="mcp-death-pill">(ت ${item.author_death_hijri}هـ)</span>` : ''}
                    <span class="mcp-cat-pill">📂 ${escapeHtml(item.category || "")}</span>
                </div>
                <div class="mcp-text-snippet-box">
                    ${item.snippet || escapeHtml(item.full_body || "")}
                </div>
                <div class="mcp-card-bottom-actions">
                    <span class="mcp-full-citation-text">${escapeHtml(item.citation || "")}</span>
                    <button type="button" class="btn-read-context-quick" onclick="quickLoadPageContext(${item.book_id}, ${item.page_num}, '${item.part || 1}')">
                        🔍 قراءة سياق الصفحة كاملة
                    </button>
                </div>
            </div>
        `).join("");

        resultBox.innerHTML = `
            <div class="mcp-result-header">
                <div>
                    <strong>🔍 نتائج البحث في نصوص الشاملة:</strong>
                    <span class="mcp-chip">${r.search_mode || "Hybrid"}</span>
                    <span class="mcp-chip">${results.length} نتائج موثقة</span>
                </div>
                <span class="mcp-duration-tag">⏱️ ${duration} مللي ثانية</span>
            </div>
            <div class="mcp-text-results-list">${cardsHtml}</div>
        `;
    } catch (e) {
        resultBox.innerHTML = `<div class="mcp-error-box">حدث خطأ: ${escapeHtml(e.message)}</div>`;
    } finally {
        if (runBtn) runBtn.disabled = false;
    }
}

// قراءة سريعة لسياق الصفحة من نتائج البحث
function quickLoadPageContext(bookId, pageNum, part) {
    switchMcpTab("page_context");
    const bInput = document.getElementById("mcpPageBookIdInput");
    const pInput = document.getElementById("mcpPageNumInput");
    const partInput = document.getElementById("mcpPagePartInput");

    if (bInput) bInput.value = bookId;
    if (pInput) pInput.value = pageNum || "";
    if (partInput) partInput.value = part || "";

    runMcpGetPageContext();
}

// -------------------------------------------------------------
// 2. أداة قراءة الصفحة وسياقها الموسع (الصفحة السابقة واللاحقة)
// -------------------------------------------------------------
async function runMcpGetPageContext() {
    const bookIdInput = document.getElementById("mcpPageBookIdInput");
    const pageNumInput = document.getElementById("mcpPageNumInput");
    const partInput = document.getElementById("mcpPagePartInput");
    const resultBox = document.getElementById("mcpPageResultBox");
    const runBtn = document.getElementById("btnRunPageContextTool");

    const bookId = parseInt(bookIdInput ? bookIdInput.value : "1") || 1;
    const pageNum = pageNumInput && pageNumInput.value ? parseInt(pageNumInput.value) : null;
    const part = partInput && partInput.value ? partInput.value.trim() : null;

    if (runBtn) runBtn.disabled = true;
    if (resultBox) {
        resultBox.style.display = "block";
        resultBox.innerHTML = `
            <div class="mcp-loading-state">
                <span class="mcp-spinner"></span>
                <span>جاري استدعاء نص الصفحة كاملة مع الصفحات المحيطة من الشاملة...</span>
            </div>
        `;
    }

    try {
        const res = await fetch("/api/mcp/execute", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                tool: "get_page_context",
                arguments: { book_id: bookId, page_num: pageNum, part: part, include_context: true }
            })
        });
        const data = await res.json();
        const duration = data.duration_ms || 0;
        logMcpInspector("get_page_context", { book_id: bookId, page_num: pageNum }, data.result, duration);

        const r = data.result || {};
        if (r.error) {
            resultBox.innerHTML = `<div class="mcp-error-box">⚠️ ${escapeHtml(r.error)}</div>`;
            return;
        }

        const targetP = r.target_page || {};
        const prevP = r.previous_page;
        const nextP = r.next_page;

        resultBox.innerHTML = `
            <div class="mcp-result-header">
                <div>
                    <h4 style="margin: 0; font-size: 1.05rem; color: var(--text-primary);">📖 ${escapeHtml(r.book_title || "")}</h4>
                    <span style="font-size: 0.8rem; color: var(--text-muted);">${escapeHtml(r.citation || "")}</span>
                </div>
                <span class="mcp-duration-tag">⏱️ ${duration} مللي ثانية</span>
            </div>

            <!-- بطاقة التوثيق المكتبي -->
            ${r.bibliographic_card ? `
                <div class="mcp-betaka-summary">
                    <strong>📋 البطاقة التوثيقية للكتاب:</strong>
                    <pre class="mcp-betaka-text">${escapeHtml(r.bibliographic_card)}</pre>
                </div>
            ` : ''}

            <!-- شبكة السياق الثلاثي: السابقة - المستهدفة - اللاحقة -->
            <div class="mcp-context-pages-wrap">
                ${prevP ? `
                    <div class="mcp-context-page prev-page">
                        <div class="mcp-context-page-header">⬅️ الصفحة السابقة (صـ ${prevP.page_num || "-"})</div>
                        <div class="mcp-context-page-body">${escapeHtml(prevP.body || "")}</div>
                    </div>
                ` : ''}

                <div class="mcp-context-page target-page highlight">
                    <div class="mcp-context-page-header active">
                        <span>⭐ الصفحة المحددة للتحقيق (جـ: ${targetP.part || "١"} / صـ: ${targetP.page_num || "-"})</span>
                        <span class="mcp-chip">موضع الشاهد</span>
                    </div>
                    <div class="mcp-context-page-body main-body">${escapeHtml(targetP.body || "")}</div>
                    ${targetP.footnotes ? `
                        <div class="mcp-page-footnotes">
                            <span class="mcp-fn-label">📌 الحواشي والتعليقات:</span>
                            <div>${escapeHtml(targetP.footnotes)}</div>
                        </div>
                    ` : ''}
                </div>

                ${nextP ? `
                    <div class="mcp-context-page next-page">
                        <div class="mcp-context-page-header">➡️ الصفحة اللاحقة (صـ ${nextP.page_num || "-"})</div>
                        <div class="mcp-context-page-body">${escapeHtml(nextP.body || "")}</div>
                    </div>
                ` : ''}
            </div>
        `;
    } catch (e) {
        resultBox.innerHTML = `<div class="mcp-error-box">حدث خطأ: ${escapeHtml(e.message)}</div>`;
    } finally {
        if (runBtn) runBtn.disabled = false;
    }
}

// -------------------------------------------------------------
// 3. أداة استعراض بطاقة وفهرس الكتاب (TOC)
// -------------------------------------------------------------
async function runMcpGetBookDetails() {
    const input = document.getElementById("mcpBookDetailInput");
    const resultBox = document.getElementById("mcpBookDetailResultBox");
    const runBtn = document.getElementById("btnRunBookDetailTool");

    const query = (input ? input.value : "").trim();
    if (!query) {
        showMcpToast("يرجى إدخال اسم الكتاب أو رقمه.");
        if (input) input.focus();
        return;
    }

    const tocLimitInput = document.getElementById("mcpBookTocLimitInput");
    const tocLimit = Math.min(Math.max(parseInt(tocLimitInput ? tocLimitInput.value : "100", 10) || 100, 1), 1000);

    if (runBtn) runBtn.disabled = true;
    if (resultBox) {
        resultBox.style.display = "block";
        resultBox.innerHTML = `
            <div class="mcp-loading-state">
                <span class="mcp-spinner"></span>
                <span>جاري استخراج بطاقة الكتاب وفهرس حتى ${tocLimit} باباً...</span>
            </div>
        `;
    }

    try {
        const res = await fetch("/api/mcp/execute", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                tool: "get_book_details",
                arguments: { book_id_or_title: query, include_toc: true, toc_limit: tocLimit }
            })
        });
        const data = await res.json();
        const duration = data.duration_ms || 0;
        logMcpInspector("get_book_details", { query, toc_limit: tocLimit }, data.result, duration);

        const r = data.result || {};
        if (r.error) {
            resultBox.innerHTML = `<div class="mcp-error-box">⚠️ ${escapeHtml(r.error)}</div>`;
            return;
        }

        const tocItems = r.table_of_contents || [];
        let tocHtml = "";
        if (tocItems.length > 0) {
            tocHtml = tocItems.map(item => `
                <div class="mcp-toc-row level-${item.level}">
                    <span class="mcp-toc-title">📑 ${escapeHtml(item.title || "")}</span>
                    <span class="mcp-toc-page">صفحة: ${item.page_id || "-"}</span>
                </div>
            `).join("");
        } else {
            tocHtml = `<div class="mcp-empty-text">لا يتوفر فهرس أبواب مفصل لهذا الكتاب في البيانات.</div>`;
        }

        resultBox.innerHTML = `
            <div class="mcp-result-header">
                <div>
                    <h3 style="margin: 0; font-size: 1.15rem; color: var(--text-primary);">📚 ${escapeHtml(r.title || "")}</h3>
                    <div style="font-size: 0.84rem; color: var(--text-muted); margin-top: 0.25rem;">
                        المؤلف: <strong>${escapeHtml(r.author && r.author.name || "")}</strong> 
                        ${r.author && r.author.death_hijri ? `(ت ${r.author.death_hijri}هـ)` : ''} 
                        | التصنيف: <span class="mcp-chip">${escapeHtml(r.category || "")}</span>
                        | عدد الصفحات: <strong>${r.total_pages || "-"}</strong>
                    </div>
                </div>
                <span class="mcp-duration-tag">⏱️ ${duration} مللي ثانية</span>
            </div>

            <!-- بطاقة الكتاب -->
            ${r.bibliographic_card ? `
                <div class="mcp-betaka-summary">
                    <strong>📋 بيانات النشر والتحقيق:</strong>
                    <pre class="mcp-betaka-text">${escapeHtml(r.bibliographic_card)}</pre>
                </div>
            ` : ''}

            <!-- نبذة عن المؤلف -->
            ${r.author && r.author.biography_summary ? `
                <div class="mcp-author-bio-card">
                    <strong>👤 نبذة عن المؤلف (من الأعلام للزركلي):</strong>
                    <p style="margin: 0.35rem 0 0 0; line-height: 1.5; font-size: 0.82rem; color: var(--text-secondary);">${escapeHtml(r.author.biography_summary)}</p>
                </div>
            ` : ''}

            <!-- فهرس الموضوعات -->
            <div class="mcp-toc-section">
                <div class="mcp-subheading">📑 فهرس أبواب وفصول الكتاب (${r.table_of_contents_count} باباً ظاهراً):</div>
                <div class="mcp-toc-list">${tocHtml}</div>
            </div>
        `;
    } catch (e) {
        resultBox.innerHTML = `<div class="mcp-error-box">حدث خطأ: ${escapeHtml(e.message)}</div>`;
    } finally {
        if (runBtn) runBtn.disabled = false;
    }
}

// -------------------------------------------------------------
// 4. تنفيذ أداة تحرير المذاهب
// -------------------------------------------------------------
async function runMcpTahrirMadhab() {
    const issueInput = document.getElementById("mcpMadhabIssueInput");
    const madhabSelect = document.getElementById("mcpMadhabSelect");
    const eraSelect = document.getElementById("mcpEraSelect");
    const resultBox = document.getElementById("mcpMadhabResultBox");
    const runBtn = document.getElementById("btnRunMadhabTool");

    const issue = (issueInput ? issueInput.value : "").trim();
    if (!issue) {
        showMcpToast("يرجى كتابة المسألة الفقهية أولاً.");
        if (issueInput) issueInput.focus();
        return;
    }

    const madhab = madhabSelect ? madhabSelect.value : "all";
    const era = eraSelect ? eraSelect.value : "late";
    const limitInput = document.getElementById("mcpMadhabLimitInput");
    const limit = Math.min(Math.max(parseInt(limitInput ? limitInput.value : "20", 10) || 20, 1), 1000);

    if (runBtn) runBtn.disabled = true;
    if (resultBox) {
        resultBox.style.display = "block";
        resultBox.innerHTML = `
            <div class="mcp-loading-state">
                <span class="mcp-spinner"></span>
                <span>جاري استدعاء أداة <strong>tahrir_madhab</strong> واستخراج حتى ${limit} مرجعاً معتمداً...</span>
            </div>
        `;
    }

    try {
        const res = await fetch("/api/mcp/execute", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                tool: "tahrir_madhab",
                arguments: { issue, madhab, era, limit }
            })
        });
        const data = await res.json();
        const duration = data.duration_ms || 0;
        logMcpInspector("tahrir_madhab", { issue, madhab, era, limit }, data.result, duration);

        const r = data.result || {};
        const books = r.recommended_references || [];

        let booksHtml = "";
        if (books.length > 0) {
            booksHtml = books.map(b => `
                <div class="mcp-book-card">
                    <div class="mcp-book-header">
                        <span class="mcp-book-title">📖 ${escapeHtml(b.title || "")}</span>
                        <span class="mcp-era-pill ${b.author_death_hijri > 900 ? 'late' : (b.author_death_hijri <= 450 ? 'early' : 'middle')}">
                            ${escapeHtml(b.era_label || "")} (${b.author_death_hijri ? b.author_death_hijri + 'هـ' : 'تراثي'})
                        </span>
                    </div>
                    <div class="mcp-book-meta">
                        <span class="mcp-cat-tag">📂 ${escapeHtml(b.category || "")}</span>
                        <span class="mcp-id-tag">معرف: #${b.book_id}</span>
                    </div>
                </div>
            `).join("");
        } else {
            booksHtml = `<p class="mcp-empty-text">لم يتم العثور على كتب مطابقة لهذه المعايير.</p>`;
        }

        resultBox.innerHTML = `
            <div class="mcp-result-header">
                <div class="mcp-result-title-badge">
                    <span>⚖️ تحرير مسألة: ${escapeHtml(issue)}</span>
                    <span class="mcp-chip">${escapeHtml(r.madhab || "")}</span>
                </div>
                <span class="mcp-duration-tag">⏱️ ${duration} مللي ثانية</span>
            </div>
            <div class="mcp-guideline-box">
                <span class="mcp-guide-icon">💡</span>
                <div>
                    <strong>قاعدة التحرير المذهبي:</strong>
                    <p>${escapeHtml(r.tahrir_guideline || "")}</p>
                </div>
            </div>
            <h4 class="mcp-subheading">📚 أهم المراجع الأساسية المعتمدة المستخرجة (${r.total_matched_books} كتاباً متاحاً):</h4>
            <div class="mcp-books-grid">${booksHtml}</div>
        `;
    } catch (e) {
        resultBox.innerHTML = `<div class="mcp-error-box">حدث خطأ: ${escapeHtml(e.message)}</div>`;
    } finally {
        if (runBtn) runBtn.disabled = false;
    }
}

// -------------------------------------------------------------
// 5. تنفيذ أداة موسوعة الرواة والجرح والتعديل
// -------------------------------------------------------------
async function runMcpSearchNarrators() {
    const input = document.getElementById("mcpNarratorInput");
    const resultBox = document.getElementById("mcpNarratorResultBox");
    const runBtn = document.getElementById("btnRunNarratorTool");

    const query = (input ? input.value : "").trim();
    if (!query) {
        showMcpToast("يرجى كتابة اسم الراوي أولاً.");
        if (input) input.focus();
        return;
    }

    const limitInput = document.getElementById("mcpNarratorLimitInput");
    const limit = Math.min(Math.max(parseInt(limitInput ? limitInput.value : "20", 10) || 20, 1), 1000);

    if (runBtn) runBtn.disabled = true;
    if (resultBox) {
        resultBox.style.display = "block";
        resultBox.innerHTML = `
            <div class="mcp-loading-state">
                <span class="mcp-spinner"></span>
                <span>جاري البحث في قاعدة الرواة لاستخراج حتى ${limit} ترجمة...</span>
            </div>
        `;
    }

    try {
        const res = await fetch("/api/mcp/execute", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                tool: "search_narrators",
                arguments: { query, limit }
            })
        });
        const data = await res.json();
        const duration = data.duration_ms || 0;
        logMcpInspector("search_narrators", { query, limit }, data.result, duration);

        const narrators = data.result || [];
        if (narrators.length === 0) {
            resultBox.innerHTML = `
                <div class="mcp-empty-box">
                    <span>🔍 لم يتم العثور على راوٍ مطابق لـ "<strong>${escapeHtml(query)}</strong>".</span>
                </div>
            `;
            return;
        }

        let narratorsHtml = narrators.map(n => {
            const criticismsHtml = (n.criticism_quotes || []).map(c => `
                <div class="mcp-criticism-row">
                    <strong class="mcp-scholar-name">${escapeHtml(c.scholar || "")}:</strong>
                    <span class="mcp-scholar-quote">«${escapeHtml(c.text || "")}»</span>
                </div>
            `).join("");

            return `
                <div class="mcp-narrator-card">
                    <div class="mcp-narrator-header">
                        <div>
                            <h4 class="mcp-narrator-title">👤 ${escapeHtml(n.short_name || "")}</h4>
                            <div class="mcp-narrator-sub">${escapeHtml(n.long_name || "")}</div>
                        </div>
                        <span class="mcp-id-tag">معرف الراوي: #${n.id}</span>
                    </div>

                    <div class="mcp-ranks-row">
                        ${n.ibn_hajar_rank ? `<span class="mcp-rank-badge rank-hajar">📌 ابن حجر: ${escapeHtml(n.ibn_hajar_rank)}</span>` : ''}
                        ${n.dhahabi_rank ? `<span class="mcp-rank-badge rank-dhahabi">⭐ الذهبي: ${escapeHtml(n.dhahabi_rank)}</span>` : ''}
                        ${n.generation ? `<span class="mcp-rank-badge rank-gen">⏳ الطبقة: ${escapeHtml(n.generation)}</span>` : ''}
                        ${n.residence ? `<span class="mcp-rank-badge rank-res">📍 البلد: ${escapeHtml(n.residence)}</span>` : ''}
                    </div>

                    ${criticismsHtml ? `
                        <div class="mcp-criticism-block">
                            <div class="mcp-criticism-heading">💬 أقوال أئمة الجرح والتعديل (${n.total_criticisms} قولاً):</div>
                            <div class="mcp-criticism-list">${criticismsHtml}</div>
                        </div>
                    ` : ''}
                </div>
            `;
        }).join("");

        resultBox.innerHTML = `
            <div class="mcp-result-header">
                <span class="mcp-result-count">✓ تم العثور على ${narrators.length} من الرواة المطابقين:</span>
                <span class="mcp-duration-tag">⏱️ ${duration} مللي ثانية</span>
            </div>
            <div class="mcp-narrators-list">${narratorsHtml}</div>
        `;
    } catch (e) {
        resultBox.innerHTML = `<div class="mcp-error-box">حدث خطأ: ${escapeHtml(e.message)}</div>`;
    } finally {
        if (runBtn) runBtn.disabled = false;
    }
}

// -------------------------------------------------------------
// 6. تنفيذ أداة تخريج الحديث وفحص السند
// -------------------------------------------------------------
async function runMcpTakhrijHadith() {
    const input = document.getElementById("mcpTakhrijInput");
    const resultBox = document.getElementById("mcpTakhrijResultBox");
    const runBtn = document.getElementById("btnRunTakhrijTool");

    const query = (input ? input.value : "").trim();
    if (!query) {
        showMcpToast("يرجى إدخال رقم أو طرف من الحديث.");
        if (input) input.focus();
        return;
    }

    const limitInput = document.getElementById("mcpTakhrijLimitInput");
    const limit = Math.min(Math.max(parseInt(limitInput ? limitInput.value : "20", 10) || 20, 1), 1000);

    if (runBtn) runBtn.disabled = true;
    if (resultBox) {
        resultBox.style.display = "block";
        resultBox.innerHTML = `
            <div class="mcp-loading-state">
                <span class="mcp-spinner"></span>
                <span>جاري استخراج حتى ${limit} إسناداً من 35,526 إسناداً مسجلاً...</span>
            </div>
        `;
    }

    try {
        const res = await fetch("/api/mcp/execute", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                tool: "takhrij_hadith",
                arguments: { query, limit }
            })
        });
        const data = await res.json();
        const duration = data.duration_ms || 0;
        logMcpInspector("takhrij_hadith", { query, limit }, data.result, duration);

        const chains = (data.result && data.result.isnad_chains) || [];
        if (chains.length === 0) {
            resultBox.innerHTML = `<div class="mcp-empty-box">لم يتم العثور على أسانيد مطابقة للرقم أو الكلمة المدخلة.</div>`;
            return;
        }

        let chainsHtml = chains.map((c, idx) => {
            const chainSteps = (c.narrators || []).map((narr, sIdx) => `
                <div class="mcp-isnad-node">
                    <span class="mcp-isnad-step">${sIdx + 1}</span>
                    <span class="mcp-isnad-name">${escapeHtml(narr.name)}</span>
                    <span class="mcp-isnad-id">#${narr.id}</span>
                </div>
            `).join('<span class="mcp-isnad-arrow">⬅️</span>');

            return `
                <div class="mcp-chain-card">
                    <div class="mcp-chain-header">
                        <div>
                            <strong>سند الحديث رقم #${c.hadith_key || idx + 1}</strong>
                            <span class="mcp-book-source">📚 ${escapeHtml(c.book_title || "")} (صفحة ${c.page_id || "-"})</span>
                        </div>
                        <span class="mcp-chip">طول السند: ${c.chain_length} رواة</span>
                    </div>
                    <div class="mcp-isnad-tree">${chainSteps}</div>
                </div>
            `;
        }).join("");

        resultBox.innerHTML = `
            <div class="mcp-result-header">
                <span>📜 الأسانيد والشواهد المستخرجة (${chains.length}):</span>
                <span class="mcp-duration-tag">⏱️ ${duration} مللي ثانية</span>
            </div>
            <div class="mcp-chains-list">${chainsHtml}</div>
        `;
    } catch (e) {
        resultBox.innerHTML = `<div class="mcp-error-box">حدث خطأ: ${escapeHtml(e.message)}</div>`;
    } finally {
        if (runBtn) runBtn.disabled = false;
    }
}

// -------------------------------------------------------------
// 7. تنفيذ أداة كشاف الآيات وتفاسيرها
// -------------------------------------------------------------
async function runMcpSearchQuran() {
    const input = document.getElementById("mcpQuranInput");
    const resultBox = document.getElementById("mcpQuranResultBox");
    const runBtn = document.getElementById("btnRunQuranTool");

    const query = (input ? input.value : "").trim();
    if (!query) {
        showMcpToast("يرجى كتابة جزء من الآية الكريمة.");
        if (input) input.focus();
        return;
    }

    const limitInput = document.getElementById("mcpQuranLimitInput");
    const limit = Math.min(Math.max(parseInt(limitInput ? limitInput.value : "20", 10) || 20, 1), 1000);

    if (runBtn) runBtn.disabled = true;
    if (resultBox) {
        resultBox.style.display = "block";
        resultBox.innerHTML = `
            <div class="mcp-loading-state">
                <span class="mcp-spinner"></span>
                <span>جاري البحث في المصحف الشريف واستخراج حتى ${limit} آية وموضع تفسير...</span>
            </div>
        `;
    }

    try {
        const res = await fetch("/api/mcp/execute", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                tool: "search_quran_and_tafsir",
                arguments: { query, limit }
            })
        });
        const data = await res.json();
        const duration = data.duration_ms || 0;
        logMcpInspector("search_quran_and_tafsir", { query, limit }, data.result, duration);

        const verses = (data.result && data.result.verses) || [];
        if (verses.length === 0) {
            resultBox.innerHTML = `<div class="mcp-empty-box">لم يتم العثور على آيات مطابقة لـ "<strong>${escapeHtml(query)}</strong>".</div>`;
            return;
        }

        let versesHtml = verses.map(v => {
            const tafsirSources = (v.tafsir_sources || []).map(ts => `
                <div class="mcp-tafsir-chip">
                    <span>📖 ${escapeHtml(ts.book_title || "")}</span>
                    <span class="mcp-page-pill">صـ ${ts.page_id}</span>
                </div>
            `).join("");

            return `
                <div class="mcp-verse-card">
                    <div class="mcp-verse-text">﴿ ${escapeHtml(v.text || "")} ﴾</div>
                    <div class="mcp-verse-meta">
                        <span class="mcp-id-tag">معرف الآية: #${v.verse_id}</span>
                        <span class="mcp-chip">كتب التفسير المتقاطعة: ${v.tafsir_sources_count}</span>
                    </div>
                    ${tafsirSources ? `
                        <div class="mcp-tafsir-sources-row">
                            <span class="mcp-sources-label">مواضع الآية في كتب التفسير:</span>
                            <div class="mcp-sources-flex">${tafsirSources}</div>
                        </div>
                    ` : ''}
                </div>
            `;
        }).join("");

        resultBox.innerHTML = `
            <div class="mcp-result-header">
                <span>📖 الآيات الكريمة المطابقة (${verses.length}):</span>
                <span class="mcp-duration-tag">⏱️ ${duration} مللي ثانية</span>
            </div>
            <div class="mcp-verses-list">${versesHtml}</div>
        `;
    } catch (e) {
        resultBox.innerHTML = `<div class="mcp-error-box">حدث خطأ: ${escapeHtml(e.message)}</div>`;
    } finally {
        if (runBtn) runBtn.disabled = false;
    }
}

// -------------------------------------------------------------
// 8. تنفيذ أداة معجم الجذور وغريب الألفاظ
// -------------------------------------------------------------
async function runMcpLookupRoot() {
    const input = document.getElementById("mcpRootInput");
    const resultBox = document.getElementById("mcpRootResultBox");
    const runBtn = document.getElementById("btnRunRootTool");

    const token = (input ? input.value : "").trim();
    if (!token) {
        showMcpToast("يرجى إدخال الكلمة المراد كشف جذرها.");
        if (input) input.focus();
        return;
    }

    if (runBtn) runBtn.disabled = true;
    if (resultBox) {
        resultBox.style.display = "block";
        resultBox.innerHTML = `
            <div class="mcp-loading-state">
                <span class="mcp-spinner"></span>
                <span>جاري البحث في معجم الجذور (1.95 مليون لفظ)...</span>
            </div>
        `;
    }

    try {
        const res = await fetch("/api/mcp/execute", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                tool: "lookup_word_root",
                arguments: { token }
            })
        });
        const data = await res.json();
        const duration = data.duration_ms || 0;
        logMcpInspector("lookup_word_root", { token }, data.result, duration);

        const r = data.result || {};
        if (!r.found) {
            resultBox.innerHTML = `
                <div class="mcp-empty-box">
                    <span>⚠️ ${escapeHtml(r.lexicon_advice || "لم يتم العثور على جذر دقيق للكلمة.")}</span>
                </div>
            `;
            return;
        }

        const rootsHtml = (r.roots || []).map(rt => `
            <span class="mcp-root-badge">${escapeHtml(rt)}</span>
        `).join("");

        resultBox.innerHTML = `
            <div class="mcp-root-card">
                <div class="mcp-root-header">
                    <div>
                        <span class="mcp-token-label">اللفظ المستعلم عنه:</span>
                        <strong class="mcp-token-word">«${escapeHtml(r.token)}»</strong>
                    </div>
                    <span class="mcp-duration-tag">⏱️ ${duration} مللي ثانية</span>
                </div>
                <div class="mcp-roots-container">
                    <span class="mcp-roots-label">الجذور المعجمية المكتشفة:</span>
                    <div class="mcp-roots-flex">${rootsHtml}</div>
                </div>
                <div class="mcp-lexicon-advice">
                    <span>📚 ${escapeHtml(r.lexicon_advice || "")}</span>
                </div>
            </div>
        `;
    } catch (e) {
        resultBox.innerHTML = `<div class="mcp-error-box">حدث خطأ: ${escapeHtml(e.message)}</div>`;
    } finally {
        if (runBtn) runBtn.disabled = false;
    }
}

// -------------------------------------------------------------
// 9. أداة استخراج أسانيد الراوي الجماعية (100 سند متصل مختلف)
// -------------------------------------------------------------
async function runMcpGetNarratorIsnads() {
    const narratorInput = document.getElementById("mcpIsnadNarratorInput");
    const limitInput = document.getElementById("mcpIsnadLimitInput");
    const bookInput = document.getElementById("mcpIsnadBookInput");
    const resultBox = document.getElementById("mcpNarratorIsnadsResultBox");
    const runBtn = document.getElementById("btnRunNarratorIsnadsTool");

    const narrator = (narratorInput ? narratorInput.value : "").trim();
    const limit = parseInt(limitInput ? limitInput.value : "100", 10) || 100;
    const bookTitle = (bookInput ? bookInput.value : "").trim();

    if (!narrator) {
        showMcpToast("يرجى كتابة اسم أو شهرة الراوي أولاً");
        return;
    }

    if (runBtn) runBtn.disabled = true;
    if (resultBox) {
        resultBox.style.display = "block";
        resultBox.innerHTML = `
            <div class="mcp-loading-spinner">
                <span class="mcp-spinner-icon">⏳</span>
                <span>جاري استخراج وتحليل حتى ${limit} سند متصل مختلف للراوي «${escapeHtml(narrator)}» من أمهات كتب السنة...</span>
            </div>
        `;
    }

    try {
        const res = await fetch("/api/mcp/execute", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                tool: "get_narrator_isnads",
                arguments: {
                    narrator: narrator,
                    limit: limit,
                    book_title: bookTitle || null,
                    unique_chains: true
                }
            })
        });
        const data = await res.json();
        const duration = data.duration_ms || 0;
        logMcpInspector("get_narrator_isnads", { narrator, limit, book_title: bookTitle }, data.result, duration);

        const r = data.result || {};
        if (r.error) {
            resultBox.innerHTML = `
                <div class="mcp-error-box">
                    <span>⚠️ ${escapeHtml(r.error)}</span>
                </div>
            `;
            return;
        }

        const isnads = r.isnads || [];
        if (isnads.length === 0) {
            resultBox.innerHTML = `
                <div class="mcp-empty-box">
                    <span>لم يتم العثور على أسانيد متصلة للراوي «${escapeHtml(narrator)}» وفق المعايير المدخلة.</span>
                </div>
            `;
            return;
        }

        const cardsHtml = isnads.map(item => {
            const chainHtml = (item.narrators || []).map(n => {
                const isTarget = n.id === r.narrator_id;
                return `<span class="mcp-narrator-pill ${isTarget ? 'target-narrator' : ''}">${escapeHtml(n.name)}</span>`;
            }).join(` <span class="mcp-chain-arrow">⬅️</span> `);

            return `
                <div class="mcp-isnad-card">
                    <div class="mcp-isnad-header">
                        <div class="mcp-isnad-title-wrap">
                            <span class="mcp-isnad-badge">سند #${item.index}</span>
                            <strong class="mcp-isnad-citation">${escapeHtml(item.citation)}</strong>
                            <span class="mcp-isnad-pos">${escapeHtml(item.narrator_position)}</span>
                            <span class="mcp-isnad-len">عدد رجال السند: ${item.chain_length}</span>
                        </div>
                        <div class="mcp-isnad-actions">
                            <button type="button" class="btn-mcp-quick-context" onclick="quickLoadPageContext(${item.book_id}, ${item.page_id})">
                                📖 عرض الصفحة وسياقها
                            </button>
                        </div>
                    </div>
                    <div class="mcp-isnad-chain-flow">
                        ${chainHtml}
                    </div>
                </div>
            `;
        }).join("");

        resultBox.innerHTML = `
            <div class="mcp-result-meta-bar">
                <div class="mcp-meta-col">
                    <span class="mcp-meta-label">الراوي المستعلم عنه:</span>
                    <strong class="mcp-meta-val">«${escapeHtml(r.narrator_name)}» (معرف #${r.narrator_id})</strong>
                </div>
                <div class="mcp-meta-col">
                    <span class="mcp-meta-label">إجمالي الأسانيد بالمكتبة:</span>
                    <strong class="mcp-meta-val">${r.total_isnads_in_corpus} سنداً</strong>
                </div>
                <div class="mcp-meta-col">
                    <span class="mcp-meta-label">الأسانيد المستخرجة المتمايزة:</span>
                    <strong class="mcp-meta-val highlight">${r.returned_count} سند متصل مختلف</strong>
                </div>
                <div class="mcp-meta-col">
                    <span class="mcp-meta-label">زمن التنفيذ الخارق:</span>
                    <span class="mcp-duration-tag">⚡ ${duration} مللي ثانية</span>
                </div>
            </div>
            <div class="mcp-isnads-list" style="margin-top: 15px; display: flex; flex-direction: column; gap: 12px;">
                ${cardsHtml}
            </div>
        `;
    } catch (e) {
        resultBox.innerHTML = `<div class="mcp-error-box">حدث خطأ: ${escapeHtml(e.message)}</div>`;
    } finally {
        if (runBtn) runBtn.disabled = false;
    }
}

function escapeHtml(str) {
    if (!str) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

window.switchMcpTab = switchMcpTab;
window.initMcpView = initMcpView;
window.copyMcpConfig = copyMcpConfig;
window.runMcpSearchText = runMcpSearchText;
window.runMcpGetPageContext = runMcpGetPageContext;
window.quickLoadPageContext = quickLoadPageContext;
window.runMcpGetBookDetails = runMcpGetBookDetails;
window.runMcpTahrirMadhab = runMcpTahrirMadhab;
window.runMcpSearchNarrators = runMcpSearchNarrators;
window.runMcpGetNarratorIsnads = runMcpGetNarratorIsnads;
window.runMcpTakhrijHadith = runMcpTakhrijHadith;
window.runMcpSearchQuran = runMcpSearchQuran;
window.runMcpLookupRoot = runMcpLookupRoot;
