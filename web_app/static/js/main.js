// main.js — منطق التفاعل لمحرك بحث المكتبة الشاملة المتقدم
let currentMode = "hybrid";
let currentReaderPage = null;

// حالة تحديد الكتب والأقسام
let selectedBookTitles = new Set();
let allLoadedBooks = [];
let currentCategoryBooks = [];
let showSelectedOnlyState = false;
let categoriesList = [];
let allBooksCache = [];

document.addEventListener("DOMContentLoaded", () => {
    initTheme();
    initDynamicEndpoints();
    loadStats();
    loadCategories();
    setupEventListeners();
    loadAiSettings();
    initAiEventListeners();
    initBookCollections();
    initAssistants();
    initCustomMcpTools();
    checkHfTokenStatus();
});

// التعرف الديناميكي على روابط الخدمات (Claude Web، Qdrant، السيرفرات السحابية والمحلية)
async function initDynamicEndpoints() {
    try {
        const btnClaude = document.getElementById("btnClaudeWebExt");
        const btnQdrant = document.getElementById("btnQdrantDashboardExt");
        
        const hostName = window.location.hostname || "localhost";
        const proto = window.location.protocol || "http:";
        
        if (hostName !== "localhost" && hostName !== "127.0.0.1") {
            if (btnClaude) btnClaude.href = `${proto}//${hostName}:5173`;
            if (btnQdrant) btnQdrant.href = `http://${hostName}:6333/dashboard`;
        }
        
        const res = await fetch("/api/system/endpoints");
        if (res.ok) {
            const data = await res.json();
            if (data.claude_web_url && btnClaude) {
                btnClaude.href = data.claude_web_url;
            }
            if (data.qdrant_dashboard_url && btnQdrant) {
                btnQdrant.href = data.qdrant_dashboard_url;
            }
        }
    } catch (e) {
        console.warn("Dynamic endpoints init warning:", e);
    }
}

// فحص وإدارة توكن Hugging Face لنموذج بدر 768
async function checkHfTokenStatus() {
    const badges = [document.getElementById("hfTokenBadge"), document.getElementById("hfTokenBadgeProv")].filter(Boolean);
    const feedbacks = [document.getElementById("hfTokenFeedback"), document.getElementById("hfTokenFeedbackProv")].filter(Boolean);
    if (!badges.length) return;
    try {
        const res = await fetch("/api/settings/hf-token");
        if (res.ok) {
            const data = await res.json();
            if (data.model_loaded) {
                badges.forEach(b => {
                    b.style.background = "rgba(16, 185, 129, 0.15)";
                    b.style.color = "#10b981";
                    b.innerText = "✅ متصل ونشط (768)";
                });
                feedbacks.forEach(f => f.innerText = `النموذج جاهز في الذاكرة (التوكن: ${data.token_prefix || "متوفر"}).`);
            } else if (data.has_token) {
                badges.forEach(b => {
                    b.style.background = "rgba(245, 158, 11, 0.15)";
                    b.style.color = "#f59e0b";
                    b.innerText = "⏳ قيد التحميل...";
                });
                feedbacks.forEach(f => f.innerText = data.error || "التوكن محفوظ، جارٍ الاتصال بـ Hugging Face...");
            } else {
                badges.forEach(b => {
                    b.style.background = "rgba(239, 68, 68, 0.15)";
                    b.style.color = "#ef4444";
                    b.innerText = "⚠️ يتطلب توكن";
                });
                feedbacks.forEach(f => f.innerText = "أدخل توكن Hugging Face المصرح له للوصول لنموذج بدر 768 ثم اضغط حفظ وتفعيل.");
            }
        }
    } catch (e) {
        console.warn("HF token check error:", e);
    }
}

async function submitHfToken(source) {
    let input = null;
    if (source === 'prov') input = document.getElementById("inputHfTokenProv");
    else if (source === 'inline') input = document.getElementById("inputHfTokenInline");
    else input = document.getElementById("inputHfToken");

    if (!input || !input.value.trim()) {
        input = [document.getElementById("inputHfTokenProv"), document.getElementById("inputHfToken"), document.getElementById("inputHfTokenInline")].find(el => el && el.value.trim());
    }

    if (!input || !input.value.trim()) {
        if (typeof showToast === "function") showToast("يرجى إدخال التوكن أولاً (يبدأ بـ hf_)", "error");
        else alert("يرجى إدخال التوكن أولاً (يبدأ بـ hf_)");
        return;
    }
    const tokenVal = input.value.trim();
    const btns = [document.getElementById("btnSaveHfToken"), document.getElementById("btnSaveHfTokenProv")].filter(Boolean);
    const badges = [document.getElementById("hfTokenBadge"), document.getElementById("hfTokenBadgeProv")].filter(Boolean);
    const feedbacks = [document.getElementById("hfTokenFeedback"), document.getElementById("hfTokenFeedbackProv")].filter(Boolean);

    btns.forEach(b => { b.disabled = true; b.innerText = "⏳ جارٍ التحميل..."; });
    feedbacks.forEach(f => f.innerText = "جارٍ إرسال التوكن والاتصال بـ Hugging Face لتحميل أوزان بدر 768...");

    try {
        const res = await fetch("/api/settings/hf-token", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token: tokenVal })
        });
        const data = await res.json();
        if (res.ok && data.status === "success") {
            if (typeof showToast === "function") showToast("✅ تم تفعيل وتحميل نموذج بدر 768 بنجاح!", "success");
            [document.getElementById("inputHfToken"), document.getElementById("inputHfTokenProv")].forEach(inp => { if (inp) inp.value = ""; });
            checkHfTokenStatus();
            if (source === 'inline') {
                const searchBtn = document.getElementById("searchBtn");
                if (searchBtn) searchBtn.click();
            }
        } else {
            const errDetail = data.detail || "فشل التحميل";
            if (typeof showToast === "function") showToast(errDetail, "error");
            badges.forEach(b => {
                b.style.background = "rgba(239, 68, 68, 0.15)";
                b.style.color = "#ef4444";
                b.innerText = "❌ خطأ مصادقة";
            });
            feedbacks.forEach(f => f.innerText = errDetail);
        }
    } catch (e) {
        if (typeof showToast === "function") showToast(`خطأ في الاتصال: ${e.message}`, "error");
    } finally {
        btns.forEach(b => { b.disabled = false; b.innerText = "حفظ وتفعيل"; });
    }
}

// إدارة الثيمات تتم عبر theme_manager.js

// تحميل الإحصائيات العامة
async function loadStats() {
    try {
        const res = await fetch("/api/stats");
        const data = await res.json();
        
        document.getElementById("statPoints").innerText = Number(data.indexed_points || 7578616).toLocaleString('ar-EG');
        document.getElementById("statBooks").innerText = Number(data.total_books || 8589).toLocaleString('ar-EG');
        document.getElementById("statCats").innerText = Number(data.total_categories || 41).toLocaleString('ar-EG');
        
        const devEl = document.getElementById("statDevice");
        if (devEl) {
            devEl.innerText = data.device ? `Apple ${data.device.toUpperCase()}` : "Apple Silicon";
        }
    } catch (e) {
        console.error("Error loading stats:", e);
    }
}

// تبديل وتحديث فهرس التضمين المعتمد
function onCollectionChanged() {
    const coll = document.getElementById("collectionSelect")?.value || "badr_all_tsh_corpus";
    const aiColl = document.getElementById("aiRagCollectionSelect");
    if (aiColl && aiColl.value !== coll) aiColl.value = coll;
    const statPts = document.getElementById("statPoints");
    if (statPts) {
        if (coll === "badr_all_tsh_corpus") {
            statPts.innerText = Number(7577481).toLocaleString('ar-EG');
        } else if (coll === "badr_corpus") {
            statPts.innerText = Number(7578616).toLocaleString('ar-EG');
        } else if (coll === "badr_tch_corpus") {
            statPts.innerText = Number(7577481).toLocaleString('ar-EG');
        } else {
            statPts.innerText = Number(5145523).toLocaleString('ar-EG');
        }
    }
    const modeSelector = document.querySelector(".mode-selector");
    if (modeSelector) {
        if (coll === "badr_all_tsh_corpus") {
            modeSelector.title = "لقطة بدر الهجينة المطورة بالتشكيل (Badr Dense 768d + BM25 Sparse - دمج RRF)";
        } else if (coll === "badr_corpus") {
            modeSelector.title = "لقطة بدر المشكولة تعتمد نموذج التضمين الفقهي الكثيف (Badr Dense Cosine 768d)";
        } else if (coll === "badr_tch_corpus") {
            modeSelector.title = "لقطة بدر بدون تشكيل تعتمد نموذج التضمين الكثيف (Badr Unvoweled Cosine 768d)";
        } else {
            modeSelector.title = "شاملة BGE-M3 تدعم البحث الهجين والعصبي واللفظي";
        }
    }
}

// تحميل قائمة التصنيفات في القائمة المنسدلة
async function loadCategories() {
    try {
        const res = await fetch("/api/categories");
        categoriesList = await res.json();
        
        const mainSelect = document.getElementById("categorySelect");
        const modalSelect = document.getElementById("modalCategorySelect");
        
        mainSelect.innerHTML = '<option value="">كل التصنيفات (جميع الأقسام)</option>';
        modalSelect.innerHTML = '<option value="">كل التصنيفات (جميع الأقسام)</option>';
        
        categoriesList.forEach(c => {
            if (c.category_id > 0) {
                const optMain = document.createElement("option");
                optMain.value = c.category_id;
                optMain.textContent = `${c.category_name_ar} (${c.book_count} كتاب)`;
                mainSelect.appendChild(optMain);

                const optModal = document.createElement("option");
                optModal.value = c.category_id;
                optModal.textContent = `${c.category_name_ar} (${c.book_count} كتاب)`;
                modalSelect.appendChild(optModal);
            }
        });

        // مزامنة قائمة التصنيفات في لوحة الذكاء الاصطناعي
        const aiCatSelect = document.getElementById("aiCategorySelect");
        if (aiCatSelect) {
            const savedCat = aiCatSelect.getAttribute("data-saved-val") || "";
            aiCatSelect.innerHTML = '<option value="">كل التصنيفات (جميع الأقسام)</option>';
            categoriesList.forEach(c => {
                if (c.category_id > 0) {
                    const optAi = document.createElement("option");
                    optAi.value = c.category_id;
                    optAi.textContent = `${c.category_name_ar} (${c.book_count} كتاب)`;
                    if (savedCat && String(savedCat) === String(c.category_id)) {
                        optAi.selected = true;
                    }
                    aiCatSelect.appendChild(optAi);
                }
            });
        }

        // مزامنة قائمة التصنيفات في قسم MCP
        const aiMcpCatSelect = document.getElementById("aiMcpCategorySelect");
        if (aiMcpCatSelect) {
            const savedMcpCat = aiMcpCatSelect.getAttribute("data-saved-val") || "";
            aiMcpCatSelect.innerHTML = '<option value="">كل التصنيفات (جميع أقسام الشاملة)</option>';
            categoriesList.forEach(c => {
                if (c.category_id > 0) {
                    const optAi = document.createElement("option");
                    optAi.value = c.category_id;
                    optAi.textContent = `${c.category_name_ar} (${c.book_count} كتاب)`;
                    if (savedMcpCat && String(savedMcpCat) === String(c.category_id)) {
                        optAi.selected = true;
                    }
                    aiMcpCatSelect.appendChild(optAi);
                }
            });
        }

        // مزامنة قائمة التصنيفات في نافذة إنشاء أداة MCP المخصصة
        const customToolCatSelect = document.getElementById("customToolCategorySelect");
        if (customToolCatSelect) {
            customToolCatSelect.innerHTML = '<option value="">كل التصنيفات (جميع أقسام الشاملة)</option>';
            categoriesList.forEach(c => {
                if (c.category_id > 0) {
                    const optCt = document.createElement("option");
                    optCt.value = c.category_id;
                    optCt.textContent = `${c.category_name_ar} (${c.book_count} كتاب)`;
                    customToolCatSelect.appendChild(optCt);
                }
            });
        }
    } catch (e) {
        console.error("Error loading categories:", e);
    }
}

// إعداد أحداث الواجهة
function setupEventListeners() {
    // تبديل أوضاع البحث (هجين، دلالي، لفظي)
    const chips = document.querySelectorAll(".mode-chip");
    chips.forEach(chip => {
        chip.addEventListener("click", () => {
            chips.forEach(c => c.classList.remove("active"));
            chip.classList.add("active");
            currentMode = chip.getAttribute("data-mode");
        });
    });

    // تنفيذ البحث
    document.getElementById("searchForm").addEventListener("submit", (e) => {
        e.preventDefault();
        performSearch();
    });

    // مقترحات البحث السريعة
    document.querySelectorAll(".suggestion-pill").forEach(pill => {
        pill.addEventListener("click", () => {
            const query = pill.getAttribute("data-query") || pill.innerText;
            document.getElementById("searchInput").value = query;
            performSearch();
        });
    });
}

// عند تغيير القسم من الصفحة الرئيسية
function onCategoryChanged() {
    const mainSelect = document.getElementById("categorySelect");
    const catId = mainSelect.value;
    
    // إذا كان هناك كتب محددة يدوياً، نوضح للمستخدم أو نحدث الشارة
    if (selectedBookTitles.size > 0) {
        updateScopeIndicator();
        return;
    }

    if (catId) {
        const cat = categoriesList.find(c => String(c.category_id) === String(catId));
        const catName = cat ? cat.category_name_ar : "القسم المحدد";
        const catCount = cat ? cat.book_count : "";
        document.getElementById("scopeText").innerHTML = `نطاق البحث: قسم <strong>[${escapeHtml(catName)}]</strong> (${catCount} كتاباً)`;
        document.getElementById("activeScopeBadge").querySelector(".scope-icon").innerText = "📁";
    } else {
        document.getElementById("scopeText").innerHTML = `نطاق البحث: جميع كتب المكتبة الشاملة (٨,٥٨٩ كتاباً)`;
        document.getElementById("activeScopeBadge").querySelector(".scope-icon").innerText = "🌐";
    }
}

// تحديث شارة نطاق البحث العامة
function updateScopeIndicator() {
    const badge = document.getElementById("selectedCountBadge");
    const scopeText = document.getElementById("scopeText");
    const iconEl = document.getElementById("activeScopeBadge").querySelector(".scope-icon");

    if (selectedBookTitles.size > 0) {
        badge.style.display = "inline-block";
        badge.innerText = selectedBookTitles.size;
        iconEl.innerText = "☑️";
        scopeText.innerHTML = `نطاق البحث: <strong>${selectedBookTitles.size}</strong> كتب مخصصة محددة بعلامة صح (✓)`;
    } else {
        badge.style.display = "none";
        onCategoryChanged();
    }
    updateAiScopeHint();
}

// --- إدارة نافذة اختيار الكتب (Book Selector Modal) ---

async function openBookSelectorModal() {
    const modal = document.getElementById("bookSelectorModal");
    const mainCatSelect = document.getElementById("categorySelect");
    const modalCatSelect = document.getElementById("modalCategorySelect");

    // مزامنة التصنيف الحالي
    modalCatSelect.value = mainCatSelect.value;
    document.getElementById("bookFilterInput").value = "";
    showSelectedOnlyState = false;
    document.getElementById("btnToggleSelectedOnly").classList.remove("active");

    modal.classList.add("active");
    updateSelectedChipsUI();
    await loadBooksForModal(modalCatSelect.value);
}

function closeBookSelectorModal() {
    document.getElementById("bookSelectorModal").classList.remove("active");
}

async function onModalCategoryChanged() {
    const catId = document.getElementById("modalCategorySelect").value;
    document.getElementById("bookFilterInput").value = "";
    showSelectedOnlyState = false;
    document.getElementById("btnToggleSelectedOnly").classList.remove("active");
    await loadBooksForModal(catId);
}

async function loadBooksForModal(categoryId) {
    const loadingEl = document.getElementById("bookListLoading");
    const container = document.getElementById("bookListContainer");
    
    loadingEl.style.display = "block";
    container.innerHTML = "";

    try {
        let url = `/api/books?limit=3000`;
        if (categoryId) {
            url += `&category_id=${categoryId}`;
        }
        
        const res = await fetch(url);
        const data = await res.json();
        loadingEl.style.display = "none";
        
        if (!res.ok || !Array.isArray(data)) {
            const errorMsg = data && (data.detail || data.message || data.error) ? (data.detail || data.message || data.error) : "قاعدة بيانات الفهرس (shamela_index.db) غير متوفرة بعد.";
            container.innerHTML = `<div style="color: #ef4444; padding: 2rem; text-align: center;">⚠️ ${escapeHtml(String(errorMsg))}</div>`;
            return;
        }
        
        currentCategoryBooks = data;
        renderBookList(currentCategoryBooks);
    } catch (e) {
        loadingEl.style.display = "none";
        container.innerHTML = `<div style="color: #ef4444; padding: 2rem; text-align: center;">تعذر تحميل قائمة الكتب: ${escapeHtml(e.message)}</div>`;
    }
}

function renderBookList(books) {
    const container = document.getElementById("bookListContainer");
    container.innerHTML = "";

    if (!Array.isArray(books)) {
        container.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 3rem; color: var(--text-dim);">لا توجد بيانات كتب صالحة للعرض.</div>`;
        return;
    }

    let filtered = books;
    const query = document.getElementById("bookFilterInput").value.trim().toLowerCase();

    if (query) {
        filtered = filtered.filter(b => 
            (b.title_ar && b.title_ar.toLowerCase().includes(query)) ||
            (b.author_name && b.author_name.toLowerCase().includes(query))
        );
    }

    if (showSelectedOnlyState) {
        filtered = filtered.filter(b => selectedBookTitles.has(b.title_ar));
    }

    if (filtered.length === 0) {
        container.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 3rem; color: var(--text-dim);">لا توجد كتب مطابقة لخيارات التصفية الحالية.</div>`;
        return;
    }

    const fragment = document.createDocumentFragment();

    filtered.forEach(book => {
        const isChecked = selectedBookTitles.has(book.title_ar);
        const card = document.createElement("div");
        card.className = `book-card-item ${isChecked ? "selected" : ""}`;
        card.id = `book-item-${book.book_id}`;

        const volText = book.volume_count ? `${book.volume_count} أجزاء` : "";
        const authorText = book.author_name ? `${book.author_name} ${book.death_hijri ? `(ت: ${book.death_hijri}هـ)` : ""}` : "مؤلف مجهول";

        card.innerHTML = `
            <input 
                type="checkbox" 
                class="book-card-checkbox" 
                id="cb-${book.book_id}" 
                ${isChecked ? "checked" : ""}
            >
            <div class="book-card-details">
                <div class="book-card-title" title="${escapeHtml(book.title_ar)}">${escapeHtml(book.title_ar)}</div>
                <div class="book-card-author" title="${escapeHtml(authorText)}">✍️ ${escapeHtml(authorText)}</div>
                <div class="book-card-meta">
                    <span class="badge badge-category" style="font-size: 0.68rem; padding: 0.1rem 0.4rem;">${escapeHtml(book.category_name_ar || "")}</span>
                    ${volText ? `<span class="badge badge-location" style="font-size: 0.68rem; padding: 0.1rem 0.4rem;">${volText}</span>` : ""}
                </div>
            </div>
        `;

        // النقر على البطاقة بالكامل لتبديل التحديد
        card.addEventListener("click", (e) => {
            if (e.target.type !== "checkbox") {
                const cb = card.querySelector(".book-card-checkbox");
                cb.checked = !cb.checked;
            }
            toggleBookSelection(book.title_ar, card.querySelector(".book-card-checkbox").checked);
        });

        // النقر المباشر على الشيك بوكس
        const cbEl = card.querySelector(".book-card-checkbox");
        cbEl.addEventListener("change", (e) => {
            toggleBookSelection(book.title_ar, e.target.checked);
        });

        fragment.appendChild(card);
    });

    container.appendChild(fragment);
    updateSelectionSummaryUI();
}

// تبديل اختيار كتاب مفرد
function toggleBookSelection(titleAr, isSelected) {
    if (isSelected) {
        selectedBookTitles.add(titleAr);
    } else {
        selectedBookTitles.delete(titleAr);
    }

    // تحديث مظهر البطاقة إذا كانت معروضة
    document.querySelectorAll(".book-card-item").forEach(card => {
        const titleEl = card.querySelector(".book-card-title");
        if (titleEl && titleEl.textContent === titleAr) {
            const cb = card.querySelector(".book-card-checkbox");
            cb.checked = isSelected;
            if (isSelected) {
                card.classList.add("selected");
            } else {
                card.classList.remove("selected");
            }
        }
    });

    updateSelectedChipsUI();
    updateSelectionSummaryUI();
}

// تصفية حية أثناء الكتابة
function filterBooksList() {
    renderBookList(currentCategoryBooks);
}

// تحديد جميع الكتب المعروضة حالياً في القائمة
function selectAllFilteredBooks() {
    const checkboxes = document.querySelectorAll(".book-card-checkbox");
    checkboxes.forEach(cb => {
        if (!cb.checked) {
            cb.checked = true;
            const card = cb.closest(".book-card-item");
            if (card) {
                card.classList.add("selected");
                const title = card.querySelector(".book-card-title").textContent;
                selectedBookTitles.add(title);
            }
        }
    });

    updateSelectedChipsUI();
    updateSelectionSummaryUI();
    showToast(`✓ تم تحديد ${checkboxes.length} كتاباً`);
}

// إلغاء تحديد كل الكتب
function deselectAllBooks() {
    selectedBookTitles.clear();
    document.querySelectorAll(".book-card-item").forEach(c => {
        c.classList.remove("selected");
        const cb = c.querySelector(".book-card-checkbox");
        if (cb) cb.checked = false;
    });

    updateSelectedChipsUI();
    updateSelectionSummaryUI();
    showToast("تم إلغاء تحديد جميع الكتب");
}

// تبديل عرض الكتب المحددة فقط
function toggleShowSelectedOnly() {
    showSelectedOnlyState = !showSelectedOnlyState;
    const btn = document.getElementById("btnToggleSelectedOnly");
    if (showSelectedOnlyState) {
        btn.classList.add("active");
    } else {
        btn.classList.remove("active");
    }
    renderBookList(currentCategoryBooks);
}

// تحديث شارات الكتب المختارة أسفل التولبار
function updateSelectedChipsUI() {
    const container = document.getElementById("selectedChipsContainer");
    const list = document.getElementById("selectedChipsList");
    const countBadge = document.getElementById("selectedBooksCount");

    countBadge.innerText = selectedBookTitles.size;

    if (selectedBookTitles.size === 0) {
        container.style.display = "none";
        list.innerHTML = "";
        return;
    }

    container.style.display = "block";
    list.innerHTML = "";

    selectedBookTitles.forEach(title => {
        const chip = document.createElement("div");
        chip.className = "selected-chip";
        chip.innerHTML = `
            <span>📖 ${escapeHtml(title)}</span>
            <span class="selected-chip-remove" onclick="removeBookChip('${escapeHtml(title)}')">✕</span>
        `;
        list.appendChild(chip);
    });
}

function removeBookChip(titleAr) {
    toggleBookSelection(titleAr, false);
}

// تحديث نص ملخص الاختيار في الفوتر
function updateSelectionSummaryUI() {
    const summary = document.getElementById("selectionSummary");
    summary.innerHTML = `تم تحديد <strong>${selectedBookTitles.size}</strong> كتاباً للبحث`;
}

// تأكيد واعتماد الكتب المحددة
function confirmBookSelection() {
    // مزامنة القائمة الرئيسية مع المودال إذا لم تكن هناك كتب، أو اعتماد الكتب
    const modalCatSelect = document.getElementById("modalCategorySelect");
    const mainCatSelect = document.getElementById("categorySelect");

    if (selectedBookTitles.size === 0) {
        mainCatSelect.value = modalCatSelect.value;
    }

    updateScopeIndicator();
    closeBookSelectorModal();

    if (selectedBookTitles.size > 0) {
        showToast(`✓ تم تطبيق حصر البحث في ${selectedBookTitles.size} كتب محددة`);
    } else {
        showToast(`✓ تم ضبط نطاق البحث بحسب القسم`);
    }
}

// --- دالة البحث الرئيسية ---

async function performSearch() {
    const query = document.getElementById("searchInput").value.trim();
    if (!query) return;

    const catId = parseInt(document.getElementById("categorySelect").value) || null;
    const limit = parseInt(document.getElementById("limitSelect").value) || 15;

    const loadingBox = document.getElementById("loadingBox");
    const resultsContainer = document.getElementById("resultsContainer");
    const resultsMeta = document.getElementById("resultsMeta");
    const emptyState = document.getElementById("emptyState");

    loadingBox.style.display = "block";
    resultsContainer.innerHTML = "";
    emptyState.style.display = "none";
    
    // وصف النطاق
    let scopeDesc = "كل الشاملة";
    if (selectedBookTitles.size > 0) {
        scopeDesc = `${selectedBookTitles.size} كتب محددة بالصح`;
    } else if (catId) {
        const cat = categoriesList.find(c => String(c.category_id) === String(catId));
        scopeDesc = `قسم [${cat ? cat.category_name_ar : catId}]`;
    }

    resultsMeta.innerHTML = `جاري البحث في <strong>${scopeDesc}</strong>...`;

    try {
        const t0 = performance.now();
        const activeColl = document.getElementById("collectionSelect")?.value || "badr_corpus";
        const useRerank = document.getElementById("useRerankerToggle") ? document.getElementById("useRerankerToggle").checked : false;
        const rerankModel = document.getElementById("searchRerankerModelSelect")?.value || document.getElementById("aiRerankerModelSelect")?.value || "BAAI/bge-reranker-v2-m3";
        const rerankLimit = parseInt(document.getElementById("aiRerankerLimitSelect")?.value) || null;
        const requestPayload = {
            query: query,
            mode: currentMode,
            collection_name: activeColl,
            limit: limit,
            use_reranker: useRerank,
            reranker_model: rerankModel,
            reranker_limit: rerankLimit
        };

        // إذا كان المستخدم حدد كتباً محددة بعلامة صح:
        if (selectedBookTitles.size > 0) {
            requestPayload.book_titles = Array.from(selectedBookTitles);
        } else if (catId) {
            requestPayload.category_id = catId;
        }

        const res = await fetch("/api/search", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(requestPayload)
        });

        if (!res.ok) {
            let errDetail = "فشل طلب البحث من الخادم";
            try {
                const errJson = await res.json();
                if (errJson && errJson.detail) errDetail = errJson.detail;
            } catch (_) {}
            
            if (errDetail.includes("Hugging Face") || errDetail.includes("Gated") || errDetail.includes("بدر") || errDetail.includes("HF_TOKEN")) {
                loadingBox.style.display = "none";
                resultsMeta.innerHTML = `
                    <div style="background: rgba(218, 119, 86, 0.08); border: 1px solid var(--accent, #da7756); border-radius: 8px; padding: 12px; margin: 10px 0;">
                        <div style="font-weight: 700; color: var(--accent, #da7756); margin-bottom: 5px;">🔑 يلزم إدخال توكن Hugging Face لتفعيل نموذج بدر 768:</div>
                        <div style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 8px;">${escapeHtml(errDetail)}</div>
                        <div style="display: flex; gap: 8px;">
                            <input type="password" id="inputHfTokenInline" class="form-control" placeholder="hf_xxxxxxxxxxxxxxxx..." style="flex: 1; font-family: monospace; font-size: 0.85rem; padding: 6px 10px;">
                            <button type="button" class="btn btn-primary" onclick="submitHfToken('inline')" style="white-space: nowrap; font-size: 0.85rem; padding: 6px 14px; background: var(--accent, #da7756); border: none; color: #fff; border-radius: 6px; cursor: pointer;">تفعيل وإعادة البحث 🚀</button>
                        </div>
                    </div>
                `;
                return;
            }
            throw new Error(errDetail);
        }

        const data = await res.json();
        loadingBox.style.display = "none";

        if (!data.results || data.results.length === 0) {
            emptyState.style.display = "block";
            resultsMeta.innerHTML = `لم يتم العثور على نتائج للعبارة: "<span>${escapeHtml(query)}</span>" في ${scopeDesc}`;
            return;
        }

        const tookTotal = Math.round(performance.now() - t0);
        const modeLabel = data.mode || (currentMode === "hybrid" ? "بحث هجين متقدم (RRF)" : (currentMode === "dense" ? "بحث دلالي عصبي" : "بحث لفظي جذري"));
        const rerankModelName = data.reranker_model ? (data.reranker_model.split('/').pop()) : "Reranker";
        const rerankBadge = data.reranker_used ? ` <span style="background: rgba(56,189,248,0.15); color: #38bdf8; border: 1px solid rgba(56,189,248,0.3); padding: 2px 7px; border-radius: 6px; font-size: 0.8rem; margin-right: 5px;" title="${escapeHtml(data.reranker_model || '')}">🎯 فرز متقاطع (${escapeHtml(rerankModelName)}) — ${data.rerank_ms}ms</span>` : "";
        
        resultsMeta.innerHTML = `تم العثور على <span>${data.results.length}</span> نتيجة في <strong>${scopeDesc}</strong> عبر <strong>${modeLabel}</strong> خلال <span>${tookTotal}ms</span> (بحث المتجهات: ${data.search_ms}ms)${rerankBadge}`;

        renderResults(data.results, query);
    } catch (e) {
        loadingBox.style.display = "none";
        resultsMeta.innerHTML = `<span style="color: #ef4444;">حدث خطأ أثناء البحث: ${e.message}</span>`;
        console.error(e);
    }
}

// عرض بطاقات النتائج
function renderResults(results, query) {
    const container = document.getElementById("resultsContainer");
    container.innerHTML = "";

    results.forEach((item, index) => {
        const card = document.createElement("div");
        card.className = "result-card";

        const partText = item.part ? `جـ ${item.part}` : "";
        const pageText = item.page_num ? `صـ ${item.page_num}` : "";
        const locationText = [partText, pageText].filter(Boolean).join("، ");
        const authorText = item.author_name ? `${item.author_name} ${item.death_hijri ? `(ت: ${item.death_hijri}هـ)` : ""}` : "";

        let scorePercent = Math.min(100, Math.round(item.score * 100));
        let scoreTitle = "درجة المطابقة";
        let scoreBadgeClass = "score-badge";
        let scoreDisplay = `${item.score} (${scorePercent}%)`;

        if (item.rerank_score !== undefined && item.rerank_score !== null) {
            scorePercent = Math.min(100, Math.round(item.rerank_score * 100));
            scoreTitle = `إعادة الترتيب بالذكاء الاصطناعي (Cross-Encoder): ${item.rerank_score} | درجة المتجهات الأولية: ${item.vector_score || item.score}`;
            scoreBadgeClass = "score-badge rerank-badge";
            scoreDisplay = `🎯 دقة فرز: ${item.score} (${scorePercent}%)`;
        } else if (currentMode === "hybrid") {
            scorePercent = Math.min(100, Math.round(item.score * 150));
            scoreDisplay = `${item.score} (${scorePercent}%)`;
        }

        card.innerHTML = `
            <div class="card-top">
                <div class="book-title">
                    <span>${index + 1}. ${escapeHtml(item.title_ar)}</span>
                    ${item.category_name_ar ? `<span class="badge badge-category">${escapeHtml(item.category_name_ar)}</span>` : ""}
                    ${locationText ? `<span class="badge badge-location">${locationText}</span>` : ""}
                </div>
                <div class="${scoreBadgeClass}" title="${escapeHtml(scoreTitle)}">
                    ${scoreDisplay}
                </div>
            </div>

            ${authorText ? `
            <div class="author-meta">
                <span>✍️ المؤلف:</span>
                <strong>${escapeHtml(authorText)}</strong>
            </div>
            ` : ""}

            <div class="snippet-box">
                ${item.snippet || "نص الصفحة غير متوفر للمعاينة السريعة."}
            </div>

            ${item.has_footnotes ? `
            <div class="footnotes-container" id="fn-${item.point_id}">
                <div style="font-weight: 700; color: var(--accent-gold); margin-bottom: 0.3rem;">📜 الحواشي والتخريج:</div>
                ${escapeHtml(item.footnotes)}
            </div>
            ` : ""}

            <div class="card-actions">
                <div class="btn-action-group">
                    <button class="btn-action btn-primary-action" onclick="openReaderModal('${escapeHtml(item.rel_path)}', '${escapeHtml(item.part || '')}', ${item.page_num || 0}, '${escapeHtml(item.title_ar)}', '${escapeHtml(item.point_id || '')}')">
                        📖 قراءة الصفحة في سياقها
                    </button>
                    ${item.has_footnotes ? `
                    <button class="btn-action" onclick="toggleFootnotes('${item.point_id}')">
                        📜 الحواشي
                    </button>
                    ` : ""}
                    <button class="btn-action" onclick="copyCitation('${escapeHtml(item.title_ar)}', '${escapeHtml(item.part || '')}', '${item.page_num || ''}', '${escapeHtml(item.author_name || '')}', this)">
                        📋 نسخ مع العزو
                    </button>
                </div>
                <div>
                    <button class="btn-action" onclick="openBookInfo(${item.book_id})">
                        ℹ️ بطاقة الكتاب
                    </button>
                </div>
            </div>
        `;

        container.appendChild(card);
    });
}

// تبديل عرض الحواشي
function toggleFootnotes(pointId) {
    const el = document.getElementById(`fn-${pointId}`);
    if (el) {
        el.classList.toggle("visible");
    }
}

// نسخ الاقتباس مع التوثيق المكتبي الأكاديمي
function copyCitation(title, part, page, author, btnEl) {
    let quote = "";
    const card = btnEl.closest(".result-card");
    if (card) {
        const snippetEl = card.querySelector(".snippet-box");
        if (snippetEl) {
            quote = snippetEl.innerText.trim();
        }
    }

    let citation = `«${quote}»\n\n— التوثيق: [${title}]`;
    if (author) citation += `، للمؤلف: ${author}`;
    if (part) citation += `، جـ ${part}`;
    if (page) citation += `، صـ ${page}`;
    citation += " (المكتبة الشاملة).";

    navigator.clipboard.writeText(citation).then(() => {
        showToast("✓ تم نسخ النص والتوثيق المكتبي إلى الحافظة");
    });
}

// فتح نافذة القارئ المتصل
async function openReaderModal(relPath, part, pageNum, bookTitle, pointId) {
    const modal = document.getElementById("readerModal");
    const readerTitle = document.getElementById("readerTitle");
    const readerContent = document.getElementById("readerContent");
    const readerFootnotes = document.getElementById("readerFootnotes");
    const prevBtn = document.getElementById("readerPrevBtn");
    const nextBtn = document.getElementById("readerNextBtn");

    const partDisplay = part ? `جـ ${part}، ` : "";
    readerTitle.innerText = `${bookTitle} — ${partDisplay}صـ ${pageNum}`;
    readerContent.innerHTML = `<div style="text-align: center; padding: 2rem;">جاري تحميل نص الصفحة...</div>`;
    readerFootnotes.innerHTML = "";
    modal.classList.add("active");

    currentReaderPage = { relPath, part, pageNum, bookTitle };

    try {
        const queryParams = new URLSearchParams({
            rel_path: relPath,
            part: part || "",
            page_num: pageNum
        });
        if (pointId) queryParams.set("point_id", pointId);

        const res = await fetch(`/api/page?${queryParams.toString()}`);
        if (!res.ok) throw new Error("تعذر جلب نص الصفحة");

        const data = await res.json();
        const curr = data.current;
        const curPart = (curr.part !== undefined && curr.part !== null && String(curr.part) !== "None") ? String(curr.part) : part;
        const curPage = curr.page_num !== undefined && curr.page_num !== null ? curr.page_num : pageNum;
        const curPartDisplay = curPart ? `جـ ${curPart}، ` : "";
        readerTitle.innerText = `${bookTitle} — ${curPartDisplay}صـ ${curPage}`;

        readerContent.innerText = curr.body || "لا يوجد نص في هذه الصفحة.";
        if (curr.footnotes) {
            readerFootnotes.innerHTML = `<strong>الحواشي والتعليقات:</strong>\n${escapeHtml(curr.footnotes)}`;
        }

        if (data.prev) {
            prevBtn.disabled = false;
            prevBtn.onclick = () => openReaderModal(relPath, data.prev.part, data.prev.page_num, bookTitle);
        } else {
            prevBtn.disabled = true;
        }

        if (data.next) {
            nextBtn.disabled = false;
            nextBtn.onclick = () => openReaderModal(relPath, data.next.part, data.next.page_num, bookTitle);
        } else {
            nextBtn.disabled = true;
        }

    } catch (e) {
        readerContent.innerHTML = `<div style="color: #ef4444;">حدث خطأ أثناء فتح الصفحة: ${e.message}</div>`;
    }
}

function closeReaderModal() {
    document.getElementById("readerModal").classList.remove("active");
}

function changeFontSize(delta) {
    const textEl = document.getElementById("readerContent");
    const currSize = parseFloat(window.getComputedStyle(textEl).fontSize);
    textEl.style.fontSize = `${Math.max(16, Math.min(36, currSize + delta))}px`;
}

// نافذة بطاقة الكتاب والفهرس
async function openBookInfo(bookId) {
    if (!bookId) {
        showToast("بيانات الكتاب الكاملة غير متوفرة لهذا المعرف");
        return;
    }

    const modal = document.getElementById("bookInfoModal");
    const titleEl = document.getElementById("bookInfoTitle");
    const bodyEl = document.getElementById("bookInfoBody");

    bodyEl.innerHTML = `<div style="text-align: center; padding: 2rem;">جاري تحميل بطاقة الكتاب وفهرسه...</div>`;
    modal.classList.add("active");

    try {
        const res = await fetch(`/api/book/${bookId}`);
        if (!res.ok) throw new Error("تعذر جلب بطاقة الكتاب");
        const data = await res.json();

        titleEl.innerText = `بطاقة: ${data.title_ar}`;

        let tocHtml = "";
        if (data.toc && data.toc.length > 0) {
            tocHtml = `
                <div style="margin-top: 1.5rem;">
                    <h4 style="margin-bottom: 0.75rem; color: var(--accent-emerald);">📑 فهرس موضوعات الكتاب (${data.toc_count} موضوعاً):</h4>
                    <div style="max-height: 250px; overflow-y: auto; background: rgba(0,0,0,0.2); border-radius: 8px; padding: 0.75rem; border: 1px solid var(--border-color);">
                        ${data.toc.map(t => `
                            <div style="padding: 0.4rem 0.5rem; border-bottom: 1px solid rgba(255,255,255,0.05); display: flex; justify-content: space-between; font-size: 0.95rem;">
                                <span>${escapeHtml(t.title_text || '')}</span>
                                <span style="color: var(--accent-gold); font-family: var(--font-num);">صـ ${t.page_num || '-'}</span>
                            </div>
                        `).join("")}
                    </div>
                </div>
            `;
        }

        bodyEl.innerHTML = `
            <div style="background: rgba(0,0,0,0.2); border: 1px solid var(--border-color); border-radius: 12px; padding: 1.25rem; font-family: var(--font-book); font-size: 1.25rem; line-height: 2; white-space: pre-wrap; margin-bottom: 1rem;">
                ${escapeHtml(data.betaka_text || "لا توجد بطاقة تعريفية مسجلة لهذا الكتاب.")}
            </div>
            ${tocHtml}
        `;
    } catch (e) {
        bodyEl.innerHTML = `<div style="color: #ef4444;">حدث خطأ: ${e.message}</div>`;
    }
}

function closeBookInfoModal() {
    document.getElementById("bookInfoModal").classList.remove("active");
}

function showToast(msg) {
    const toast = document.getElementById("toast");
    toast.innerText = msg;
    toast.classList.add("show");
    setTimeout(() => {
        toast.classList.remove("show");
    }, 2800);
}

function escapeHtml(text) {
    if (!text) return "";
    return String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// =========================================================================
// ==================== وظائف داشبورد الذكاء الاصطناعي (AI Dashboard) ====================
// =========================================================================

let aiChatHistory = [];
const AI_SETTINGS_STORAGE_KEY = "shamela_ai_dashboard_settings_v1";

// النماذج الافتراضية لكل مزود
const DEFAULT_PROVIDER_MODELS = {
    "openrouter": [
        { id: "anthropic/claude-3.5-sonnet", name: "Claude 3.5 Sonnet (موصى به للتحقيق)" },
        { id: "deepseek/deepseek-r1", name: "DeepSeek R1 (تفكير استدلالي عالي الدقة)" },
        { id: "openai/gpt-4o", name: "OpenAI GPT-4o (شامل ومتعدد الوسائط)" },
        { id: "meta-llama/llama-3.3-70b-instruct", name: "Llama 3.3 70B Instruct" },
        { id: "google/gemini-2.0-flash-exp:free", name: "Gemini 2.0 Flash (Free)" },
        { id: "google/gemini-pro-1.5", name: "Gemini 1.5 Pro" },
        { id: "mistralai/mistral-large-2411", name: "Mistral Large" }
    ],
    "openai": [
        { id: "gpt-4o", name: "GPT-4o (النموذج الرائد)" },
        { id: "gpt-4o-mini", name: "GPT-4o Mini (سريع وخفيف)" },
        { id: "o1", name: "o1 (تفكير منطقي استدلالي)" },
        { id: "o1-mini", name: "o1 Mini" },
        { id: "gpt-4-turbo", name: "GPT-4 Turbo" }
    ],
    "google": [
        { id: "gemini-1.5-pro", name: "Gemini 1.5 Pro (سياق مليون رمز)" },
        { id: "gemini-1.5-flash", name: "Gemini 1.5 Flash (فائق السرعة)" },
        { id: "gemini-2.0-flash-exp", name: "Gemini 2.0 Flash Experimental" }
    ],
    "anthropic": [
        { id: "claude-3-5-sonnet-20241022", name: "Claude 3.5 Sonnet (الأعلى تقييماً في اللغة)" },
        { id: "claude-3-5-haiku-20241022", name: "Claude 3.5 Haiku (سريع واقتصادي)" },
        { id: "claude-3-opus-20240229", name: "Claude 3 Opus" }
    ],
    "ollama": [
        { id: "qwen2.5:7b", name: "Qwen 2.5 7B (متفوق باللغة العربية وموصى به)" },
        { id: "qwen2.5:14b", name: "Qwen 2.5 14B (دقة عالية وسياق 128k)" },
        { id: "qwen2.5:32b", name: "Qwen 2.5 32B (تحقيق تراثي متقدم)" },
        { id: "deepseek-r1:7b", name: "DeepSeek R1 7B (استدلال واستنباط محلي)" },
        { id: "deepseek-r1:8b", name: "DeepSeek R1 8B (تفكير استدلالي)" },
        { id: "deepseek-r1:14b", name: "DeepSeek R1 14B (استدلال متقدم)" },
        { id: "llama3.1:8b", name: "Llama 3.1 8B (سريع وخفيف)" },
        { id: "llama3.2:3b", name: "Llama 3.2 3B (فائق السرعة)" },
        { id: "mistral:7b", name: "Mistral 7B (أداء متميز)" },
        { id: "aya:8b", name: "Cohere Aya 8B (تخصص لغات وعربية)" }
    ],
    "lmstudio": [
        { id: "local-model", name: "النموذج النشط حالياً في LM Studio" },
        { id: "qwen2.5-7b-instruct", name: "Qwen 2.5 7B Instruct" },
        { id: "deepseek-r1-distill-qwen-7b", name: "DeepSeek R1 Distill Qwen 7B" },
        { id: "llama-3.1-8b-instruct", name: "Llama 3.1 8B Instruct" }
    ],
    "local": [
        { id: "models", name: "📂 فحص مجلد models/ لاكتشاف النماذج (GGUF)" }
    ]
};

// التبديل بين واجهة البحث المباشر وداشبورد الذكاء الاصطناعي وصفحة النماذج المساعدة
function switchMainView(view) {
    const searchView = document.getElementById("searchView");
    const aiView = document.getElementById("aiDashboardView");
    const pipelineView = document.getElementById("pipelineDashboardView");
    const mcpView = document.getElementById("mcpDashboardView");
    const tabSearch = document.getElementById("tabSearchBtn");
    const tabAi = document.getElementById("tabAiBtn");
    const tabPipeline = document.getElementById("tabPipelineBtn");
    const tabMcp = document.getElementById("tabMcpBtn");

    if (view === "mcp") {
        if (searchView) searchView.style.display = "none";
        if (aiView) aiView.style.display = "none";
        if (pipelineView) pipelineView.style.display = "none";
        if (mcpView) mcpView.style.display = "block";
        if (tabSearch) tabSearch.classList.remove("active");
        if (tabAi) tabAi.classList.remove("active");
        if (tabPipeline) tabPipeline.classList.remove("active");
        if (tabMcp) tabMcp.classList.add("active");
        if (typeof window.initMcpView === "function") {
            window.initMcpView();
        }
    } else if (view === "pipeline") {
        if (searchView) searchView.style.display = "none";
        if (aiView) aiView.style.display = "none";
        if (pipelineView) pipelineView.style.display = "block";
        if (mcpView) mcpView.style.display = "none";
        if (tabSearch) tabSearch.classList.remove("active");
        if (tabAi) tabAi.classList.remove("active");
        if (tabPipeline) tabPipeline.classList.add("active");
        if (tabMcp) tabMcp.classList.remove("active");
        renderPipelinePageView();
    } else if (view === "ai") {
        if (searchView) searchView.style.display = "none";
        if (aiView) aiView.style.display = "block";
        if (pipelineView) pipelineView.style.display = "none";
        if (mcpView) mcpView.style.display = "none";
        if (tabSearch) tabSearch.classList.remove("active");
        if (tabAi) tabAi.classList.remove("active");
        if (tabPipeline) tabPipeline.classList.remove("active");
        if (tabMcp) tabMcp.classList.remove("active");
        updateAiScopeHint();
        updateChatHeaderBadges();
    } else {
        if (searchView) searchView.style.display = "block";
        if (aiView) aiView.style.display = "none";
        if (pipelineView) pipelineView.style.display = "none";
        if (mcpView) mcpView.style.display = "none";
        if (tabSearch) tabSearch.classList.add("active");
        if (tabAi) tabAi.classList.remove("active");
        if (tabPipeline) tabPipeline.classList.remove("active");
        if (tabMcp) tabMcp.classList.remove("active");
    }
}

// إعداد أحداث واجهة الذكاء الاصطناعي
function initAiEventListeners() {
    const chatForm = document.getElementById("aiChatForm");
    const aiInput = document.getElementById("aiInputText");

    if (chatForm) {
        chatForm.addEventListener("submit", handleAiChatSubmit);
    }

    if (aiInput) {
        aiInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleAiChatSubmit();
            }
        });
        
        // تعديل الارتفاع التلقائي
        aiInput.addEventListener("input", () => {
            aiInput.style.height = "auto";
            aiInput.style.height = Math.min(aiInput.scrollHeight, 180) + "px";
        });
    }
}

// حفظ الإعدادات في localStorage
function saveAiSettings() {
    const settings = {
        provider: document.getElementById("aiProviderSelect")?.value || "openrouter",
        endpoint_url: document.getElementById("aiEndpointUrlInput")?.value?.trim() || "",
        api_key: document.getElementById("aiApiKeyInput")?.value || "",
        model: document.getElementById("aiModelSelect")?.value || "",
        custom_model: document.getElementById("aiCustomModelInput")?.value || "",
        rag_enabled: document.getElementById("aiRagEnabled")?.checked ?? true,
        reformulate_query: document.getElementById("aiReformulateQuery")?.checked ?? true,
        iterative_research: document.getElementById("aiIterativeResearch")?.checked ?? true,
        max_research_hops: document.getElementById("aiMaxHopsSelect")?.value || "2",
        rag_limit: document.getElementById("aiRagLimitSelect")?.value || "5",
        rag_mode: document.getElementById("aiRagModeSelect")?.value || "hybrid",
        category_id: document.getElementById("aiCategorySelect")?.value || "",
        // إعدادات قسم أدوات التحقيق الشرعي (MCP)
        mcp_enabled: document.getElementById("aiMcpEnabled")?.checked ?? true,
        mcp_mode: document.getElementById("aiMcpModeSelect")?.value || "autonomous",
        mcp_reformulate: document.getElementById("aiMcpReformulateQuery")?.checked ?? true,
        mcp_iterative: document.getElementById("aiMcpIterativeResearch")?.checked ?? true,
        mcp_max_hops: document.getElementById("aiMcpMaxHopsSelect")?.value || "2",
        mcp_limit: document.getElementById("aiMcpLimitSelect")?.value || "20",
        mcp_use_reranker: document.getElementById("aiMcpUseRerankerToggle")?.checked ?? true,
        mcp_reranker_model: document.getElementById("aiMcpRerankerModelSelect")?.value || "BAAI/bge-reranker-v2-m3",
        mcp_reranker_limit: parseInt(document.getElementById("aiMcpRerankerLimitSelect")?.value) || 10,
        mcp_category_id: document.getElementById("aiMcpCategorySelect")?.value || "",
        mcp_book_filter: document.getElementById("aiMcpBookFilterInput")?.value || "",
        mcp_active_tools: Array.from(document.querySelectorAll(".mcp-tool-chk:checked")).map(c => c.value),
        temperature: document.getElementById("aiTemperature")?.value || "0.3",
        repetition_penalty: document.getElementById("aiRepPenalty")?.value || "0.0",
        max_tokens: document.getElementById("aiMaxTokens")?.value || "6000",
        system_prompt: document.getElementById("aiSystemPrompt")?.value || "",
        structured_enabled: document.getElementById("aiStructuredEnabled")?.checked || false,
        structured_format: document.getElementById("aiStructuredFormat")?.value || "",
        craft_api_key: document.getElementById("craftApiKeyInput")?.value || "",
        craft_template_id: document.getElementById("craftTemplateIdInput")?.value || "",
        craft_custom_data_schema: document.getElementById("craftCustomDataSchema")?.value || "",
        active_collection_id: document.getElementById("aiCollectionSelect")?.value || "",
        use_reranker: document.getElementById("aiUseRerankerToggle")?.checked ?? true,
        reranker_model: document.getElementById("aiRerankerModelSelect")?.value || "BAAI/bge-reranker-v2-m3",
        reranker_limit: parseInt(document.getElementById("aiRerankerLimitSelect")?.value) || 10,
        local_models_dir: document.getElementById("aiLocalModelsDirInput")?.value?.trim() || "models/"
    };
    
    const curKey = document.getElementById("aiApiKeyInput")?.value?.trim() || "";
    const curProv = document.getElementById("aiProviderSelect")?.value || "openrouter";
    if (curProv === "openrouter" && curKey) {
        try { localStorage.setItem("shamela_openrouter_api_key", curKey); } catch (e) {}
    } else if (curProv === "lmstudio") {
        if (curKey) {
            try { localStorage.setItem("shamela_lmstudio_api_token", curKey); } catch (e) {}
        }
        const curEndpoint = document.getElementById("aiEndpointUrlInput")?.value?.trim() || "";
        if (curEndpoint) {
            try { localStorage.setItem("shamela_lmstudio_endpoint", curEndpoint); } catch (e) {}
        }
    }

    try {
        localStorage.setItem(AI_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    } catch (e) {
        console.warn("Storage error:", e);
    }

    updateChatHeaderBadges();
    updateAiScopeHint();
}

// تحديث الشارات في رأس محادثة الذكاء الاصطناعي
function updateChatHeaderBadges() {
    const modelBadge = document.getElementById("chatActiveModelBadge");
    const ragBadge = document.getElementById("chatRagStatusBadge");
    const customModel = document.getElementById("aiCustomModelInput")?.value?.trim();
    const selectedModel = document.getElementById("aiModelSelect")?.value;
    const activeModel = customModel || selectedModel || "gpt-4o";
    const ragEnabled = document.getElementById("aiRagEnabled")?.checked ?? true;
    const ragLimit = document.getElementById("aiRagLimitSelect")?.value || "5";

    if (modelBadge) {
        modelBadge.innerText = `النموذج: ${activeModel.split('/').pop()}`;
        modelBadge.title = activeModel;
    }
    if (ragBadge) {
        if (ragEnabled) {
            ragBadge.className = "chat-rag-badge";
            ragBadge.innerHTML = `📚 RAG نشط (${ragLimit} نصوص)`;
        } else {
            ragBadge.className = "chat-rag-badge disabled";
            ragBadge.innerHTML = `⚠️ RAG متوقف (بدون مراجع)`;
        }
    }
    const mcpBadge = document.getElementById("chatMcpStatusBadge");
    const mcpEnabled = document.getElementById("aiMcpEnabled")?.checked ?? true;
    const mcpLimit = document.getElementById("aiMcpLimitSelect")?.value || "20";
    if (mcpBadge) {
        if (mcpEnabled) {
            mcpBadge.className = "chat-rag-badge";
            mcpBadge.style.background = "rgba(168, 85, 247, 0.15)";
            mcpBadge.style.color = "#c084fc";
            mcpBadge.style.borderColor = "rgba(168, 85, 247, 0.35)";
            mcpBadge.innerHTML = `🔌 MCP نشط (${mcpLimit} سقف)`;
        } else {
            mcpBadge.className = "chat-rag-badge disabled";
            mcpBadge.style.background = "";
            mcpBadge.style.color = "";
            mcpBadge.style.borderColor = "";
            mcpBadge.innerHTML = `⚠️ MCP متوقف`;
        }
    }
}

// تحديث إشارة حصر الكتب في لوحة الذكاء الاصطناعي
function updateAiScopeHint() {
    const aiBadge = document.getElementById("aiSelectedCountBadge");
    const aiHint = document.getElementById("aiScopeHint");
    if (!aiBadge || !aiHint) return;

    if (typeof selectedBookTitles !== "undefined" && selectedBookTitles.size > 0) {
        aiBadge.style.display = "inline-block";
        aiBadge.innerText = selectedBookTitles.size;
        aiHint.innerText = `تم حصر مراجع الذكاء الاصطناعي في (${selectedBookTitles.size}) كتب محددة بالصح`;
    } else {
        aiBadge.style.display = "none";
        const catSelect = document.getElementById("aiCategorySelect");
        if (catSelect && catSelect.value && typeof categoriesList !== "undefined") {
            const cat = categoriesList.find(c => String(c.category_id) === String(catSelect.value));
            aiHint.innerText = `حصر مراجع الذكاء الاصطناعي في قسم: [${cat ? cat.category_name_ar : 'المحدد'}]`;
        } else {
            aiHint.innerText = "سياق الذكاء الاصطناعي يشمل كل كتب المكتبة الشاملة";
        }
    }
}

// تبديل إظهار حقل هيكلة JSON
function toggleStructuredFormatBox() {
    const chk = document.getElementById("aiStructuredEnabled");
    const box = document.getElementById("structuredFormatBox");
    if (chk && box) {
        box.style.display = chk.checked ? "block" : "none";
    }
}

// إظهار أو إخفاء حقل تحديد عدد نتائج الفرز المتقاطع
function toggleAiRerankerLimitVisibility() {
    const isChecked = document.getElementById("aiUseRerankerToggle")?.checked;
    const box = document.getElementById("aiRerankerSettingsBox") || document.getElementById("aiRerankerLimitBox");
    if (box) {
        box.style.display = isChecked ? "block" : "none";
    }
}

// اختيار المزود عبر أزرار الاختيار السريع
function selectProviderPill(prov) {
    const sel = document.getElementById("aiProviderSelect");
    if (sel) {
        sel.value = prov;
        onAiProviderChanged();
    }
}

// مزامنة حالة حقول المزود المحلي (Ollama / LM Studio)
function syncLocalEndpointVisibility(provider) {
    const endpointGroup = document.getElementById("aiLocalEndpointGroup");
    const endpointInput = document.getElementById("aiEndpointUrlInput");
    const endpointLabel = document.getElementById("aiEndpointLabel");
    const endpointHint = document.getElementById("aiEndpointHint");
    const apiKeyNotice = document.getElementById("aiApiKeyNotice");
    const apiKeyHint = document.getElementById("aiApiKeyHint");
    const apiKeyLabel = document.getElementById("aiApiKeyLabel");
    const apiKeyInput = document.getElementById("aiApiKeyInput");
    const btnResetApiKey = document.getElementById("btnResetDefaultApiKey");

    const localFolderGroup = document.getElementById("aiLocalFolderGroup");

    // مزامنة أزرار الاختيار السريع
    document.querySelectorAll(".btn-prov-pill").forEach(btn => {
        if (btn.id === `provPill-${provider}`) {
            btn.classList.add("active");
        } else {
            btn.classList.remove("active");
        }
    });

    if (provider === "local") {
        if (endpointGroup) endpointGroup.style.display = "none";
        if (localFolderGroup) localFolderGroup.style.display = "block";
        if (apiKeyLabel) apiKeyLabel.innerText = "مفتاح API Key:";
        if (btnResetApiKey) btnResetApiKey.style.display = "none";
        if (apiKeyNotice) {
            apiKeyNotice.style.display = "block";
            apiKeyNotice.innerText = "✓ غير مطلوب للنماذج المحلية المباشرة (تعمل داخلياً على جهازك بدون إنترنت أو وسيط)";
        }
        if (apiKeyHint) apiKeyHint.style.display = "none";
    } else if (provider === "ollama") {
        if (localFolderGroup) localFolderGroup.style.display = "none";
        if (endpointGroup) endpointGroup.style.display = "block";
        if (endpointLabel) endpointLabel.innerText = "🦙 عنوان خادم Ollama المحلي:";
        if (endpointHint) endpointHint.innerText = "المنفذ الافتراضي لخادم Ollama هو: http://localhost:11434";
        if (endpointInput && (!endpointInput.value || endpointInput.value.includes("1234"))) {
            endpointInput.value = "http://localhost:11434";
            endpointInput.placeholder = "http://localhost:11434";
        }
        if (apiKeyLabel) apiKeyLabel.innerText = "مفتاح API Key:";
        if (btnResetApiKey) btnResetApiKey.style.display = "none";
        if (apiKeyNotice) {
            apiKeyNotice.style.display = "block";
            apiKeyNotice.innerText = "✓ غير مطلوب للنماذج المحلية (تعمل بدون مفتاح مباشرة على جهازك)";
        }
        if (apiKeyHint) apiKeyHint.style.display = "none";
    } else if (provider === "lmstudio") {
        if (localFolderGroup) localFolderGroup.style.display = "none";
        if (endpointGroup) endpointGroup.style.display = "block";
        if (endpointLabel) endpointLabel.innerText = "🌐 عنوان IP / رابط خادم LM Studio (IP & Port):";
        if (endpointHint) endpointHint.innerText = "الافتراضي: http://192.168.100.134:1234 أو http://localhost:1234";
        if (endpointInput && (!endpointInput.value || endpointInput.value.includes("11434") || endpointInput.value === "http://localhost:1234")) {
            endpointInput.value = localStorage.getItem("shamela_lmstudio_endpoint") || "http://192.168.100.134:1234";
            endpointInput.placeholder = "http://192.168.100.134:1234";
        }
        if (apiKeyLabel) apiKeyLabel.innerText = "🔑 LM Studio API Tokens (رمز التوثيق والمصادقة):";
        if (btnResetApiKey) btnResetApiKey.style.display = "inline-block";
        if (apiKeyNotice) apiKeyNotice.style.display = "none";
        if (apiKeyHint) {
            apiKeyHint.style.display = "block";
            apiKeyHint.innerText = "💡 مطلوب للمصادقة وتخويل تحميل النماذج (الافتراضي: sk-lm-ARRMdEDr:nh1GuNwgHu4MpvOKefRu)";
        }
        if (apiKeyInput && (!apiKeyInput.value || apiKeyInput.value.startsWith("sk-or-"))) {
            apiKeyInput.value = localStorage.getItem("shamela_lmstudio_api_token") || "sk-lm-ARRMdEDr:nh1GuNwgHu4MpvOKefRu";
            apiKeyInput.placeholder = "sk-lm-ARRMdEDr:nh1GuNwgHu4MpvOKefRu";
        }
    } else {
        if (localFolderGroup) localFolderGroup.style.display = "none";
        if (endpointGroup) endpointGroup.style.display = "none";
        if (apiKeyLabel) apiKeyLabel.innerText = `مفتاح API Key (${provider.toUpperCase()}):`;
        if (btnResetApiKey) btnResetApiKey.style.display = "none";
        if (apiKeyNotice) apiKeyNotice.style.display = "none";
        if (apiKeyHint) {
            apiKeyHint.style.display = "block";
            apiKeyHint.innerText = "يُحفظ بأمان في متصفحك محلياً (localStorage)";
        }
        if (apiKeyInput && apiKeyInput.value.startsWith("sk-lm-")) {
            apiKeyInput.value = localStorage.getItem("shamela_openrouter_api_key") || "";
            apiKeyInput.placeholder = "sk-...";
        }
    }
}

// استعادة العنوان الافتراضي للمزود المحلي
function resetDefaultEndpoint() {
    const provider = document.getElementById("aiProviderSelect")?.value || "openrouter";
    const endpointInput = document.getElementById("aiEndpointUrlInput");
    if (!endpointInput) return;
    if (provider === "ollama") {
        endpointInput.value = "http://localhost:11434";
    } else if (provider === "lmstudio") {
        endpointInput.value = "http://192.168.100.134:1234";
    }
    saveAiSettings();
    showToast("✓ تمت استعادة العنوان الافتراضي للمزود");
}

// استعادة توكن LM Studio الافتراضي
function resetDefaultApiKey() {
    const provider = document.getElementById("aiProviderSelect")?.value || "openrouter";
    const apiKeyInput = document.getElementById("aiApiKeyInput");
    if (!apiKeyInput) return;
    if (provider === "lmstudio") {
        apiKeyInput.value = "sk-lm-ARRMdEDr:nh1GuNwgHu4MpvOKefRu";
        saveAiSettings();
        showToast("✓ تمت استعادة توكن LM Studio الافتراضي");
    }
}

// تحميل الإعدادات من localStorage
function loadAiSettings() {
    let s = {};
    try {
        const raw = localStorage.getItem(AI_SETTINGS_STORAGE_KEY);
        if (raw) s = JSON.parse(raw);
    } catch (e) {
        console.warn("Error reading localStorage:", e);
    }

    const providerSelect = document.getElementById("aiProviderSelect");
    const activeProv = s.provider || (providerSelect ? providerSelect.value : "openrouter");
    if (providerSelect && s.provider) {
        providerSelect.value = s.provider;
    }
    syncLocalEndpointVisibility(activeProv);

    const endpointInput = document.getElementById("aiEndpointUrlInput");
    if (endpointInput) {
        if (s.endpoint_url) {
            endpointInput.value = s.endpoint_url;
        } else if (activeProv === "lmstudio") {
            endpointInput.value = localStorage.getItem("shamela_lmstudio_endpoint") || "http://192.168.100.134:1234";
        }
    }

    const localDirInput = document.getElementById("aiLocalModelsDirInput");
    if (localDirInput && s.local_models_dir) {
        localDirInput.value = s.local_models_dir;
    }

    const apiKeyInput = document.getElementById("aiApiKeyInput");
    if (apiKeyInput) {
        if (s.api_key) {
            apiKeyInput.value = s.api_key;
        } else if (activeProv === "lmstudio") {
            apiKeyInput.value = localStorage.getItem("shamela_lmstudio_api_token") || "sk-lm-ARRMdEDr:nh1GuNwgHu4MpvOKefRu";
        } else if (activeProv === "openrouter") {
            const savedOr = localStorage.getItem("shamela_openrouter_api_key");
            if (savedOr) apiKeyInput.value = savedOr;
        }
    }

    const customModelInput = document.getElementById("aiCustomModelInput");
    if (customModelInput && s.custom_model) customModelInput.value = s.custom_model;

    const ragEnabled = document.getElementById("aiRagEnabled");
    if (ragEnabled && s.rag_enabled !== undefined) ragEnabled.checked = s.rag_enabled;

    const reformulateEl = document.getElementById("aiReformulateQuery");
    if (reformulateEl && s.reformulate_query !== undefined) {
        reformulateEl.checked = s.reformulate_query;
        const qReformulate = document.getElementById("aiQuickReformulate");
        if (qReformulate) qReformulate.checked = s.reformulate_query;
    }

    const iterativeEl = document.getElementById("aiIterativeResearch");
    if (iterativeEl && s.iterative_research !== undefined) {
        iterativeEl.checked = s.iterative_research;
        const qIterative = document.getElementById("aiQuickIterative");
        if (qIterative) qIterative.checked = s.iterative_research;
    }

    const maxHopsSelect = document.getElementById("aiMaxHopsSelect");
    if (maxHopsSelect && s.max_research_hops) {
        maxHopsSelect.value = s.max_research_hops;
    }
    toggleIterativeHops();

    const ragLimitSelect = document.getElementById("aiRagLimitSelect");
    if (ragLimitSelect && s.rag_limit) ragLimitSelect.value = s.rag_limit;

    const ragModeSelect = document.getElementById("aiRagModeSelect");
    if (ragModeSelect && s.rag_mode) ragModeSelect.value = s.rag_mode;

    const aiCatSelect = document.getElementById("aiCategorySelect");
    if (aiCatSelect && s.category_id) {
        aiCatSelect.setAttribute("data-saved-val", s.category_id);
        aiCatSelect.value = s.category_id;
    }

    // استعادة إعدادات قسم أدوات التحقيق الشرعي (MCP)
    const mcpEnabled = document.getElementById("aiMcpEnabled");
    if (mcpEnabled && s.mcp_enabled !== undefined) {
        mcpEnabled.checked = s.mcp_enabled;
        const qMcp = document.getElementById("aiQuickMcp");
        if (qMcp) qMcp.checked = s.mcp_enabled;
    }

    const mcpModeSelect = document.getElementById("aiMcpModeSelect");
    if (mcpModeSelect && s.mcp_mode) mcpModeSelect.value = s.mcp_mode;

    const mcpReformulateEl = document.getElementById("aiMcpReformulateQuery");
    if (mcpReformulateEl && s.mcp_reformulate !== undefined) mcpReformulateEl.checked = s.mcp_reformulate;

    const mcpIterativeEl = document.getElementById("aiMcpIterativeResearch");
    if (mcpIterativeEl && s.mcp_iterative !== undefined) mcpIterativeEl.checked = s.mcp_iterative;

    const mcpMaxHopsSelect = document.getElementById("aiMcpMaxHopsSelect");
    if (mcpMaxHopsSelect && s.mcp_max_hops) mcpMaxHopsSelect.value = s.mcp_max_hops;
    toggleMcpIterativeHops();

    const mcpLimitSelect = document.getElementById("aiMcpLimitSelect");
    if (mcpLimitSelect && s.mcp_limit) mcpLimitSelect.value = s.mcp_limit;

    const mcpRerankerToggle = document.getElementById("aiMcpUseRerankerToggle");
    if (mcpRerankerToggle && s.mcp_use_reranker !== undefined) mcpRerankerToggle.checked = !!s.mcp_use_reranker;

    const mcpRerankerModelSelect = document.getElementById("aiMcpRerankerModelSelect");
    if (mcpRerankerModelSelect && s.mcp_reranker_model) mcpRerankerModelSelect.value = s.mcp_reranker_model;

    const mcpRerankerLimitSelect = document.getElementById("aiMcpRerankerLimitSelect");
    if (mcpRerankerLimitSelect && s.mcp_reranker_limit) mcpRerankerLimitSelect.value = s.mcp_reranker_limit;
    toggleAiMcpRerankerLimitVisibility();

    const mcpCatSelect = document.getElementById("aiMcpCategorySelect");
    if (mcpCatSelect && s.mcp_category_id) {
        mcpCatSelect.setAttribute("data-saved-val", s.mcp_category_id);
        mcpCatSelect.value = s.mcp_category_id;
    }

    const mcpBookFilterInput = document.getElementById("aiMcpBookFilterInput");
    if (mcpBookFilterInput && s.mcp_book_filter) mcpBookFilterInput.value = s.mcp_book_filter;

    if (Array.isArray(s.mcp_active_tools)) {
        document.querySelectorAll(".mcp-tool-chk").forEach(chk => {
            chk.checked = s.mcp_active_tools.includes(chk.value);
        });
    }

    const tempSlider = document.getElementById("aiTemperature");
    if (tempSlider && s.temperature) {
        tempSlider.value = s.temperature;
        const tempVal = document.getElementById("tempVal");
        if (tempVal) tempVal.innerText = s.temperature;
    }

    const repSlider = document.getElementById("aiRepPenalty");
    if (repSlider && s.repetition_penalty) {
        repSlider.value = s.repetition_penalty;
        const repVal = document.getElementById("repVal");
        if (repVal) repVal.innerText = s.repetition_penalty;
    }

    const maxTokensInput = document.getElementById("aiMaxTokens");
    if (maxTokensInput) {
        if (s.max_tokens && parseInt(s.max_tokens) >= 4000) {
            maxTokensInput.value = s.max_tokens;
        } else {
            maxTokensInput.value = "6000";
        }
    }

    const sysPromptInput = document.getElementById("aiSystemPrompt");
    if (sysPromptInput && s.system_prompt) sysPromptInput.value = s.system_prompt;

    const structEnabled = document.getElementById("aiStructuredEnabled");
    if (structEnabled && s.structured_enabled !== undefined) {
        structEnabled.checked = s.structured_enabled;
        toggleStructuredFormatBox();
    }

    const structFormat = document.getElementById("aiStructuredFormat");
    if (structFormat && s.structured_format) structFormat.value = s.structured_format;

    const craftKey = document.getElementById("craftApiKeyInput");
    if (craftKey && s.craft_api_key) craftKey.value = s.craft_api_key;

    const craftTpl = document.getElementById("craftTemplateIdInput");
    if (craftTpl && s.craft_template_id) craftTpl.value = s.craft_template_id;

    const craftSchema = document.getElementById("craftCustomDataSchema");
    if (craftSchema) {
        if (s.craft_custom_data_schema !== undefined && s.craft_custom_data_schema !== "") {
            craftSchema.value = s.craft_custom_data_schema;
        } else if (!craftSchema.value.trim()) {
            craftSchema.value = typeof getDefaultCraftSchemaJson === "function" ? getDefaultCraftSchemaJson() : "";
        }
        if (typeof onCraftSchemaChanged === "function") {
            onCraftSchemaChanged(false);
        }
    }

    const rerankerToggle = document.getElementById("aiUseRerankerToggle");
    if (rerankerToggle && s.use_reranker !== undefined) rerankerToggle.checked = !!s.use_reranker;

    const rerankerModelSelect = document.getElementById("aiRerankerModelSelect");
    if (rerankerModelSelect && s.reranker_model) {
        rerankerModelSelect.value = s.reranker_model;
        const searchRerank = document.getElementById("searchRerankerModelSelect");
        if (searchRerank) searchRerank.value = s.reranker_model;
    }

    const rerankerLimitSelect = document.getElementById("aiRerankerLimitSelect");
    if (rerankerLimitSelect && s.reranker_limit) rerankerLimitSelect.value = s.reranker_limit;
    toggleAiRerankerLimitVisibility();

    populateDefaultModels(s.provider || "openrouter", s.model);
    switchSettingsSection("provider");
    updateChatHeaderBadges();
    updateAiScopeHint();
}

// مزامنة خيار البحث التكميلي السريع
function syncIterativeQuickToggle(val) {
    const el = document.getElementById("aiIterativeResearch");
    if (el) el.checked = val;
    const qEl = document.getElementById("aiQuickIterative");
    if (qEl) qEl.checked = val;
    toggleIterativeHops();
    saveAiSettings();
}

// مزامنة خيار إعادة صياغة السؤال فقهياً
function syncReformulateQuickToggle(val) {
    const el = document.getElementById("aiReformulateQuery");
    if (el) el.checked = val;
    const qEl = document.getElementById("aiQuickReformulate");
    if (qEl) qEl.checked = val;
    saveAiSettings();
}

// مزامنة زر أدوات MCP السريع
function syncMcpQuickToggle(val) {
    const el = document.getElementById("aiMcpEnabled");
    if (el) el.checked = val;
    const qEl = document.getElementById("aiQuickMcp");
    if (qEl) qEl.checked = val;
    saveAiSettings();
    updateChatHeaderBadges();
}

// إظهار أو إخفاء حقل تحديد عدد نتائج الفرز المتقاطع لـ MCP
function toggleAiMcpRerankerLimitVisibility() {
    const isChecked = document.getElementById("aiMcpUseRerankerToggle")?.checked;
    const box = document.getElementById("aiMcpRerankerSettingsBox");
    if (box) {
        box.style.display = isChecked ? "block" : "none";
    }
}

// إظهار أو إخفاء خطوات الاستدعاء المتتالية لـ MCP
function toggleMcpIterativeHops() {
    const isIter = document.getElementById("aiMcpIterativeResearch")?.checked;
    const box = document.getElementById("mcpIterativeHopsBox");
    if (box) {
        box.style.display = isIter ? "block" : "none";
    }
}

// تحديد أو إلغاء تحديد كافة أدوات MCP
function toggleSelectAllMcpTools() {
    const toolChks = document.querySelectorAll(".mcp-tool-chk");
    const anyUnchecked = Array.from(toolChks).some(c => !c.checked);
    toolChks.forEach(c => c.checked = anyUnchecked);
    saveAiSettings();
}

// إظهار أو إخفاء حقل عدد جولات البحث التكميلي
function toggleIterativeHops() {
    const isIter = document.getElementById("aiIterativeResearch")?.checked;
    const hopsBox = document.getElementById("iterativeHopsBox");
    if (hopsBox) {
        hopsBox.style.display = isIter ? "block" : "none";
    }
}

// طي وفتح مسار البحث والتدقيق التكميلي في الرسالة
function toggleResearchTrail(headerEl) {
    const box = headerEl.closest('.chat-research-trail-box');
    if (box) {
        box.classList.toggle('open');
    }
}

// مكتبة شعارات وأيقونات الشركات المنتجة لنماذج الذكاء الاصطناعي (مثل OpenRouter)
const AI_COMPANIES = {
    "openai": { 
        name: "OpenAI", 
        icon: "✳️", 
        color: "#10a37f", 
        logo: `<svg viewBox="0 0 24 24" width="22" height="22" fill="#10a37f"><path d="M22.28 9.82a6 6 0 0 0-.52-4.91 6.05 6.05 0 0 0-6.5-2.9A6.06 6.06 0 0 0 4.98 4.18a6 6 0 0 0-4 2.9 6.05 6.05 0 0 0 .74 7.1 6 6 0 0 0 .51 4.91 6.05 6.05 0 0 0 6.51 2.9A6 6 0 0 0 13.26 24a6.05 6.05 0 0 0 5.77-4.2 6 6 0 0 0 4-2.9 6.05 6.05 0 0 0-.75-7.08zm-9.02 12.61a4.5 4.5 0 0 1-2.88-1.04l.14-.08 4.78-2.76a.8.8 0 0 0 .4-.68v-6.74l2.02 1.17a.07.07 0 0 1 .04.05v5.58a4.5 4.5 0 0 1-4.5 4.5zm-9.66-4.13a4.5 4.5 0 0 1-.53-3.01l.14.08 4.78 2.76a.8.8 0 0 0 .78 0l5.85-3.37v2.33a.08.08 0 0 1-.03.06l-4.85 2.8a4.5 4.5 0 0 1-6.14-1.65zM2.34 7.9a4.5 4.5 0 0 1 2.37-1.98v5.68a.8.8 0 0 0 .38.68l5.82 3.35-2.02 1.17a.08.08 0 0 1-.07 0l-4.83-2.79A4.5 4.5 0 0 1 2.34 7.9zm16.1 3.85l-5.84-3.37 2.02-1.16a.08.08 0 0 1 .07 0l4.83 2.79a4.5 4.5 0 0 1-.68 8.1v-5.68a.8.8 0 0 0-.4-.68zm2.01-3.02l-.14-.09-4.78-2.78a.8.8 0 0 0-.78 0l-5.84 3.36V6.9a.07.07 0 0 1 .03-.06l4.83-2.79a4.5 4.5 0 0 1 6.68 4.66zM8.3 12.86l-2.02-1.16a.08.08 0 0 1-.04-.06V6.07a4.5 4.5 0 0 1 7.38-3.45l-.14.08-4.78 2.76a.8.8 0 0 0-.4.68zm1.1-2.36l2.6-1.5 2.61 1.5v3l-2.61 1.5-2.6-1.5z"/></svg>` 
    },
    "anthropic": { 
        name: "Anthropic", 
        icon: "🟤", 
        color: "#d97706", 
        logo: `<svg viewBox="0 0 24 24" width="22" height="22" fill="#d97706"><path d="M17.47 3.6h-3.92L6.53 20.4h3.92l1.4-3.16h6.3l1.4 3.16h3.92L17.47 3.6zm-4.43 10.87l2.35-5.34 2.35 5.34h-4.7z"/></svg>` 
    },
    "google": { 
        name: "Google Gemini", 
        icon: "✨", 
        color: "#38bdf8", 
        logo: `<svg viewBox="0 0 24 24" width="22" height="22" fill="#38bdf8"><path d="M12 0C12 6.63 6.63 12 0 12c6.63 0 12 5.37 12 12 0-6.63 5.37-12 12-12-6.63 0-12-5.37-12-12z"/></svg>` 
    },
    "deepseek": { 
        name: "DeepSeek", 
        icon: "🐋", 
        color: "#0284c7", 
        logo: `<svg viewBox="0 0 24 24" width="22" height="22" fill="#0284c7"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 16.5c-3.5 0-6.3-2.8-6.3-6.3 0-1.8.7-3.4 1.9-4.6l1.4 1.4c-.9.9-1.4 2-1.4 3.2 0 2.4 1.9 4.3 4.3 4.3s4.3-1.9 4.3-4.3c0-1.2-.5-2.3-1.4-3.2l1.4-1.4c1.2 1.2 1.9 2.8 1.9 4.6 0 3.5-2.8 6.3-6.3 6.3z"/></svg>` 
    },
    "meta-llama": { 
        name: "Meta Llama", 
        icon: "🦙", 
        color: "#0668E1", 
        logo: `<svg viewBox="0 0 24 24" width="22" height="22" fill="#0668E1"><path d="M16.5 6C13.8 6 12 8.3 12 10.8 12 8.3 10.2 6 7.5 6 4.4 6 2 8.5 2 12s2.4 6 5.5 6c2.7 0 4.5-2.3 4.5-4.8 0 2.5 1.8 4.8 4.5 4.8 3.1 0 5.5-2.5 5.5-6s-2.4-6-5.5-6zm-9 9.6C5.6 15.6 4 14 4 12s1.6-3.6 3.5-3.6c1.8 0 3.1 1.7 3.1 3.6s-1.3 3.6-3.1 3.6zm9 0c-1.8 0-3.1-1.7-3.1-3.6s1.3-3.6 3.1-3.6 3.5 1.6 3.5 3.6-1.6 3.6-3.5 3.6z"/></svg>` 
    },
    "meta": { 
        name: "Meta Llama", 
        icon: "🦙", 
        color: "#0668E1", 
        logo: `<svg viewBox="0 0 24 24" width="22" height="22" fill="#0668E1"><path d="M16.5 6C13.8 6 12 8.3 12 10.8 12 8.3 10.2 6 7.5 6 4.4 6 2 8.5 2 12s2.4 6 5.5 6c2.7 0 4.5-2.3 4.5-4.8 0 2.5 1.8 4.8 4.5 4.8 3.1 0 5.5-2.5 5.5-6s-2.4-6-5.5-6zm-9 9.6C5.6 15.6 4 14 4 12s1.6-3.6 3.5-3.6c1.8 0 3.1 1.7 3.1 3.6s-1.3 3.6-3.1 3.6zm9 0c-1.8 0-3.1-1.7-3.1-3.6s1.3-3.6 3.1-3.6 3.5 1.6 3.5 3.6-1.6 3.6-3.5 3.6z"/></svg>` 
    },
    "mistralai": { 
        name: "Mistral AI", 
        icon: "🌪️", 
        color: "#f97316", 
        logo: `<svg viewBox="0 0 24 24" width="22" height="22" fill="#f97316"><path d="M3 3h4.5v4.5H3zm13.5 0H21v4.5h-4.5zM3 9.75h4.5v4.5H3zm6.75 0h4.5v4.5h-4.5zm6.75 0H21v4.5h-4.5zM3 16.5h18V21H3z"/></svg>` 
    },
    "qwen": { 
        name: "Qwen (Alibaba)", 
        icon: "🟣", 
        color: "#a855f7", 
        logo: `<svg viewBox="0 0 24 24" width="22" height="22" fill="#a855f7"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>` 
    },
    "alibaba": { 
        name: "Alibaba", 
        icon: "🟣", 
        color: "#a855f7", 
        logo: `<svg viewBox="0 0 24 24" width="22" height="22" fill="#a855f7"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>` 
    },
    "microsoft": { 
        name: "Microsoft", 
        icon: "🪟", 
        color: "#00a4ef", 
        logo: `<svg viewBox="0 0 24 24" width="22" height="22"><path fill="#f25022" d="M1 1h10v10H1z"/><path fill="#00a4ef" d="M1 13h10v10H1z"/><path fill="#7fba00" d="M13 1h10v10H13z"/><path fill="#ffb900" d="M13 13h10v10H13z"/></svg>` 
    },
    "cohere": { 
        name: "Cohere", 
        icon: "💠", 
        color: "#14b8a6", 
        logo: `<svg viewBox="0 0 24 24" width="22" height="22" fill="#14b8a6"><circle cx="7" cy="12" r="5"/><circle cx="17" cy="7" r="4"/><circle cx="16" cy="16" r="4.5"/></svg>` 
    },
    "perplexity": { 
        name: "Perplexity", 
        icon: "🔮", 
        color: "#22d3ee", 
        logo: `<svg viewBox="0 0 24 24" width="22" height="22" fill="#22d3ee"><path d="M12 2a10 10 0 100 20 10 10 0 000-20zm1 14.5h-2v-5h2v5zm0-7h-2V7h2v2.5z"/></svg>` 
    },
    "x-ai": { 
        name: "xAI (Grok)", 
        icon: "⚡", 
        color: "#e2e8f0", 
        logo: `<svg viewBox="0 0 24 24" width="22" height="22" fill="#e2e8f0"><path d="M18.24 2.25h3.31l-7.23 8.26 8.5 11.24h-6.65l-5.21-6.82L4.99 21.75H1.68l7.73-8.84L1.25 2.25h6.83l4.71 6.23zm-1.16 17.52h1.83L7.08 4.13H5.12z"/></svg>` 
    },
    "nvidia": { 
        name: "NVIDIA", 
        icon: "🟩", 
        color: "#76b900", 
        logo: `<svg viewBox="0 0 24 24" width="22" height="22" fill="#76b900"><path d="M4 12c0-4.4 3.6-8 8-8s8 3.6 8 8-3.6 8-8 8-8-3.6-8-8zm8-6c-3.3 0-6 2.7-6 6s2.7 6 6 6 6-2.7 6-6-2.7-6-6-6z"/></svg>` 
    },
    "amazon": { 
        name: "Amazon", 
        icon: "📦", 
        color: "#ff9900", 
        logo: `<svg viewBox="0 0 24 24" width="22" height="22" fill="#ff9900"><path d="M13.9 14.7c-2.4 1.8-6.1 2.7-9.1 2.7-4.3 0-8.2-1.6-11.2-4.3-.2-.2-.2-.6 0-.8.2-.2.6-.2.8 0 2.8 2.5 6.4 4 10.4 4 2.7 0 6.1-.8 8.3-2.4.3-.2.7-.1.9.2.2.2.1.7-.1.8z"/></svg>` 
    },
    "nousresearch": { 
        name: "Nous Research", 
        icon: "🧠", 
        color: "#f43f5e", 
        logo: `<svg viewBox="0 0 24 24" width="22" height="22" fill="#f43f5e"><circle cx="12" cy="12" r="10"/></svg>` 
    },
    "ollama": {
        name: "Ollama (محلي)",
        icon: "🦙",
        color: "#ffffff",
        logo: `<svg viewBox="0 0 24 24" width="22" height="22" fill="#ffffff"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>`
    },
    "lmstudio": {
        name: "LM Studio (محلي)",
        icon: "🧪",
        color: "#10b981",
        logo: `<svg viewBox="0 0 24 24" width="22" height="22" fill="#10b981"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 14l-5-5 1.41-1.41L12 14.17l7.59-7.59L21 8l-9 9z"/></svg>`
    },
    "local": {
        name: "نماذج محلية (GGUF)",
        icon: "📁",
        color: "#34d399",
        logo: `<svg viewBox="0 0 24 24" width="22" height="22" fill="#34d399"><path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>`
    },
    "huggingface": {
        name: "Hugging Face",
        icon: "🤗",
        color: "#ffd21e",
        logo: `<svg viewBox="0 0 24 24" width="22" height="22" fill="#ffd21e"><circle cx="12" cy="12" r="10"/></svg>`
    }
};

let currentLoadedModels = [];

// استخراج معلومات وشعار الشركة المنتجة للنموذج
function getCompanyInfo(modelId, provider) {
    if (!modelId) {
        return { 
            slug: "ai", 
            name: "الذكاء الاصطناعي", 
            icon: "🤖", 
            color: "#34d399", 
            logo: `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#34d399" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="2"/><circle cx="9" cy="9" r="2"/><path d="M15 9h.01M9 15h6"/></svg>` 
        };
    }

    const clean = modelId.toLowerCase();
    const slug = clean.split("/")[0].replace(/^~/, "");

    for (const [key, info] of Object.entries(AI_COMPANIES)) {
        if (slug === key || clean.startsWith(key + "/") || (provider && provider.toLowerCase() === key)) {
            return { slug: key, ...info };
        }
    }

    const prettyName = slug ? slug.charAt(0).toUpperCase() + slug.slice(1) : "مزود ذكاء اصطناعي";
    return {
        slug: slug || "other",
        name: prettyName,
        icon: "⚡",
        color: "#38bdf8",
        logo: `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#38bdf8" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>`
    };
}

// تحديث بطاقة شعار الشركة والنموذج المختار
function updateActiveModelCompanyBanner() {
    const select = document.getElementById("aiModelSelect");
    const modelId = select ? select.value : "";
    const provider = document.getElementById("aiProviderSelect")?.value || "openrouter";
    const info = getCompanyInfo(modelId, provider);

    const logoSlot = document.getElementById("companyLogoSlot");
    const nameEl = document.getElementById("companyProviderName");
    const titleEl = document.getElementById("activeModelFullTitle");

    if (logoSlot) {
        logoSlot.innerHTML = info.logo || `<span style="font-size: 1.3rem;">${info.icon}</span>`;
    }
    if (nameEl) {
        nameEl.innerText = info.name;
        nameEl.style.color = info.color || "#34d399";
    }
    if (titleEl) {
        titleEl.innerText = modelId || "لم يتم اختيار نموذج";
    }
}

let activeCompanyFilter = "all";

// فتح القائمة المنسدلة للنماذج
function openCustomModelDropdown() {
    const menu = document.getElementById("customModelDropdownMenu");
    if (!menu) return;
    menu.style.display = "flex";
    
    // إذا لم تكن القائمة مبنية بعد، يتم بناؤها
    const listEl = document.getElementById("customModelOptionsList");
    if (listEl && listEl.children.length === 0) {
        renderCustomModelDropdown();
    }

    setTimeout(() => {
        menu.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 60);
}

// إغلاق القائمة المنسدلة للنماذج
function closeCustomModelDropdown() {
    const menu = document.getElementById("customModelDropdownMenu");
    if (menu) menu.style.display = "none";
}

// التبديل بين فتح وإغلاق القائمة المنسدلة
function toggleCustomModelDropdown() {
    const menu = document.getElementById("customModelDropdownMenu");
    if (!menu) return;
    if (menu.style.display === "none" || !menu.style.display) {
        openCustomModelDropdown();
        document.getElementById("aiModelSearchInput")?.focus();
    } else {
        closeCustomModelDropdown();
    }
}

// اختيار شركة سريعة لتصفية النماذج
function selectCompanyFilterChip(slug) {
    activeCompanyFilter = slug || "all";
    
    // تحديث حالة الأزرار
    const chips = document.querySelectorAll(".quick-comp-chip");
    chips.forEach(chip => {
        if (chip.getAttribute("data-slug") === activeCompanyFilter) {
            chip.classList.add("active");
        } else {
            chip.classList.remove("active");
        }
    });

    filterCustomModelDropdown();
}

// تصفية النماذج في القائمة الحية فور الكتابة في حقل البحث أو تغيير زر الشركة
function filterCustomModelDropdown() {
    const q = (document.getElementById("aiModelSearchInput")?.value || "").trim().toLowerCase();
    const select = document.getElementById("aiModelSelect");
    const activeModelId = select ? select.value : "";
    const listEl = document.getElementById("customModelOptionsList");
    if (!listEl) return;

    // فلترة النماذج بحسب نص البحث والشركة المحددة
    const filtered = currentLoadedModels.filter(m => {
        const id = (m.id || "").toLowerCase();
        const name = (m.name || "").toLowerCase();
        const comp = (m.company || (m.id && m.id.includes("/") ? m.id.split("/")[0] : "")).toLowerCase();

        // فلترة الشركة
        if (activeCompanyFilter !== "all") {
            const matchesComp = comp === activeCompanyFilter.toLowerCase() || 
                                id.startsWith(activeCompanyFilter.toLowerCase() + "/");
            if (!matchesComp) return false;
        }

        // فلترة نص البحث
        if (q) {
            return id.includes(q) || name.includes(q) || comp.includes(q);
        }
        return true;
    });

    // تحديث شارة العداد
    const badge = document.getElementById("aiModelCountBadge");
    if (badge) {
        if (q || activeCompanyFilter !== "all") {
            badge.innerText = `${filtered.length} من ${currentLoadedModels.length}`;
        } else {
            badge.innerText = `${currentLoadedModels.length} نموذجاً`;
        }
    }

    listEl.innerHTML = "";

    if (filtered.length === 0) {
        listEl.innerHTML = `
            <div style="padding: 1.5rem; text-align: center; color: #94a3b8; font-size: 0.82rem;">
                <div style="font-size: 1.5rem; margin-bottom: 0.35rem;">🔍</div>
                لا توجد نماذج مطابقة للبحث الحالي
            </div>
        `;
        return;
    }

    // تجميع النماذج حسب الشركة المنتجة (Grouping by Company)
    const groups = {};
    filtered.forEach(m => {
        const compSlug = m.company || (m.id.includes("/") ? m.id.split("/")[0].replace(/^~/, "") : "other");
        if (!groups[compSlug]) {
            groups[compSlug] = [];
        }
        groups[compSlug].push(m);
    });

    // فرز الشركات أبجدياً
    const sortedSlugs = Object.keys(groups).sort((a, b) => {
        const nameA = (AI_COMPANIES[a]?.name || a).toLowerCase();
        const nameB = (AI_COMPANIES[b]?.name || b).toLowerCase();
        return nameA.localeCompare(nameB);
    });

    sortedSlugs.forEach(slug => {
        const compInfo = getCompanyInfo(slug + "/test", slug);
        
        // رأس المجموعة للشركة
        const header = document.createElement("div");
        header.className = "model-group-header";
        header.innerHTML = `
            <span>${compInfo.icon} ${compInfo.name}</span>
            <span style="font-size: 0.68rem; opacity: 0.8; font-weight: normal;">${groups[slug].length} نموذج</span>
        `;
        listEl.appendChild(header);

        // فرز النماذج أبجدياً داخل كل شركة
        groups[slug].sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id));

        groups[slug].forEach(m => {
            const isSelected = m.id === activeModelId;
            const row = document.createElement("div");
            row.className = `custom-model-option-row ${isSelected ? "selected" : ""}`;
            row.setAttribute("data-model-id", m.id);

            // حساب نافذة السياق
            let ctxBadgeHtml = "";
            if (m.context_length) {
                const kVal = Math.round(m.context_length / 1024);
                ctxBadgeHtml = `<span class="model-ctx-badge">${kVal}K</span>`;
            }

            // شعار النموذج
            const modelComp = getCompanyInfo(m.id, m.company);
            const logoSvg = modelComp.logo || `<span style="font-size: 1rem;">${modelComp.icon}</span>`;

            row.innerHTML = `
                <div class="model-row-left">
                    <div class="model-row-logo">${logoSvg}</div>
                    <div class="model-row-info">
                        <div class="model-row-name">${escapeHtml(m.name || m.id)}</div>
                        <div class="model-row-id" dir="ltr">${escapeHtml(m.id)}</div>
                    </div>
                </div>
                <div class="model-row-right">
                    ${ctxBadgeHtml}
                    ${isSelected ? '<span class="model-check-icon">✓</span>' : ''}
                </div>
            `;

            row.onclick = () => selectCustomModel(m.id);
            listEl.appendChild(row);
        });
    });
}

// اختيار نموذج من القائمة المنسدلة
function selectCustomModel(modelId) {
    const select = document.getElementById("aiModelSelect");
    if (select) {
        select.value = modelId;
    }

    const searchInput = document.getElementById("aiModelSearchInput");
    if (searchInput) {
        searchInput.value = "";
        searchInput.placeholder = `✓ ${modelId}`;
    }

    closeCustomModelDropdown();
    updateActiveModelCompanyBanner();
    saveAiSettings();
    updateChatHeaderBadges();

    // تحديث شارة العداد وإعادة فلترة القائمة المنسدلة لتمييز العنصر المختار
    filterCustomModelDropdown();
    showToast(`✓ تم اختيار النموذج: ${modelId}`);
}

// بناء وتصنيف خيارات قائمة النماذج وبناء أزرار الشركات السريعة
function renderCustomModelDropdown(preferredSelection = null) {
    const select = document.getElementById("aiModelSelect");
    const currentVal = preferredSelection || (select ? select.value : "");

    // 1. مزامنة القائمة الأصلية <select>
    if (select) {
        select.innerHTML = "";
        currentLoadedModels.forEach(m => {
            const opt = document.createElement("option");
            opt.value = m.id;
            opt.textContent = m.name || m.id;
            if (currentVal && m.id === currentVal) {
                opt.selected = true;
            }
            select.appendChild(opt);
        });
        if (currentVal && !select.value) {
            select.value = currentVal;
        }
    }

    // 2. بناء أزرار التصفية السريعة للشركات في ترويسة القائمة
    const chipsContainer = document.getElementById("modelQuickCompanyChips");
    if (chipsContainer) {
        chipsContainer.innerHTML = "";

        // زر الكل
        const allBtn = document.createElement("button");
        allBtn.type = "button";
        allBtn.className = `quick-comp-chip ${activeCompanyFilter === "all" ? "active" : ""}`;
        allBtn.setAttribute("data-slug", "all");
        allBtn.innerText = "🌐 الكل";
        allBtn.onclick = () => selectCompanyFilterChip("all");
        chipsContainer.appendChild(allBtn);

        // حساب الشركات المتوفرة
        const compCounts = {};
        currentLoadedModels.forEach(m => {
            const slug = m.company || (m.id.includes("/") ? m.id.split("/")[0].replace(/^~/, "") : "other");
            compCounts[slug] = (compCounts[slug] || 0) + 1;
        });

        // ترتيب الشركات حسب الأكثر شيوعاً أو أبجدياً
        const sortedCompKeys = Object.keys(compCounts).sort((a, b) => compCounts[b] - compCounts[a]);

        sortedCompKeys.forEach(slug => {
            const comp = getCompanyInfo(slug + "/test", slug);
            const chip = document.createElement("button");
            chip.type = "button";
            chip.className = `quick-comp-chip ${activeCompanyFilter === slug ? "active" : ""}`;
            chip.setAttribute("data-slug", slug);
            chip.innerText = `${comp.icon} ${comp.name} (${compCounts[slug]})`;
            chip.onclick = () => selectCompanyFilterChip(slug);
            chipsContainer.appendChild(chip);
        });
    }

    // 3. تحديث placeholder حقل البحث
    const searchInput = document.getElementById("aiModelSearchInput");
    if (searchInput) {
        const activeM = select?.value;
        if (activeM) {
            searchInput.placeholder = `✓ ${activeM}`;
        }
    }

    // 4. بناء القائمة المنسدلة الحية
    filterCustomModelDropdown();
    updateActiveModelCompanyBanner();
}

// دالة متوافقة مع الاستدعاءات القديمة
function renderModelSelectOptions(filterText = "", preferredSelection = null) {
    renderCustomModelDropdown(preferredSelection);
}

// تصفية النماذج عند إدخال نص البحث
function filterAiModelsList() {
    filterCustomModelDropdown();
}

// عند تغيير النموذج المختار في القائمة المنسدلة
function onModelSelectChanged() {
    updateActiveModelCompanyBanner();
    saveAiSettings();
    updateChatHeaderBadges();
    filterCustomModelDropdown();
}

// تعبئة قائمة النماذج الافتراضية بحسب المزود
function populateDefaultModels(provider, selectedModel) {
    const list = DEFAULT_PROVIDER_MODELS[provider] || [];
    currentLoadedModels = list.map(m => ({
        id: m.id,
        name: m.name,
        company: m.id.includes("/") ? m.id.split("/")[0] : provider
    }));

    if (selectedModel && !currentLoadedModels.some(m => m.id === selectedModel)) {
        currentLoadedModels.unshift({
            id: selectedModel,
            name: `${selectedModel} (مخصص)`,
            company: selectedModel.includes("/") ? selectedModel.split("/")[0] : provider
        });
    }

    renderCustomModelDropdown(selectedModel);
}

// إغلاق القائمة المنسدلة عند النقر خارجها
document.addEventListener("click", function (e) {
    const container = document.getElementById("customModelDropdownContainer");
    if (container && !container.contains(e.target)) {
        closeCustomModelDropdown();
    }
});

// التبديل بين أقسام الإعدادات في الشريط الجانبي
function switchSettingsSection(section) {
    const btns = document.querySelectorAll(".set-tab-btn");
    let activeBtn = null;
    btns.forEach(b => {
        if (b.getAttribute("data-tab") === section) {
            b.classList.add("active");
            activeBtn = b;
        } else {
            b.classList.remove("active");
        }
    });

    if (activeBtn) {
        try {
            activeBtn.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
        } catch (_) {}
    }

    const wrapper = document.getElementById("settingsCardsWrapper");
    if (!wrapper) return;

    const cards = wrapper.querySelectorAll(".settings-card");
    if (section === "all") {
        cards.forEach(c => c.style.display = "block");
        wrapper.scrollTop = 0;
    } else {
        cards.forEach(c => {
            if (c.classList.contains(`section-${section}`)) {
                c.style.display = "block";
            } else {
                c.style.display = "none";
            }
        });
        wrapper.scrollTop = 0;
    }
}

// عند تغيير مزود الذكاء الاصطناعي
function onAiProviderChanged() {
    const provider = document.getElementById("aiProviderSelect")?.value || "openrouter";
    syncLocalEndpointVisibility(provider);
    populateDefaultModels(provider);
    saveAiSettings();
    updateChatHeaderBadges();
    showToast(`تم التبديل إلى مزود: ${provider.toUpperCase()}`);
}

// جلب النماذج الحية عبر API المزود (استيعاب كامل النماذج الـ 458+ مع الترتيب والتصفية والشعارات)
async function fetchLiveModels() {
    const provider = document.getElementById("aiProviderSelect")?.value || "openrouter";
    let apiKey = document.getElementById("aiApiKeyInput")?.value?.trim() || "";
    let endpoint = document.getElementById("aiEndpointUrlInput")?.value?.trim() || "";
    const btn = document.querySelector(".btn-fetch-models");

    if (provider === "lmstudio") {
        if (!apiKey) apiKey = localStorage.getItem("shamela_lmstudio_api_token") || "sk-lm-ARRMdEDr:nh1GuNwgHu4MpvOKefRu";
        if (!endpoint) endpoint = localStorage.getItem("shamela_lmstudio_endpoint") || "http://192.168.100.134:1234";
    } else if (provider === "local") {
        const localDir = document.getElementById("aiLocalModelsDirInput")?.value?.trim();
        if (localDir) endpoint = localDir;
    }

    if (btn) btn.innerHTML = "⏳ جاري الفحص...";
    try {
        let url = `/api/ai/models?provider=${encodeURIComponent(provider)}`;
        if (apiKey) url += `&api_key=${encodeURIComponent(apiKey)}`;
        if (endpoint) url += `&endpoint_url=${encodeURIComponent(endpoint)}`;

        const res = await fetch(url);
        const data = await res.json();

        if (data.status === "error") {
            throw new Error(data.message || "تعذر جلب النماذج من المزود");
        }

        const models = data.models || [];
        if (models.length === 0) {
            if (provider === "lmstudio") {
                showToast("ℹ️ تم الاتصال بـ LM Studio بنجاح، لكن لم يتم تحميل أي نموذج بعد داخل واجهة التطبيق.");
            } else if (provider === "local") {
                showToast("ℹ️ لم يتم العثور على نماذج (.gguf) في مجلد models/. ضع أي ملف نموذج هناك ثم أعد الفحص.");
            } else {
                showToast("لم يتم العثور على نماذج إضافية، تم الإبقاء على النماذج الحالية");
            }
            return;
        }

        const select = document.getElementById("aiModelSelect");
        const prevVal = select ? select.value : null;

        currentLoadedModels = models.map(m => {
            if (typeof m === "string") {
                return {
                    id: m,
                    name: m,
                    company: m.includes("/") ? m.split("/")[0] : provider
                };
            }
            return {
                id: m.id || m.name,
                name: m.name || m.id,
                company: m.company || (m.id && m.id.includes("/") ? m.id.split("/")[0] : provider),
                context_length: m.context_length
            };
        });

        // إذا كان المزود LM Studio أو Local، نحدث أيضاً الكاش العام للنماذج المساعدة
        if (provider === "lmstudio") {
            allOpenRouterModelsCache = allOpenRouterModelsCache.filter(m => m.company !== "lmstudio");
            currentLoadedModels.forEach(m => {
                allOpenRouterModelsCache.unshift(m);
            });
        } else if (provider === "local") {
            allOpenRouterModelsCache = allOpenRouterModelsCache.filter(m => m.company !== "local");
            currentLoadedModels.forEach(m => {
                allOpenRouterModelsCache.unshift(m);
            });
        }

        // تصفير حقل البحث والفلترة وعرض كافة النماذج
        const searchInput = document.getElementById("aiModelSearchInput");
        if (searchInput) searchInput.value = "";
        activeCompanyFilter = "all";

        renderModelSelectOptions("", prevVal);

        const successMsg = provider === "local" 
            ? `✓ تم اكتشاف ${currentLoadedModels.length} نموذج محلي في مجلد models/ بنجاح` 
            : `✓ تم جلب ${currentLoadedModels.length} نموذجاً بنجاح وترتيبها أبجدياً حسب الشركة`;
        showToast(successMsg);
        saveAiSettings();
    } catch (e) {
        console.error("fetchLiveModels error:", e);
        showToast(`تنبيه: ${e.message}`);
    } finally {
        if (btn) btn.innerHTML = "🔄 جلب النماذج من المزود";
    }
}

// إدراج نموذج JSON فقهي افتراضي
function insertDefaultJsonSchema() {
    const textarea = document.getElementById("aiStructuredFormat");
    if (textarea) {
        const schema = {
            "المسألة": "عنوان المسألة الفقهية",
            "صورة_المسألة": "تصوير المسألة وبيان واقعها وحقيقتها بدقة",
            "تحرير_محل_النزاع": "موضع الاتفاق ومحل النزاع بين العلماء",
            "سبب_الخلاف": "العلة الأصولية أو الفقهية أو الحديثية لنشوء الخلاف",
            "الأقوال_في_المسألة": "عرض تفصيلي لأقوال المذاهب الفقهية الأربعة مع نسبة كل قول لقائليه",
            "الأدلة": "سرد ومناقشة أدلة كل مذهب من نصوص الشاملة المرفقة تفصيلاً",
            "القول_الراجح": "الترجيح المدعوم بالدليل وعلة الترجيح والتعليل المقاصدي",
            "الحاشية": "(١) تخريج الآثار وتوثيق الأجزاء والصفحات من كتب الشاملة بدقة...\n(٢) توثيق المرجع الثاني...",
            "المصادر_والمراجع": "١. اسم الكتاب الأول - المؤلف.\n٢. اسم الكتاب الثاني - المؤلف."
        };
        textarea.value = JSON.stringify(schema, null, 2);
        saveAiSettings();
        showToast("✓ تم إدراج نموذج الهيكلة الفقهية الشامل (JSON Schema)");
    }
}

// ==================== إدارة هيكلة بيانات قالب CraftMyPDF ====================

// الحصول على عينة JSON الافتراضية لقالب CraftMyPDF
function getDefaultCraftSchemaJson() {
    const sample = {
        "title": "مسألة بيع العينة وحكمها الفقهي المقارن",
        "المسألة": "مسألة بيع العينة وحكمها الفقهي المقارن",
        "صورة_المسألة": "أن يبيع شخص سلعة بثمن مؤجل ثم يشتريها من المشتري بثمن حاضر أقل مما باعها به نقدًا.",
        "تحرير_محل_النزاع": "اتفق الفقهاء على تحريم التحايل على الربا، واختلفوا في صحة هذا العقد وصوره الملحقة به.",
        "سبب_الخلاف": "تردد العقد بين التمسك بظاهر اللفظ وصحة البيعين منفصلين، وبين النظر إلى حقيقة القصد والذريعة إلى الربا.",
        "الأقوال_في_المسألة": "تفصيل أقوال المذاهب الفقهية الأربعة مع نسبة كل قول لقائليه بدقة.",
        "الأدلة": "أدلة الأقوال ومناقشتها من نصوص التراث.",
        "الترجيح": "القول الراجح وعلة الترجيح وخاتمة التحقيق.",
        "الحواشي": "توثيق النقول وتخريج الآثار بأرقام الهوامش.",
        "المراجع": "قائمة المصادر والمراجع التراثية المعتمدة.",
        "date": "2026-09-30",
        "date_ar": "٢٠٢٦/٠٩/٣٠",
        "hijri_date": "١٤٤٧ هـ",
        "footnotes_list": [
            { "index": 1, "num": "1", "text": "توثيق الهامش والتخريج", "content": "نص التخريج" }
        ],
        "items": [
            { "index": 1, "title": "اسم الكتاب المعتمد", "author": "المؤلف", "volume": "1", "page": "100" }
        ]
    };
    return JSON.stringify(sample, null, 2);
}

// استعادة الهيكلة الافتراضية لقالب CraftMyPDF
function resetDefaultCraftSchema() {
    const ta = document.getElementById("craftCustomDataSchema");
    if (!ta) return;
    ta.value = getDefaultCraftSchemaJson();
    onCraftSchemaChanged(true);
    showToast("✓ تم استعادة هيكلة الـ JSON الافتراضية لقالب CraftMyPDF");
}

// تنسيق وتجميل كود JSON
function formatCraftSchemaJson() {
    const ta = document.getElementById("craftCustomDataSchema");
    if (!ta) return;
    const raw = ta.value.trim();
    if (!raw) return;
    try {
        const parsed = JSON.parse(raw);
        ta.value = JSON.stringify(parsed, null, 2);
        onCraftSchemaChanged(true);
        showToast("✓ تم تنسيق كود JSON بنجاح");
    } catch (e) {
        showToast("⚠️ كود الـ JSON غير صالح، يرجى مراجعة إغلاق الأقواس");
    }
}

// لصق من الحافظة مباشرة
async function pasteCraftSchemaFromClipboard() {
    const ta = document.getElementById("craftCustomDataSchema");
    if (!ta) return;
    try {
        const text = await navigator.clipboard.readText();
        if (text && text.trim()) {
            ta.value = text.trim();
            onCraftSchemaChanged(true);
            showToast("✓ تم لصق هيكلة القالب من الحافظة بنجاح");
            return;
        }
    } catch (e) {
        // متصفحات تمنع الوصول التلقائي للحافظة
    }
    const manual = prompt("الصق هيكلة الـ JSON المنسوخة من تبويب Data في CraftMyPDF:");
    if (manual && manual.trim()) {
        ta.value = manual.trim();
        onCraftSchemaChanged(true);
        showToast("✓ تم إدراج هيكلة القالب بنجاح");
    }
}

// تدقيق كود الـ JSON وعرض حالة الحقول
function onCraftSchemaChanged(shouldSave = true) {
    if (shouldSave) saveAiSettings();
    const ta = document.getElementById("craftCustomDataSchema");
    const hint = document.getElementById("craftSchemaStatusHint");
    if (!ta || !hint) return;

    const val = ta.value.trim();
    if (!val) {
        hint.innerHTML = "💡 الصق هيكلة كائن الـ JSON كما هي مباشرة من تبويب <code>Data</code> في قالبك بـ CraftMyPDF.";
        hint.style.color = "#94a3b8";
        return;
    }

    try {
        const parsed = JSON.parse(val);
        const keysCount = typeof parsed === "object" && parsed !== null ? Object.keys(parsed).length : 0;
        hint.innerHTML = `<span style="color: #34d399; font-weight: 700;">✓ هيكلة JSON صالحة (${keysCount} حقول رئيسية معرّفة).</span> سيتم ملء الحقول تلقائياً ببيانات البحث عند التصدير.`;
    } catch (e) {
        const errShort = e.message.split(":")[0];
        hint.innerHTML = `<span style="color: #f87171; font-weight: 700;">⚠️ تنبيه: خطأ في صياغة الـ JSON (${errShort}).</span> يرجى التأكد من إغلاق الأقواس والفواصل.`;
    }
}

function setSystemPreset(preset) {
    const sysInput = document.getElementById("aiSystemPrompt");
    if (!sysInput) return;

    if (preset === "muhaqqiq") {
        sysInput.value = "أنت باحث شرعي ومحقق تراثي متخصص، تجيب بالاعتماد الصارم والدقيق على نصوص المكتبة الشاملة المرفقة بالسياق، وتذكر اسم الكتاب والمؤلف ورقم الجزء والصفحة والحواشي بكل وضوح وتوثيق علمي رصين.";
    } else if (preset === "muqaran") {
        sysInput.value = "أنت فقيه مقارن، استعرض أقوال أئمة المذاهب الأربعة (الحنفي، المالكي، الشافعي، الحنبلي) من واقع نصوص الشاملة، مع بيان أدلة كل مذهب ومناقشتها وترجيح ما يقتضيه الدليل الموثق مع العزو المكتبي.";
    } else if (preset === "hadith") {
        sysInput.value = "أنت محدث ومخرج أسانيد، استخرج طرق الحديث وألفاظه، وحكم الأئمة المتقدمين عليه، مع توثيق المصادر من كتب السنن والصحاح والمسانيد مع بيان الجزء والصفحة.";
    }
    saveAiSettings();
    showToast("✓ تم تطبيق القالب المختار لتعليمات النظام");
}

// وضع سؤال سريع في صندوق الإدخال
function setAiPrompt(text) {
    const input = document.getElementById("aiInputText");
    if (input) {
        input.value = text;
        input.focus();
        input.style.height = "auto";
        input.style.height = Math.min(input.scrollHeight, 180) + "px";
    }
}

// إظهار/إخفاء مفتاح API
function toggleApiKeyVisibility() {
    const inp = document.getElementById("aiApiKeyInput");
    if (inp) {
        inp.type = inp.type === "password" ? "text" : "password";
    }
}

// مسح محادثة الذكاء الاصطناعي
function clearAiChat() {
    if (confirm("هل تريد مسح محادثة التحقيق الحالية والبدء من جديد؟")) {
        aiChatHistory = [];
        const container = document.getElementById("chatMessagesContainer");
        container.innerHTML = `
            <div class="chat-message assistant-message">
                <div class="msg-avatar">🤖</div>
                <div class="msg-body">
                    <div class="msg-author">المحقق الذكي لمكتبة الشاملة</div>
                    <div class="msg-content">
                        مرحباً بك! تم مسح المحادثة السابقة. يمكنك البدء بسؤال فقهي أو استفسار تراثي جديد.
                    </div>
                </div>
            </div>
        `;
        showToast("تم مسح المحادثة بنجاح");
    }
}

// إرسال رسالة الذكاء الاصطناعي
async function handleAiChatSubmit(e) {
    if (e) e.preventDefault();

    const textarea = document.getElementById("aiInputText");
    const prompt = textarea.value.trim();
    if (!prompt) return;

    const provider = document.getElementById("aiProviderSelect")?.value || "openrouter";
    const apiKey = document.getElementById("aiApiKeyInput")?.value?.trim() || "";
    const endpointUrl = document.getElementById("aiEndpointUrlInput")?.value?.trim() || "";
    const customModel = document.getElementById("aiCustomModelInput")?.value?.trim() || "";
    const selectedModel = document.getElementById("aiModelSelect")?.value || "";
    const model = customModel || selectedModel;

    if (!apiKey && provider !== "ollama" && provider !== "lmstudio") {
        alert("يرجى إدخال مفتاح API Key في بطاقة الإعدادات الجانبية للبدء بالتواصل مع النموذج.");
        document.getElementById("aiApiKeyInput").focus();
        return;
    }

    if (!model) {
        alert("يرجى تحديد النموذج في لوحة الإعدادات الجانبية.");
        return;
    }

    // إضافة رسالة المستخدم في الشات
    appendChatMessage({
        role: "user",
        content: prompt
    });

    textarea.value = "";
    textarea.style.height = "auto";

    // إظهار مؤشر المعالجة والانتظار
    const typingIndicator = document.getElementById("chatTypingIndicator");
    const typingText = document.getElementById("chatTypingText");
    const sendBtn = document.getElementById("aiSendBtn");
    const ragEnabled = document.getElementById("aiRagEnabled")?.checked ?? true;
    const reformulateEnabled = document.getElementById("aiReformulateQuery")?.checked ?? true;
    const iterativeEnabled = document.getElementById("aiIterativeResearch")?.checked ?? true;
    const maxHops = parseInt(document.getElementById("aiMaxHopsSelect")?.value || "2");

    // التحقق من تشغيل بايبلاين النماذج المساعدة
    const activeAssistants = (assistantsList || []).filter(a => a.enabled);
    const usePipeline = isPipelineEnabled && activeAssistants.length > 0;

    let typingTimer = null;
    if (typingIndicator) {
        typingIndicator.style.display = "flex";
        if (typingText) {
            if (usePipeline) {
                const stages = [
                    "🚀 جاري تفكيك المسألة وتوزيع المهام على النماذج المساعدة...",
                    "⚡ جاري تشغيل المساعدين المتخصصين بالتوازي واسترجاع كتبهم...",
                    "📖 المساعد [سيبويه]: استخلاص المعاجم واللغويات وغريب الحديث...",
                    "📜 المساعد [البخاري]: تخريج الأحاديث وبيان عللها ورواياتها...",
                    "⚖️ المساعد [الفقيه]: تحرير المذهب والأدلة وتفريع المسألة...",
                    "🔄 جاري فحص النواقص والعجز التكميلي وسد الثغرات...",
                    "✨ جاري الصياغة والتأليف والتحقيق النهائي الموحد..."
                ];
                let stageIdx = 0;
                typingText.innerText = stages[stageIdx];
                typingTimer = setInterval(() => {
                    stageIdx = (stageIdx + 1) % stages.length;
                    typingText.innerText = stages[stageIdx];
                }, 3000);
            } else if (iterativeEnabled) {
                const stages = [
                    "جاري تحليل السؤال وصياغته بالمصطلحات الفقهية والتراثية...",
                    "جاري استرجاع نصوص الشاملة والتحقق من أقوال الفقهاء...",
                    "جاري فحص المسألة ورصد النواقص وتخريج الأحاديث (بحث تكميلي)...",
                    "جاري سد النواقص من مصادر التراث المعتمَدة...",
                    "جاري تدقيق المسألة وصياغة الحكم والترجيح النهائي..."
                ];
                let stageIdx = 0;
                typingText.innerText = stages[stageIdx];
                typingTimer = setInterval(() => {
                    stageIdx = (stageIdx + 1) % stages.length;
                    typingText.innerText = stages[stageIdx];
                }, 3500);
            } else if (reformulateEnabled) {
                typingText.innerText = "جاري صياغة السؤال فقهياً والبحث في الشاملة...";
            } else {
                typingText.innerText = ragEnabled 
                    ? "جاري البحث في قاعدة بيانات الشاملة وتوليد التحقيق العلمي..." 
                    : "جاري التواصل مع نموذج الذكاء الاصطناعي وتوليد الإجابة...";
            }
        }
    }
    if (sendBtn) sendBtn.disabled = true;

    const clearTyping = () => {
        if (typingTimer) {
            clearInterval(typingTimer);
            typingTimer = null;
        }
        if (typingIndicator) typingIndicator.style.display = "none";
        if (sendBtn) sendBtn.disabled = false;
    };

    // تجميع المعلمات
    const catId = document.getElementById("aiCategorySelect").value;
    const structuredEnabled = document.getElementById("aiStructuredEnabled").checked;
    const structuredFormat = structuredEnabled ? document.getElementById("aiStructuredFormat").value.trim() : null;

    // بناء سجل المحادثة للنموذج
    const conversationMessages = [];
    aiChatHistory.forEach(item => {
        if (item.prompt) {
            conversationMessages.push({ role: "user", content: item.prompt });
        }
        if (item.content) {
            conversationMessages.push({ role: "assistant", content: item.content });
        }
    });
    conversationMessages.push({ role: "user", content: prompt });

    try {
        const aiUseReranker = document.getElementById("aiUseRerankerToggle") ? document.getElementById("aiUseRerankerToggle").checked : true;
        let res;
        if (usePipeline) {
            const savedCloudKey = localStorage.getItem("shamela_openrouter_api_key") || "";
            const effectiveCloudKey = (apiKey && apiKey.startsWith("sk-or-")) ? apiKey : (savedCloudKey || apiKey);
            const pipelinePayload = {
                query: prompt,
                api_key: apiKey || effectiveCloudKey,
                cloud_api_key: effectiveCloudKey,
                openrouter_api_key: effectiveCloudKey,
                provider: provider,
                endpoint_url: endpointUrl,
                base_url: endpointUrl,
                main_model: model,
                main_system_prompt: document.getElementById("aiSystemPrompt").value.trim(),
                main_temperature: parseFloat(document.getElementById("aiTemperature").value) || 0.3,
                main_max_tokens: parseInt(document.getElementById("aiMaxTokens").value) || 8000,
                assistants: activeAssistants,
                enable_gap_fill: pipelineGapFillEnabled,
                collection_name: document.getElementById("aiRagCollectionSelect")?.value || document.getElementById("collectionSelect")?.value || "badr_all_tsh_corpus",
                structured_format: structuredFormat || null,
                use_reranker: aiUseReranker,
                reranker_model: document.getElementById("aiRerankerModelSelect")?.value || "BAAI/bge-reranker-v2-m3",
                reranker_limit: parseInt(document.getElementById("aiRerankerLimitSelect")?.value) || 10
            };
            res = await fetch("/api/ai/pipeline", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(pipelinePayload)
            });
        } else {
            const payload = {
                provider: provider,
                api_key: apiKey,
                endpoint_url: endpointUrl,
                base_url: endpointUrl,
                model: model,
                prompt: prompt,
                messages: conversationMessages,
                system_prompt: document.getElementById("aiSystemPrompt").value.trim(),
                temperature: parseFloat(document.getElementById("aiTemperature").value) || 0.3,
                repetition_penalty: parseFloat(document.getElementById("aiRepPenalty").value) || 0.0,
                max_tokens: parseInt(document.getElementById("aiMaxTokens").value) || 6000,
                structured_format: structuredFormat || null,
                structured_output: structuredFormat || null,
                rag_enabled: ragEnabled,
                use_rag: ragEnabled,
                rag_query: prompt,
                rag_limit: parseInt(document.getElementById("aiRagLimitSelect").value) || 5,
                rag_mode: document.getElementById("aiRagModeSelect").value || "hybrid",
                collection_name: document.getElementById("aiRagCollectionSelect")?.value || document.getElementById("collectionSelect")?.value || "badr_all_tsh_corpus",
                category_id: catId ? parseInt(catId) : null,
                book_titles: Array.from(selectedBookTitles),
                selected_books: Array.from(selectedBookTitles),
                reformulate_query: reformulateEnabled,
                iterative_research: iterativeEnabled,
                max_research_hops: maxHops,
                use_reranker: aiUseReranker,
                reranker_model: document.getElementById("aiRerankerModelSelect")?.value || "BAAI/bge-reranker-v2-m3",
                reranker_limit: parseInt(document.getElementById("aiRerankerLimitSelect")?.value) || 10,
                // معلمات أدوات التحقيق الشرعي (MCP)
                mcp_enabled: document.getElementById("aiMcpEnabled")?.checked ?? true,
                mcp_mode: document.getElementById("aiMcpModeSelect")?.value || "autonomous",
                mcp_reformulate: document.getElementById("aiMcpReformulateQuery")?.checked ?? true,
                mcp_iterative: document.getElementById("aiMcpIterativeResearch")?.checked ?? true,
                mcp_max_hops: parseInt(document.getElementById("aiMcpMaxHopsSelect")?.value) || 2,
                mcp_limit: parseInt(document.getElementById("aiMcpLimitSelect")?.value) || 20,
                mcp_use_reranker: document.getElementById("aiMcpUseRerankerToggle")?.checked ?? true,
                mcp_reranker_model: document.getElementById("aiMcpRerankerModelSelect")?.value || "BAAI/bge-reranker-v2-m3",
                mcp_reranker_limit: parseInt(document.getElementById("aiMcpRerankerLimitSelect")?.value) || 10,
                mcp_category_id: document.getElementById("aiMcpCategorySelect")?.value || null,
                mcp_book_filter: document.getElementById("aiMcpBookFilterInput")?.value || "",
                mcp_active_tools: Array.from(document.querySelectorAll(".mcp-tool-chk:checked")).map(c => c.value)
            };
            res = await fetch("/api/ai/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
        }
        let data;
        const contentType = res.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
            data = await res.json().catch(() => ({ status: "error", detail: "تعذر قراءة رد الخادم بتنسيق JSON" }));
        } else {
            const rawText = await res.text();
            data = { status: "error", detail: rawText || `خطأ في استجابة الخادم (كود ${res.status})` };
        }
        clearTyping();

        if (!res.ok || data.status === "error") {
            let errMsg = data.detail || data.message || data.error || "تعذر الحصول على رد من مزود الذكاء الاصطناعي";
            if (typeof errMsg === "object") {
                if (Array.isArray(errMsg)) {
                    errMsg = errMsg.map(e => {
                        const loc = e.loc ? e.loc.filter(l => l !== 'body').join('.') : '';
                        return (loc ? loc + ': ' : '') + (e.msg || JSON.stringify(e));
                    }).join(' | ');
                } else {
                    errMsg = errMsg.message || errMsg.error || JSON.stringify(errMsg, null, 2);
                }
            }
            appendChatMessage({
                role: "assistant",
                content: `⚠️ **حدث خطأ أثناء التواصل مع النموذج:**\n\n\`${errMsg}\`\n\nتأكد من صحة الـ API Key وصلاحية الوصول للنموذج المختار.`
            });
            return;
        }

        const replyContent = data.answer || data.reply || "";
        const msgObj = {
            role: "assistant",
            content: replyContent,
            sources: data.sources || [],
            prompt: prompt,
            model: data.model_used || data.stats?.main_model || model,
            pipeline_flow: data.pipeline_flow || null,
            reformulated_query: data.reformulated_query || null,
            supplementary_rounds: data.supplementary_rounds || [],
            finish_reason: data.finish_reason || null
        };

        aiChatHistory.push(msgObj);
        appendChatMessage(msgObj, aiChatHistory.length - 1);

    } catch (e) {
        clearTyping();
        const errText = e && (e.message || String(e)) ? (e.message || String(e)) : "خطأ غير متوقع";
        appendChatMessage({
            role: "assistant",
            content: `⚠️ **تعذر إكمال الطلب:** ${errText}`
        });
    }
}

// متابعة إكمال توليد الإجابة عند انقطاع الرد لبلوغ سقف المخرجات
function continueAiGeneration() {
    const input = document.getElementById("aiInputText");
    if (!input) return;
    input.value = "أكمل الإجابة من حيث توقفت تماماً دون تكرار أي نصوص سابقة، واستوفِ بقية الأقسام والترجيح وقائمة المراجع كاملة.";
    const sendBtn = document.getElementById("aiSendBtn");
    if (sendBtn) {
        sendBtn.click();
    } else {
        document.getElementById("aiChatForm")?.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
    }
}

// عرض رسالة في الشات
function appendChatMessage(msg, historyIndex) {
    const container = document.getElementById("chatMessagesContainer");
    if (!container) return;

    const isUser = msg.role === "user";
    const msgEl = document.createElement("div");
    msgEl.className = `chat-message ${isUser ? 'user-message' : 'assistant-message'}`;

    if (isUser) {
        msgEl.innerHTML = `
            <div class="msg-avatar">👤</div>
            <div class="msg-body">
                <div class="msg-author">أنت (الباحث)</div>
                <div class="msg-content">${escapeHtml(msg.content).replace(/\n/g, '<br>')}</div>
            </div>
        `;
    } else {
        // رسالة المساعد
        // عرض محتوى رسالة المساعد مع دعم استخراج البطاقات الفقهية المهيكلة ونصوص الترجيح الصافية
        let renderedHtml = renderAssistantContent(msg.content);

        // مسار البحث والتدقيق التكميلي
        let researchTrailHtml = "";
        const hasReformulated = Boolean(msg.reformulated_query && msg.reformulated_query.trim() !== (msg.prompt || "").trim());
        const hasSupplementary = Boolean(msg.supplementary_rounds && msg.supplementary_rounds.length > 0);

        if (hasReformulated || hasSupplementary) {
            const roundsCount = (msg.supplementary_rounds ? msg.supplementary_rounds.length : 0) + 1;
            researchTrailHtml = `
                <div class="chat-research-trail-box open">
                    <div class="chat-research-trail-header" onclick="toggleResearchTrail(this)">
                        <div class="trail-header-title">
                            <span>🔍 مسار التحقيق والبحث التكميلي</span>
                            <span class="trail-badge-count">${roundsCount} جولات بحث</span>
                        </div>
                        <span class="accordion-arrow">▼</span>
                    </div>
                    <div class="chat-research-trail-content">
                        ${hasReformulated ? `
                            <div class="research-step-item">
                                <span class="step-badge reformulated">✍️ صياغة السؤال التراثية</span>
                                <div class="step-text">
                                    <div class="step-label">ألفاظ البحث الفقهي الموجهة للشاملة بعد التعديل:</div>
                                    <div class="step-query-box">«${escapeHtml(msg.reformulated_query)}»</div>
                                </div>
                            </div>
                        ` : ''}
                        ${hasSupplementary ? msg.supplementary_rounds.map((round) => `
                            <div class="research-step-item">
                                <span class="step-badge supplementary">🔄 جولة تكميلية #${round.round}</span>
                                <div class="step-text">
                                    ${round.reason ? `<div class="step-reason"><strong>سبب البحث التكميلي:</strong> ${escapeHtml(round.reason)}</div>` : ''}
                                    <div class="step-queries">
                                        <strong>ألفاظ وتخريجات البحث الإضافي:</strong>
                                        <div class="query-pills-row">
                                            ${(round.queries || []).map(q => `<span class="query-pill">🔎 ${escapeHtml(q)}</span>`).join('')}
                                        </div>
                                    </div>
                                    <div class="step-results-count">✓ تم استدراك وضم ${round.retrieved_count || 0} نصوص إضافية إلى التحقيق.</div>
                                </div>
                            </div>
                        `).join('') : ''}
                    </div>
                </div>
            `;
        }

        // عرض بطاقات مصادر الشاملة (Qdrant RAG)
        let sourcesHtml = "";
        if (msg.sources && msg.sources.length > 0) {
            sourcesHtml = `
                <div class="chat-sources-accordion open">
                    <div class="chat-sources-header" onclick="toggleSourcesList(this)">
                        <span>📚 نصوص الشاملة المعتمدة في هذا التحقيق (${msg.sources.length} نصوص ومواضع)</span>
                        <span class="accordion-arrow">▼</span>
                    </div>
                    <div class="chat-sources-content">
                        ${msg.sources.map((s, sIdx) => `
                            <div class="rag-source-item">
                                <div class="rag-source-top">
                                    <span class="rag-source-num">#${sIdx + 1}</span>
                                    <span class="rag-source-title">📖 ${escapeHtml(s.title_ar || 'كتاب في الشاملة')}</span>
                                    ${s.author_name ? `<span class="rag-source-author">✍️ ${escapeHtml(s.author_name)}</span>` : ''}
                                    <span class="rag-source-loc">صـ ${s.page_num || '-'}${s.part ? ` / جـ ${s.part}` : ''}</span>
                                </div>
                                <div class="rag-source-text">
                                    «${escapeHtml(s.snippet || s.body || '')}»
                                </div>
                                <div class="rag-source-actions">
                                    ${s.rel_path ? `
                                        <button type="button" class="btn-source-action" onclick="openReaderModal('${escapeHtml(s.rel_path)}', '${escapeHtml(s.part || '')}', ${s.page_num || 1}, '${escapeHtml(s.title_ar || '')}', '${escapeHtml(s.point_id || '')}')">
                                            📖 فتح الصفحة في القارئ
                                        </button>
                                    ` : ''}
                                    <button type="button" class="btn-source-action" onclick="copyCitation('${escapeHtml(s.title_ar)}', '${escapeHtml(s.part || '')}', '${s.page_num || ''}', '${escapeHtml(s.author_name || '')}', this)">
                                        📋 نسخ العزو المكتبي
                                    </button>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }

        // شريط أزرار التصدير (Word, PDF, CraftMyPDF, Copy)
        let actionToolbarHtml = "";
        if (historyIndex !== undefined && historyIndex >= 0) {
            actionToolbarHtml = `
                <div class="ai-msg-toolbar">
                    <button type="button" class="ai-btn-export docx" onclick="exportWord(${historyIndex})" title="تصدير مستند Word مفسر">
                        <span>📝 تصدير Word (.docx)</span>
                    </button>
                    <button type="button" class="ai-btn-export pdf" onclick="printAiMessage(${historyIndex})" title="طباعة أو تصدير PDF">
                        <span>🖨️ طباعة / PDF</span>
                    </button>
                    <button type="button" class="ai-btn-export craft" onclick="exportCraftPdf(${historyIndex})" title="تصدير عبر منصة CraftMyPDF بقالب احترافي">
                        <span>🎨 تصدير CraftMyPDF</span>
                    </button>
                    <button type="button" class="ai-btn-export copy" onclick="copyAiReply(${historyIndex}, this)" title="نسخ نص الإجابة كاملاً">
                        <span>📋 نسخ الإجابة</span>
                    </button>
                </div>
            `;
        }

        // خط أنابيب النماذج المساعدة
        let pipelineTrailHtml = "";
        if (msg.pipeline_flow) {
            const pf = msg.pipeline_flow;
            const executedCount = (pf.subtasks || []).length;
            pipelineTrailHtml = `
                <div class="pipeline-chat-container open">
                    <div class="pipeline-chat-header" onclick="this.parentElement.classList.toggle('open')">
                        <div class="pipeline-chat-header-title">
                            <span>🚀 خط أنابيب النماذج المساعدة (${executedCount} وكلاء تخصصيين)</span>
                        </div>
                        <span class="accordion-arrow">▼</span>
                    </div>
                    <div class="pipeline-flow-steps">
                        <div class="pipeline-step-item">
                            <div class="pipeline-step-header">🧩 تفكيك المسألة والمنهجية:</div>
                            <div style="font-size: 0.78rem; color: #cbd5e1; line-height: 1.5;">${escapeHtml(pf.plan || 'تم تفكيك المسألة إلى مهام تخصصية')}</div>
                        </div>
                        <div class="assistant-tab-reports">
                            ${(pf.subtasks || []).map((sub, sIdx) => `
                                <div class="ast-report-accordion">
                                    <div class="ast-report-acc-header" onclick="this.nextElementSibling.style.display = this.nextElementSibling.style.display === 'none' ? 'block' : 'none'">
                                        <span>🤖 [${escapeHtml(sub.assistant_name)}]: ${escapeHtml(sub.objective || sub.subquery)}</span>
                                        <span style="font-size: 0.7rem; color: #34d399;">${sub.sources_count || 0} نصوص ▾</span>
                                    </div>
                                    <div class="ast-report-acc-body" style="display: none;">
                                        <div style="margin-bottom: 0.4rem; color: #7dd3fc; font-weight: 700;">سؤال المساعد: «${escapeHtml(sub.subquery)}»</div>
                                        <div style="white-space: pre-wrap;">${escapeHtml(sub.report || '')}</div>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                        ${pf.gap_analysis && pf.gap_analysis.has_gap ? `
                            <div class="pipeline-step-item" style="border-color: rgba(245, 158, 11, 0.4); background: rgba(245, 158, 11, 0.08);">
                                <div class="pipeline-step-header" style="color: #fbbf24;">🔄 سد النقص والعجز التكميلي:</div>
                                <div style="font-size: 0.78rem; color: #fde68a;">
                                    <strong>موضع النقص:</strong> ${escapeHtml(pf.gap_analysis.reason || '')}<br>
                                    <strong>المساعد المكلف:</strong> ${escapeHtml(pf.gap_analysis.target_assistant_id || '')}
                                </div>
                            </div>
                        ` : ''}
                    </div>
                </div>
            `;
        }

        // زر إكمال الإجابة في حال انقطاع الرد لبلوغ سقف التوليد
        let continueBoxHtml = "";
        const isTruncated = msg.finish_reason === "length" || (msg.content && msg.content.length > 2500 && !msg.content.includes("المراجع") && !msg.content.includes("الترجيح") && (msg.content.trim().endsWith("قاعد") || msg.content.trim().endsWith("الـ") || msg.content.trim().endsWith("و")));
        if (isTruncated) {
            continueBoxHtml = `
                <div class="continue-msg-box" style="margin-top: 10px; margin-bottom: 8px; padding: 10px 14px; background: rgba(245, 158, 11, 0.12); border: 1px dashed rgba(245, 158, 11, 0.45); border-radius: 8px; display: flex; align-items: center; justify-content: space-between; gap: 12px;">
                    <div style="font-size: 0.82rem; color: #fbbf24; line-height: 1.4;">
                        ⚠️ <strong>توقف الرد لبلوغ سقف المخرجات المسموح للنموذج (8k/16k رمزاً).</strong>
                        <div style="font-size: 0.74rem; color: #cbd5e1; margin-top: 2px;">يمكنك متابعة واستكمال بقية البحث الفقهي والترجيح والمراجع دون بتر بضغطة واحدة:</div>
                    </div>
                    <button type="button" class="btn-preset" onclick="continueAiGeneration()" style="background: #f59e0b; color: #1e1e2d; font-weight: 700; white-space: nowrap; padding: 6px 14px; border-radius: 6px; cursor: pointer; border: none;">
                        ⚡ إكمال بقية الإجابة
                    </button>
                </div>
            `;
        }

        msgEl.innerHTML = `
            <div class="msg-avatar">🤖</div>
            <div class="msg-body">
                <div class="msg-author-row">
                    <span class="msg-author">المحقق الذكي لمكتبة الشاملة</span>
                    ${msg.model ? `<span class="msg-model-tag">${escapeHtml(msg.model)}</span>` : ''}
                </div>
                ${pipelineTrailHtml}
                ${researchTrailHtml}
                <div class="msg-content">${renderedHtml}</div>
                ${continueBoxHtml}
                ${sourcesHtml}
                ${actionToolbarHtml}
            </div>
        `;
    }

    container.appendChild(msgEl);
    container.scrollTop = container.scrollHeight;
}

// معالجة وعرض محتوى رد المساعد وتحويل الـ JSON المهيكل إلى بطاقات فقهية أنيقة
function renderAssistantContent(rawText) {
    if (!rawText) return "";
    let trimmed = rawText.trim();

    // إزالة كتل كود الماركداون إذا كان JSON مغلفاً بـ ```json
    if (trimmed.startsWith("```json") && trimmed.endsWith("```")) {
        trimmed = trimmed.replace(/^```json\s*/, "").replace(/\s*```$/, "").trim();
    } else if (trimmed.startsWith("```") && trimmed.endsWith("```")) {
        trimmed = trimmed.replace(/^```\w*\s*/, "").replace(/\s*```$/, "").trim();
    }

    // فحص ما إذا كان النص بالكامل عبارة عن كائن JSON صالح
    let parsedObj = null;
    let textBeforeJson = "";
    try {
        if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
            parsedObj = JSON.parse(trimmed);
        }
    } catch(e) {}

    // فحص ما إذا كان هناك كائن JSON مدمج في نهاية النص أو داخل الترجيح
    if (!parsedObj) {
        const jsonMatch = trimmed.match(/(\{[\s\S]*\})/);
        if (jsonMatch) {
            try {
                const candidate = JSON.parse(jsonMatch[1]);
                if (typeof candidate === "object" && candidate !== null) {
                    parsedObj = candidate;
                    textBeforeJson = trimmed.substring(0, jsonMatch.index).trim();
                }
            } catch(e) {}
        }
    }

    // إذا كان كائن JSON مهيكلاً يحوي حقول المسألة الفقهية
    if (parsedObj && typeof parsedObj === "object" && !Array.isArray(parsedObj)) {
        const keys = Object.keys(parsedObj);
        const hasFiqhKeys = keys.some(k => [
            "المسألة", "عنوان المسألة", "عنوان_المسألة", "صورة المسألة", "صورة_المسألة", 
            "تحرير_محل_النزاع", "سبب_الخلاف", "أقوال_العلماء", "الأقوال", "الأقوال_في_المسألة",
            "القول_الراجح", "الترجيح", "الخلاصة", "المصادر", "المراجع"
        ].includes(k));

        let introHtml = "";
        if (textBeforeJson) {
            let cleanedIntro = textBeforeJson.replace(/(?:^|\n)\s*(?:الراجح|الترجيح|القول الراجح)\s*[\:\*\-]*\s*$/, "").trim();
            if (cleanedIntro && typeof marked !== "undefined") {
                introHtml = `<div class="chat-intro-markdown">${marked.parse(cleanedIntro)}</div>`;
            }
        }

        if (hasFiqhKeys) {
            const title = parsedObj["المسألة"] || parsedObj["عنوان_المسألة"] || parsedObj["عنوان المسألة"] || parsedObj["title"] || "";
            const surat = parsedObj["صورة_المسألة"] || parsedObj["صورة المسألة"] || "";
            const tahrir = parsedObj["تحرير_محل_النزاع"] || parsedObj["تحرير محل النزاع"] || "";
            const sabab = parsedObj["سبب_الخلاف"] || parsedObj["سبب الخلاف"] || "";
            const aqwal = parsedObj["أقوال_العلماء"] || parsedObj["الأقوال_في_المسألة"] || parsedObj["الأقوال"] || "";
            const adillah = parsedObj["الأدلة"] || parsedObj["الأدلة_ومناقشتها"] || parsedObj["أدلة"] || "";
            const tarjih = parsedObj["القول_الراجح"] || parsedObj["الترجيح"] || parsedObj["الراجح"] || parsedObj["الخلاصة"] || "";
            const maraje3 = parsedObj["المصادر"] || parsedObj["المراجع"] || parsedObj["المصادر_والمراجع"] || "";
            const hawashi = parsedObj["الحواشي"] || parsedObj["الهوامش"] || "";

            let aqwalHtml = "";
            if (Array.isArray(aqwal)) {
                aqwalHtml = aqwal.map((item, idx) => {
                    if (typeof item === "object" && item !== null) {
                        return `
                            <div class="fiqh-opinion-card">
                                <div class="opinion-header">
                                    <span class="madhhab-badge">${escapeHtml(item["المذهب"] || item["مذهب"] || `القول ${idx+1}`)}</span>
                                    <strong>${escapeHtml(item["القول"] || item["حكم"] || '')}</strong>
                                </div>
                                ${item["الدليل"] ? `<div class="opinion-proof"><strong>الدليل:</strong> ${escapeHtml(item["الدليل"])}</div>` : ''}
                            </div>
                        `;
                    }
                    return `<div class="fiqh-opinion-card">${escapeHtml(String(item))}</div>`;
                }).join("");
            } else if (typeof aqwal === "string" && aqwal) {
                aqwalHtml = typeof marked !== "undefined" ? marked.parse(aqwal) : escapeHtml(aqwal);
            }

            const rawJsonStr = JSON.stringify(parsedObj, null, 2);
            const cardId = "fc_" + Math.random().toString(36).substring(2, 9);

            return `
                ${introHtml}
                <div class="structured-fiqh-display">
                    ${title ? `<div class="fiqh-card-title">⚖️ ${escapeHtml(title)}</div>` : ''}
                    
                    ${surat ? `
                        <div class="fiqh-section-block">
                            <div class="fiqh-sec-badge">📌 صورة المسألة</div>
                            <div class="fiqh-sec-body">${typeof marked !== "undefined" ? marked.parse(surat) : escapeHtml(surat)}</div>
                        </div>
                    ` : ''}

                    ${tahrir ? `
                        <div class="fiqh-section-block">
                            <div class="fiqh-sec-badge">🎯 تحرير محل النزاع</div>
                            <div class="fiqh-sec-body">${typeof marked !== "undefined" ? marked.parse(tahrir) : escapeHtml(tahrir)}</div>
                        </div>
                    ` : ''}

                    ${sabab ? `
                        <div class="fiqh-section-block">
                            <div class="fiqh-sec-badge">🔍 سبب الخلاف</div>
                            <div class="fiqh-sec-body">${typeof marked !== "undefined" ? marked.parse(sabab) : escapeHtml(sabab)}</div>
                        </div>
                    ` : ''}

                    ${aqwalHtml ? `
                        <div class="fiqh-section-block">
                            <div class="fiqh-sec-badge">📜 أقوال العلماء والمذاهب</div>
                            <div class="fiqh-sec-body">${aqwalHtml}</div>
                        </div>
                    ` : ''}

                    ${adillah && typeof adillah === "string" ? `
                        <div class="fiqh-section-block">
                            <div class="fiqh-sec-badge">📖 الأدلة ومناقشتها</div>
                            <div class="fiqh-sec-body">${typeof marked !== "undefined" ? marked.parse(adillah) : escapeHtml(adillah)}</div>
                        </div>
                    ` : ''}

                    ${tarjih ? `
                        <div class="fiqh-tarjih-highlight-box">
                            <div class="tarjih-header">
                                <span class="tarjih-icon">⭐</span>
                                <strong>القول الراجح وعلة الترجيح:</strong>
                            </div>
                            <div class="tarjih-content">
                                ${typeof marked !== "undefined" ? marked.parse(typeof tarjih === "string" ? tarjih : JSON.stringify(tarjih)) : escapeHtml(String(tarjih))}
                            </div>
                        </div>
                    ` : ''}

                    ${maraje3 ? `
                        <div class="fiqh-section-block">
                            <div class="fiqh-sec-badge">📚 المراجع والمصادر</div>
                            <div class="fiqh-sec-body">${typeof maraje3 === 'string' ? (typeof marked !== "undefined" ? marked.parse(maraje3) : escapeHtml(maraje3)) : `<pre class="json-code-box"><code>${escapeHtml(JSON.stringify(maraje3, null, 2))}</code></pre>`}</div>
                        </div>
                    ` : ''}

                    ${hawashi ? `
                        <div class="fiqh-section-block">
                            <div class="fiqh-sec-badge">📝 الحواشي والتخريج</div>
                            <div class="fiqh-sec-body">${typeof hawashi === 'string' ? (typeof marked !== "undefined" ? marked.parse(hawashi) : escapeHtml(hawashi)) : escapeHtml(JSON.stringify(hawashi))}</div>
                        </div>
                    ` : ''}

                    <div class="fiqh-raw-json-toggle">
                        <button type="button" class="btn-toggle-json" onclick="toggleRawJsonCard('${cardId}')">
                            <span>📐 عرض كود JSON المهيكل الأصلي</span>
                            <span id="arrow_${cardId}">▼</span>
                        </button>
                        <div id="${cardId}" class="raw-json-drawer" style="display: none;">
                            <div style="display: flex; justify-content: flex-end; margin-bottom: 0.35rem;">
                                <button type="button" class="btn-copy-code" onclick="copyRawJsonText('${cardId}', this)">📋 نسخ كود JSON</button>
                            </div>
                            <pre class="json-code-box"><code id="code_${cardId}">${escapeHtml(rawJsonStr)}</code></pre>
                        </div>
                    </div>
                </div>
            `;
        }

        // في حال كان JSON عام غير مخصص
        const rawJsonStr = JSON.stringify(parsedObj, null, 2);
        return `
            ${introHtml}
            <div class="structured-json-badge">📐 مخرجات مهيكلة بصيغة JSON</div>
            <pre class="json-code-box"><code>${escapeHtml(rawJsonStr)}</code></pre>
        `;
    }

    // إخراج Markdown قياسي
    if (typeof marked !== "undefined" && marked.parse) {
        return marked.parse(rawText);
    }
    return `<p>${escapeHtml(rawText).replace(/\n/g, '<br>')}</p>`;
}

// طي وإظهار درج كود الـ JSON
function toggleRawJsonCard(drawerId) {
    const el = document.getElementById(drawerId);
    const arrow = document.getElementById("arrow_" + drawerId);
    if (!el) return;
    if (el.style.display === "none" || !el.style.display) {
        el.style.display = "block";
        if (arrow) arrow.innerText = "▲";
    } else {
        el.style.display = "none";
        if (arrow) arrow.innerText = "▼";
    }
}

// نسخ كود JSON من البطاقة
function copyRawJsonText(drawerId, btnEl) {
    const codeEl = document.getElementById("code_" + drawerId);
    if (!codeEl) return;
    navigator.clipboard.writeText(codeEl.innerText).then(() => {
        const origText = btnEl.innerText;
        btnEl.innerText = "✓ تم النسخ";
        setTimeout(() => { btnEl.innerText = origText; }, 2000);
        showToast("✓ تم نسخ كود JSON المهيكل إلى الحافظة");
    });
}


// طي وبسط قائمة المصادر
function toggleSourcesList(headerEl) {
    const parent = headerEl.closest(".chat-sources-accordion");
    if (parent) {
        parent.classList.toggle("open");
    }
}

// نسخ إجابة المساعد
function copyAiReply(index, btnEl) {
    const msg = aiChatHistory[index];
    if (!msg) return;
    navigator.clipboard.writeText(msg.content).then(() => {
        showToast("✓ تم نسخ نص الإجابة إلى الحافظة");
    });
}

// ==================== دوال التصدير (Word, PDF, CraftMyPDF) ====================

// 1. تصدير Word (.docx)
async function exportWord(index) {
    const msg = aiChatHistory[index];
    if (!msg) return;

    showToast("جاري إعداد مستند Word وتحميله...");
    try {
        const res = await fetch("/api/export/docx", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                title: msg.prompt ? `تحقيق: ${msg.prompt.slice(0, 60)}` : "تقرير استجابة الذكاء الاصطناعي — المكتبة الشاملة",
                content: msg.content,
                sources: msg.sources || []
            })
        });

        if (!res.ok) throw new Error("فشل توليد مستند Word من الخادم");

        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `تقرير_الشاملة_${Date.now()}.docx`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
        showToast("✓ تم تحميل ملف Word (.docx) بنجاح");
    } catch (e) {
        alert("خطأ أثناء تصدير Word: " + e.message);
    }
}

// 2. طباعة وتصدير PDF بالمتصفح
function printAiMessage(index) {
    const msg = aiChatHistory[index];
    if (!msg) return;

    const printWin = window.open("", "_blank");
    if (!printWin) {
        alert("يرجى السماح بالنوافذ المنبثقة (Popups) في المتصفح لفتح نافذة طباعة وحفظ PDF.");
        return;
    }
    const title = msg.prompt ? `تحقيق فقهي: ${escapeHtml(msg.prompt)}` : "تقرير واستجابة الذكاء الاصطناعي — المكتبة الشاملة";

    let sourcesHtml = "";
    if (msg.sources && msg.sources.length > 0) {
        sourcesHtml = `
            <div style="margin-top: 30px; border-top: 2px solid #ddd; padding-top: 15px;">
                <h3 style="color: #065f46; font-size: 15pt; margin-bottom: 12px;">المصادر المعتمدة من الشاملة (${msg.sources.length}):</h3>
                ${msg.sources.map((s, idx) => `
                    <div style="margin-bottom: 10px; padding: 10px 14px; background: #f8fafc; border-right: 4px solid #10b981; border-radius: 4px;">
                        <strong>[${idx + 1}] كتاب: ${escapeHtml(s.title_ar || '')}</strong>
                        ${s.author_name ? ` — للمؤلف: ${escapeHtml(s.author_name)}` : ''}
                        ${s.part ? ` — جـ ${escapeHtml(s.part)}` : ''}
                        ${s.page_num ? ` — صـ ${escapeHtml(s.page_num)}` : ''}
                        <div style="margin-top: 6px; font-size: 11pt; color: #475569; font-style: italic; line-height: 1.8;">
                            «${escapeHtml(s.snippet || s.body || '')}»
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    const renderedContent = typeof marked !== "undefined" && marked.parse ? marked.parse(msg.content) : `<p>${escapeHtml(msg.content).replace(/\n/g, '<br>')}</p>`;

    printWin.document.write(`
        <!DOCTYPE html>
        <html dir="rtl" lang="ar">
        <head>
            <meta charset="UTF-8">
            <title>${title}</title>
            <style>
                @import url('https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&family=IBM+Plex+Sans+Arabic:wght@400;600;700&display=swap');
                body {
                    font-family: 'Amiri', 'Traditional Arabic', serif;
                    font-size: 13.5pt;
                    line-height: 2;
                    color: #1e293b;
                    padding: 40px;
                    max-width: 850px;
                    margin: 0 auto;
                }
                h1, h2, h3 { font-family: 'IBM Plex Sans Arabic', sans-serif; }
                h1 { font-size: 18pt; color: #0f172a; border-bottom: 2px solid #065f46; padding-bottom: 10px; margin-bottom: 15px; }
                .report-meta { font-family: 'IBM Plex Sans Arabic', sans-serif; font-size: 10pt; color: #64748b; margin-bottom: 20px; }
                .content-box { margin-bottom: 25px; }
                blockquote { border-right: 4px solid #10b981; margin: 15px 0; padding: 5px 15px; background: #f0fdf4; font-style: italic; }
                table { width: 100%; border-collapse: collapse; margin: 15px 0; font-size: 11pt; }
                th, td { border: 1px solid #cbd5e1; padding: 8px 12px; text-align: right; }
                th { background: #f1f5f9; }
                pre { background: #f8fafc; border: 1px solid #e2e8f0; padding: 12px; border-radius: 6px; font-family: monospace; font-size: 10pt; overflow-x: auto; direction: ltr; }
                @media print {
                    body { padding: 0; }
                }
            </style>
        </head>
        <body>
            <h1>المكتبة الشاملة — تقرير التحقيق والبحث العلمي</h1>
            <div class="report-meta">
                <span>تاريخ التقرير: ${new Date().toLocaleDateString('ar-EG')}</span> | 
                <span>محرك البحث: BGE-M3 + Qdrant RAG</span>
            </div>
            ${msg.prompt ? `<div style="background: #f1f5f9; padding: 12px 18px; border-radius: 8px; margin-bottom: 20px; font-family: 'IBM Plex Sans Arabic', sans-serif;"><strong>المسألة المبحوثة:</strong> ${escapeHtml(msg.prompt)}</div>` : ''}
            <div class="content-box">
                ${renderedContent}
            </div>
            ${sourcesHtml}
            <script>
                window.onload = function() {
                    try { window.print(); } catch(e){}
                }
            </script>
        </body>
        </html>
    `);
    printWin.document.close();

    // Direct fallback print trigger in case onload was already fired
    setTimeout(() => {
        try {
            printWin.focus();
            printWin.print();
        } catch(e) {
            console.error("Print trigger error:", e);
        }
    }, 400);
}

let currentCraftPdfUrl = "";

function openCraftPdfModal() {
    const modal = document.getElementById("craftPdfModal");
    if (modal) {
        modal.classList.add("active");
    }
}

function closeCraftPdfModal() {
    const modal = document.getElementById("craftPdfModal");
    if (modal) {
        modal.classList.remove("active");
        const iframe = document.getElementById("craftPdfPreviewFrame");
        if (iframe) iframe.src = "";
    }
}

function copyCraftPdfLink() {
    if (!currentCraftPdfUrl) return;
    navigator.clipboard.writeText(currentCraftPdfUrl).then(() => {
        showToast("✓ تم نسخ رابط تحميل ملف الـ PDF إلى الحافظة");
        const btnText = document.getElementById("craftCopyBtnText");
        if (btnText) {
            const old = btnText.innerText;
            btnText.innerText = "✓ تم النسخ بنجاح!";
            setTimeout(() => { btnText.innerText = old; }, 2500);
        }
    }).catch(err => {
        prompt("رابط الملف المولد:", currentCraftPdfUrl);
    });
}

// إغلاق النافذة بالنقر خارجها
window.addEventListener("click", (e) => {
    const craftModal = document.getElementById("craftPdfModal");
    if (craftModal && e.target === craftModal) {
        closeCraftPdfModal();
    }
});

// 3. تصدير عبر منصة CraftMyPDF
async function exportCraftPdf(index) {
    const msg = aiChatHistory[index];
    if (!msg) return;

    const apiKey = document.getElementById("craftApiKeyInput").value.trim();
    const templateId = document.getElementById("craftTemplateIdInput").value.trim();

    if (!apiKey || !templateId) {
        alert("يرجى إدخال مفتاح CraftMyPDF API Key ومعرف القالب Template ID في بطاقة إعدادات CraftMyPDF الجانبية أولاً.");
        switchSettingsSection("craft");
        const input = document.getElementById("craftApiKeyInput");
        if (input) input.focus();
        return;
    }

    const reportTitle = msg.prompt ? `تحقيق: ${msg.prompt.trim()}` : "تقرير بحث المكتبة الشاملة";

    // فتح النافذة التفاعلية وإظهار حالة المعالجة
    openCraftPdfModal();
    const loadingState = document.getElementById("craftLoadingState");
    const errorState = document.getElementById("craftErrorState");
    const successState = document.getElementById("craftSuccessState");
    const heading = document.getElementById("craftModalHeading");
    const sub = document.getElementById("craftModalSub");

    if (loadingState) loadingState.style.display = "block";
    if (errorState) errorState.style.display = "none";
    if (successState) successState.style.display = "none";
    if (heading) heading.innerText = "جاري إعداد وتوليد ملف الـ PDF...";
    if (sub) sub.innerText = "التواصل مع خوادم CraftMyPDF لتطبيق القالب وتوليد التقرير الأكاديمي";

    try {
        // عدم تضمين نصوص الشاملة الخام والاكتفاء حصراً بإجابة النموذج لتفادي تضخم الحجم وأخطاء التنسيق
        const customSchemaVal = document.getElementById("craftCustomDataSchema")?.value?.trim() || "";
        const res = await fetch("/api/export/craftmypdf", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                api_key: apiKey,
                template_id: templateId,
                title: reportTitle,
                query: msg.prompt || "مسألة بحثية في الشاملة",
                prompt: msg.prompt || "مسألة بحثية في الشاملة",
                answer: msg.content || "",
                content: msg.content || "",
                sources: [],
                custom_data_schema: customSchemaVal || null
            })
        });

        const data = await res.json();

        if (!res.ok || data.status === "error") {
            let errMsg = data.detail || data.message || data.error || "تعذر التوليد عبر CraftMyPDF";
            if (typeof errMsg === "object") {
                errMsg = JSON.stringify(errMsg, null, 2);
            }
            throw new Error(errMsg);
        }

        const pdfUrl = data.pdf_url || data.file || (data.data && data.data.file) || "";
        const filename = data.filename || `shamela_research_${Date.now()}.pdf`;
        const title = data.title || reportTitle;

        if (!pdfUrl) {
            throw new Error("لم تُرجع منصة CraftMyPDF رابط الملف المولد. تأكد من تفعيل صلاحيات القالب.");
        }

        currentCraftPdfUrl = pdfUrl;

        // تحديث بيانات النافذة بعنوان الملف ورابطه
        const titleEl = document.getElementById("craftGeneratedTitle");
        if (titleEl) titleEl.innerText = title;

        const fileEl = document.getElementById("craftGeneratedFilename");
        if (fileEl) fileEl.innerText = filename;

        const timeEl = document.getElementById("craftGeneratedTime");
        if (timeEl) timeEl.innerText = new Date().toLocaleTimeString('ar-SA');

        const openBtn = document.getElementById("craftOpenBtn");
        if (openBtn) {
            openBtn.href = pdfUrl;
            openBtn.target = "_blank";
        }

        const downloadBtn = document.getElementById("craftDownloadBtn");
        if (downloadBtn) {
            downloadBtn.href = pdfUrl;
            downloadBtn.setAttribute("download", filename);
        }

        const previewFrame = document.getElementById("craftPdfPreviewFrame");
        if (previewFrame) {
            previewFrame.src = pdfUrl;
        }

        if (loadingState) loadingState.style.display = "none";
        if (errorState) errorState.style.display = "none";
        if (successState) successState.style.display = "flex";
        if (heading) heading.innerText = "تم توليد ملف PDF بنجاح عبر CraftMyPDF";
        if (sub) sub.innerText = "الملف جاهز الآن، يمكنك فتحه مباشرة أو تنزيله أو نسخ رابطه";

        showToast("✓ تم توليد ملف PDF بنجاح");

    } catch (e) {
        if (loadingState) loadingState.style.display = "none";
        if (successState) successState.style.display = "none";
        if (errorState) errorState.style.display = "block";
        if (heading) heading.innerText = "تعذر توليد ملف PDF";
        if (sub) sub.innerText = "حدث خطأ أثناء معالجة القالب أو الاتصال بالمنصة";

        const errEl = document.getElementById("craftErrorMessage");
        if (errEl) {
            errEl.innerText = e.message || String(e);
        }
    }
}

// ==================== نظام تجميعات الكتب المخصصة (Custom Book Collections) ====================

const COLLECTIONS_STORAGE_KEY = "shamela_custom_book_collections";
const ACTIVE_COLLECTION_STORAGE_KEY = "shamela_active_collection_id";

let bookCollections = [];
let activeCollectionId = "default_fiqh";
let currentEditingCollection = null;

// تهيئة نظام تجميعات الكتب عند تحميل الصفحة
async function initBookCollections() {
    try {
        const stored = localStorage.getItem(COLLECTIONS_STORAGE_KEY);
        if (stored) {
            bookCollections = JSON.parse(stored);
        }
    } catch (e) {
        console.warn("Error reading stored collections:", e);
    }

    // جلب التجميعة الافتراضية إذا لم تكن موجودة
    const hasDefault = bookCollections.some(c => c.id === "default_fiqh");
    if (!hasDefault || bookCollections.length === 0) {
        try {
            const res = await fetch("/api/ai/collections/default");
            if (res.ok) {
                const defCol = await res.json();
                defCol.id = "default_fiqh";
                if (!bookCollections.some(c => c.id === "default_fiqh")) {
                    bookCollections.unshift(defCol);
                } else {
                    const idx = bookCollections.findIndex(c => c.id === "default_fiqh");
                    bookCollections[idx] = defCol;
                }
                saveCollectionsToStorage();
            }
        } catch (e) {
            console.warn("Could not fetch default fiqh collection:", e);
        }
    }

    const savedActiveId = localStorage.getItem(ACTIVE_COLLECTION_STORAGE_KEY);
    if (savedActiveId !== null && (savedActiveId === "" || bookCollections.some(c => c.id === savedActiveId))) {
        activeCollectionId = savedActiveId;
    } else {
        activeCollectionId = "default_fiqh";
    }

    updateCollectionSelectDropdown();
    applyActiveCollection(false);
}

// حفظ التجميعات في localStorage
function saveCollectionsToStorage() {
    try {
        localStorage.setItem(COLLECTIONS_STORAGE_KEY, JSON.stringify(bookCollections));
    } catch (e) {
        console.warn("Storage save error:", e);
    }
}

// تحديث القائمة المنسدلة للتجميعات
function updateCollectionSelectDropdown() {
    const sel = document.getElementById("aiCollectionSelect");
    if (!sel) return;

    sel.innerHTML = `<option value="">-- بدون تجميعة (البحث في عموم الشاملة) --</option>`;

    bookCollections.forEach(col => {
        const opt = document.createElement("option");
        opt.value = col.id;
        let count = 0;
        if (col.sections) {
            col.sections.forEach(s => {
                if (s.books) count += s.books.length;
            });
        }
        opt.textContent = `📚 ${col.name} (${count} كتاباً)`;
        if (col.id === activeCollectionId) {
            opt.selected = true;
        }
        sel.appendChild(opt);
    });

    sel.value = activeCollectionId;
}

// عند تغيير اختيار التجميعة من القائمة
function onCollectionSelectChanged() {
    const sel = document.getElementById("aiCollectionSelect");
    if (!sel) return;

    activeCollectionId = sel.value;
    localStorage.setItem(ACTIVE_COLLECTION_STORAGE_KEY, activeCollectionId);

    applyActiveCollection(true);
    saveAiSettings();
}

// تطبيق التجميعة النشطة وتفعيل كتبها في الـ RAG
function applyActiveCollection(notify = true) {
    const activeCol = bookCollections.find(c => c.id === activeCollectionId);
    const countSpan = document.getElementById("collectionBooksCount");
    const hintSpan = document.getElementById("aiCollectionHint");
    const scopeHint = document.getElementById("aiScopeHint");

    if (!activeCol || activeCollectionId === "") {
        // بدون تجميعة
        if (countSpan) countSpan.innerText = "0";
        if (hintSpan) {
            hintSpan.innerText = "البحث والذكاء الاصطناعي يستوعب كافة كتب وتصنيفات الشاملة.";
            hintSpan.style.color = "var(--text-muted)";
        }
        if (scopeHint) scopeHint.innerText = "البحث يشمل كل كتب المكتبة الشاملة";
        selectedBookTitles.clear();
        updateScopeIndicator();
        if (notify) showToast("تم تعطيل التجميعة — البحث يشمل كل الشاملة");
        return;
    }

    // تجميع عناوين الكتب المفعلة في هذه التجميعة
    selectedBookTitles.clear();
    let totalCount = 0;
    let activeCount = 0;

    if (activeCol.sections) {
        activeCol.sections.forEach(sec => {
            if (sec.books) {
                sec.books.forEach(b => {
                    totalCount++;
                    if (b.selected !== false && b.title_ar) {
                        selectedBookTitles.add(b.title_ar);
                        activeCount++;
                    }
                });
            }
        });
    }

    if (countSpan) countSpan.innerText = totalCount;
    if (hintSpan) {
        hintSpan.innerHTML = `✓ مفعّل: تجميعة <strong>«${escapeHtml(activeCol.name)}»</strong> (${activeCount} كتاباً معتمداً بالصح من أصل ${totalCount})`;
        hintSpan.style.color = "#34d399";
    }
    if (scopeHint) {
        scopeHint.innerHTML = `نطاق البحث محصور في تجميعة <strong>«${escapeHtml(activeCol.name)}»</strong> (${activeCount} كتاباً)`;
    }

    updateScopeIndicator();
    if (notify) {
        showToast(`✓ تم تفعيل تجميعة «${activeCol.name}» (${activeCount} كتاباً محصوراً بالصح)`);
    }
}

// فتح نافذة إدارة وتعديل كتب التجميعة
function openCollectionManagerModal() {
    let col = bookCollections.find(c => c.id === activeCollectionId);
    if (!col) {
        if (bookCollections.length > 0) {
            col = bookCollections[0];
            activeCollectionId = col.id;
            updateCollectionSelectDropdown();
        } else {
            showToast("لا توجد تجميعات متاحة حالياً");
            return;
        }
    }

    // عمل نسخة عميقة للتعديل دون التأثير إلا عند الحفظ
    currentEditingCollection = JSON.parse(JSON.stringify(col));

    const nameInput = document.getElementById("currentCollectionNameInput");
    if (nameInput) nameInput.value = currentEditingCollection.name || "";

    const deleteBtn = document.getElementById("btnDeleteCollection");
    if (deleteBtn) {
        deleteBtn.style.display = currentEditingCollection.id === "default_fiqh" ? "none" : "inline-block";
    }

    // تعبئة قائمة الأقسام لاختيار القسم عند إضافة كتاب جديد
    const secSelect = document.getElementById("addBookTargetSection");
    if (secSelect && currentEditingCollection.sections) {
        secSelect.innerHTML = "";
        currentEditingCollection.sections.forEach((sec, sIdx) => {
            const opt = document.createElement("option");
            opt.value = sIdx;
            opt.textContent = sec.section_name;
            secSelect.appendChild(opt);
        });
    }

    renderCollectionSections();
    toggleAddBookPopover(false);

    const modal = document.getElementById("collectionManagerModal");
    if (modal) modal.classList.add("active");
}

function closeCollectionManagerModal() {
    autoSaveCurrentCollection(false);
    const modal = document.getElementById("collectionManagerModal");
    if (modal) modal.classList.remove("active");
    toggleAddBookPopover(false);
}

// عرض أقسام وكتب التجميعة الحالية في النافذة
function renderCollectionSections(filterQuery = "") {
    const container = document.getElementById("collectionSectionsContainer");
    if (!container || !currentEditingCollection) return;

    const q = (filterQuery || "").trim().toLowerCase();
    let totalBooks = 0;
    let activeBooks = 0;

    const sectionsHtml = (currentEditingCollection.sections || []).map((sec, secIdx) => {
        const books = sec.books || [];
        totalBooks += books.length;
        const secActive = books.filter(b => b.selected !== false).length;
        activeBooks += secActive;

        // فلترة الكتب إن وجد بحث
        const visibleBooks = books.map((b, bIdx) => ({ book: b, originalIdx: bIdx })).filter(item => {
            if (!q) return true;
            const t = (item.book.title_ar || "").toLowerCase();
            const a = (item.book.author || "").toLowerCase();
            return t.includes(q) || a.includes(q);
        });

        if (q && visibleBooks.length === 0) {
            return "";
        }

        const isAllSecChecked = books.length > 0 && books.every(b => b.selected !== false);

        return `
            <div class="col-section-accordion open" id="sec_acc_${secIdx}">
                <div class="col-section-header" onclick="toggleColSectionAccordion(${secIdx})">
                    <div class="col-section-title-wrap">
                        <input 
                            type="checkbox" 
                            class="col-sec-checkbox" 
                            ${isAllSecChecked ? 'checked' : ''} 
                            onclick="event.stopPropagation(); toggleSectionAllBooks(${secIdx}, this.checked)"
                            title="تحديد أو إلغاء تحديد كافة كتب هذا القسم"
                        >
                        <span class="col-section-name">${escapeHtml(sec.section_name)}</span>
                        <span class="col-section-count">${secActive} / ${books.length} كتاباً</span>
                    </div>
                    <span class="accordion-arrow">▼</span>
                </div>
                <div class="col-books-grid" id="sec_grid_${secIdx}">
                    ${visibleBooks.map(item => {
                        const b = item.book;
                        const bIdx = item.originalIdx;
                        const isChecked = b.selected !== false;
                        return `
                            <div class="col-book-card ${isChecked ? '' : 'disabled'}" id="card_${secIdx}_${bIdx}">
                                <div class="col-book-info">
                                    <input 
                                        type="checkbox" 
                                        ${isChecked ? 'checked' : ''} 
                                        onchange="onColBookToggled(${secIdx}, ${bIdx}, this.checked)"
                                    >
                                    <div style="overflow: hidden;">
                                        <span class="col-book-title" title="${escapeHtml(b.title_ar)}">${escapeHtml(b.title_ar)}</span>
                                        ${b.author ? `<span class="col-book-author" title="${escapeHtml(b.author)}">✍️ ${escapeHtml(b.author)}</span>` : ''}
                                    </div>
                                </div>
                                <button type="button" class="btn-remove-book" onclick="removeBookFromCurrentCollection(${secIdx}, ${bIdx})" title="حذف الكتاب من التجميعة">🗑️</button>
                            </div>
                        `;
                    }).join("")}
                </div>
            </div>
        `;
    }).join("");

    container.innerHTML = sectionsHtml || `<div style="text-align: center; color: var(--text-muted); padding: 2rem;">لا توجد كتب مطابقة لبحثك في هذه التجميعة.</div>`;

    const totalEl = document.getElementById("modalColTotalBooks");
    const activeEl = document.getElementById("modalColActiveBooks");
    if (totalEl) totalEl.innerText = totalBooks;
    if (activeEl) activeEl.innerText = activeBooks;
}

// طي وبسط قسم في النافذة
function toggleColSectionAccordion(secIdx) {
    const acc = document.getElementById(`sec_acc_${secIdx}`);
    if (acc) acc.classList.toggle("open");
}

// الحفظ التلقائي الفوري لكافة تعديلات التجميعة في التخزين المحلي وتحديث الواجهة والـ RAG
function autoSaveCurrentCollection(showToastMsg = false, toastText = "") {
    if (!currentEditingCollection) return;

    const nameInput = document.getElementById("currentCollectionNameInput");
    if (nameInput && nameInput.value.trim()) {
        currentEditingCollection.name = nameInput.value.trim();
    }

    const idx = bookCollections.findIndex(c => c.id === currentEditingCollection.id);
    if (idx !== -1) {
        bookCollections[idx] = currentEditingCollection;
    } else {
        bookCollections.push(currentEditingCollection);
    }

    saveCollectionsToStorage();
    updateCollectionSelectDropdown();
    applyActiveCollection(false);
    updateModalBookCounts();

    const indicator = document.getElementById("colAutoSaveIndicator");
    if (indicator) {
        indicator.textContent = "✓ تم الحفظ تلقائياً";
        indicator.style.opacity = "1";
        clearTimeout(window._autoSaveIndicatorTimer);
        window._autoSaveIndicatorTimer = setTimeout(() => {
            if (indicator) indicator.style.opacity = "0.75";
        }, 1800);
    }

    if (showToastMsg && toastText) {
        showToast(toastText);
    }
}

// تبديل اختيار كتاب فردي
function onColBookToggled(secIdx, bookIdx, checked) {
    if (!currentEditingCollection || !currentEditingCollection.sections[secIdx]) return;
    const b = currentEditingCollection.sections[secIdx].books[bookIdx];
    if (b) {
        b.selected = checked;
        const card = document.getElementById(`card_${secIdx}_${bookIdx}`);
        if (card) {
            if (checked) card.classList.remove("disabled");
            else card.classList.add("disabled");
        }
        autoSaveCurrentCollection(false);
    }
}

// تبديل اختيار كل كتب قسم معين
function toggleSectionAllBooks(secIdx, checked) {
    if (!currentEditingCollection || !currentEditingCollection.sections[secIdx]) return;
    const sec = currentEditingCollection.sections[secIdx];
    if (sec.books) {
        sec.books.forEach(b => { b.selected = checked; });
    }
    renderCollectionSections(document.getElementById("collectionBookFilterInput")?.value || "");
    autoSaveCurrentCollection(true, checked ? `✓ تم تحديد جميع كتب قسم: ${sec.section_name}` : `✓ تم إلغاء تحديد كتب قسم: ${sec.section_name}`);
}

// تحديد أو إلغاء تحديد كافة كتب التجميعة
function toggleSelectAllCollection(checked) {
    if (!currentEditingCollection || !currentEditingCollection.sections) return;
    currentEditingCollection.sections.forEach(sec => {
        if (sec.books) {
            sec.books.forEach(b => { b.selected = checked; });
        }
    });
    renderCollectionSections(document.getElementById("collectionBookFilterInput")?.value || "");
    autoSaveCurrentCollection(true, checked ? "✓ تم تحديد كافة كتب التجميعة" : "✓ تم إلغاء تحديد كافة كتب التجميعة");
}

// تحديث الإحصائيات في رأس النافذة
function updateModalBookCounts() {
    if (!currentEditingCollection) return;
    let total = 0;
    let active = 0;
    currentEditingCollection.sections.forEach(sec => {
        if (sec.books) {
            total += sec.books.length;
            active += sec.books.filter(b => b.selected !== false).length;
        }
    });
    const totalEl = document.getElementById("modalColTotalBooks");
    const activeEl = document.getElementById("modalColActiveBooks");
    if (totalEl) totalEl.innerText = total;
    if (activeEl) activeEl.innerText = active;
}

// تصفية الكتب المعروضة في النافذة
function filterCollectionDisplayBooks() {
    const q = document.getElementById("collectionBookFilterInput")?.value || "";
    renderCollectionSections(q);
}

// حذف كتاب من التجميعة مع حفظ فوري تلقائي يضمن عدم عودته
function removeBookFromCurrentCollection(secIdx, bookIdx) {
    if (!currentEditingCollection || !currentEditingCollection.sections[secIdx]) return;
    const b = currentEditingCollection.sections[secIdx].books[bookIdx];
    const bTitle = b ? b.title_ar : "الكتاب";
    currentEditingCollection.sections[secIdx].books.splice(bookIdx, 1);
    renderCollectionSections(document.getElementById("collectionBookFilterInput")?.value || "");
    autoSaveCurrentCollection(true, `✓ تم حذف «${bTitle}» وحفظ التعديل تلقائياً`);
}

// إظهار أو إخفاء لوحة إضافة كتاب جديد مع تعبئة التصنيفات الـ 41
let _addBookDebounceTimer = null;
function debounceAddBookSearch() {
    clearTimeout(_addBookDebounceTimer);
    _addBookDebounceTimer = setTimeout(() => {
        searchBooksToAddInCollection();
    }, 280);
}

async function toggleAddBookPopover(forceState) {
    const popover = document.getElementById("addBookPopover");
    if (!popover) return;
    const isOpen = popover.style.display === "block";
    const nextState = forceState !== undefined ? forceState : !isOpen;
    popover.style.display = nextState ? "block" : "none";
    if (nextState) {
        // تعبئة قائمة الـ 41 تصنيفاً الأساسية للشاملة
        const catSelect = document.getElementById("addBookShamelaCategorySelect");
        if (catSelect && catSelect.options.length <= 1) {
            if (!categoriesList || categoriesList.length === 0) {
                try {
                    const res = await fetch("/api/categories");
                    categoriesList = await res.json();
                } catch(e) {}
            }
            catSelect.innerHTML = `<option value="">📚 كل التصنيفات (جميع أقسام الشاملة الـ ٤١)</option>`;
            (categoriesList || []).forEach(c => {
                if (c.category_id > 0) {
                    const opt = document.createElement("option");
                    opt.value = c.category_id;
                    opt.textContent = `${c.category_name_ar} (${c.book_count} كتاب)`;
                    catSelect.appendChild(opt);
                }
            });
        }

        // تعبئة قائمة أقسام التجميعة لاختيار وجهة الكتاب
        const secSelect = document.getElementById("addBookTargetSection");
        if (secSelect && currentEditingCollection && currentEditingCollection.sections) {
            secSelect.innerHTML = "";
            currentEditingCollection.sections.forEach((sec, sIdx) => {
                const opt = document.createElement("option");
                opt.value = sIdx;
                opt.textContent = `📁 ${sec.section_name}`;
                secSelect.appendChild(opt);
            });
        }

        const input = document.getElementById("addBookSearchInput");
        if (input) {
            input.value = "";
        }
        searchBooksToAddInCollection();
    }
}

// البحث المباشر في قاعدة بيانات الشاملة (8589 كتاباً في 41 تصنيفاً)
async function searchBooksToAddInCollection() {
    const q = (document.getElementById("addBookSearchInput")?.value || "").trim();
    const catSelect = document.getElementById("addBookShamelaCategorySelect");
    const catId = catSelect ? catSelect.value : "";
    const resultsContainer = document.getElementById("addBookSearchResults");
    if (!resultsContainer) return;

    resultsContainer.innerHTML = `<div style="padding: 1rem; text-align: center; color: var(--text-muted); font-size: 0.85rem;"><span class="spinner" style="display:inline-block; margin-left: 0.4rem;">⏳</span> جاري البحث في الشاملة...</div>`;

    try {
        let url = `/api/books?limit=60`;
        if (catId) url += `&category_id=${catId}`;
        if (q) url += `&q=${encodeURIComponent(q)}`;

        const res = await fetch(url);
        if (!res.ok) throw new Error("تعذر جلب الكتب");
        const books = await res.json();

        if (!books || books.length === 0) {
            resultsContainer.innerHTML = `<div style="padding: 1rem; text-align: center; color: var(--text-muted); font-size: 0.85rem;">لم يتم العثور على كتب مطابقة لخيارات البحث.</div>`;
            return;
        }

        // حفظ الكتب في الذاكرة لتسهيل الإضافة
        books.forEach(b => {
            if (!allBooksCache.some(x => x.book_id === b.book_id)) {
                allBooksCache.push(b);
            }
        });

        resultsContainer.innerHTML = books.map(b => `
            <div class="add-book-item">
                <div style="overflow: hidden; flex: 1;">
                    <strong style="color: #f8fafc; font-size: 0.88rem; display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${escapeHtml(b.title_ar)}">${escapeHtml(b.title_ar)}</strong>
                    <div style="font-size: 0.74rem; color: #94a3b8; display: flex; gap: 0.5rem; margin-top: 2px; flex-wrap: wrap;">
                        <span>✍️ ${escapeHtml(b.author_name || 'غير معروف')}</span>
                        ${b.category_name_ar ? `<span style="background: rgba(255,255,255,0.06); padding: 1px 6px; border-radius: 4px;">🏷️ ${escapeHtml(b.category_name_ar)}</span>` : ''}
                    </div>
                </div>
                <button type="button" class="btn-add-to-section" onclick="confirmAddBookToCollection(${b.book_id})">➕ إضافة للتجميعة</button>
            </div>
        `).join("");

    } catch (e) {
        console.error("searchBooksToAddInCollection error:", e);
        resultsContainer.innerHTML = `<div style="padding: 1rem; text-align: center; color: #ef4444; font-size: 0.85rem;">حدث خطأ أثناء البحث في الشاملة</div>`;
    }
}

// تأكيد إضافة كتاب إلى التجميعة وحفظ التعديل تلقائياً
function confirmAddBookToCollection(bookId) {
    if (!currentEditingCollection) return;
    const b = allBooksCache.find(x => x.book_id === bookId);
    if (!b) return;

    const secSelect = document.getElementById("addBookTargetSection");
    let secIdx = parseInt(secSelect?.value || 0);

    if (isNaN(secIdx) || !currentEditingCollection.sections || !currentEditingCollection.sections[secIdx]) {
        if (!currentEditingCollection.sections) currentEditingCollection.sections = [];
        if (currentEditingCollection.sections.length === 0) {
            currentEditingCollection.sections.push({
                section_name: b.category_name_ar || "كتب إضافية",
                books: []
            });
            secIdx = 0;
        } else {
            secIdx = 0;
        }
    }

    const sec = currentEditingCollection.sections[secIdx];
    if (!sec.books) sec.books = [];

    // التحقق من عدم التكرار
    const exists = sec.books.some(x => x.book_id === b.book_id || x.title_ar === b.title_ar);
    if (exists) {
        showToast("⚠️ الكتاب موجود بالفعل في هذا القسم");
        return;
    }

    sec.books.unshift({
        book_id: b.book_id,
        title_ar: b.title_ar,
        author: b.author_name || "",
        category: b.category_name_ar || sec.section_name,
        selected: true
    });

    renderCollectionSections(document.getElementById("collectionBookFilterInput")?.value || "");
    autoSaveCurrentCollection(true, `✓ تم إضافة «${b.title_ar}» إلى قسم: ${sec.section_name} وحفظ التجميعة`);
}

// حفظ وتطبيق تعديلات التجميعة
function saveAndApplyCollectionChanges() {
    if (!currentEditingCollection) return;

    const newName = (document.getElementById("currentCollectionNameInput")?.value || "").trim();
    if (!newName) {
        showToast("⚠️ يرجى إدخال اسم للتجميعة");
        return;
    }

    currentEditingCollection.name = newName;
    autoSaveCurrentCollection(false);
    activeCollectionId = currentEditingCollection.id;
    localStorage.setItem(ACTIVE_COLLECTION_STORAGE_KEY, activeCollectionId);
    applyActiveCollection(true);
    saveAiSettings();
    closeCollectionManagerModal();
    showToast(`✓ تم حفظ وتطبيق تجميعة «${currentEditingCollection.name}» بنجاح`);
}

// تصدير التجميعة النشطة كملف JSON
function exportCurrentCollectionJson() {
    const col = currentEditingCollection || bookCollections.find(c => c.id === activeCollectionId);
    if (!col) {
        showToast("⚠️ لا توجد تجميعة لتصديرها");
        return;
    }

    const exportObj = {
        name: col.name || "تجميعة فقهية مخصصة",
        description: col.description || "تجميعة كتب محددة من المكتبة الشاملة للبحث والتحقيق الذكي",
        created_at: new Date().toISOString().split("T")[0],
        sections: col.sections || []
    };

    const jsonStr = JSON.stringify(exportObj, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const safeName = (col.name || "shamela_collection").replace(/[^\w\u0600-\u06FF\-]/g, "_");

    const a = document.createElement("a");
    a.href = url;
    a.download = `${safeName}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast(`✓ تم تصدير التجميعة كملف JSON: ${safeName}.json`);
}

// تفعيل اختيار ملف الاستيراد
function triggerImportCollectionJson() {
    const fileInput = document.getElementById("collectionJsonFileInput");
    if (fileInput) {
        fileInput.value = "";
        fileInput.click();
    }
}

// استيراد تجميعة من ملف JSON
function handleImportCollectionJson(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = JSON.parse(e.target.result);
            let importedSections = [];
            let importedName = file.name.replace(/\.json$/i, "").replace(/_/g, " ");

            if (data.sections && Array.isArray(data.sections)) {
                importedSections = data.sections;
                if (data.name) importedName = data.name;
            } else if (Array.isArray(data)) {
                importedSections = data;
            } else {
                throw new Error("تنسيق ملف JSON غير مطابق لهيكلة تجميعات الشاملة");
            }

            const newId = "col_" + Date.now();
            const newCol = {
                id: newId,
                name: importedName,
                description: data.description || "تجميعة مستوردة من ملف JSON",
                created_at: new Date().toISOString().split("T")[0],
                sections: importedSections
            };

            bookCollections.push(newCol);
            activeCollectionId = newId;
            saveCollectionsToStorage();
            updateCollectionSelectDropdown();
            applyActiveCollection(true);
            saveAiSettings();

            showToast(`✓ تم استيراد التجميعة «${importedName}» بنجاح`);
        } catch (err) {
            console.error("Import error:", err);
            showToast(`⚠️ تعذر استيراد الملف: ${err.message || 'تنسيق JSON غير صالح'}`);
        }
    };
    reader.readAsText(file, "UTF-8");
}

// استعادة النموذج الافتراضي المعتمد
async function resetDefaultFiqhCollection() {
    if (!confirm("هل تريد استعادة نموذج «فقه مقارن تراثي موسع» الافتراضي بكافة كتبه الـ ٨٨؟")) {
        return;
    }

    try {
        const res = await fetch("/api/ai/collections/default");
        if (res.ok) {
            const defCol = await res.json();
            defCol.id = "default_fiqh";

            const idx = bookCollections.findIndex(c => c.id === "default_fiqh");
            if (idx !== -1) {
                bookCollections[idx] = defCol;
            } else {
                bookCollections.unshift(defCol);
            }

            saveCollectionsToStorage();
            activeCollectionId = "default_fiqh";
            updateCollectionSelectDropdown();
            applyActiveCollection(true);

            if (document.getElementById("collectionManagerModal")?.classList.contains("active")) {
                currentEditingCollection = JSON.parse(JSON.stringify(defCol));
                document.getElementById("currentCollectionNameInput").value = defCol.name;
                renderCollectionSections();
            }

            showToast("✓ تمت استعادة نموذج فقه مقارن تراثي موسع بنجاح");
        }
    } catch (e) {
        showToast("⚠️ تعذر استعادة النموذج الافتراضي");
    }
}

// حذف التجميعة الحالية
function deleteCurrentCollection() {
    if (!currentEditingCollection) return;
    if (currentEditingCollection.id === "default_fiqh") {
        showToast("⚠️ لا يمكن حذف النموذج الافتراضي، يمكنك التعديل عليه أو استعادته");
        return;
    }

    if (!confirm(`هل أنت متأكد من حذف تجميعة «${currentEditingCollection.name}» نهائياً؟`)) {
        return;
    }

    bookCollections = bookCollections.filter(c => c.id !== currentEditingCollection.id);
    activeCollectionId = "default_fiqh";
    saveCollectionsToStorage();
    updateCollectionSelectDropdown();
    applyActiveCollection(true);
    closeCollectionManagerModal();
    showToast(`✓ تم حذف التجميعة بنجاح`);
}

// فتح نافذة إنشاء تجميعة جديدة
function openNewCollectionModal() {
    const input = document.getElementById("newColNameInput");
    if (input) input.value = "";
    const modal = document.getElementById("newCollectionModal");
    if (modal) modal.classList.add("active");
}

function closeNewCollectionModal() {
    const modal = document.getElementById("newCollectionModal");
    if (modal) modal.classList.remove("active");
}

// تأكيد إنشاء التجميعة الجديدة
async function confirmCreateNewCollection() {
    const nameInput = document.getElementById("newColNameInput");
    const name = (nameInput?.value || "").trim();
    if (!name) {
        showToast("⚠️ يرجى كتابة اسم التجميعة الجديدة");
        return;
    }

    const mode = document.querySelector('input[name="newColMode"]:checked')?.value || "copy_default";
    let sections = [];

    if (mode === "copy_default") {
        const def = bookCollections.find(c => c.id === "default_fiqh");
        if (def && def.sections) {
            sections = JSON.parse(JSON.stringify(def.sections));
        }
    } else {
        // أقسام فارغة جاهزة
        const sectionTitles = [
            "كتب اللغة والغريب", "اللغة الفقهية", "تفسير آيات الأحكام",
            "سبب الخلاف", "القواعد الفقهية والفروق", "كتب أصول الفقه",
            "الإجماع والخلاف ومنهجيته", "كتب الأحاديث", "كتب التخريج والتصحيح",
            "كتب الفقه المقارن", "كتب المذاهب", "الآثار"
        ];
        sections = sectionTitles.map(t => ({ section_name: t, books: [] }));
    }

    const newId = "col_" + Date.now();
    const newCol = {
        id: newId,
        name: name,
        description: "تجميعة كتب مخصصة بواسطة المستخدم",
        created_at: new Date().toISOString().split("T")[0],
        sections: sections
    };

    bookCollections.push(newCol);
    activeCollectionId = newId;
    saveCollectionsToStorage();
    updateCollectionSelectDropdown();
    applyActiveCollection(true);
    closeNewCollectionModal();

    // فتح شاشة التعديل مباشرة لإتاحة اختيار الكتب
    openCollectionManagerModal();
    showToast(`✓ تم إنشاء تجميعة «${name}»، يمكنك الآن تخصيص وإضافة الكتب`);
}

// =========================================================================
// نظام النماذج المساعدة المتخصصة وخط الأنابيب (Multi-Agent Pipeline System)
// =========================================================================

const ASSISTANTS_STORAGE_KEY = "shamela_assistant_models";
const PIPELINE_ENABLED_STORAGE_KEY = "shamela_pipeline_enabled";
const PIPELINE_GAP_FILL_STORAGE_KEY = "shamela_pipeline_gap_fill";

let assistantsList = [];
let isPipelineEnabled = false;
let pipelineGapFillEnabled = true;

// النماذج المقترحة الأساسية المثبتة في صدارة القائمة
const PRIMARY_RECOMMENDED_MODELS = [
    { id: "anthropic/claude-sonnet-4.5", name: "Claude Sonnet 4.5", comp: "anthropic", context: "200k", desc: "الأقوى في التحقيق والتأصيل وصياغة العزو والمقارنات", badge: "موصى به" },
    { id: "deepseek/deepseek-r1", name: "DeepSeek R1 (Reasoning)", comp: "deepseek", context: "128k", desc: "نموذج التفكير المنطقي الفائق واستخراج العلل والاستدلال", badge: "تفكير واستدلال" },
    { id: "openai/gpt-4o", name: "GPT-4o Omnimodel", comp: "openai", context: "128k", desc: "نموذج شامل ودقيق في الربط والاستخلاص وتنسيق المخرجات", badge: "شامل متقدم" },
    { id: "google/gemini-2.0-flash-001", name: "Gemini 2.0 Flash", comp: "google", context: "1M+", desc: "سياق عملاق يتسع لمئات صفحات كتب التراث دفعة واحدة", badge: "سياق ضخم" },
    { id: "qwen/qwen-2.5-72b-instruct", name: "Qwen 2.5 72B Instruct", comp: "qwen", context: "128k", desc: "أصالة وبراعة عالية جداً في نصوص اللغة والحديث والشعر", badge: "متفوق عربياً" },
    { id: "meta-llama/llama-3.3-70b-instruct", name: "Llama 3.3 70B Instruct", comp: "meta", context: "128k", desc: "سرعة ودقة عالية في الفرز والتصنيف والاستخلاص", badge: "دقة وسرعة" },
    { id: "mistralai/mistral-large-2411", name: "Mistral Large", comp: "mistral", context: "128k", desc: "أداء ممتاز في الاستدلال وتحليل النصوص المعقدة", badge: "تحليل واستدلال" },
    { id: "x-ai/grok-2-1212", name: "Grok 2", comp: "xai", context: "128k", desc: "نموذج حديث متقدم في الاستيعاب والتحليل المعرفي", badge: "حديث متقدم" },
    { id: "qwen2.5:7b", name: "Qwen 2.5 7B (Ollama محلي)", comp: "ollama", context: "32k", desc: "نموذج محلي خفيف وسريع على جهازك دون إنترنت أو تكلفة", badge: "🦙 محلي خفيف" },
    { id: "deepseek-r1:7b", name: "DeepSeek R1 7B (Ollama محلي)", comp: "ollama", context: "32k", desc: "استدلال وتفكير فائق محلياً عبر Ollama دون إنترنت", badge: "🧠 تفكير محلي" },
    { id: "local-model", name: "LM Studio (النموذج المحمّل)", comp: "lmstudio", context: "محلي", desc: "النموذج النشط حالياً والمحمّل في واجهة LM Studio المحلية", badge: "🧪 LM Studio" }
];

// ذاكرة تخزين مؤقتة لكافة نماذج OpenRouter (458+ نموذجاً)
let allOpenRouterModelsCache = [];
let isOpenRouterPreloading = false;

// دالة التأكد من جلب وتخزين كافة نماذج OpenRouter والنماذج المحلية
async function ensureOpenRouterModelsLoaded() {
    if (allOpenRouterModelsCache && allOpenRouterModelsCache.length > 50) {
        return allOpenRouterModelsCache;
    }
    if (isOpenRouterPreloading) return allOpenRouterModelsCache;
    isOpenRouterPreloading = true;
    try {
        const apiKey = document.getElementById("aiApiKeyInput")?.value || "";
        let url = `/api/ai/models?provider=openrouter`;
        if (apiKey) url += `&api_key=${encodeURIComponent(apiKey)}`;
        const res = await fetch(url);
        const data = await res.json();
        if (data && data.models && data.models.length > 0) {
            allOpenRouterModelsCache = data.models.map(m => {
                if (typeof m === "string") {
                    return {
                        id: m,
                        name: m,
                        company: m.includes("/") ? m.split("/")[0] : "openrouter"
                    };
                }
                return {
                    id: m.id || m.name,
                    name: m.name || m.id,
                    company: m.company || (m.id && m.id.includes("/") ? m.id.split("/")[0] : "openrouter"),
                    context_length: m.context_length
                };
            });
            // حقن النماذج المحلية في الذاكرة المؤقتة للتصفية السريعة
            const localModels = [
                { id: "qwen2.5:7b", name: "Qwen 2.5 7B (Ollama)", company: "ollama", context_length: 32768 },
                { id: "qwen2.5:14b", name: "Qwen 2.5 14B (Ollama)", company: "ollama", context_length: 32768 },
                { id: "qwen2.5:32b", name: "Qwen 2.5 32B (Ollama)", company: "ollama", context_length: 32768 },
                { id: "deepseek-r1:7b", name: "DeepSeek R1 7B (Ollama)", company: "ollama", context_length: 32768 },
                { id: "deepseek-r1:8b", name: "DeepSeek R1 8B (Ollama)", company: "ollama", context_length: 32768 },
                { id: "deepseek-r1:14b", name: "DeepSeek R1 14B (Ollama)", company: "ollama", context_length: 32768 },
                { id: "llama3.1:8b", name: "Llama 3.1 8B (Ollama)", company: "ollama", context_length: 131072 },
                { id: "local-model", name: "LM Studio Loaded Model", company: "lmstudio", context_length: 32768 },
                { id: "qwen2.5-7b-instruct", name: "Qwen 2.5 7B (LM Studio)", company: "lmstudio", context_length: 32768 },
                { id: "deepseek-r1-distill-qwen-7b", name: "DeepSeek R1 Distill 7B (LM Studio)", company: "lmstudio", context_length: 32768 }
            ];
            localModels.forEach(lm => {
                if (!allOpenRouterModelsCache.some(m => m.id === lm.id)) {
                    allOpenRouterModelsCache.push(lm);
                }
            });
            const pipeKpiProvider = document.getElementById("pipeKpiProvider");
            if (pipeKpiProvider && allOpenRouterModelsCache.length > 0) {
                pipeKpiProvider.innerText = `${allOpenRouterModelsCache.length} نموذج`;
            }
        }
    } catch (e) {
        console.warn("Could not preload openrouter models:", e);
    } finally {
        isOpenRouterPreloading = false;
    }
    return allOpenRouterModelsCache;
}

// تهيئة نظام النماذج المساعدة عند تشغيل التطبيق
async function initAssistants() {
    try {
        const stored = localStorage.getItem(ASSISTANTS_STORAGE_KEY);
        if (stored) {
            assistantsList = JSON.parse(stored);
            // ترقية وتحديث المعرفات القديمة لـ Claude 3.5 Sonnet إلى المعرف النشط
            let migrated = false;
            assistantsList.forEach(a => {
                if (a.model === "anthropic/claude-3.5-sonnet") {
                    a.model = "anthropic/claude-sonnet-4.5";
                    migrated = true;
                }
                if (!a.collection_name) {
                    a.collection_name = "badr_all_tsh_corpus";
                    migrated = true;
                }
                if (a.use_reranker === undefined) {
                    a.use_reranker = true;
                    migrated = true;
                }
                if (!a.rag_mode) {
                    a.rag_mode = "hybrid";
                    migrated = true;
                }
                if (!a.max_tokens) {
                    a.max_tokens = 264000;
                    migrated = true;
                }
                if (!a.reranker_limit) {
                    a.reranker_limit = 10;
                    migrated = true;
                }
                if (!a.reranker_model) {
                    a.reranker_model = "BAAI/bge-reranker-v2-m3";
                    migrated = true;
                }
                if (!a.output_format) {
                    const defaultFormats = {
                        'sibawayh': 'عرض المعاني اللغوية والاشتقاقية من المعاجم والتعريفات الاصطلاحية لكل كتاب على حدة، متبوعاً بالعزو المكتبي الصريح (اسم الكتاب، المؤلف، الجزء، الصفحة)، وفي ختام الرد قائمة المراجع الكاملة.',
                        'bukhari': 'سرد نصوص الأحاديث المستخرجة بنزع الإسناد وسرد المتن مباشرة، مع التخريج الإلزامي لكل حديث: أخرجه [الكتاب] عن [الصحابي]، (جـ [الجزء]، صـ [الصفحة]، رقم [الحديث])، دون أي شرح أو خلاف فقهي أو تعليق، ثم قائمة المراجع.',
                        'malik': 'تحرير معتمد المذهب المالكي في المسألة (المشهور والراجح من المدونة ومختصر خليل وشروحه)، وسرد أدلة المذهب من كتبه المعزوة، مع التوثيق المكتبي الدقيق (الكتاب، الجزء، الصفحة)، دون خلط بالمذاهب الأخرى.',
                        'shatibi': 'تأصيل المسألة بالقواعد الأصولية والمقاصد الشرعية ذات الصلة من أمهات كتب الأصول مع بيان وجه انطباق القاعدة وعزو النصوص (الكتاب، الجزء، الصفحة).'
                    };
                    a.output_format = defaultFormats[a.id] || "تقرير تحقيقي علمي رصين ومستوفٍ مع العزو المكتبي الصريح (الكتاب، المؤلف، الجزء، الصفحة) وقائمة المصادر والمراجع التراثية.";
                    migrated = true;
                }
            });
            if (migrated) saveAssistantsSettings();
        }
    } catch (e) {
        console.warn("Error reading stored assistants:", e);
    }

    // إذا لم تكن هناك نماذج مساعدة بعد، نقوم بجلب النماذج التراثية الافتراضية
    if (!assistantsList || assistantsList.length === 0) {
        try {
            const res = await fetch("/api/ai/assistants/default");
            if (res.ok) {
                assistantsList = await res.json();
                saveAssistantsSettings();
            }
        } catch (e) {
            console.warn("Could not load default assistants:", e);
        }
    }

    // استعادة حالة تفعيل خط الأنابيب
    const savedPipeline = localStorage.getItem(PIPELINE_ENABLED_STORAGE_KEY);
    if (savedPipeline !== null) {
        isPipelineEnabled = savedPipeline === "true";
    }

    const savedGapFill = localStorage.getItem(PIPELINE_GAP_FILL_STORAGE_KEY);
    if (savedGapFill !== null) {
        pipelineGapFillEnabled = savedGapFill === "true";
    }

    // مزامنة عناصر الواجهة
    const mainToggle = document.getElementById("aiPipelineEnabled");
    if (mainToggle) mainToggle.checked = isPipelineEnabled;

    const quickToggle = document.getElementById("aiQuickPipeline");
    if (quickToggle) quickToggle.checked = isPipelineEnabled;

    const gapToggle = document.getElementById("aiPipelineGapFill");
    if (gapToggle) gapToggle.checked = pipelineGapFillEnabled;

    renderAssistantsList();
    updateAssistantsActiveBadge();
    syncAssistantsToMainSystemPrompt();
    syncAssistantsToBackend();
}

function syncAssistantsToBackend() {
    try {
        const activeList = (assistantsList || []).filter(a => a.enabled !== false);
        fetch('/api/ai/agents/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ assistants: activeList })
        }).then(r => r.json()).then(data => {
            console.log("✓ Session assistants synced:", data.count);
        }).catch(err => console.warn("Sync session agents warning:", err));
    } catch (e) {
        console.warn("syncAssistantsToBackend error:", e);
    }
}

// توليد نص قائمة فريق المساعدين الملحقة تلقائياً بنهاية موجه النموذج الأساسي
function generateAssistantsPromptManifest(activeList) {
    if (!activeList || activeList.length === 0) return "";
    let lines = [
        "[فريق النماذج المساعدة المتخصصة المتاحة لك (Specialized Assistant Agents)]:",
        "لديك فريق من المساعدين المتخصصين يمكنك تفكيك المسألة والاستعانة بهم بحسب تخصص كل منهم:"
    ];
    activeList.forEach((ast, idx) => {
        const name = ast.name || `مساعد_${idx + 1}`;
        const role = ast.role || "بحث وتحقيق تخصصي";
        lines.push(`${idx + 1}. [${name}]: تخصص (${role})، ويبحث في نطاق كتبه الخاصة.`);
    });
    lines.push("");
    lines.push("استند إلى تقارير هؤلاء المساعدين، وتحقق من سد أي نقص أو عجز علمي، ثم ادمج نتائجهم في تحرير علمي رصين ومستوفٍ موثق حسب المطلوب.");
    lines.push("*مهم* لا تذكر في إجابتك الاعتماد على المساعدين أو النسبة إليهم مثل: قال المساعد.. أو هذا ما استخرجه المساعد؛ بل يجب الوثوق بهم تماما وفي حال عدم وجود إجابة من اي مساعد تجاوز المساعد دون تعليق.");
    return lines.join("\n");
}

// مزامنة قائمة المساعدين النشطين تلقائياً مع نهاية prompt system للنموذج الأساسي
function syncAssistantsToMainSystemPrompt() {
    const sysEl = document.getElementById("aiSystemPrompt");
    if (!sysEl) return;

    let currentVal = sysEl.value;
    const marker = "[فريق النماذج المساعدة المتخصصة المتاحة لك (Specialized Assistant Agents)]";
    let basePrompt = currentVal;

    const markerIdx = currentVal.indexOf(marker);
    if (markerIdx !== -1) {
        basePrompt = currentVal.substring(0, markerIdx).trim();
    } else {
        basePrompt = currentVal.trim();
    }

    const activeList = (assistantsList || []).filter(a => a.enabled);
    if (activeList.length > 0) {
        const manifest = generateAssistantsPromptManifest(activeList);
        sysEl.value = (basePrompt ? basePrompt + "\n\n" : "") + manifest;
    } else {
        sysEl.value = basePrompt;
    }

    if (typeof saveAiSettings === "function") {
        saveAiSettings();
    }
}

// حفظ النماذج المساعدة والإعدادات في التخزين المحلي
function saveAssistantsSettings() {
    try {
        localStorage.setItem(ASSISTANTS_STORAGE_KEY, JSON.stringify(assistantsList));
        localStorage.setItem(PIPELINE_ENABLED_STORAGE_KEY, isPipelineEnabled ? "true" : "false");
        
        const gapEl = document.getElementById("aiPipelineGapFill");
        if (gapEl) {
            pipelineGapFillEnabled = gapEl.checked;
            localStorage.setItem(PIPELINE_GAP_FILL_STORAGE_KEY, pipelineGapFillEnabled ? "true" : "false");
        }

        // مزامنة فورية لوكلاء الجلسة مع الخادم
        syncAssistantsToBackend();
    } catch (e) {
        console.warn("Error saving assistants settings:", e);
    }
    updateAssistantsActiveBadge();
    syncAssistantsToMainSystemPrompt();
}

// تحديث شارة عدد النماذج النشطة في الشريط والصفحة
function updateAssistantsActiveBadge() {
    const badge = document.getElementById("assistantsActiveCountBadge");
    const navBadge = document.getElementById("navPipelineBadge");
    const pipeKpiTotal = document.getElementById("pipeKpiTotal");
    const pipeKpiActive = document.getElementById("pipeKpiActive");

    const totalCount = (assistantsList || []).length;
    const activeCount = (assistantsList || []).filter(a => a.enabled).length;

    if (badge) {
        badge.innerText = `${activeCount} نشط من ${totalCount}`;
        badge.style.background = activeCount > 0 ? "rgba(16, 185, 129, 0.25)" : "rgba(148, 163, 184, 0.15)";
        badge.style.color = activeCount > 0 ? "#34d399" : "#94a3b8";
    }

    if (navBadge) {
        navBadge.innerText = activeCount;
    }

    if (pipeKpiTotal) pipeKpiTotal.innerText = totalCount;
    if (pipeKpiActive) pipeKpiActive.innerText = activeCount;
}

// استخراج أيقونة تعبيرية مناسبة للمساعد بحسب اسمه وتخصصه
function getAssistantAvatarIcon(name = "", role = "") {
    const str = (name + " " + role).toLowerCase();
    if (str.includes("لغ") || str.includes("معجم") || str.includes("سيبويه") || str.includes("غريب")) return "📖";
    if (str.includes("حديث") || str.includes("تخريج") || str.includes("بخاري") || str.includes("سنة") || str.includes("أثر")) return "📜";
    if (str.includes("مالك") || str.includes("فقه") || str.includes("مذهب") || str.includes("حنبلي") || str.includes("شافعي") || str.includes("حنفي") || str.includes("أبو حنيفة") || str.includes("أحمد")) return "⚖️";
    if (str.includes("أصول") || str.includes("مقاصد") || str.includes("شاطبي") || str.includes("قواعد")) return "📐";
    if (str.includes("تفسير") || str.includes("قرآن") || str.includes("آيات")) return "📗";
    return "🤖";
}

// بناء وعرض كروت النماذج المساعدة في لوحة الإعدادات
function renderAssistantsList() {
    const listContainers = [
        document.getElementById("assistantsCardsList"),
        document.getElementById("pipelinePageAssistantsGrid")
    ];

    const hasAnyContainer = listContainers.some(c => c !== null);
    if (!hasAnyContainer) return;

    if (!assistantsList || assistantsList.length === 0) {
        const emptyHtml = `
            <div style="grid-column: 1 / -1; padding: 2.5rem 1.5rem; text-align: center; color: #94a3b8; background: rgba(15, 23, 42, 0.4); border-radius: 12px; border: 1px dashed rgba(255, 255, 255, 0.15);">
                <div style="font-size: 2.5rem; margin-bottom: 0.65rem;">🤖</div>
                <div style="font-weight: 800; font-size: 1.1rem; color: #e2e8f0; margin-bottom: 0.35rem;">لا توجد نماذج مساعدة حالياً</div>
                <div style="font-size: 0.85rem; margin-bottom: 1.1rem; color: #94a3b8;">اضغط على «إضافة نموذج مساعد» أو «استعادة النماذج التراثية الأساسية» للبدء بالبايبلاين.</div>
                <button type="button" class="btn-action-primary" onclick="loadDefaultScholarlyAssistants()">
                    ⚡ استيراد النماذج التراثية الأساسية (سيبويه، البخاري، مالك، الشاطبي)
                </button>
            </div>
        `;
        listContainers.forEach(c => { if (c) c.innerHTML = emptyHtml; });
        updateAssistantsActiveBadge();
        return;
    }

    const cardsHtml = assistantsList.map((ast, idx) => {
        const icon = getAssistantAvatarIcon(ast.name, ast.role);
        const isCollapsed = ast._collapsed === true;
        const isDisabled = !ast.enabled;

        // معلومات النموذج المختار
        let modelTitle = "تلقائي (استخدام نموذج المزود الأساسي)";
        let modelCompSlug = "other";
        if (ast.model) {
            const foundPrimary = PRIMARY_RECOMMENDED_MODELS.find(m => m.id === ast.model);
            if (foundPrimary) {
                modelTitle = foundPrimary.name;
                modelCompSlug = foundPrimary.comp;
            } else {
                const foundAll = allOpenRouterModelsCache.find(m => m.id === ast.model);
                if (foundAll) {
                    modelTitle = foundAll.name || foundAll.id;
                    modelCompSlug = foundAll.company || "openrouter";
                } else {
                    modelTitle = ast.model;
                    modelCompSlug = ast.model.includes("/") ? ast.model.split("/")[0] : "openrouter";
                }
            }
        }
        const compInfo = getCompanyInfo(ast.model || "test", modelCompSlug);
        const logoSvg = compInfo.logo || `<span>${compInfo.icon}</span>`;

        // استخراج وتنسيق النطاق
        const scopeType = ast.scope_type || (ast.collection_id ? "collection" : (ast.category_id ? "category" : (ast.book_titles && ast.book_titles.length > 0 ? "books" : "all")));
        let scopeBadgeText = "🌐 عموم الشاملة (بدون حصر)";
        let booksPreviewHtml = "";

        if (scopeType === "collection") {
            const col = (bookCollections || []).find(c => c.id === ast.collection_id);
            const colName = col ? col.name : "تجميعة مخصصة";
            const booksCount = (ast.book_titles && ast.book_titles.length > 0) ? ast.book_titles.length : (col ? (col.sections || []).reduce((acc, s) => acc + (s.books || []).length, 0) : 0);
            scopeBadgeText = `📦 تجميعة: ${escapeHtml(colName)} (${booksCount} كتب)`;
        } else if (scopeType === "category") {
            const cat = (categoriesList || []).find(c => String(c.category_id) === String(ast.category_id));
            const catName = cat ? cat.category_name_ar : "قسم مخصص";
            scopeBadgeText = `📂 قسم كامل: ${escapeHtml(catName)} (${cat ? cat.book_count : 0} كتاب)`;
        } else if (scopeType === "books" || (ast.book_titles && ast.book_titles.length > 0)) {
            const bCount = (ast.book_titles || []).length;
            scopeBadgeText = `📚 حصر مخصص: (${bCount} كتب محددة بالاسم)`;
        }

        if (ast.book_titles && ast.book_titles.length > 0) {
            const shown = ast.book_titles.slice(0, 5);
            booksPreviewHtml = shown.map(bt => `<span class="ast-scope-book-chip">📖 ${escapeHtml(bt)}</span>`).join("");
            if (ast.book_titles.length > 5) {
                booksPreviewHtml += `<span class="ast-scope-book-chip" style="color: #38bdf8;">+ ${ast.book_titles.length - 5} كتب أخرى...</span>`;
            }
        } else if (scopeType === "all") {
            booksPreviewHtml = `<span style="font-size: 0.72rem; color: #64748b;">يبحث في عموم الـ ٥ ملايين صفحة وفق التشابه الدلالي</span>`;
        }

        return `
            <div class="assistant-card ${isDisabled ? 'disabled' : ''}" id="assistant-card-${ast.id}">
                <!-- ترويسة كرت المساعد -->
                <div class="assistant-card-header">
                    <div class="ast-header-left">
                        <label class="checkbox-label" style="margin: 0; cursor: pointer;" title="تفعيل / تعطيل هذا المساعد">
                            <input type="checkbox" ${ast.enabled ? 'checked' : ''} onchange="toggleAssistantEnabled('${ast.id}', this.checked)">
                        </label>
                        <div class="ast-icon-avatar">${icon}</div>
                        <div class="ast-title-group">
                            <div class="ast-name-label">${escapeHtml(ast.name || 'مساعد جديد')}</div>
                            <div style="display: flex; gap: 4px; flex-wrap: wrap; align-items: center; margin-top: 1px;">
                                <span class="ast-role-badge">🎯 ${escapeHtml(ast.role || 'تخصص عام')}</span>
                                ${ast.output_format ? `<span class="ast-format-badge" title="${escapeHtml(ast.output_format)}">📐 ${escapeHtml(ast.output_format.length > 28 ? ast.output_format.substring(0, 28) + '...' : ast.output_format)}</span>` : ''}
                            </div>
                        </div>
                    </div>
                    <div class="ast-header-actions">
                        <button type="button" class="ast-btn-toggle" onclick="toggleAssistantCardCollapse('${ast.id}')" title="طي / فتح الكرت">
                            ${isCollapsed ? '▼ عرض' : '▲ طي'}
                        </button>
                        <button type="button" class="ast-btn-action" onclick="duplicateAssistantCard('${ast.id}')" title="تكرار / استنساخ هذا المساعد">
                            📋
                        </button>
                        <button type="button" class="ast-btn-action" onclick="deleteAssistantCard('${ast.id}')" title="حذف هذا المساعد">
                            🗑️
                        </button>
                    </div>
                </div>

                <!-- جسم كرت المساعد -->
                <div class="assistant-card-body" style="display: ${isCollapsed ? 'none' : 'flex'};">
                    <div class="ast-grid-2">
                        <div class="form-group">
                            <label style="font-size: 0.76rem; font-weight: 700;">اسم النموذج المساعد:</label>
                            <input 
                                type="text" 
                                class="filter-select w-100" 
                                value="${escapeHtml(ast.name || '')}" 
                                placeholder="مثلاً: سيبويه - خبير المعاجم" 
                                oninput="updateAssistantField('${ast.id}', 'name', this.value)"
                            >
                        </div>
                        <div class="form-group">
                            <label style="font-size: 0.76rem; font-weight: 700;">التوجيه الفرعي والدور (التخصص الحصري):</label>
                            <input 
                                type="text" 
                                class="filter-select w-100" 
                                value="${escapeHtml(ast.role || '')}" 
                                placeholder="مثلاً: تأصيل المعاني اللغوية وغريب الحديث" 
                                oninput="updateAssistantField('${ast.id}', 'role', this.value)"
                            >
                        </div>
                    </div>

                    <!-- اختيار وتحديد المزود والنموذج الذكي للمساعد -->
                    <div class="form-group">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.35rem; flex-wrap: wrap; gap: 0.35rem;">
                            <label style="font-size: 0.76rem; font-weight: 700; color: var(--text-main); margin: 0;">
                                🤖 المزود والنموذج الذكي للمساعد:
                            </label>
                            <div style="display: flex; align-items: center; gap: 0.35rem;">
                                <span style="font-size: 0.72rem; color: var(--text-muted);">المزود:</span>
                                <select class="filter-select" style="padding: 0.15rem 0.5rem; font-size: 0.72rem; height: auto;" onchange="updateAssistantProvider('${ast.id}', this.value)">
                                    <option value="" ${(ast.provider === '' || !ast.provider) ? 'selected' : ''}>🌐 تلقائي (مزود المنصة)</option>
                                    <option value="ollama" ${ast.provider === 'ollama' ? 'selected' : ''}>🦙 Ollama (محلي)</option>
                                    <option value="lmstudio" ${ast.provider === 'lmstudio' ? 'selected' : ''}>🧪 LM Studio (محلي)</option>
                                    <option value="openrouter" ${ast.provider === 'openrouter' ? 'selected' : ''}>🌐 OpenRouter</option>
                                    <option value="openai" ${ast.provider === 'openai' ? 'selected' : ''}>🟢 OpenAI</option>
                                    <option value="gemini" ${ast.provider === 'gemini' ? 'selected' : ''}>🔷 Google Gemini</option>
                                    <option value="claude" ${ast.provider === 'claude' ? 'selected' : ''}>🟣 Anthropic Claude</option>
                                </select>
                            </div>
                        </div>
                        <div class="ast-model-selector-card">
                            <div class="ast-model-display-info">
                                <div class="ast-model-logo-badge">${logoSvg}</div>
                                <div style="overflow: hidden;">
                                    <div class="ast-model-name-text">${escapeHtml(modelTitle)}</div>
                                    <div class="ast-model-id-text" dir="ltr">${escapeHtml(ast.model || 'auto_platform_default')}</div>
                                </div>
                            </div>
                            <button type="button" class="btn-open-model-picker" onclick="openAssistantModelPickerModal('${ast.id}')">
                                🔄 اختيار النموذج أو تحديده
                            </button>
                        </div>
                    </div>

                    <!-- نطاق البحث وحصر كتب الشاملة لهذا المساعد -->
                    <div class="form-group">
                        <label style="font-size: 0.76rem; font-weight: 700; color: var(--text-main); display: block; margin-bottom: 0.35rem;">
                            📚 نطاق كتب الشاملة المخصصة لهذا المساعد:
                        </label>
                        <div class="ast-scope-summary-card">
                            <div class="ast-scope-header-row">
                                <span class="ast-scope-badge-type">${scopeBadgeText}</span>
                                <button type="button" class="btn-open-scope-picker" onclick="openAssistantScopeModal('${ast.id}')">
                                    ⚙️ تخصيص وتحديد الكتب والأقسام
                                </button>
                            </div>
                            <div class="ast-scope-books-preview">
                                ${booksPreviewHtml}
                            </div>
                        </div>
                    </div>

                    <!-- إعدادات نموذج التضمين وطريقة الاستدلال والفرز المتقاطع -->
                    <div class="ast-embedding-config-box" style="padding: 0.65rem 0.8rem; border-radius: var(--radius-sm); margin-bottom: 0.65rem;">
                        <div class="ast-grid-2" style="margin-bottom: 0.5rem;">
                            <div class="form-group" style="margin: 0;">
                                <label style="font-size: 0.74rem; font-weight: 700; color: var(--accent-cyan);">🧠 فهرس ونموذج التضمين:</label>
                                <select class="filter-select w-100" onchange="updateAssistantField('${ast.id}', 'collection_name', this.value)">
                                    <option value="badr_all_tsh_corpus" ${(ast.collection_name === 'badr_all_tsh_corpus' || !ast.collection_name) ? 'selected' : ''}>⚡ بدر الهجين المطور (Badr 768 + BM25 Sparse — ٧.٥٨M)</option>
                                    <option value="badr_corpus" ${ast.collection_name === 'badr_corpus' ? 'selected' : ''}>✨ لقطة بدر المشكولة (Badr Embedding — ٧.٥٨M)</option>
                                    <option value="badr_tch_corpus" ${ast.collection_name === 'badr_tch_corpus' ? 'selected' : ''}>🔤 لقطة بدر بدون تشكيل (Badr Unvoweled — ٧.٥٨M)</option>
                                    <option value="shamela_corpus" ${ast.collection_name === 'shamela_corpus' ? 'selected' : ''}>📚 شاملة BGE-M3 (هجين لغوي وعصبي — ٥.١٥M)</option>
                                </select>
                            </div>
                            <div class="form-group" style="margin: 0;">
                                <label style="font-size: 0.74rem; font-weight: 700; color: var(--accent-emerald);">🔍 طريقة الاستدلال والبحث:</label>
                                <select class="filter-select w-100" onchange="updateAssistantField('${ast.id}', 'rag_mode', this.value)">
                                    <option value="hybrid" ${(ast.rag_mode === 'hybrid' || !ast.rag_mode) ? 'selected' : ''}>⚡ بحث هجين (Dense + Sparse RRF)</option>
                                    <option value="dense" ${ast.rag_mode === 'dense' ? 'selected' : ''}>🧠 بحث دلالي عصبي (Dense Cosine)</option>
                                    <option value="sparse" ${ast.rag_mode === 'sparse' ? 'selected' : ''}>🔍 بحث لفظي دقيق (Lexical Sparse)</option>
                                    <option value="full" ${ast.rag_mode === 'full' ? 'selected' : ''}>🌐 كامل يجمع الجميع (Full Combined)</option>
                                </select>
                            </div>
                        </div>

                        <!-- إعدادات نموذج الـ Reranker الخاص بالمساعد -->
                        <div class="ast-grid-3" style="align-items: flex-end; padding-top: 0.45rem; border-top: 1px dashed var(--border-container);">
                            <div class="form-group" style="margin: 0;">
                                <label class="custom-toggle" style="display: flex; align-items: center; gap: 5px; cursor: pointer; user-select: none; margin: 0; padding-bottom: 5px;">
                                    <input 
                                        type="checkbox" 
                                        ${ast.use_reranker !== false ? 'checked' : ''} 
                                        onchange="updateAssistantField('${ast.id}', 'use_reranker', this.checked); const m = document.getElementById('ast-reranker-model-${ast.id}'); const l = document.getElementById('ast-reranker-limit-${ast.id}'); if (m) { m.disabled = !this.checked; m.style.opacity = this.checked ? '1' : '0.45'; } if (l) { l.disabled = !this.checked; l.style.opacity = this.checked ? '1' : '0.45'; }"
                                        style="accent-color: #38bdf8; width: 14px; height: 14px; cursor: pointer;"
                                    >
                                    <span style="font-weight: 700; color: #38bdf8; font-size: 0.74rem;">🎯 تفعيل الفرز المتقاطع:</span>
                                </label>
                            </div>
                            <div class="form-group" style="margin: 0;">
                                <label style="font-size: 0.72rem; font-weight: 700; color: #38bdf8; margin-bottom: 2px; display: block;">🤖 نموذج الـ Reranker:</label>
                                <select 
                                    id="ast-reranker-model-${ast.id}"
                                    class="filter-select w-100"
                                    ${ast.use_reranker === false ? 'disabled style="opacity: 0.45;"' : ''}
                                    onchange="updateAssistantField('${ast.id}', 'reranker_model', this.value)"
                                    style="font-size: 0.76rem;"
                                >
                                    <option value="BAAI/bge-reranker-v2-m3" ${(ast.reranker_model === 'BAAI/bge-reranker-v2-m3' || !ast.reranker_model) ? 'selected' : ''}>⭐ BGE-Reranker-v2-m3 (8K)</option>
                                    <option value="NAMAA-Space/Namaa-ARA-Reranker-V1" ${ast.reranker_model === 'NAMAA-Space/Namaa-ARA-Reranker-V1' ? 'selected' : ''}>🇸🇦 Namaa ARA Reranker V1</option>
                                    <option value="AzeerDev/arabic-reranker" ${ast.reranker_model === 'AzeerDev/arabic-reranker' ? 'selected' : ''}>⚡ AzeerDev Arabic (AraBERT)</option>
                                    <option value="oddadmix/arabic-reranker-v1" ${ast.reranker_model === 'oddadmix/arabic-reranker-v1' ? 'selected' : ''}>🔍 oddadmix Arabic v1</option>
                                    <option value="Alibaba-NLP/gte-multilingual-reranker-base" ${ast.reranker_model === 'Alibaba-NLP/gte-multilingual-reranker-base' ? 'selected' : ''}>🌐 Alibaba GTE Base</option>
                                    <option value="ZakariaAlMoktar/presto-qwen3-reranker-0.6b-arabic-ecommerce" ${ast.reranker_model === 'ZakariaAlMoktar/presto-qwen3-reranker-0.6b-arabic-ecommerce' ? 'selected' : ''}>🛍️ Presto Qwen3 0.6B</option>
                                    <option value="Qwen/Qwen3-Reranker-4B" ${ast.reranker_model === 'Qwen/Qwen3-Reranker-4B' ? 'selected' : ''}>🚀 Qwen3 Reranker 4B</option>
                                </select>
                            </div>
                            <div class="form-group" style="margin: 0;">
                                <label style="font-size: 0.72rem; font-weight: 700; color: #38bdf8; margin-bottom: 2px; display: block;">🎯 سقف نتائج الفرز:</label>
                                <select 
                                    id="ast-reranker-limit-${ast.id}"
                                    class="filter-select w-100" 
                                    ${ast.use_reranker === false ? 'disabled style="opacity: 0.45;"' : ''}
                                    onchange="updateAssistantField('${ast.id}', 'reranker_limit', parseInt(this.value))"
                                    title="تحديد عدد نتائج نموذج Reranker لتفادي تضخم التوكنز"
                                    style="font-size: 0.76rem;"
                                >
                                    <option value="3" ${ast.reranker_limit === 3 ? 'selected' : ''}>٣ نتائج مصفاة</option>
                                    <option value="5" ${ast.reranker_limit === 5 ? 'selected' : ''}>٥ نتائج مصفاة</option>
                                    <option value="10" ${(ast.reranker_limit === 10 || !ast.reranker_limit) ? 'selected' : ''}>١٠ نتائج (افتراضي معتدل)</option>
                                    <option value="15" ${ast.reranker_limit === 15 ? 'selected' : ''}>١٥ نتيجة مصفاة</option>
                                    <option value="20" ${ast.reranker_limit === 20 ? 'selected' : ''}>٢٠ نتيجة مصفاة</option>
                                    <option value="25" ${ast.reranker_limit === 25 ? 'selected' : ''}>٢٥ نتيجة مصفاة</option>
                                    <option value="30" ${ast.reranker_limit === 30 ? 'selected' : ''}>٣٠ نتيجة مصفاة</option>
                                    <option value="35" ${ast.reranker_limit === 35 ? 'selected' : ''}>٣٥ نتيجة مصفاة</option>
                                    <option value="40" ${ast.reranker_limit === 40 ? 'selected' : ''}>٤٠ نتيجة مصفاة</option>
                                    <option value="50" ${ast.reranker_limit === 50 ? 'selected' : ''}>٥٠ نتيجة مصفاة</option>
                                    <option value="60" ${ast.reranker_limit === 60 ? 'selected' : ''}>٦٠ نتيجة مصفاة</option>
                                    <option value="70" ${ast.reranker_limit === 70 ? 'selected' : ''}>٧٠ نتيجة مصفاة</option>
                                    <option value="80" ${ast.reranker_limit === 80 ? 'selected' : ''}>٨٠ نتيجة مصفاة</option>
                                    <option value="90" ${ast.reranker_limit === 90 ? 'selected' : ''}>٩٠ نتيجة مصفاة</option>
                                    <option value="100" ${ast.reranker_limit === 100 ? 'selected' : ''}>١٠٠ نتيجة مصفاة</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    <!-- معلمات طول السياق وسقف الرموز (حتى 1M مليون) والتوليد -->
                    <div class="ast-grid-3">
                        <div class="form-group">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px;">
                                <label style="font-size: 0.74rem; font-weight: 700; color: #fbbf24;">⚡ طول السياق (إلى 1M):</label>
                                <span id="ast-tokens-badge-${ast.id}" style="font-size: 0.7rem; color: #fbbf24; font-weight: 700;">
                                    ${formatTokensBadge(ast.max_tokens || 264000)}
                                </span>
                            </div>
                            <input 
                                type="number" 
                                id="ast-tokens-input-${ast.id}"
                                min="1000" 
                                max="1000000" 
                                step="1000" 
                                value="${ast.max_tokens || 264000}" 
                                class="filter-select w-100" 
                                style="font-weight: 700; color: #f8fafc;"
                                placeholder="طول السياق (حتى 1000000)"
                                onchange="updateAssistantTokens('${ast.id}', this.value)"
                            >
                            <div class="ast-tokens-presets" style="display: flex; flex-wrap: wrap; gap: 3px; margin-top: 4px;">
                                <button type="button" class="btn-token-preset" onclick="setAssistantTokens('${ast.id}', 8000)">8K</button>
                                <button type="button" class="btn-token-preset" onclick="setAssistantTokens('${ast.id}', 32000)">32K</button>
                                <button type="button" class="btn-token-preset" onclick="setAssistantTokens('${ast.id}', 64000)">64K</button>
                                <button type="button" class="btn-token-preset" onclick="setAssistantTokens('${ast.id}', 128000)">128K</button>
                                <button type="button" class="btn-token-preset" onclick="setAssistantTokens('${ast.id}', 264000)">264K</button>
                                <button type="button" class="btn-token-preset" onclick="setAssistantTokens('${ast.id}', 500000)">500K</button>
                                <button type="button" class="btn-token-preset btn-token-1m" onclick="setAssistantTokens('${ast.id}', 1000000)">⚡ 1M (مليون)</button>
                            </div>
                        </div>

                        <div class="form-group">
                            <label style="font-size: 0.74rem;">نصوص وسياقات الشاملة (RAG Limit):</label>
                            <select class="filter-select w-100" onchange="updateAssistantField('${ast.id}', 'rag_limit', parseInt(this.value))">
                                <option value="5" ${ast.rag_limit === 5 ? 'selected' : ''}>٥ صفحات سياق</option>
                                <option value="10" ${(ast.rag_limit === 10 || !ast.rag_limit) ? 'selected' : ''}>١٠ صفحات سياق</option>
                                <option value="15" ${ast.rag_limit === 15 ? 'selected' : ''}>١٥ صفحة سياق</option>
                                <option value="20" ${ast.rag_limit === 20 ? 'selected' : ''}>٢٠ صفحة سياق</option>
                                <option value="30" ${ast.rag_limit === 30 ? 'selected' : ''}>٣٠ صفحة سياق</option>
                                <option value="50" ${ast.rag_limit === 50 ? 'selected' : ''}>٥٠ صفحة سياق (موسع)</option>
                                <option value="100" ${ast.rag_limit === 100 ? 'selected' : ''}>١٠٠ صفحة سياق (كبير)</option>
                                <option value="200" ${ast.rag_limit === 200 ? 'selected' : ''}>٢٠٠ صفحة سياق (ضخم)</option>
                                <option value="300" ${ast.rag_limit === 300 ? 'selected' : ''}>٣٠٠ صفحة سياق</option>
                                <option value="500" ${ast.rag_limit === 500 ? 'selected' : ''}>٥٠٠ صفحة سياق (سياق مليون رمز)</option>
                            </select>
                        </div>

                        <div class="form-group">
                            <div style="display: flex; justify-content: space-between; font-size: 0.74rem;">
                                <span>درجة الحرارة:</span>
                                <span id="ast-temp-val-${ast.id}">${ast.temperature ?? 0.2}</span>
                            </div>
                            <input 
                                type="range" 
                                min="0" 
                                max="1.0" 
                                step="0.05" 
                                value="${ast.temperature ?? 0.2}" 
                                class="range-slider" 
                                oninput="document.getElementById('ast-temp-val-${ast.id}').innerText = this.value; updateAssistantField('${ast.id}', 'temperature', parseFloat(this.value))"
                            >
                        </div>
                    </div>

                    <!-- التوجيه التخصصي للمساعد (System Prompt) -->
                    <div class="form-group">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px;">
                            <label style="font-size: 0.76rem; font-weight: 700;">التوجيه التخصصي للمساعد (Specialized System Prompt):</label>
                            <button type="button" class="btn-preset" onclick="fillAssistantSuggestedPrompt('${ast.id}')" style="font-size: 0.7rem; padding: 1px 6px;">
                                💡 اقتراح توجيه
                            </button>
                        </div>
                        <textarea 
                            class="prompt-textarea" 
                            rows="3" 
                            placeholder="حدد التوجيه والمنهج العلمي الذي سيلتزم به هذا المساعد بدقة..."
                            oninput="updateAssistantField('${ast.id}', 'system_prompt', this.value)"
                        >${escapeHtml(ast.system_prompt || '')}</textarea>
                    </div>

                    <!-- طريقة وهيئة الإخراج الإلزامية للمساعد (Output Format) -->
                    <div class="form-group" style="background: rgba(16, 185, 129, 0.05); padding: 0.65rem 0.8rem; border-radius: var(--radius-sm); border: 1px solid rgba(16, 185, 129, 0.25); margin-top: 0.5rem;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; flex-wrap: wrap; gap: 4px;">
                            <label style="font-size: 0.76rem; font-weight: 700; color: #34d399; margin: 0;">
                                📐 طريقة وهيئة الإخراج الإلزامية لهذا النموذج الفرعي (Output Format):
                            </label>
                            <div class="ast-format-presets" style="display: flex; flex-wrap: wrap; gap: 3px;">
                                <button type="button" class="btn-token-preset" onclick="setAssistantOutputFormatPreset('${ast.id}', 'takhrij')" title="نزع الإسناد وتخريج المتن والموضع">📜 تخريج حديثي</button>
                                <button type="button" class="btn-token-preset" onclick="setAssistantOutputFormatPreset('${ast.id}', 'madhhab')" title="تحرير معتمد المذهب وسرد الأدلة">⚖️ تحرير مذهبي</button>
                                <button type="button" class="btn-token-preset" onclick="setAssistantOutputFormatPreset('${ast.id}', 'lexicon')" title="المعنى اللغوي والاصطلاحي مع العزو">📖 تأصيل لغوي</button>
                                <button type="button" class="btn-token-preset" onclick="setAssistantOutputFormatPreset('${ast.id}', 'points')" title="نقاط استدلالية موجزة">🎯 نقاط مركزة</button>
                                <button type="button" class="btn-token-preset" onclick="setAssistantOutputFormatPreset('${ast.id}', 'full_report')" title="تقرير موثق مع المراجع">📋 تقرير كامل</button>
                            </div>
                        </div>
                        <textarea 
                            id="ast-output-format-${ast.id}"
                            class="prompt-textarea" 
                            rows="2" 
                            style="border-color: rgba(16, 185, 129, 0.3); font-size: 0.8rem;"
                            placeholder="حدد طريقة وهيئة إخراج التقرير التخصصي التي يلتزم بها هذا النموذج الفرعي بدقة..."
                            oninput="updateAssistantField('${ast.id}', 'output_format', this.value)"
                        >${escapeHtml(ast.output_format || '')}</textarea>
                    </div>
                </div>
            </div>
        `;
    }).join("");

    listContainers.forEach(c => {
        if (c) c.innerHTML = cardsHtml;
    });

    updateAssistantsActiveBadge();
}

// تعيين قالب مسبق لطريقة إخراج المساعد التخصصي
function setAssistantOutputFormatPreset(id, type) {
    const presets = {
        'takhrij': 'سرد نصوص الأحاديث المستخرجة بنزع الإسناد وسرد المتن مباشرة، مع التخريج الإلزامي لكل حديث: أخرجه [الكتاب] عن [الصحابي]، (جـ [الجزء]، صـ [الصفحة]، رقم [الحديث])، دون أي شرح أو خلاف فقهي أو تعليق، ثم قائمة المراجع.',
        'madhhab': 'تحرير معتمد المذهب في المسألة من أمهات متونه وشروحه المعتمدة، وسرد أدلة المذهب وعزو النصوص بالجزء والصفحة بدقة، دون استطراد خارج نطاق المذهب.',
        'lexicon': 'عرض المعاني اللغوية والاشتقاقية من المعاجم والتعريفات الاصطلاحية لكل كتاب على حدة، متبوعاً بالعزو المكتبي الصريح (اسم الكتاب، المؤلف، الجزء، الصفحة)، وفي ختام الرد قائمة المراجع الكاملة.',
        'points': 'صياغة الجواب في نقاط استدلالية محررة وموجزة مستفادة من نصوص الكتب المرفقة مع العزو المكتبي الصريح (الكتاب، المؤلف، الجزء، الصفحة).',
        'full_report': 'تقرير تحقيقي علمي رصين ومستوفٍ مع العزو المكتبي الصريح (الكتاب، المؤلف، الجزء، الصفحة) وقائمة المصادر والمراجع التراثية.'
    };
    const text = presets[type] || '';
    if (text) {
        updateAssistantField(id, 'output_format', text);
        const el = document.getElementById(`ast-output-format-${id}`);
        if (el) el.value = text;
        showToast("✓ تم تطبيق طريقة الإخراج المقترحة بنجاح");
    }
}

// إضافة كرت نموذج مساعد جديد
function addNewAssistantCard() {
    const newId = "ast_" + Date.now();
    const newAst = {
        id: newId,
        name: "مساعد تخصصي جديد",
        role: "تحقيق وبحث تخصصي",
        enabled: true,
        provider: "openrouter",
        model: "",
        temperature: 0.2,
        max_tokens: 264000,
        rag_limit: 10,
        rag_mode: "hybrid",
        collection_name: "badr_all_tsh_corpus",
        use_reranker: true,
        reranker_model: "BAAI/bge-reranker-v2-m3",
        reranker_limit: 10,
        scope_type: "collection",
        collection_id: activeCollectionId || "default_fiqh",
        book_titles: [],
        system_prompt: "أنت باحث محقق تخصصي. مهمتك تحرير المسألة المطلوبة منك بدقة بالغة بالاعتماد على نصوص الشاملة المرفقة مع العزو المكتبي الكامل (الكتاب، المؤلف، الجزء، الصفحة).",
        output_format: "تقرير تحقيقي علمي رصين ومستوفٍ مع العزو المكتبي الصريح (الكتاب، المؤلف، الجزء، الصفحة) وقائمة المصادر والمراجع التراثية."
    };

    assistantsList.push(newAst);
    saveAssistantsSettings();
    renderAssistantsList();

    // التمرير إلى الكرت الجديد
    setTimeout(() => {
        const el = document.getElementById(`assistant-card-${newId}`);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);

    showToast("✓ تم إضافة كرت نموذج مساعد جديد");
}

// حذف كرت نموذج مساعد
function deleteAssistantCard(id) {
    const ast = assistantsList.find(a => a.id === id);
    const name = ast ? ast.name : "هذا المساعد";
    if (!confirm(`هل أنت متأكد من حذف النموذج المساعد «${name}»؟`)) return;

    assistantsList = assistantsList.filter(a => a.id !== id);
    saveAssistantsSettings();
    renderAssistantsList();
    showToast(`✓ تم حذف النموذج المساعد: ${name}`);
}

// استنساخ وتكرار نموذج مساعد
function duplicateAssistantCard(id) {
    const ast = assistantsList.find(a => a.id === id);
    if (!ast) return;

    const copy = JSON.parse(JSON.stringify(ast));
    copy.id = "ast_" + Date.now();
    copy.name = copy.name + " (نسخة)";
    copy._collapsed = false;

    assistantsList.push(copy);
    saveAssistantsSettings();
    renderAssistantsList();
    showToast(`✓ تم تكرار المساعد: ${copy.name}`);
}

// تفعيل أو تعطيل نموذج مساعد
function toggleAssistantEnabled(id, isChecked) {
    const ast = assistantsList.find(a => a.id === id);
    if (ast) {
        ast.enabled = isChecked;
        saveAssistantsSettings();
        
        const cardEl = document.getElementById(`assistant-card-${id}`);
        if (cardEl) {
            if (isChecked) cardEl.classList.remove("disabled");
            else cardEl.classList.add("disabled");
        }
    }
}

// طي أو فتح كرت المساعد
function toggleAssistantCardCollapse(id) {
    const ast = assistantsList.find(a => a.id === id);
    if (ast) {
        ast._collapsed = !ast._collapsed;
        renderAssistantsList();
    }
}

// تحديث حقل معين في كائن المساعد
function updateAssistantField(id, field, value) {
    const ast = assistantsList.find(a => a.id === id);
    if (ast) {
        ast[field] = value;
        saveAssistantsSettings();
    }
}

// تحديث مزود الذكاء الاصطناعي للمساعد
function updateAssistantProvider(id, provider) {
    const ast = assistantsList.find(a => a.id === id);
    if (ast) {
        ast.provider = provider;
        if (provider === "ollama" && (!ast.model || ast.model.includes("/"))) {
            ast.model = "qwen2.5:7b";
        } else if (provider === "lmstudio" && (!ast.model || ast.model.includes("/"))) {
            ast.model = "local-model";
        }
        saveAssistantsSettings();
        renderAssistantsList();
        showToast(`✓ تم تحديث مزود المساعد «${ast.name || ''}» إلى: ${provider ? provider.toUpperCase() : 'تلقائي المنصة'}`);
    }
}

// تنسيق شارة عدد الرموز وسياق المساعد
function formatTokensBadge(val) {
    const num = parseInt(val) || 0;
    if (num >= 1000000) return (num / 1000000).toFixed(num % 1000000 === 0 ? 0 : 1) + "M رمز (مليون ⚡)";
    if (num >= 1000) return Math.round(num / 1000) + "K رمز";
    return num + " رمز";
}

// تحديث سقف الرموز وطول السياق للمساعد (حتى 1 مليون)
function updateAssistantTokens(id, value) {
    let num = parseInt(value) || 3500;
    if (num > 1000000) num = 1000000;
    if (num < 500) num = 500;
    updateAssistantField(id, 'max_tokens', num);
    const badge = document.getElementById(`ast-tokens-badge-${id}`);
    if (badge) badge.innerText = formatTokensBadge(num);
    const input = document.getElementById(`ast-tokens-input-${id}`);
    if (input) input.value = num;
}

// تعيين سريع للرموز والسياق عبر الأزرار الجاهزة
function setAssistantTokens(id, value) {
    updateAssistantTokens(id, value);
}

// تحديث نوع نطاق البحث للمساعد
function updateAssistantScopeType(id, scopeType) {
    const ast = assistantsList.find(a => a.id === id);
    if (ast) {
        ast.scope_type = scopeType;
        if (scopeType === "collection") {
            ast.collection_id = activeCollectionId || "default_fiqh";
            updateAssistantCollectionScope(id, ast.collection_id);
        }
        saveAssistantsSettings();
        renderAssistantsList();
    }
}

// تحديث تجميعة الكتب للمساعد واستخراج قائمة كتبها
function updateAssistantCollectionScope(id, colId) {
    const ast = assistantsList.find(a => a.id === id);
    if (!ast) return;
    ast.collection_id = colId;
    
    const col = (bookCollections || []).find(c => c.id === colId);
    if (col && col.sections) {
        const titles = [];
        col.sections.forEach(sec => {
            (sec.books || []).forEach(b => {
                if (b.selected !== false && b.title_ar) {
                    titles.push(b.title_ar);
                }
            });
        });
        ast.book_titles = titles;
    }
    saveAssistantsSettings();
}

// تحديث عناوين الكتب يدparamياً
function updateAssistantBookTitles(id, text) {
    const ast = assistantsList.find(a => a.id === id);
    if (ast) {
        const titles = text.split(/[\n,]/).map(t => t.trim()).filter(Boolean);
        ast.book_titles = titles;
        saveAssistantsSettings();
    }
}

// اقتراح توجيه تخصصي تلقائي للمساعد بحسب دوره واسمه
function fillAssistantSuggestedPrompt(id) {
    const ast = assistantsList.find(a => a.id === id);
    if (!ast) return;

    const icon = getAssistantAvatarIcon(ast.name, ast.role);
    let prompt = "";
    if (icon === "📖") {
        prompt = "أنت الإمام اللغوي المحقق سيبويه، خبير المعاجم وغريب الألفاظ والاشتقاق. مهمتك حصر المعنى اللغوي الدقيق لمفردات المسألة، واشتقاقاتها، ومواضع الغريب في النصوص الشرعية، مع النقل الحرفي والتوثيق من أمهات المعاجم (لسان العرب، مقاييس اللغة، النهاية لابن الأثير). اذكر الشواهد وأصل اللفظ ومدلوله العرفي والشرعي بدقة بالغة مع التوثيق المكتبي (الجزء والصفحة).";
    } else if (icon === "📜") {
        prompt = "أنت الحافظ المحقق أمير المؤمنين في الحديث. مهمتك تخريج الأحاديث والآثار الواردة في المسألة من دواوين السنة المشهورة (الكتب الستة، والمسانيد، وكتب التخريج). بيّن متن الحديث وروايته، ومن خرجه من الأئمة مع رقم الجزء والصفحة والحديث، وحكم الأئمة عليه (صحيح، حسن، ضعيف)، مع الإشارة إلى علله ورواياته المختلفة بدقة علمية صارمة وعزو مباشر لنصوص الشاملة.";
    } else if (icon === "⚖️") {
        prompt = "أنت فقيه المذهب ومحرر أقوال الأئمة. مهمتك تحرير حكم المسألة الفقهية وسرد نصوص الإمام وأصحابه من أمهات كتب المذهب المعتمدة، وتبيين الروايات والوجوه المعتمدة، مع ذكر الأدلة النقلية والقياسية والأصولية مع التوثيق المكتبي الدقيق (الكتاب، المؤلف، الجزء، الصفحة).";
    } else if (icon === "📐") {
        prompt = "أنت الإمام الأصولي المحقق الشاطبي. مهمتك تحرير القواعد الأصولية والفقهية والمقاصدية التي تنبني عليها هذه المسألة، وبيان سبب ومنشأ خلاف الفقهاء فيها (هل هو تردد بين أصلين، أو عارض أصل لفرع، أو معارضة دلالة القياس لظاهر النص)، مع توثيق القواعد والعلل من الموافقات وقواعد الأحكام والمستصفى بدقة متناهية.";
    } else if (icon === "📗") {
        prompt = "أنت المفسر المحقق لآيات الأحكام وتفسير القرآن الكريم. مهمتك استقراء وتفسير الآيات القرآنية الواردة في المسألة من أمهات كتب التفسير المعتمدة (تفسير الطبري، القرطبي، ابن كثير، أحكام القرآن للجصاص وابن العربي). بيّن دلالة الآية وسبب نزولها وأوجه القراءات والاستدلال الفقهي منها بدقة مع التوثيق المكتبي الكامل (الجزء والصفحة).";
    } else {
        prompt = `أنت الباحث المحقق المتخصص: ${ast.name}. مهمتك: ${ast.role} بالاعتماد الصارم على نصوص المكتبة الشاملة المرفقة بالسياق، وتوثيق الجزء والصفحة والمؤلف بدقة وأمانة علمية.`;
    }

    ast.system_prompt = prompt;
    saveAssistantsSettings();
    renderAssistantsList();
    showToast(`✓ تم إدراج توجيه مقترح لـ «${ast.name}»`);
}

// استيراد النماذج التراثية المعتمدة الجاهزة (سيبويه، البخاري، مالك، الشاطبي)
async function loadDefaultScholarlyAssistants() {
    try {
        const res = await fetch("/api/ai/assistants/default");
        if (!res.ok) throw new Error("تعذر جلب النماذج الافتراضية من الخادم");
        const defs = await res.json();
        if (defs && defs.length > 0) {
            assistantsList = defs;
            saveAssistantsSettings();
            renderAssistantsList();
            showToast("✓ تم استيراد النماذج التراثية المعتمدة (سيبويه، البخاري، مالك، الشاطبي) بنجاح!");
        }
    } catch (e) {
        showToast("تنبيه: " + e.message);
    }
}

// تضمين تعريف النماذج المساعدة في توجيه النموذج الأساسي (System Prompt)
function injectAssistantsIntoMainPrompt() {
    const activeOnes = assistantsList.filter(a => a.enabled);
    if (activeOnes.length === 0) {
        showToast("تنبيه: لا يوجد نماذج مساعدة مفعلة حالياً لتضمينها");
        return;
    }

    let manifest = "\n\n[فريق النماذج المساعدة المتخصصة المتاحة لك (Specialized Assistant Agents)]:\n";
    manifest += "لديك فريق من المساعدين المتخصصين يمكنك تفكيك المسألة والاستعانة بهم بحسب تخصص كل منهم:\n";
    activeOnes.forEach((a, i) => {
        manifest += `${i + 1}. [${a.name}]: تخصص (${a.role})، ويبحث في نطاق كتبه الخاصة.\n`;
    });
    manifest += "عند تفكيك المسألة، استند إلى تقارير هؤلاء المساعدين، وتحقق من سد أي نقص أو عجز علمي، ثم ادمج نتائجهم في تحرير علمي رصين ومستوفٍ موثق بالحواشي وقائمة المراجع.";

    const promptTextarea = document.getElementById("aiSystemPrompt");
    if (promptTextarea) {
        const cur = promptTextarea.value.trim();
        // إزالة أي تعريف سابق إن وجد
        const clean = cur.replace(/\n\n\[فريق النماذج المساعدة المتخصصة المتاحة لك[\s\S]*?المراجع\./, "");
        promptTextarea.value = clean + manifest;
        saveAiSettings();
        showToast("✓ تم تضمين تعريف النماذج المساعدة في توجيه النموذج الأساسي (System Prompt)");
    }
}

// تصدير النماذج المساعدة كملف JSON
function exportAssistantsToJson() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(assistantsList, null, 2));
    const dlAnchor = document.createElement("a");
    dlAnchor.setAttribute("href", dataStr);
    dlAnchor.setAttribute("download", `shamela_assistants_${new Date().toISOString().split("T")[0]}.json`);
    document.body.appendChild(dlAnchor);
    dlAnchor.click();
    dlAnchor.remove();
    showToast("✓ تم تصدير ملف النماذج المساعدة بنجاح");
}

// معالجة استيراد النماذج من ملف JSON
function handleAssistantsJsonFile(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const parsed = JSON.parse(e.target.result);
            if (Array.isArray(parsed)) {
                assistantsList = parsed;
                saveAssistantsSettings();
                renderAssistantsList();
                showToast(`✓ تم استيراد (${assistantsList.length}) نماذج مساعدة بنجاح`);
            } else {
                throw new Error("ملف JSON غير صالح أو لا يحتوي على مصفوفة نماذج");
            }
        } catch (err) {
            alert("خطأ أثناء استيراد الملف: " + err.message);
        }
    };
    reader.readAsText(file);
    event.target.value = "";
}

// التبديل بين تشغيل وتعطيل بايبلاين النماذج المساعدة
function togglePipelineMode(isChecked) {
    isPipelineEnabled = isChecked;
    saveAssistantsSettings();

    const quickEl = document.getElementById("aiQuickPipeline");
    if (quickEl) quickEl.checked = isChecked;

    if (isChecked) {
        const activeCount = assistantsList.filter(a => a.enabled).length;
        showToast(`🚀 تم تشغيل بايبلاين النماذج المساعدة (${activeCount} وكلاء نشطون)`);
    } else {
        showToast("تم إيقاف بايبلاين النماذج المساعدة والعودة للنمط المباشر");
    }
}

// مزامنة التبديل السريع من شريط أدوات الشات
function syncPipelineQuickToggle(isChecked) {
    isPipelineEnabled = isChecked;
    const mainEl = document.getElementById("aiPipelineEnabled");
    if (mainEl) mainEl.checked = isChecked;
    saveAssistantsSettings();

    if (isChecked) {
        const activeCount = assistantsList.filter(a => a.enabled).length;
        showToast(`🚀 تم تشغيل بايبلاين النماذج المساعدة (${activeCount} وكلاء نشطون)`);
    } else {
        showToast("تم إيقاف بايبلاين النماذج المساعدة والعودة للنمط المباشر");
    }
}

// ==========================================================================
// وظائف الصفحة المستقلة للنماذج المساعدة (Multi-Agent Pipeline Page View)
// ==========================================================================

// عرض وتحديث صفحة النماذج المساعدة المخصصة
function renderPipelinePageView() {
    updateAssistantsActiveBadge();
    renderAssistantsList();
    ensureOpenRouterModelsLoaded();

    const masterToggle = document.getElementById("pipelineGlobalMasterToggle");
    if (masterToggle) masterToggle.checked = isPipelineEnabled;
}

// تبديل تشغيل البايبلاين من الزر الرئيسي في الصفحة
function togglePipelineGlobalMaster(isChecked) {
    togglePipelineMode(isChecked);
}

// ==========================================================================
// نافذة اختيار وتحديد نموذج الذكاء الاصطناعي (OpenRouter 458+ Models Picker)
// ==========================================================================

let currentEditingAssistantForModel = null;
let astModelPickerActiveCompany = "all";

// فتح نافذة اختيار النموذج للمساعد
async function openAssistantModelPickerModal(assistantId) {
    currentEditingAssistantForModel = assistantId;
    const modal = document.getElementById("assistantModelPickerModal");
    if (!modal) return;

    const ast = (assistantsList || []).find(a => a.id === assistantId);
    const titleEl = document.getElementById("astModelPickerModalTitle");
    if (titleEl && ast) {
        titleEl.innerText = `تحديد نموذج الذكاء الاصطناعي للمساعد: «${ast.name}»`;
    }

    // تصفير البحث
    const searchInput = document.getElementById("astModelPickerSearchInput");
    if (searchInput) searchInput.value = "";
    astModelPickerActiveCompany = "all";

    // إظهار النافذة
    modal.style.display = "flex";

    // التأكد من جلب النماذج كاملة
    await ensureOpenRouterModelsLoaded();

    renderAssistantModelPickerOptions();
}

// إغلاق نافذة اختيار النموذج
function closeAssistantModelPickerModal() {
    const modal = document.getElementById("assistantModelPickerModal");
    if (modal) modal.style.display = "none";
    currentEditingAssistantForModel = null;
}

// بناء خيارات قائمة اختيار النماذج (المقترحات الأساسية + كافة النماذج الـ 458)
function renderAssistantModelPickerOptions() {
    const ast = (assistantsList || []).find(a => a.id === currentEditingAssistantForModel);
    const activeModelId = ast ? (ast.model || "") : "";

    // 1. بناء أزرار تصفية الشركات
    const chipsContainer = document.getElementById("astModelPickerCompanyChips");
    if (chipsContainer) {
        chipsContainer.innerHTML = "";

        // زر الكل
        const allBtn = document.createElement("button");
        allBtn.type = "button";
        allBtn.className = `quick-comp-chip ${astModelPickerActiveCompany === "all" ? "active" : ""}`;
        allBtn.innerText = "🌐 الكل";
        allBtn.onclick = () => { astModelPickerActiveCompany = "all"; filterAssistantModelPickerList(); };
        chipsContainer.appendChild(allBtn);

        // حساب تكرار الشركات
        const compCounts = {};
        allOpenRouterModelsCache.forEach(m => {
            const slug = m.company || (m.id.includes("/") ? m.id.split("/")[0] : "other");
            compCounts[slug] = (compCounts[slug] || 0) + 1;
        });

        if (!compCounts["lmstudio"]) compCounts["lmstudio"] = 0;
        if (!compCounts["ollama"]) compCounts["ollama"] = 0;

        let sortedSlugs = Object.keys(compCounts).sort((a, b) => compCounts[b] - compCounts[a]);
        // وضع LM Studio و Ollama في المقدمة لتسهيل الوصول للنماذج المحلية
        sortedSlugs = sortedSlugs.filter(s => s !== "lmstudio" && s !== "ollama");
        sortedSlugs.unshift("lmstudio", "ollama");

        sortedSlugs.slice(0, 16).forEach(slug => {
            const comp = getCompanyInfo(slug + "/test", slug);
            const chip = document.createElement("button");
            chip.type = "button";
            chip.className = `quick-comp-chip ${astModelPickerActiveCompany === slug ? "active" : ""}`;
            chip.innerText = `${comp.icon} ${comp.name} (${compCounts[slug] || 0})`;
            chip.onclick = () => {
                astModelPickerActiveCompany = slug;
                renderAssistantModelPickerOptions();
            };
            chipsContainer.appendChild(chip);
        });
    }

    // إظهار أو إخفاء شريط أدوات LM Studio المباشر
    const lmToolbar = document.getElementById("astLmStudioToolbar");
    if (lmToolbar) {
        if (astModelPickerActiveCompany === "lmstudio" || (ast && ast.provider === "lmstudio")) {
            lmToolbar.style.display = "block";
            const ipInput = document.getElementById("modalLmStudioIpInput");
            const tokenInput = document.getElementById("modalLmStudioTokenInput");
            if (ipInput && (!ipInput.value || ipInput.value === "http://localhost:1234")) {
                ipInput.value = localStorage.getItem("shamela_lmstudio_endpoint") || "http://192.168.100.134:1234";
            }
            if (tokenInput && !tokenInput.value) {
                tokenInput.value = localStorage.getItem("shamela_lmstudio_api_token") || "sk-lm-ARRMdEDr:nh1GuNwgHu4MpvOKefRu";
            }
        } else {
            lmToolbar.style.display = "none";
        }
    }

    // 2. بناء قسم المقترحات الأساسية الموصى بها
    const primaryContainer = document.getElementById("astModelPickerPrimaryList");
    if (primaryContainer) {
        primaryContainer.innerHTML = PRIMARY_RECOMMENDED_MODELS.map(pm => {
            const isSel = pm.id === activeModelId || (pm.id === "" && (!activeModelId || activeModelId === ""));
            const comp = getCompanyInfo(pm.id, pm.comp);
            const logoSvg = comp.logo || `<span>${comp.icon}</span>`;
            return `
                <div class="primary-model-card ${isSel ? 'active-selected' : ''}" onclick="selectAssistantModel('${pm.id}')">
                    <div class="pm-header">
                        <div style="display: flex; align-items: center; gap: 0.45rem;">
                            <div style="width: 22px; height: 22px; display: flex; align-items: center; justify-content: center;">${logoSvg}</div>
                            <strong class="pm-title">${escapeHtml(pm.name)}</strong>
                        </div>
                        <span class="pm-badge">${escapeHtml(pm.badge)}</span>
                    </div>
                    <div class="pm-desc">${escapeHtml(pm.desc)}</div>
                    <div class="pm-id">${pm.id ? escapeHtml(pm.id) : 'افتراضي المنصة'}</div>
                </div>
            `;
        }).join("");
    }

    filterAssistantModelPickerList();
}

// إظهار/إخفاء مفتاح LM Studio في نافذة النماذج
function toggleModalLmTokenVisibility() {
    const input = document.getElementById("modalLmStudioTokenInput");
    if (!input) return;
    input.type = input.type === "password" ? "text" : "password";
}

// استعادة إعدادات LM Studio الافتراضية في النافذة
function resetModalLmStudioDefaults() {
    const ipInput = document.getElementById("modalLmStudioIpInput");
    const tokenInput = document.getElementById("modalLmStudioTokenInput");
    if (ipInput) ipInput.value = "http://192.168.100.134:1234";
    if (tokenInput) tokenInput.value = "sk-lm-ARRMdEDr:nh1GuNwgHu4MpvOKefRu";
    try {
        localStorage.setItem("shamela_lmstudio_endpoint", "http://192.168.100.134:1234");
        localStorage.setItem("shamela_lmstudio_api_token", "sk-lm-ARRMdEDr:nh1GuNwgHu4MpvOKefRu");
    } catch (e) {}
    showToast("✓ تمت استعادة إعدادات LM Studio الافتراضية");
}

// تحميل نماذج LM Studio الحية من داخل نافذة اختيار النماذج
async function fetchLiveModelsFromModalLmStudio() {
    const ipInput = document.getElementById("modalLmStudioIpInput");
    const tokenInput = document.getElementById("modalLmStudioTokenInput");
    const btn = document.getElementById("btnModalFetchLmStudio");

    const endpoint = (ipInput?.value || "").trim() || "http://192.168.100.134:1234";
    const token = (tokenInput?.value || "").trim() || "sk-lm-ARRMdEDr:nh1GuNwgHu4MpvOKefRu";

    try {
        localStorage.setItem("shamela_lmstudio_endpoint", endpoint);
        localStorage.setItem("shamela_lmstudio_api_token", token);
        const mainEndpoint = document.getElementById("aiEndpointUrlInput");
        const mainToken = document.getElementById("aiApiKeyInput");
        if (mainEndpoint) mainEndpoint.value = endpoint;
        if (mainToken && document.getElementById("aiProviderSelect")?.value === "lmstudio") {
            mainToken.value = token;
        }
    } catch (e) {}

    if (btn) btn.innerHTML = "⏳ جاري التحميل...";
    try {
        const url = `/api/ai/models?provider=lmstudio&endpoint_url=${encodeURIComponent(endpoint)}&api_key=${encodeURIComponent(token)}`;
        const res = await fetch(url);
        const data = await res.json();
        const models = data.models || [];

        if (models.length > 0) {
            allOpenRouterModelsCache = allOpenRouterModelsCache.filter(m => m.company !== "lmstudio");
            models.forEach(m => {
                allOpenRouterModelsCache.unshift({
                    id: m.id || m.name,
                    name: m.name || m.id,
                    company: "lmstudio",
                    context_length: m.context_length || 32768
                });
            });
            astModelPickerActiveCompany = "lmstudio";
            renderAssistantModelPickerOptions();
            showToast(`✓ تم تحميل (${models.length}) نماذج من LM Studio بنجاح`);
        } else {
            showToast("ℹ️ تم الاتصال بـ LM Studio بنجاح. تأكد من تحميل نموذج نشط داخل واجهة LM Studio ليظهر في القائمة.");
            astModelPickerActiveCompany = "lmstudio";
            renderAssistantModelPickerOptions();
        }
    } catch (err) {
        showToast(`❌ تعذر الاتصال بـ LM Studio: ${err.message || err}`);
    } finally {
        if (btn) btn.innerHTML = "🔄 تحميل نماذج LM Studio";
    }
}

// تصفية النماذج في نافذة الاختيار بحسب البحث والشركة
function filterAssistantModelPickerList() {
    const q = (document.getElementById("astModelPickerSearchInput")?.value || "").trim().toLowerCase();
    const fullListContainer = document.getElementById("astModelPickerFullList");
    const countBadge = document.getElementById("astModelPickerCountBadge");
    if (!fullListContainer) return;

    const ast = (assistantsList || []).find(a => a.id === currentEditingAssistantForModel);
    const activeModelId = ast ? (ast.model || "") : "";

    const filtered = allOpenRouterModelsCache.filter(m => {
        const id = (m.id || "").toLowerCase();
        const name = (m.name || "").toLowerCase();
        const comp = (m.company || (m.id.includes("/") ? m.id.split("/")[0] : "")).toLowerCase();

        if (astModelPickerActiveCompany !== "all") {
            const matchesComp = comp === astModelPickerActiveCompany.toLowerCase() || id.startsWith(astModelPickerActiveCompany.toLowerCase() + "/");
            if (!matchesComp) return false;
        }

        if (q) {
            return id.includes(q) || name.includes(q) || comp.includes(q);
        }
        return true;
    });

    if (countBadge) {
        countBadge.innerText = `${filtered.length} من ${allOpenRouterModelsCache.length} نموذج`;
    }

    // تحديث أزرار الشركات
    const chips = document.querySelectorAll("#astModelPickerCompanyChips .quick-comp-chip");
    chips.forEach(c => {
        if (c.innerText.includes("الكل") && astModelPickerActiveCompany === "all") c.classList.add("active");
        else c.classList.remove("active");
    });

    if (filtered.length === 0) {
        fullListContainer.innerHTML = `
            <div style="padding: 2rem; text-align: center; color: #94a3b8; font-size: 0.85rem;">
                <div style="font-size: 2rem; margin-bottom: 0.5rem;">🔍</div>
                لا توجد نماذج مطابقة للبحث الحالي في OpenRouter
            </div>
        `;
        return;
    }

    // تجميع النماذج بحسب الشركة
    const groups = {};
    filtered.forEach(m => {
        const compSlug = m.company || (m.id.includes("/") ? m.id.split("/")[0] : "other");
        if (!groups[compSlug]) groups[compSlug] = [];
        groups[compSlug].push(m);
    });

    const sortedCompSlugs = Object.keys(groups).sort((a, b) => {
        const nameA = (AI_COMPANIES[a]?.name || a).toLowerCase();
        const nameB = (AI_COMPANIES[b]?.name || b).toLowerCase();
        return nameA.localeCompare(nameB);
    });

    let html = "";
    sortedCompSlugs.forEach(slug => {
        const comp = getCompanyInfo(slug + "/test", slug);
        html += `
            <div class="model-group-header">
                <span>${comp.icon} ${comp.name}</span>
                <span style="font-size: 0.7rem; opacity: 0.8;">${groups[slug].length} نموذج</span>
            </div>
        `;

        groups[slug].sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id));

        groups[slug].forEach(m => {
            const isSel = m.id === activeModelId;
            const modelComp = getCompanyInfo(m.id, m.company);
            const logoSvg = modelComp.logo || `<span>${modelComp.icon}</span>`;

            let ctxBadge = "";
            if (m.context_length) {
                const kVal = Math.round(m.context_length / 1024);
                ctxBadge = `<span class="model-ctx-badge">${kVal}K</span>`;
            }

            html += `
                <div class="custom-model-option-row ${isSel ? 'selected' : ''}" onclick="selectAssistantModel('${escapeHtml(m.id)}')">
                    <div class="model-row-left">
                        <div class="model-row-logo">${logoSvg}</div>
                        <div class="model-row-info">
                            <div class="model-row-name">${escapeHtml(m.name || m.id)}</div>
                            <div class="model-row-id" dir="ltr">${escapeHtml(m.id)}</div>
                        </div>
                    </div>
                    <div class="model-row-right">
                        ${ctxBadge}
                        ${isSel ? '<span class="model-check-icon">✓</span>' : ''}
                    </div>
                </div>
            `;
        });
    });

    fullListContainer.innerHTML = html;
}

// اعتماد واختيار النموذج للمساعد
function selectAssistantModel(modelId) {
    if (!currentEditingAssistantForModel) return;
    const ast = (assistantsList || []).find(a => a.id === currentEditingAssistantForModel);
    if (ast) {
        ast.model = modelId;
        saveAssistantsSettings();
        renderAssistantsList();
        closeAssistantModelPickerModal();
        showToast(`✓ تم تعيين النموذج «${modelId || 'تلقائي'}» للمساعد «${ast.name}» بنجاح`);
    }
}

// تعيين نموذج يدوي من حقل الإدخال
function applyManualAssistantModel() {
    const input = document.getElementById("astModelPickerManualInput");
    const val = input ? input.value.trim() : "";
    if (!val) {
        showToast("يرجى كتابة معرف النموذج من OpenRouter أولاً");
        return;
    }
    selectAssistantModel(val);
}

// ==========================================================================
// نافذة إدارة وتخصيص نطاق كتب النموذج المساعد (Scope & Books Manager)
// ==========================================================================

let currentEditingAssistantForScope = null;
let scopeWorkingBooks = [];
let scopeWorkingCategoryId = null;
let scopeWorkingCollectionId = null;
let scopeWorkingType = "all";
let astScopeSearchTimeout = null;

// فتح نافذة إدارة وتخصيص نطاق كتب النموذج المساعد
async function openAssistantScopeModal(assistantId) {
    currentEditingAssistantForScope = assistantId;
    const modal = document.getElementById("assistantScopeManagerModal");
    if (!modal) return;

    const ast = (assistantsList || []).find(a => a.id === assistantId);
    if (!ast) return;

    const titleEl = document.getElementById("astScopeModalTitle");
    if (titleEl) {
        titleEl.innerText = `إدارة وتعديل نطاق كتب: «${ast.name}»`;
    }

    // استنساخ النطاق الحالي للعمل عليه
    scopeWorkingBooks = Array.isArray(ast.book_titles) ? [...ast.book_titles] : [];
    scopeWorkingCategoryId = ast.category_id || null;
    scopeWorkingCollectionId = ast.collection_id || null;
    scopeWorkingType = ast.scope_type || (ast.collection_id ? "collection" : (ast.category_id ? "category" : (scopeWorkingBooks.length > 0 ? "books" : "all")));

    // تعبئة قائمة الـ 41 تصنيفاً إن لم تكن معبأة
    const catSelect = document.getElementById("astScopeCategorySelect");
    if (catSelect && catSelect.options.length <= 1) {
        if (!categoriesList || categoriesList.length === 0) {
            try {
                const res = await fetch("/api/categories");
                categoriesList = await res.json();
            } catch(e) {}
        }
        catSelect.innerHTML = `<option value="">📚 كل التصنيفات (جميع أقسام الشاملة الـ ٤١)</option>`;
        (categoriesList || []).forEach(c => {
            if (c.category_id > 0) {
                const opt = document.createElement("option");
                opt.value = c.category_id;
                opt.textContent = `${c.category_name_ar} (${c.book_count} كتاب)`;
                catSelect.appendChild(opt);
            }
        });
    }

    // تعبئة قائمة التجميعات المحفوظة
    const colSelect = document.getElementById("astScopeCollectionSelect");
    if (colSelect) {
        colSelect.innerHTML = (bookCollections || []).map(col => {
            const count = (col.sections || []).reduce((acc, s) => acc + (s.books || []).length, 0);
            return `<option value="${col.id}">${escapeHtml(col.name)} (${count} كتاب)</option>`;
        }).join("");
        if (scopeWorkingCollectionId) {
            colSelect.value = scopeWorkingCollectionId;
        }
    }

    // تحديد التبويب المبدئي المناسب
    if (scopeWorkingType === "collection") {
        switchAssistantScopeTab("collection");
    } else if (scopeWorkingType === "all" && scopeWorkingBooks.length === 0 && !scopeWorkingCategoryId) {
        switchAssistantScopeTab("all");
    } else {
        switchAssistantScopeTab("shamela");
    }

    renderAssistantScopeTags();
    modal.style.display = "flex";
}

// إغلاق نافذة إدارة نطاق الكتب
function closeAssistantScopeModal() {
    const modal = document.getElementById("assistantScopeManagerModal");
    if (modal) {
        modal.style.display = "none";
        modal.style.zIndex = "";
    }
    currentEditingAssistantForScope = null;
}

// التبديل بين تبويبات نافذة النطاق
function switchAssistantScopeTab(tab) {
    const tabs = ["shamela", "collection", "all"];
    tabs.forEach(t => {
        const btn = document.getElementById(`scopeTab${t.charAt(0).toUpperCase() + t.slice(1)}Btn`);
        const content = document.getElementById(`scopeTabContent${t.charAt(0).toUpperCase() + t.slice(1)}`);
        if (t === tab) {
            if (btn) btn.classList.add("active");
            if (content) content.style.display = "block";
        } else {
            if (btn) btn.classList.remove("active");
            if (content) content.style.display = "none";
        }
    });

    if (tab === "shamela") {
        loadBooksForAssistantScope();
    } else if (tab === "collection") {
        renderCollectionSectionsForScope();
    }
}

// البحث وجلب كتب الشاملة في نافذة النطاق (تستوعب الـ 41 تصنيفاً و 8589 كتاباً)
async function loadBooksForAssistantScope() {
    const catSelect = document.getElementById("astScopeCategorySelect");
    const catId = catSelect ? catSelect.value : "";
    const q = (document.getElementById("astScopeSearchInput")?.value || "").trim();
    const container = document.getElementById("astScopeShamelaBooksList");
    if (!container) return;

    container.innerHTML = `<div style="padding: 1.5rem; text-align: center; color: #94a3b8;"><span class="spinner" style="display:inline-block; margin-left: 0.4rem;">⏳</span> جاري جلب الكتب من الشاملة...</div>`;

    try {
        let url = `/api/books?limit=80`;
        if (catId) url += `&category_id=${catId}`;
        if (q) url += `&q=${encodeURIComponent(q)}`;

        const res = await fetch(url);
        if (!res.ok) throw new Error("تعذر جلب الكتب");
        const books = await res.json();

        if (!books || books.length === 0) {
            container.innerHTML = `<div style="padding: 1.5rem; text-align: center; color: #94a3b8;">لم يتم العثور على كتب مطابقة.</div>`;
            return;
        }

        container.innerHTML = books.map(b => {
            const isChecked = scopeWorkingBooks.includes(b.title_ar);
            return `
                <div class="scope-book-row ${isChecked ? 'selected' : ''}" onclick="toggleBookInScope('${escapeHtml(b.title_ar)}', !${isChecked})">
                    <div style="display: flex; align-items: center; gap: 0.65rem; overflow: hidden; flex: 1;">
                        <input type="checkbox" ${isChecked ? 'checked' : ''} style="cursor: pointer;" onclick="event.stopPropagation(); toggleBookInScope('${escapeHtml(b.title_ar)}', this.checked)">
                        <div style="overflow: hidden;">
                            <strong style="font-size: 0.84rem; color: #f8fafc; display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(b.title_ar)}</strong>
                            <div style="font-size: 0.72rem; color: #94a3b8; display: flex; gap: 0.5rem; margin-top: 1px;">
                                <span>✍️ ${escapeHtml(b.author_name || 'غير معروف')}</span>
                                ${b.category_name_ar ? `<span style="background: rgba(255,255,255,0.06); padding: 0 5px; border-radius: 3px;">🏷️ ${escapeHtml(b.category_name_ar)}</span>` : ''}
                            </div>
                        </div>
                    </div>
                    <span style="font-size: 0.75rem; color: ${isChecked ? '#34d399' : '#64748b'}; font-weight: 700;">
                        ${isChecked ? '✓ محدد' : '+ تحديد'}
                    </span>
                </div>
            `;
        }).join("");

    } catch (e) {
        console.error("loadBooksForAssistantScope error:", e);
        container.innerHTML = `<div style="padding: 1.5rem; text-align: center; color: #ef4444;">حدث خطأ أثناء تحميل الكتب</div>`;
    }
}

// تأخير البحث بالمدخلات
function debounceAssistantScopeSearch() {
    clearTimeout(astScopeSearchTimeout);
    astScopeSearchTimeout = setTimeout(() => {
        loadBooksForAssistantScope();
    }, 280);
}

// تبديل اختيار كتاب معين في نطاق العمل للمساعد
function toggleBookInScope(bookTitle, checked) {
    if (checked) {
        if (!scopeWorkingBooks.includes(bookTitle)) {
            scopeWorkingBooks.push(bookTitle);
        }
        scopeWorkingType = "books";
    } else {
        scopeWorkingBooks = scopeWorkingBooks.filter(t => t !== bookTitle);
    }

    renderAssistantScopeTags();
    loadBooksForAssistantScope();
}

// تحديد أو إلغاء تحديد كافة الكتب المعروضة في تصنيف الشاملة
function toggleSelectAllCategoryBooksInScope(selectAll) {
    const rows = document.querySelectorAll("#astScopeShamelaBooksList .scope-book-row");
    rows.forEach(r => {
        const titleEl = r.querySelector("strong");
        if (titleEl) {
            const title = titleEl.innerText.trim();
            if (selectAll) {
                if (!scopeWorkingBooks.includes(title)) scopeWorkingBooks.push(title);
            } else {
                scopeWorkingBooks = scopeWorkingBooks.filter(t => t !== title);
            }
        }
    });

    if (selectAll) scopeWorkingType = "books";
    renderAssistantScopeTags();
    loadBooksForAssistantScope();
}

// عرض أقسام وكتب التجميعة المحفوظة لاستعراضها والتحديد منها
function renderCollectionSectionsForScope() {
    const colSelect = document.getElementById("astScopeCollectionSelect");
    const colId = colSelect ? colSelect.value : "";
    const container = document.getElementById("astScopeCollectionSectionsContainer");
    if (!container) return;

    const col = (bookCollections || []).find(c => c.id === colId);
    if (!col || !col.sections || col.sections.length === 0) {
        container.innerHTML = `<div style="padding: 1.5rem; text-align: center; color: #94a3b8;">لا توجد أقسام في هذه التجميعة.</div>`;
        return;
    }

    container.innerHTML = col.sections.map((sec, sIdx) => {
        const books = sec.books || [];
        return `
            <div class="collection-section-card" style="margin-bottom: 0.85rem; background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 8px; overflow: hidden;">
                <div style="padding: 0.65rem 0.95rem; background: rgba(255, 255, 255, 0.04); display: flex; align-items: center; justify-content: space-between;">
                    <div style="font-weight: 800; font-size: 0.84rem; color: #f8fafc;">📁 ${escapeHtml(sec.section_name)} (${books.length} كتاب)</div>
                    <button type="button" class="btn-tool-action" style="font-size: 0.72rem; padding: 2px 7px;" onclick="importSectionBooksToScope(${sIdx})">
                        ➕ تضمين كل كتب هذا القسم
                    </button>
                </div>
                <div style="padding: 0.5rem 0.85rem; display: flex; flex-direction: column; gap: 0.35rem; max-height: 180px; overflow-y: auto;">
                    ${books.map(b => {
                        const isChecked = scopeWorkingBooks.includes(b.title_ar);
                        return `
                            <div class="scope-book-row ${isChecked ? 'selected' : ''}" onclick="toggleBookInScope('${escapeHtml(b.title_ar)}', !${isChecked})">
                                <div style="display: flex; align-items: center; gap: 0.6rem;">
                                    <input type="checkbox" ${isChecked ? 'checked' : ''} onclick="event.stopPropagation(); toggleBookInScope('${escapeHtml(b.title_ar)}', this.checked)">
                                    <span style="font-size: 0.82rem; color: #e2e8f0;">${escapeHtml(b.title_ar)}</span>
                                </div>
                                <span style="font-size: 0.72rem; color: #94a3b8;">${escapeHtml(b.author || '')}</span>
                            </div>
                        `;
                    }).join("")}
                </div>
            </div>
        `;
    }).join("");
}

// تضمين كافة كتب قسم معين من التجميعة في نطاق المساعد
function importSectionBooksToScope(sectionIdx) {
    const colSelect = document.getElementById("astScopeCollectionSelect");
    const colId = colSelect ? colSelect.value : "";
    const col = (bookCollections || []).find(c => c.id === colId);
    if (!col || !col.sections || !col.sections[sectionIdx]) return;

    const sec = col.sections[sectionIdx];
    (sec.books || []).forEach(b => {
        if (!scopeWorkingBooks.includes(b.title_ar)) {
            scopeWorkingBooks.push(b.title_ar);
        }
    });

    scopeWorkingType = "books";
    renderAssistantScopeTags();
    renderCollectionSectionsForScope();
    showToast(`✓ تم تضمين (${(sec.books || []).length}) كتب من قسم «${sec.section_name}» في نطاق المساعد`);
}

// ربط المساعد بالتجميعة كاملة
function importEntireCollectionToScope() {
    const colSelect = document.getElementById("astScopeCollectionSelect");
    const colId = colSelect ? colSelect.value : "";
    const col = (bookCollections || []).find(c => c.id === colId);
    if (!col) return;

    scopeWorkingCollectionId = col.id;
    scopeWorkingType = "collection";
    scopeWorkingBooks = [];

    // جلب جميع كتب التجميعة
    (col.sections || []).forEach(sec => {
        (sec.books || []).forEach(b => {
            if (b.selected !== false && !scopeWorkingBooks.includes(b.title_ar)) {
                scopeWorkingBooks.push(b.title_ar);
            }
        });
    });

    renderAssistantScopeTags();
    showToast(`✓ تم ربط المساعد بتجميعة «${col.name}» (${scopeWorkingBooks.length} كتب)`);
}

// فتح نافذة إدارة التجميعات مباشرة من نافذة النطاق
function openCollectionManagerModalFromScope() {
    const colSelect = document.getElementById("astScopeCollectionSelect");
    const colId = colSelect ? colSelect.value : "";
    closeAssistantScopeModal();
    openCollectionManagerModal(colId);
}

// تعيين النطاق: عموم الشاملة
function setAssistantScopeToAll() {
    scopeWorkingType = "all";
    scopeWorkingBooks = [];
    scopeWorkingCategoryId = null;
    scopeWorkingCollectionId = null;
    renderAssistantScopeTags();
    showToast("✓ تم تعيين نطاق البحث: عموم المكتبة الشاملة (بدون حصر)");
}

// مسح كافة الكتب المحددة في الرف
function clearAllSelectedScopeBooks() {
    scopeWorkingBooks = [];
    scopeWorkingType = "all";
    renderAssistantScopeTags();
    loadBooksForAssistantScope();
}

// بناء وتحديث رف الكتب المحددة حالياً (Active Scope Shelf)
function renderAssistantScopeTags() {
    const countBadge = document.getElementById("astScopeActiveCountBadge");
    const tagsContainer = document.getElementById("astScopeSelectedTagsContainer");
    const summaryPill = document.getElementById("astScopeSummaryPill");

    const count = scopeWorkingBooks.length;
    if (countBadge) {
        countBadge.innerText = `${count} كتاب محدد`;
    }

    if (summaryPill) {
        if (scopeWorkingType === "collection") {
            const col = (bookCollections || []).find(c => c.id === scopeWorkingCollectionId);
            summaryPill.innerText = `النطاق المعتمد: تجميعة «${col ? col.name : 'مخصصة'}» (${count} كتاب)`;
        } else if (scopeWorkingType === "category") {
            const cat = (categoriesList || []).find(c => String(c.category_id) === String(scopeWorkingCategoryId));
            summaryPill.innerText = `النطاق المعتمد: قسم «${cat ? cat.category_name_ar : 'مخصص'}» كامل`;
        } else if (count > 0) {
            summaryPill.innerText = `النطاق المعتمد: حصر مخصص في (${count}) كتاباً مصرحاً`;
        } else {
            summaryPill.innerText = `النطاق المعتمد: عموم الشاملة (٥ ملايين صفحة)`;
        }
    }

    if (!tagsContainer) return;

    if (count === 0) {
        tagsContainer.innerHTML = `<span style="color: #64748b; font-size: 0.8rem;">لم يتم حصر أي كتب بعد (النطاق مفتوح على عموم الشاملة).</span>`;
        return;
    }

    tagsContainer.innerHTML = scopeWorkingBooks.map(bt => `
        <span class="scope-tag-item">
            <span>📖 ${escapeHtml(bt)}</span>
            <button type="button" class="btn-remove-tag" onclick="toggleBookInScope('${escapeHtml(bt)}', false)">✕</button>
        </span>
    `).join("");
}

// اعتماد وحفظ تعديلات نطاق الكتب للمساعد أو لأداة MCP
function applyScopeChangesToAssistant() {
    if (!currentEditingAssistantForScope) return;

    // حالة خاصة: إذا كان النطاق مفتوحاً لأداة MCP التخصصية المخصصة
    if (currentEditingAssistantForScope === "mcp_custom_tool") {
        const booksInput = document.getElementById("customToolBooksInput");
        const catSelect = document.getElementById("customToolCategorySelect");

        if (booksInput) {
            booksInput.value = scopeWorkingBooks.join("، ");
        }
        if (catSelect && scopeWorkingCategoryId) {
            catSelect.value = String(scopeWorkingCategoryId);
        }

        if (typeof updateCustomToolBooksCountBadge === "function") {
            updateCustomToolBooksCountBadge();
        }
        closeAssistantScopeModal();
        showToast(`✓ تم تطبيق وتحديد نطاق الكتب بنجاح لأداة MCP (${scopeWorkingBooks.length} كتب محددة)`);
        return;
    }

    const ast = (assistantsList || []).find(a => a.id === currentEditingAssistantForScope);
    if (!ast) return;

    ast.book_titles = [...scopeWorkingBooks];
    ast.scope_type = scopeWorkingType;
    ast.category_id = scopeWorkingCategoryId;
    ast.collection_id = scopeWorkingCollectionId;

    saveAssistantsSettings();
    renderAssistantsList();
    closeAssistantScopeModal();
    showToast(`✓ تم حفظ وتطبيق نطاق كتب الشاملة بنجاح للمساعد «${ast.name}»`);
}

// ==========================================================================
// مختبر التجربة المباشرة للبايبلاين (Live Pipeline Sandbox Runner)
// ==========================================================================

async function runPipelineSandboxDirect() {
    const input = document.getElementById("pipelineSandboxInput");
    const btn = document.getElementById("btnRunPipelineSandbox");
    const logContainer = document.getElementById("pipelineSandboxLogContainer");
    const statusText = document.getElementById("pipelineSandboxStatusText");
    const stepsTimeline = document.getElementById("pipelineSandboxSteps");
    const resultBox = document.getElementById("pipelineSandboxResultBox");

    const query = input ? input.value.trim() : "";
    if (!query) {
        showToast("يرجى كتابة مسألة أو سؤال في حقل التجربة أولاً");
        return;
    }

    const provider = document.getElementById("aiProviderSelect")?.value || "openrouter";
    const isLocalProvider = provider === "ollama" || provider === "lmstudio";
    const apiKey = document.getElementById("aiApiKeyInput")?.value.trim() || "";
    if (!apiKey && !isLocalProvider) {
        showToast("تنبيه: يرجى إدخال مفتاح API في لوحة الإعدادات أولاً");
        return;
    }
    const endpointUrl = document.getElementById("aiEndpointUrlInput")?.value.trim() || "";

    const activeAssistants = (assistantsList || []).filter(a => a.enabled);
    if (activeAssistants.length === 0) {
        showToast("تنبيه: لا يوجد نماذج مساعدة مفعلة لتشغيل البايبلاين");
        return;
    }

    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<span class="spinner" style="display:inline-block; margin-left: 0.4rem;">⏳</span> جاري الاستجواب والتوليف...`;
    }

    if (logContainer) logContainer.style.display = "block";
    if (resultBox) resultBox.style.display = "none";
    
    let startTime = Date.now();
    const updateTimer = () => {
        const elapsedSec = Math.floor((Date.now() - startTime) / 1000);
        if (statusText) {
            statusText.innerText = `جاري استدعاء (${activeAssistants.length}) نماذج مساعدة وتوزيع الاستعلامات التخصصية... (⏱️ ${elapsedSec} ثانية)`;
        }
    };
    updateTimer();
    const timerInterval = setInterval(updateTimer, 1000);

    if (stepsTimeline) {
        stepsTimeline.innerHTML = `
            <div class="sandbox-step-item">
                <span>1️⃣</span>
                <div>توجيه السؤال التراثي: <strong>«${escapeHtml(query)}»</strong> مباشرة إلى النماذج التخصصية.</div>
            </div>
            <div class="sandbox-step-item">
                <span>2️⃣</span>
                <div>إطلاق استعلامات Qdrant المتوازية في نطاق كتب كل نموذج مساعد واستخلاص نصوص الشاملة...</div>
            </div>
        `;
    }

    try {
        const savedCloudKey = localStorage.getItem("shamela_openrouter_api_key") || "";
        const effectiveCloudKey = (apiKey && apiKey.startsWith("sk-or-")) ? apiKey : (savedCloudKey || apiKey);
        
        let effectiveMainModel = document.getElementById("aiModelSelect")?.value || "";
        if (!effectiveMainModel) {
            effectiveMainModel = (provider === "ollama") ? "qwen3.6:27b-mlx-bf16" : "z-ai/glm-5.3";
        }

        const payload = {
            query: query,
            api_key: apiKey || effectiveCloudKey,
            cloud_api_key: effectiveCloudKey,
            openrouter_api_key: effectiveCloudKey,
            provider: provider,
            endpoint_url: endpointUrl,
            base_url: endpointUrl,
            main_model: effectiveMainModel,
            main_system_prompt: document.getElementById("aiSystemPrompt")?.value || "",
            main_temperature: parseFloat(document.getElementById("aiTemperature")?.value || "0.2"),
            assistants: activeAssistants,
            enable_gap_fill: false
        };

        const res = await fetch("/api/ai/pipeline", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.detail || "حدث خطأ أثناء تشغيل البايبلاين");
        }

        const data = await res.json();
        const elapsedTotal = Math.floor((Date.now() - startTime) / 1000);

        if (statusText) statusText.innerText = `✓ تم اكتمال تشغيل البايبلاين والتوليف النهائي بنجاح في (${elapsedTotal} ثانية)!`;

        // إضافة خطوات التقرير مع إظهار تحليل النموذج الأساسي واستدعاءات المساعدين
        let stepsHtml = "";
        const leadPlan = data.pipeline_flow?.plan || "";
        if (leadPlan) {
            stepsHtml += `
                <div class="sandbox-step-item" style="border-right: 3px solid #818cf8; background: rgba(99, 102, 241, 0.08);">
                    <span>🧠</span>
                    <div style="flex: 1;">
                        <strong style="color: #a5b4fc;">تحليل وتفكيك النموذج الأساسي للنظائر التراثية وتوزيع المهام:</strong>
                        <div style="font-size: 0.78rem; color: #e0e7ff; margin-top: 4px; line-height: 1.55; white-space: pre-wrap;">${escapeHtml(leadPlan)}</div>
                    </div>
                </div>
            `;
        }

        const subtasks = data.assistant_reports || data.pipeline_flow?.subtasks || data.subtasks || [];
        subtasks.forEach(rep => {
            const reportSnippet = rep.report || rep.response || "";
            const modelUsed = rep.model_used || "افتراضي المنصة";
            const roleText = rep.role || "";
            const subqText = rep.subquery || "";
            const formatText = rep.output_format || "";
            stepsHtml += `
                <div class="sandbox-step-item" style="border-right: 3px solid #38bdf8;">
                    <span>🤖</span>
                    <div style="flex: 1;">
                        <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap;">
                            <strong>${escapeHtml(rep.assistant_name || 'مساعد تخصصي')}:</strong>
                            <span style="font-size: 0.72rem; background: rgba(56, 189, 248, 0.15); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.3); padding: 1px 7px; border-radius: 4px;" dir="ltr">
                                ⚡ ${escapeHtml(modelUsed)}
                            </span>
                        </div>
                        ${subqText ? `
                            <div style="font-size: 0.76rem; color: #fde047; margin-top: 3px;">
                                📩 <strong>الطلب الموجه له من النموذج الأساسي:</strong> «${escapeHtml(subqText)}»
                            </div>
                        ` : ''}
                        ${roleText ? `
                            <div style="font-size: 0.74rem; color: #93c5fd; margin-top: 2px;">
                                🎯 <strong>التوجيه الفرعي:</strong> ${escapeHtml(roleText)}
                            </div>
                        ` : ''}
                        ${formatText ? `
                            <div style="font-size: 0.72rem; color: #86efac; margin-top: 2px;">
                                📐 <strong>طريقة الإخراج:</strong> ${escapeHtml(formatText)}
                            </div>
                        ` : ''}
                        <div style="font-size: 0.74rem; color: #cbd5e1; margin-top: 2px;">
                            استرجع (${rep.sources_count || 0}) نصاً من كتبه التخصصية.
                        </div>
                        ${reportSnippet ? `
                            <div style="font-size: 0.75rem; color: #94a3b8; margin-top: 5px; max-height: 90px; overflow-y: auto; background: rgba(0,0,0,0.25); padding: 5px 8px; border-radius: 4px; line-height: 1.5; white-space: pre-wrap;">${escapeHtml(reportSnippet.length > 300 ? reportSnippet.substring(0, 300) + '...' : reportSnippet)}</div>
                        ` : ''}
                    </div>
                </div>
            `;
        });

        stepsHtml += `
            <div class="sandbox-step-item" style="border-right: 3px solid #34d399; background: rgba(16, 185, 129, 0.08);">
                <span>🏆</span>
                <div>
                    <strong style="color: #6ee7b7;">التحرير والترجيح النهائي بواسطة النموذج الأساسي:</strong>
                    <div style="font-size: 0.76rem; color: #d1fae5; margin-top: 3px;">أتم النموذج الأساسي صياغة التحقيق والترجيح الموحد استناداً لتقارير المساعدين وفق موجهه المعتمد.</div>
                </div>
            </div>
        `;

        const gapInfo = data.gap_report || data.pipeline_flow?.gap_analysis;
        if (gapInfo && (gapInfo.has_gaps || gapInfo.has_gap)) {
            const missingText = (gapInfo.missing_aspects && gapInfo.missing_aspects.length > 0) 
                ? gapInfo.missing_aspects.join('، ') 
                : (gapInfo.reason || "استدراك وتدقيق إضافي");
            stepsHtml += `
                <div class="sandbox-step-item" style="border-right: 3px solid #f59e0b;">
                    <span>🔄</span>
                    <div>
                        <strong>البحث التكميلي التلقائي (سد العجز):</strong>
                        تم رصد حاجة علمية لاستدراك [${escapeHtml(missingText)}] وإجراء جولة بحثية إضافية.
                    </div>
                </div>
            `;
        }

        if (stepsTimeline) stepsTimeline.innerHTML = stepsHtml;

        // عرض النتيجة النهائية
        if (resultBox) {
            resultBox.style.display = "block";
            const renderedAnswer = renderMarkdownToHtml(data.answer || "");
            resultBox.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem; border-bottom: 1px solid rgba(255, 255, 255, 0.1); padding-bottom: 0.4rem;">
                    <strong style="color: #34d399; font-size: 0.95rem;">🏆 التحقيق والتوليف الاستدلالي النهائي:</strong>
                    <button type="button" class="btn-copy-code" onclick="copyPipelineSandboxResult()">📋 نسخ الجواب</button>
                </div>
                <div id="pipelineSandboxFinalText" class="markdown-body" style="font-size: 0.9rem; line-height: 1.8;">
                    ${renderedAnswer}
                </div>
            `;
            setTimeout(() => {
                resultBox.scrollIntoView({ behavior: "smooth", block: "start" });
            }, 100);
        }

    } catch (e) {
        console.error("runPipelineSandboxDirect error:", e);
        if (statusText) statusText.innerText = "❌ حدث خطأ: " + e.message;
        showToast("خطأ: " + e.message);
    } finally {
        clearInterval(timerInterval);
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = `<span>🚀 تشغيل البايبلاين الآن</span>`;
        }
    }
}

// دالة تحويل نصوص الماركداون والـ JSON إلى عناصر HTML منسقة
function renderMarkdownToHtml(rawText) {
    if (!rawText) return "";
    if (typeof renderAssistantContent === "function") {
        return renderAssistantContent(rawText);
    }
    if (typeof marked !== "undefined" && marked.parse) {
        return marked.parse(rawText);
    }
    return `<p>${escapeHtml(rawText).replace(/\n/g, '<br>')}</p>`;
}

// نسخ نتيجة مختبر البايبلاين
function copyPipelineSandboxResult() {
    const el = document.getElementById("pipelineSandboxFinalText");
    if (!el) return;
    navigator.clipboard.writeText(el.innerText).then(() => {
        showToast("✓ تم نسخ التقرير النهائي للبايبلاين إلى الحافظة");
    });
}

// التمرير السريع إلى شات الداشبورد
function scrollToAiDashboardChat() {
    switchMainView("ai");
    document.getElementById("aiChatMessagesContainer")?.scrollIntoView({ behavior: "smooth" });
}

// تصدير النماذج المساعدة كملف JSON
function exportAssistantsJson() {
    exportAssistantsToJson();
}

// فتح نافذة اختيار ملف لاستيراد JSON
function importAssistantsJson() {
    const inp = document.createElement("input");
    inp.type = "file";
    inp.accept = ".json";
    inp.onchange = (e) => handleAssistantsJsonFile(e);
    inp.click();
}

/* ==========================================================================
   إدارة وتخصيص أدوات التحقيق الشرعي عبر بروتوكول MCP (Custom MCP Tools)
   ========================================================================== */

const MCP_TOOL_TEMPLATES = {
    usul: {
        id: "tahrir_usul_fiqh",
        title: "💎 كشاف القواعد الأصولية والمقاصدية",
        icon: "💎",
        category_id: 25,
        topic: "أصول الفقه، القواعد الفقهية، مقاصد الشريعة، والعلل القياسية",
        description: "استخراج القواعد الأصولية وعلل الأحكام ومقاصد الشريعة وتخريج الفروع على الأصول من أمهات كتب الأصول المعتمدة (المستصفى، الموافقات، البحر المحيط، البرهان) مع التوثيق المكتبي الدقيق.",
        books: "الموافقات، المستصفى من علم الأصول، البحر المحيط في أصول الفقه - ط الكتبي، البرهان في أصول الفقه",
        limit: 30,
        engine_type: "semantic_hybrid",
        python_code: `# محرك البحث الهجين في كتب أصول الفقه\nres = search_shamela_text(query=query, category_id=category_id, book_titles=book_titles, limit=limit)\nreturn res`
    },
    fatwa: {
        id: "nawazil_contemporary_fatwa",
        title: "🕌 فتاوى النوازل والمسائل المعاصرة",
        icon: "🕌",
        category_id: 21,
        topic: "النوازل الفقهية والمسائل الطبية والمالية والتقنية المعاصرة",
        description: "تخريج النوازل والمسائل الفقهية المعاصرة وتكييفها الفقهي ومقارنتها بفتاوى كبار المحققين ومجامع الفقه الإسلامي مع بيان مآخذ الفتوى والأدلة المقاصدية.",
        books: "مجموع الفتاوى - ابن تيمية، فتاوى قاضي الجماعة ابن سراج الأندلسي، الفتاوى الكبرى لابن تيمية، الفتاوى الهندية",
        limit: 30,
        engine_type: "semantic_hybrid",
        python_code: `# محرك البحث في كتب الفتاوى والنوازل\nres = search_shamela_text(query=query, category_id=category_id, book_titles=book_titles, limit=limit)\nreturn res`
    },
    ilal: {
        id: "ilal_hadith_advanced",
        title: "🔍 كشاف علل الحديث وتفرد الرواة",
        icon: "🔍",
        category_id: 9,
        topic: "علل الحديث، الاختلاف على الرواة، تفرد الثقات، والشواهد والمتابعات",
        description: "استقصاء علل الأحاديث وأوجه الاختلاف على الرواة في الأسانيد وتتبع كلام أئمة النقد والعلل كالإمام أحمد والبخاري وأبي حاتم والدارقطني.",
        books: "العلل ومعرفة الرجال لأحمد رواية ابنه عبد الله، العلل الكبير للترمذي، علل الحديث لابن أبي حاتم، العلل الواردة في الأحاديث النبوية للدارقطني",
        limit: 50,
        engine_type: "semantic_hybrid",
        python_code: `# محرك البحث في كتب العلل والرجال\nres = search_shamela_text(query=query, category_id=category_id, book_titles=book_titles, limit=limit)\nreturn res`
    },
    tafsir: {
        id: "tafsir_ayat_ahkam",
        title: "📖 كشاف آيات الأحكام وتفاسير الفقهاء",
        icon: "📖",
        category_id: 4,
        topic: "آيات الأحكام، أسباب النزول، دلالات الألفاظ القرآنية، وتفاسير المذاهب",
        description: "استخراج آيات الأحكام الفقهية وتفاسير الفقهاء المعتمدة لها (أحكام القرآن للجصاص، أحكام القرآن لابن العربي، الجامع لأحكام القرآن للقرطبي) بأرقام السور والآيات.",
        books: "أحكام القرآن للجصاص ط العلمية، أحكام القرآن لابن العربي ط العلمية، تفسير القرطبي = الجامع لأحكام القرآن",
        limit: 30,
        engine_type: "semantic_hybrid",
        python_code: `# محرك البحث في آيات الأحكام والتفاسير\nres = search_shamela_text(query=query, category_id=category_id, book_titles=book_titles, limit=limit)\nreturn res`
    },
    gharib: {
        id: "gharib_alhadith_lexicon",
        title: "🌿 غريب الحديث والمعاجم الأصيلة",
        icon: "🌿",
        category_id: 26,
        topic: "غريب الحديث والأثر، المعاجم التراثية، لغة الفقهاء، واشتقاق الألفاظ",
        description: "بيان المعاني اللغوية وتأصيل الألفاظ الغريبة الواردة في الأحاديث الشريفة وآثار السلف من النهاية في غريب الحديث لابن الأثير ولسان العرب والمصباح المنير.",
        books: "النهاية في غريب الحديث والأثر، لسان العرب، المصباح المنير في غريب الشرح الكبير",
        limit: 30,
        engine_type: "semantic_hybrid",
        python_code: `# محرك البحث في غريب الحديث والمعاجم\nres = search_shamela_text(query=query, category_id=category_id, book_titles=book_titles, limit=limit)\nreturn res`
    }
};

window.customMcpToolsList = [];

// تهيئة قسم أدوات MCP المخصصة
function initCustomMcpTools() {
    loadCustomMcpTools();
}

// تحميل الأدوات المخصصة وعرضها في القائمة الجانبية
// تحميل الأدوات المخصصة وعرضها في القائمة الجانبية وشبكة محطة MCP واستوديو التحقيق
async function loadCustomMcpTools() {
    const container = document.getElementById("customMcpToolsListContainer");
    const badge = document.getElementById("customMcpToolsCountBadge");
    const studioGrid = document.getElementById("mcpStudioCustomGrid");
    const studioTotalBadge = document.getElementById("mcpStudioCustomTotalBadge");
    const studioCountBadge = document.getElementById("mcpStudioCustomCountBadge");
    const toolSelect = document.getElementById("mcpCustomToolSelect");

    try {
        const res = await fetch("/api/mcp/custom-tools");
        if (!res.ok) throw new Error("تعذر جلب أدوات MCP المخصصة");
        const data = await res.json();
        window.customMcpToolsList = data.tools || [];

        const countStr = `${window.customMcpToolsList.length} أداة`;
        if (badge) badge.innerText = countStr;
        if (studioTotalBadge) studioTotalBadge.innerText = `${window.customMcpToolsList.length} أدوات تخصصية نشطة`;
        if (studioCountBadge) studioCountBadge.innerText = String(window.customMcpToolsList.length);

        // 1. تحديث قائمة الاختيار في لوحة الاستوديو التفاعلي
        if (toolSelect) {
            const prevVal = toolSelect.value;
            toolSelect.innerHTML = "";
            window.customMcpToolsList.forEach(t => {
                const opt = document.createElement("option");
                opt.value = t.id || t.name;
                opt.textContent = `${t.icon || '🛠️'} ${t.title || t.name} (${t.category || 'تخصصي'})`;
                toolSelect.appendChild(opt);
            });
            if (prevVal && window.customMcpToolsList.some(t => (t.id === prevVal || t.name === prevVal))) {
                toolSelect.value = prevVal;
            }
            onMcpCustomToolSelected();
        }

        // 2. تحديث قائمة الشريط الجانبي (AI Chat View)
        if (container) {
            if (window.customMcpToolsList.length === 0) {
                container.innerHTML = `
                    <div style="font-size: 0.74rem; color: #94a3b8; text-align: center; padding: 0.75rem 0.5rem; background: rgba(255,255,255,0.02); border-radius: var(--radius-sm); border: 1px dashed rgba(255,255,255,0.1);">
                        لا توجد أدوات MCP مخصصة حتى الآن.<br>
                        <button type="button" class="btn-preset" onclick="openCustomMcpToolModal()" style="margin-top: 0.4rem; font-size: 0.72rem; color: #c084fc;">+ أنشئ أول أداة مخصصة الآن</button>
                    </div>
                `;
            } else {
                let html = "";
                window.customMcpToolsList.forEach(tool => {
                    const toolId = tool.id || tool.name;
                    const isChecked = tool.enabled !== false ? "checked" : "";
                    const engineBadge = tool.engine_type === "custom_python"
                        ? `<span style="font-size: 0.62rem; padding: 1px 4px; border-radius: 4px; background: rgba(56, 189, 248, 0.15); color: #38bdf8; border: 1px solid rgba(56,189,248,0.3);">🐍 كود بايثون</span>`
                        : `<span style="font-size: 0.62rem; padding: 1px 4px; border-radius: 4px; background: rgba(168, 85, 247, 0.15); color: #c084fc; border: 1px solid rgba(168,85,247,0.3);">⚡ هجين تخصصي</span>`;
                    
                    const limitLabel = tool.default_limit ? `سقف: ${tool.default_limit}` : "سقف: 30";

                    html += `
                        <div class="custom-mcp-tool-card" style="display: flex; align-items: center; justify-content: space-between; background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(168, 85, 247, 0.2); border-radius: var(--radius-sm); padding: 0.45rem 0.65rem; transition: background 0.2s;" onmouseenter="this.style.background='rgba(168,85,247,0.08)'" onmouseleave="this.style.background='rgba(255,255,255,0.03)'">
                            <label style="display: flex; align-items: center; gap: 0.5rem; margin: 0; cursor: pointer; flex: 1; min-width: 0;">
                                <input type="checkbox" class="mcp-tool-chk custom-tool-chk" value="${toolId}" ${isChecked} onchange="saveAiSettings()">
                                <div style="min-width: 0; flex: 1;">
                                    <div style="font-size: 0.78rem; font-weight: 700; color: #f1f5f9; display: flex; align-items: center; gap: 0.35rem; flex-wrap: wrap;">
                                        <span>${tool.icon || '🛠️'}</span>
                                        <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 170px;">${escapeHtml(tool.title || toolId)}</span>
                                        <span style="font-size: 0.64rem; padding: 1px 5px; border-radius: 4px; background: rgba(255,255,255,0.08); color: #cbd5e1;">${limitLabel}</span>
                                        ${engineBadge}
                                    </div>
                                    <div style="font-size: 0.68rem; color: #94a3b8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 1px;" title="${escapeHtml(tool.topic || tool.description || '')}">
                                        ${escapeHtml(tool.topic || tool.description || '')}
                                    </div>
                                </div>
                            </label>
                            <div style="display: flex; align-items: center; gap: 0.3rem; margin-right: 0.4rem; flex-shrink: 0;">
                                <button type="button" class="btn-icon-subtle" title="تعديل الأداة" onclick="editCustomMcpTool('${toolId}')" style="padding: 2px 6px; font-size: 0.72rem; color: #38bdf8; background: rgba(56,189,248,0.1); border: 1px solid rgba(56,189,248,0.25); border-radius: 4px; cursor: pointer;">✏️</button>
                                <button type="button" class="btn-icon-subtle" title="حذف الأداة" onclick="deleteCustomMcpTool('${toolId}')" style="padding: 2px 6px; font-size: 0.72rem; color: #f43f5e; background: rgba(244,63,94,0.1); border: 1px solid rgba(244,63,94,0.25); border-radius: 4px; cursor: pointer;">🗑️</button>
                            </div>
                        </div>
                    `;
                });
                container.innerHTML = html;
            }
        }

        // 3. تحديث شبكة كروت الأدوات التخصصية في محطة MCP الرئيسية
        if (studioGrid) {
            if (window.customMcpToolsList.length === 0) {
                studioGrid.innerHTML = `
                    <div style="grid-column: 1 / -1; text-align: center; padding: 2rem; color: #94a3b8; background: rgba(255,255,255,0.02); border-radius: var(--radius-sm); border: 1px dashed rgba(255,255,255,0.15);">
                        <p style="margin-bottom: 0.75rem;">لم تقم بإنشاء أدوات MCP تخصصية حتى الآن.</p>
                        <button type="button" class="btn-action" onclick="openCustomMcpToolModal()">+ أنشئ أول أداة مخصصة الآن</button>
                    </div>
                `;
            } else {
                let gridHtml = "";
                window.customMcpToolsList.forEach(tool => {
                    const toolId = tool.id || tool.name;
                    const engineLabel = tool.engine_type === "custom_python"
                        ? `<span style="font-size: 0.68rem; padding: 2px 6px; border-radius: 4px; background: rgba(56, 189, 248, 0.15); color: #38bdf8; border: 1px solid rgba(56,189,248,0.3);">🐍 كود بايثون</span>`
                        : `<span style="font-size: 0.68rem; padding: 2px 6px; border-radius: 4px; background: rgba(168, 85, 247, 0.15); color: #c084fc; border: 1px solid rgba(168,85,247,0.3);">⚡ محرك هجين تخصصي</span>`;
                    
                    const catLabel = tool.category || "عام بالشاملة";
                    const limitVal = tool.default_limit || 30;

                    gridHtml += `
                        <div class="mcp-custom-card" style="background: rgba(15, 23, 42, 0.85); border: 1px solid rgba(168, 85, 247, 0.25); border-radius: var(--radius-sm); padding: 1rem; display: flex; flex-direction: column; justify-content: space-between; transition: all 0.25s ease;" onmouseenter="this.style.borderColor='#a855f7'; this.style.transform='translateY(-2px)';" onmouseleave="this.style.borderColor='rgba(168,85,247,0.25)'; this.style.transform='none';">
                            <div>
                                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.5rem;">
                                    <div style="display: flex; align-items: center; gap: 0.45rem;">
                                        <span style="font-size: 1.3rem;">${tool.icon || '🛠️'}</span>
                                        <div>
                                            <h4 style="margin: 0; font-size: 0.92rem; color: #f8fafc; font-weight: 700;">${escapeHtml(tool.title || toolId)}</h4>
                                            <span style="font-family: monospace; font-size: 0.68rem; color: #a855f7;">${escapeHtml(toolId)}</span>
                                        </div>
                                    </div>
                                    <span style="font-size: 0.68rem; padding: 2px 6px; border-radius: 10px; background: rgba(255,255,255,0.08); color: #e2e8f0;">سقف: ${limitVal}</span>
                                </div>
                                
                                <p style="font-size: 0.76rem; color: #94a3b8; line-height: 1.45; margin: 0 0 0.75rem 0; min-height: 42px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;" title="${escapeHtml(tool.topic || tool.description || '')}">
                                    ${escapeHtml(tool.topic || tool.description || 'أداة تخصصية لاستخراج وتحرير المسائل')}
                                </p>

                                <div style="display: flex; gap: 0.4rem; flex-wrap: wrap; margin-bottom: 0.75rem;">
                                    <span style="font-size: 0.68rem; padding: 1px 6px; border-radius: 4px; background: rgba(255,255,255,0.05); color: #cbd5e1; border: 1px solid rgba(255,255,255,0.1);">📚 ${escapeHtml(catLabel)}</span>
                                    ${engineLabel}
                                </div>
                            </div>

                            <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid rgba(255,255,255,0.08); padding-top: 0.65rem; margin-top: 0.25rem;">
                                <button type="button" class="btn-preset" onclick="openMcpStudioWithTool('${toolId}')" style="background: rgba(168, 85, 247, 0.2); color: #c084fc; border: 1px solid rgba(168, 85, 247, 0.4); font-size: 0.74rem; font-weight: 700; padding: 4px 10px; cursor: pointer; border-radius: 6px;">
                                    <span>⚡ تجربة بالاستوديو</span>
                                </button>
                                <div style="display: flex; gap: 0.35rem;">
                                    <button type="button" class="btn-icon-subtle" title="تعديل الأداة" onclick="editCustomMcpTool('${toolId}')" style="padding: 3px 8px; font-size: 0.76rem; color: #38bdf8; background: rgba(56,189,248,0.1); border: 1px solid rgba(56,189,248,0.25); border-radius: 5px; cursor: pointer;">✏️ تعديل</button>
                                    <button type="button" class="btn-icon-subtle" title="حذف الأداة" onclick="deleteCustomMcpTool('${toolId}')" style="padding: 3px 8px; font-size: 0.76rem; color: #f43f5e; background: rgba(244,63,94,0.1); border: 1px solid rgba(244,63,94,0.25); border-radius: 5px; cursor: pointer;">🗑️</button>
                                </div>
                            </div>
                        </div>
                    `;
                });
                studioGrid.innerHTML = gridHtml;
            }
        }

    } catch (e) {
        console.error("loadCustomMcpTools error:", e);
        if (container) {
            container.innerHTML = `<div style="color: #f43f5e; font-size: 0.72rem; padding: 0.5rem;">خطأ في تحميل الأدوات: ${escapeHtml(e.message)}</div>`;
        }
    }
}

// فتح استوديو التحقيق مع اختيار أداة مخصصة محددة
function openMcpStudioWithTool(toolId) {
    if (typeof switchMainView === "function") switchMainView("mcp");
    if (typeof switchMcpTab === "function") switchMcpTab("custom_tools");
    const sel = document.getElementById("mcpCustomToolSelect");
    if (sel && toolId) {
        sel.value = toolId;
        onMcpCustomToolSelected();
    }
    document.getElementById("mcpPanel_custom_tools")?.scrollIntoView({ behavior: "smooth" });
}

// تحديث شريط مواصفات الأداة في استوديو التحقيق
function onMcpCustomToolSelected() {
    const sel = document.getElementById("mcpCustomToolSelect");
    const badge = document.getElementById("mcpCustomToolMetaBadge");
    const queryInput = document.getElementById("mcpCustomQueryInput");
    const limitSelect = document.getElementById("mcpCustomLimitSelect");
    if (!sel || !window.customMcpToolsList) return;

    const tool = window.customMcpToolsList.find(t => (t.id === sel.value || t.name === sel.value));
    if (!tool) {
        if (badge) badge.innerHTML = `<span>اختر أداة لعرض مواصفاتها ومجالها</span>`;
        return;
    }

    if (queryInput && (!queryInput.value || queryInput.value === "سد الذرائع والمصالح المرسلة")) {
        if (tool.topic) queryInput.value = tool.topic.split("،")[0].trim();
    }
    if (limitSelect && tool.default_limit) {
        limitSelect.value = String(tool.default_limit);
    }

    if (badge) {
        const booksStr = Array.isArray(tool.book_titles) && tool.book_titles.length > 0 
            ? `📖 كتب مخصصة: ${tool.book_titles.slice(0, 3).join("، ")}${tool.book_titles.length > 3 ? "..." : ""}`
            : `📚 قسم الشاملة: ${tool.category || 'عموم الشاملة'}`;
        
        const engineStr = tool.engine_type === "custom_python" ? "🐍 محرك كود بايثون" : "⚡ محرك بحث هجين تخصصي";

        badge.innerHTML = `
            <span style="font-weight: 700; color: #f1f5f9;">${tool.icon || '🛠️'} ${escapeHtml(tool.title || tool.name)}</span>
            <span>🎯 المجال: ${escapeHtml(tool.topic || tool.description || '')}</span>
            <span>${booksStr}</span>
            <span style="color: #38bdf8;">${engineStr}</span>
            <span style="background: rgba(168, 85, 247, 0.2); padding: 1px 7px; border-radius: 6px; color: #c084fc;">سقف النتائج: ${tool.default_limit || 30}</span>
            <button type="button" class="btn-preset" onclick="editCustomMcpTool('${tool.id || tool.name}')" style="margin-right: auto; padding: 2px 7px; font-size: 0.72rem; color: #38bdf8;">✏️ تعديل إعدادات الأداة</button>
        `;
    }
}

// تنفيذ وتشغيل الأداة المخصصة داخل استوديو التحقيق
async function runMcpStudioCustomTool() {
    const sel = document.getElementById("mcpCustomToolSelect");
    const queryInput = document.getElementById("mcpCustomQueryInput");
    const limitSelect = document.getElementById("mcpCustomLimitSelect");
    const resultBox = document.getElementById("mcpCustomResultBox");
    const runBtn = document.getElementById("btnRunCustomMcpTool");

    const toolName = sel ? sel.value : "";
    const query = queryInput ? queryInput.value.trim() : "";
    const limit = parseInt(limitSelect ? limitSelect.value : "30") || 30;

    if (!toolName) {
        showToast("⚠️ يرجى اختيار أداة MCP أولاً");
        return;
    }
    if (!query) {
        showToast("⚠️ يرجى كتابة مسألة أو عبارة استعلام للأداة");
        return;
    }

    if (runBtn) runBtn.disabled = true;
    if (resultBox) {
        resultBox.style.display = "block";
        resultBox.innerHTML = `
            <div class="mcp-loading-state" style="text-align: center; padding: 2rem; color: #c084fc;">
                <span class="mcp-spinner"></span>
                <span style="margin-right: 0.5rem; font-weight: 700;">جاري استدعاء وتنفيذ الأداة التخصصية [${toolName}] بسقف ${limit} نتيجة...</span>
            </div>
        `;
    }

    const t0 = performance.now();
    try {
        const res = await fetch("/api/mcp/execute", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                tool: toolName,
                arguments: { query: query, limit: limit }
            })
        });

        const data = await res.json();
        const duration = (performance.now() - t0).toFixed(1);

        if (typeof logMcpInspector === "function") {
            logMcpInspector(toolName, { query, limit }, data.result, duration);
        }

        const r = data.result || {};

        // 1. فحص وجود خطأ برمجي في كود بايثون أو محرك الأداة
        if (r.error || r.status === "error" || data.error) {
            const errMsg = r.error || data.error || "خطأ غير معروف في تنفيذ الأداة";
            resultBox.innerHTML = `
                <div class="mcp-error-box" style="background: rgba(239, 68, 68, 0.12); border: 1px solid rgba(239, 68, 68, 0.4); color: #f87171; padding: 1.1rem; border-radius: 8px;">
                    <div style="font-weight: 700; margin-bottom: 0.5rem; display: flex; align-items: center; justify-content: space-between;">
                        <span style="font-size: 0.9rem;">❌ خطأ في تنفيذ كود الأداة البرمجية:</span>
                        <span style="font-size: 0.75rem; background: rgba(239, 68, 68, 0.25); padding: 2px 8px; border-radius: 4px; color: #fca5a5;">${escapeHtml(toolName)}</span>
                    </div>
                    <div style="font-family: monospace; font-size: 0.8rem; direction: ltr; text-align: left; background: rgba(0,0,0,0.4); padding: 0.75rem; border-radius: 6px; line-height: 1.4; color: #fca5a5; word-break: break-all; white-space: pre-wrap; max-height: 220px; overflow-y: auto;">${escapeHtml(errMsg)}</div>
                    <div style="margin-top: 0.6rem; font-size: 0.76rem; color: #cbd5e1; direction: rtl; text-align: right;">
                        💡 يُرجى مراجعة كود بايثون للأداة والتأكد من صحة الصياغة، أو استخدام محرك البحث الهجين التلقائي.
                    </div>
                </div>
            `;
            return;
        }

        const items = r.results || r.recommended_references || r.verses || r.isnads || r.isnad_chains || r.narrators || (Array.isArray(r) ? r : []);

        if (!items || items.length === 0) {
            const noteHtml = r.note ? `<div style="margin-top: 0.5rem; font-size: 0.8rem; color: #fef08a;">💡 ملاحظة: ${escapeHtml(r.note)}</div>` : '';
            resultBox.innerHTML = `
                <div class="mcp-error-box" style="background: rgba(245, 158, 11, 0.1); border: 1px solid rgba(245, 158, 11, 0.3); color: #fbbf24; padding: 1rem; border-radius: 8px;">
                    <div style="font-weight: 700;">⚠️ لم تُعِد الأداة نصوصاً مطابقة للاستعلام في الكتب المحددة. جرب عبارة أخرى أو وسّع نطاق البحث.</div>
                    ${noteHtml}
                </div>
            `;
            return;
        }

        let html = `
            <div class="mcp-result-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; padding-bottom: 0.5rem; border-bottom: 1px solid rgba(255,255,255,0.08);">
                <div>
                    <span style="font-weight: 700; color: #a855f7;">⚡ تم استخراج ${items.length} نتيجة محققة</span>
                    <span style="font-size: 0.75rem; color: #94a3b8; margin-right: 0.5rem;">(الأداة: ${escapeHtml(toolName)})</span>
                </div>
                <span class="mcp-latency-pill">⚡ ${duration} ms</span>
            </div>
            <div style="display: flex; flex-direction: column; gap: 0.75rem;">
        `;

        items.forEach((item, idx) => {
            const bTitle = item.title || item.book_title || item.short_name || item.name || (item.verse_id ? `آية قرآنية رقم ${item.verse_id}` : "كتاب من الشاملة");
            const author = item.author ? `لـ ${item.author}` : (item.ibn_hajar_rank ? `(${item.ibn_hajar_rank})` : "");
            const death = item.author_death_hijri ? `(ت ${item.author_death_hijri}هـ)` : "";
            const loc = (item.part ? `ج: ${item.part} ` : "") + (item.page_num ? `ص: ${item.page_num}` : "") + (item.era_label ? ` [${item.era_label}]` : "");
            const snippet = item.snippet || item.full_body || item.text || item.chain_text || (item.criticism_quotes ? item.criticism_quotes.map(c => `${c.scholar}: ${c.text}`).join('\n') : "") || "";
            const citation = item.citation || `«${bTitle}» ${author} ${death} ${loc}`.trim();

            html += `
                <div class="mcp-result-card" style="background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; padding: 0.85rem; border-right: 4px solid #a855f7;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.4rem;">
                        <span style="font-weight: 700; color: #38bdf8; font-size: 0.86rem;">#${idx + 1} — «${escapeHtml(bTitle)}» <small style="color: #94a3b8; font-weight: normal;">${escapeHtml(author)} ${escapeHtml(death)}</small></span>
                        <span style="font-size: 0.72rem; color: #cbd5e1; background: rgba(255,255,255,0.06); padding: 2px 6px; border-radius: 4px;">${escapeHtml(loc)}</span>
                    </div>
                    <div style="font-size: 0.82rem; color: #f1f5f9; line-height: 1.6; margin-bottom: 0.5rem; text-align: justify;">
                        ${snippet}
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.74rem; color: #94a3b8; border-top: 1px dashed rgba(255,255,255,0.06); padding-top: 0.4rem;">
                        <span>📜 ${escapeHtml(citation)}</span>
                        ${item.book_id && item.page_num ? `<button type="button" class="btn-preset" onclick="quickLoadPageContext(${item.book_id}, ${item.page_num})" style="padding: 1px 7px; font-size: 0.7rem; color: #38bdf8;">📖 فتح سياق الصفحة</button>` : ''}
                    </div>
                </div>
            `;
        });

        html += `</div>`;
        resultBox.innerHTML = html;

    } catch (e) {
        console.error("runMcpStudioCustomTool error:", e);
        if (resultBox) {
            resultBox.innerHTML = `<div class="mcp-error-box">❌ خطأ في تنفيذ الأداة: ${escapeHtml(e.message)}</div>`;
        }
        showToast("خطأ في تشغيل الأداة: " + e.message);
    } finally {
        if (runBtn) runBtn.disabled = false;
    }
}

// فتح نافذة إنشاء/تعديل أداة MCP
function openCustomMcpToolModal(toolName = null) {
    const modal = document.getElementById("customMcpToolModal");
    if (!modal) return;

    const modalTitle = document.getElementById("customMcpModalTitle");
    const editIdInput = document.getElementById("customToolEditId");
    const titleInput = document.getElementById("customToolTitleInput");
    const nameInput = document.getElementById("customToolNameInput");
    const iconInput = document.getElementById("customToolIconInput");
    const topicInput = document.getElementById("customToolTopicInput");
    const catSelect = document.getElementById("customToolCategorySelect");
    const limitSelect = document.getElementById("customToolLimitSelect");
    const booksInput = document.getElementById("customToolBooksInput");
    const descInput = document.getElementById("customToolDescInput");
    const engineSelect = document.getElementById("customToolEngineSelect");
    const codeArea = document.getElementById("customToolPythonCode");
    const testBox = document.getElementById("customToolTestResultBox");

    if (testBox) testBox.style.display = "none";

    if (toolName && window.customMcpToolsList) {
        const tool = window.customMcpToolsList.find(t => (t.id === toolName || t.name === toolName));
        if (tool) {
            if (modalTitle) modalTitle.innerText = "تعديل أداة MCP تخصصية: " + (tool.title || tool.name);
            if (editIdInput) editIdInput.value = tool.id || tool.name;
            if (titleInput) titleInput.value = tool.title || "";
            if (nameInput) {
                nameInput.value = tool.name || tool.id || "";
                nameInput.readOnly = true;
            }
            if (iconInput) iconInput.value = tool.icon || "🛠️";
            if (topicInput) topicInput.value = tool.topic || "";
            if (catSelect) catSelect.value = tool.category_id || "";
            if (limitSelect) limitSelect.value = String(tool.default_limit || 30);
            if (booksInput) booksInput.value = Array.isArray(tool.book_titles) ? tool.book_titles.join("، ") : "";
            if (descInput) descInput.value = tool.description || "";
            if (engineSelect) {
                engineSelect.value = tool.engine_type || "semantic_hybrid";
                toggleCustomToolCodeBox(engineSelect.value);
            }
            if (codeArea) codeArea.value = tool.python_code || "";

            updateCustomToolBooksCountBadge();
            modal.style.display = "flex";
            return;
        }
    }

    // الوضع الافتراضي لإنشاء أداة جديدة
    if (modalTitle) modalTitle.innerText = "إنشاء أداة MCP تخصصية جديدة";
    if (editIdInput) editIdInput.value = "";
    if (titleInput) titleInput.value = "";
    if (nameInput) {
        nameInput.value = "";
        nameInput.readOnly = false;
    }
    if (iconInput) iconInput.value = "💎";
    if (topicInput) topicInput.value = "";
    if (catSelect) catSelect.value = "";
    if (limitSelect) limitSelect.value = "30";
    if (booksInput) booksInput.value = "";
    if (descInput) descInput.value = "";
    if (engineSelect) {
        engineSelect.value = "semantic_hybrid";
        toggleCustomToolCodeBox("semantic_hybrid");
    }
    if (codeArea) {
        codeArea.value = `# كود بايثون لتنفيذ الأداة المخصصة\nres = search_shamela_text(query=query, category_id=category_id, book_titles=book_titles, limit=limit)\nreturn res`;
    }

    updateCustomToolBooksCountBadge();
    modal.style.display = "flex";
}

// إغلاق نافذة أداة MCP
function closeCustomMcpToolModal() {
    const modal = document.getElementById("customMcpToolModal");
    if (modal) modal.style.display = "none";
}

// فتح نافذة إدارة وتخصيص نطاق كتب الشاملة لأداة MCP (نفس نافذة النماذج المساعدة)
async function openCustomMcpToolScopeModal() {
    const scopeModal = document.getElementById("assistantScopeManagerModal");
    if (!scopeModal) return;

    // تعيين الكيان الجاري تعديله كأداة MCP مخصصة
    currentEditingAssistantForScope = "mcp_custom_tool";

    // رفع طبقة العرض لتظهر فوق نافذة أداة MCP مباشرة
    scopeModal.style.zIndex = "10015";

    const titleEl = document.getElementById("astScopeModalTitle");
    const subtitleEl = document.getElementById("astScopeModalSubtitle");
    const toolTitle = document.getElementById("customToolTitleInput")?.value?.trim() || "أداة MCP التخصصية";

    if (titleEl) titleEl.innerText = `إدارة وتعديل نطاق كتب: «${toolTitle}»`;
    if (subtitleEl) subtitleEl.innerText = `تخصيص وتحديد الكتب المحصورة في أداة MCP واستيعاب الأقسام والتجميعات`;

    // قراءة الكتب الحالية من حقل الإدخال
    const booksRaw = document.getElementById("customToolBooksInput")?.value?.trim() || "";
    scopeWorkingBooks = booksRaw ? booksRaw.split(/[،,]/).map(b => b.trim()).filter(Boolean) : [];

    // قراءة القسم المختار إن وجد
    const catSelect = document.getElementById("customToolCategorySelect");
    scopeWorkingCategoryId = catSelect?.value ? parseInt(catSelect.value) : null;
    scopeWorkingCollectionId = null;
    scopeWorkingType = scopeWorkingBooks.length > 0 ? "books" : (scopeWorkingCategoryId ? "category" : "all");

    // تعبئة قائمة الـ 41 تصنيفاً إن لم تكن معبأة
    const astCatSelect = document.getElementById("astScopeCategorySelect");
    if (astCatSelect && astCatSelect.options.length <= 1) {
        if (!categoriesList || categoriesList.length === 0) {
            try {
                const res = await fetch("/api/categories");
                categoriesList = await res.json();
            } catch(e) {}
        }
        astCatSelect.innerHTML = `<option value="">📚 كل التصنيفات (جميع أقسام الشاملة الـ ٤١)</option>`;
        (categoriesList || []).forEach(c => {
            if (c.category_id > 0) {
                const opt = document.createElement("option");
                opt.value = c.category_id;
                opt.textContent = `${c.category_name_ar} (${c.book_count} كتاب)`;
                astCatSelect.appendChild(opt);
            }
        });
    }

    if (astCatSelect && scopeWorkingCategoryId) {
        astCatSelect.value = String(scopeWorkingCategoryId);
    }

    // تعبئة قائمة التجميعات المحفوظة
    const colSelect = document.getElementById("astScopeCollectionSelect");
    if (colSelect) {
        colSelect.innerHTML = (bookCollections || []).map(col => {
            const count = (col.sections || []).reduce((acc, s) => acc + (s.books || []).length, 0);
            return `<option value="${col.id}">${escapeHtml(col.name)} (${count} كتاب)</option>`;
        }).join("");
    }

    // التبديل إلى التبويب المناسب
    switchAssistantScopeTab(scopeWorkingType === "collection" ? "collection" : (scopeWorkingType === "all" ? "all" : "shamela"));

    renderAssistantScopeTags();
    scopeModal.style.display = "flex";
}

// تحديث شارة ووسوم الكتب المحددة لأداة MCP في النافذة
function updateCustomToolBooksCountBadge() {
    const input = document.getElementById("customToolBooksInput");
    const badge = document.getElementById("customToolBooksCountBadge");
    const previewContainer = document.getElementById("customToolBooksTagsPreview");

    const raw = input?.value?.trim() || "";
    const books = raw ? raw.split(/[،,]/).map(b => b.trim()).filter(Boolean) : [];

    if (badge) {
        if (books.length > 0) {
            badge.innerText = `${books.length} كتاب محدد`;
            badge.style.background = "rgba(16, 185, 129, 0.2)";
            badge.style.color = "#34d399";
        } else {
            badge.innerText = "عموم الشاملة / القسم";
            badge.style.background = "rgba(168, 85, 247, 0.2)";
            badge.style.color = "#c084fc";
        }
    }

    if (previewContainer) {
        if (books.length === 0) {
            previewContainer.innerHTML = "";
            return;
        }
        previewContainer.innerHTML = books.map((bt, idx) => `
            <span style="font-size: 0.72rem; background: rgba(168, 85, 247, 0.15); color: #f1f5f9; border: 1px solid rgba(168, 85, 247, 0.35); border-radius: 4px; padding: 2px 7px; display: inline-flex; align-items: center; gap: 5px;">
                <span>📖 ${escapeHtml(bt)}</span>
                <button type="button" onclick="removeCustomToolBookTag(${idx})" title="إزالة الكتاب" style="background: none; border: none; color: #f43f5e; cursor: pointer; font-size: 0.75rem; padding: 0; line-height: 1;">✕</button>
            </span>
        `).join("");
    }
}

// إزالة كتاب معين من حقل أداة MCP بنقرة زر
function removeCustomToolBookTag(index) {
    const input = document.getElementById("customToolBooksInput");
    if (!input) return;
    const raw = input.value.trim();
    const books = raw ? raw.split(/[،,]/).map(b => b.trim()).filter(Boolean) : [];
    if (index >= 0 && index < books.length) {
        books.splice(index, 1);
        input.value = books.join("، ");
        updateCustomToolBooksCountBadge();
    }
}

// تحميل قالب جاهز للأداة
function loadMcpTemplate(templateKey) {
    const tpl = MCP_TOOL_TEMPLATES[templateKey];
    if (!tpl) return;

    const titleInput = document.getElementById("customToolTitleInput");
    const nameInput = document.getElementById("customToolNameInput");
    const iconInput = document.getElementById("customToolIconInput");
    const topicInput = document.getElementById("customToolTopicInput");
    const catSelect = document.getElementById("customToolCategorySelect");
    const limitSelect = document.getElementById("customToolLimitSelect");
    const booksInput = document.getElementById("customToolBooksInput");
    const descInput = document.getElementById("customToolDescInput");
    const engineSelect = document.getElementById("customToolEngineSelect");
    const codeArea = document.getElementById("customToolPythonCode");

    if (titleInput) titleInput.value = tpl.title;
    if (nameInput && !nameInput.readOnly) nameInput.value = tpl.id;
    if (iconInput) iconInput.value = tpl.icon;
    if (topicInput) topicInput.value = tpl.topic;
    if (catSelect) catSelect.value = tpl.category_id || "";
    if (limitSelect) limitSelect.value = String(tpl.limit || 30);
    if (booksInput) booksInput.value = tpl.books || "";
    if (descInput) descInput.value = tpl.description;
    if (engineSelect) {
        engineSelect.value = tpl.engine_type || "semantic_hybrid";
        toggleCustomToolCodeBox(engineSelect.value);
    }
    if (codeArea) codeArea.value = tpl.python_code || "";

    updateCustomToolBooksCountBadge();
    showToast("✓ تم تحميل قالب: " + tpl.title);
}

// إظهار أو إخفاء صندوق كود بايثون حسب المحرك المختار
function toggleCustomToolCodeBox(engineType) {
    const codeBox = document.getElementById("customToolCodeContainer");
    const codeArea = document.getElementById("customToolPythonCode");
    if (codeBox) {
        codeBox.style.display = (engineType === "custom_python") ? "block" : "none";
    }
    if (engineType === "custom_python" && codeArea && !codeArea.value.trim()) {
        codeArea.value = `# كود بايثون مخصص لتنفيذ الأداة
res = search_shamela_text(query=query, category_id=category_id, book_titles=book_titles, limit=limit)
return res`;
    }
}

// تجربة الأداة التفاعلية المباشرة
async function testCustomMcpTool() {
    const nameInput = document.getElementById("customToolNameInput");
    const titleInput = document.getElementById("customToolTitleInput");
    const topicInput = document.getElementById("customToolTopicInput");
    const catSelect = document.getElementById("customToolCategorySelect");
    const limitSelect = document.getElementById("customToolLimitSelect");
    const booksInput = document.getElementById("customToolBooksInput");
    const descInput = document.getElementById("customToolDescInput");
    const engineSelect = document.getElementById("customToolEngineSelect");
    const codeArea = document.getElementById("customToolPythonCode");
    const testBox = document.getElementById("customToolTestResultBox");
    const testOutput = document.getElementById("customToolTestOutput");
    const testTime = document.getElementById("customToolTestTime");

    const toolName = nameInput?.value?.trim() || "custom_tool";
    const sampleQuery = topicInput?.value?.trim() || "تحرير المسألة وبيان الحكم الشرعي";
    const booksRaw = booksInput?.value?.trim() || "";
    const bookTitles = booksRaw ? booksRaw.split(/[،,]/).map(b => b.trim()).filter(Boolean) : [];

    const dynamicSpec = {
        id: toolName,
        name: toolName,
        title: titleInput?.value?.trim() || toolName,
        topic: topicInput?.value?.trim() || "",
        category_id: catSelect?.value ? parseInt(catSelect.value) : null,
        book_titles: bookTitles,
        default_limit: parseInt(limitSelect?.value) || 30,
        engine_type: engineSelect?.value || "semantic_hybrid",
        python_code: codeArea?.value || "",
        description: descInput?.value?.trim() || ""
    };

    if (testBox) testBox.style.display = "block";
    if (testOutput) testOutput.innerText = `⏳ جاري اختبار واستدعاء الأداة [${toolName}] بمحرك (${dynamicSpec.engine_type})...\nالاستعلام: "${sampleQuery}"`;
    if (testTime) testTime.innerText = "⚡ جاري الفحص...";

    const t0 = performance.now();
    try {
        const res = await fetch("/api/mcp/execute", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                tool: toolName,
                arguments: {
                    query: sampleQuery,
                    limit: 3
                },
                custom_tool_spec: dynamicSpec
            })
        });

        const elapsed = (performance.now() - t0).toFixed(1);
        const data = await res.json();

        if (testTime) testTime.innerText = `⚡ ${elapsed} ms`;
        if (testOutput) {
            testOutput.innerText = JSON.stringify(data, null, 2);
        }

        if (data.result?.error || data.error) {
            showToast("⚠️ حدث خطأ في تنفيذ الأداة: " + (data.result?.error || data.error));
        } else {
            const count = data.result?.results?.length ?? (Array.isArray(data.result) ? data.result.length : 0);
            showToast(`✓ تم فحص الأداة بنجاح! (${count} مخرج)`);
        }
    } catch (e) {
        const elapsed = (performance.now() - t0).toFixed(1);
        if (testTime) testTime.innerText = `❌ ${elapsed} ms`;
        if (testOutput) testOutput.innerText = "خطأ في الاتصال بالخادم: " + e.message;
        showToast("❌ فشل اختبار الأداة: " + e.message);
    }
}

// حفظ أو تحديث الأداة المخصصة
async function handleSaveCustomMcpTool(event) {
    if (event) event.preventDefault();

    const titleInput = document.getElementById("customToolTitleInput");
    const nameInput = document.getElementById("customToolNameInput");
    const iconInput = document.getElementById("customToolIconInput");
    const topicInput = document.getElementById("customToolTopicInput");
    const catSelect = document.getElementById("customToolCategorySelect");
    const limitSelect = document.getElementById("customToolLimitSelect");
    const booksInput = document.getElementById("customToolBooksInput");
    const descInput = document.getElementById("customToolDescInput");
    const engineSelect = document.getElementById("customToolEngineSelect");
    const codeArea = document.getElementById("customToolPythonCode");

    const slug = nameInput?.value?.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_");
    if (!slug) {
        showToast("⚠️ المعرف البرمجي للأداة مطلوب (أحرف إنجليزية صغيرة و _)");
        return;
    }

    const booksRaw = booksInput?.value?.trim() || "";
    const bookTitles = booksRaw ? booksRaw.split(/[،,]/).map(b => b.trim()).filter(Boolean) : [];

    const toolObj = {
        id: slug,
        name: slug,
        title: titleInput?.value?.trim() || slug,
        icon: iconInput?.value?.trim() || "🛠️",
        topic: topicInput?.value?.trim() || "",
        category: catSelect?.options[catSelect.selectedIndex]?.text?.split(" (")[0] || "",
        category_id: catSelect?.value ? parseInt(catSelect.value) : null,
        book_titles: bookTitles,
        default_limit: parseInt(limitSelect?.value) || 30,
        max_limit: 1000,
        description: descInput?.value?.trim() || "",
        engine_type: engineSelect?.value || "semantic_hybrid",
        python_code: codeArea?.value || "",
        enabled: true,
        is_custom: true,
        input_schema: {
            type: "object",
            properties: {
                query: { type: "string", description: `الاستعلام الشرعي المطلوب في موضوع: ${topicInput?.value || ''}` },
                limit: { type: "integer", default: parseInt(limitSelect?.value) || 30, description: "عدد المخرجات المطلوبة (حتى 1000)" }
            },
            required: ["query"]
        }
    };

    try {
        const res = await fetch("/api/mcp/custom-tools", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tool: toolObj })
        });
        if (!res.ok) throw new Error("تعذر حفظ أداة MCP");
        const data = await res.json();

        showToast("✓ تم حفظ وتفعيل أداة MCP التخصصية بنجاح");
        closeCustomMcpToolModal();
        await loadCustomMcpTools();
        saveAiSettings();
    } catch (e) {
        console.error("handleSaveCustomMcpTool error:", e);
        showToast("❌ خطأ أثناء حفظ الأداة: " + e.message);
    }
}

// تعديل أداة مخصصة
function editCustomMcpTool(toolName) {
    openCustomMcpToolModal(toolName);
}

// حذف أداة مخصصة
async function deleteCustomMcpTool(toolName) {
    if (!confirm(`هل أنت متأكد من رغبتك في حذف أداة MCP التخصصية [${toolName}]؟`)) {
        return;
    }

    try {
        const res = await fetch(`/api/mcp/custom-tools/${encodeURIComponent(toolName)}`, {
            method: "DELETE"
        });
        if (!res.ok) throw new Error("تعذر حذف الأداة");
        showToast(`✓ تم حذف الأداة [${toolName}] بنجاح`);
        await loadCustomMcpTools();
        saveAiSettings();
    } catch (e) {
        console.error("deleteCustomMcpTool error:", e);
        showToast("❌ خطأ أثناء حذف الأداة: " + e.message);
    }
}

// =====================================================================
// إدارة نقاط نهاية واجهات البرمجة للوكلاء (Agent REST API & Multi-Select)
// =====================================================================
let currentApiAgentsCache = [];
let selectedAgentApiIds = ["shatibi", "bukhari"];

function getSessionAssistantsList() {
    if (typeof assistantsList !== "undefined" && Array.isArray(assistantsList) && assistantsList.length > 0) {
        return assistantsList;
    }
    try {
        const storedKey = typeof ASSISTANTS_STORAGE_KEY !== "undefined" ? ASSISTANTS_STORAGE_KEY : "shamela_assistant_models";
        const stored = localStorage.getItem(storedKey);
        if (stored) {
            const parsed = JSON.parse(stored);
            if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
    } catch (e) {
        console.warn("Could not read stored session assistants:", e);
    }
    return [];
}

async function openAgentApiModal(preferredAgentId) {
    const modal = document.getElementById("agentApiModal");
    if (!modal) return;

    modal.classList.add("active");
    modal.style.display = "flex";

    // تفعيل إغلاق النافذة عند النقر خارجها
    modal.onclick = function(e) {
        if (e.target === modal) closeAgentApiModal();
    };

    // 1. استخراج وكلاء الجلسة المفتوحة أولاً (الوكلاء المنشأون أو المخصصون من قبل المستخدم)
    const sessionList = getSessionAssistantsList();
    if (sessionList && sessionList.length > 0) {
        currentApiAgentsCache = sessionList;
    } else {
        // إذا لم تكن هناك وكلاء بالجلسة، نجلب الافتراضيين
        try {
            const res = await fetch("/api/ai/agents");
            const data = await res.json();
            if (data.agents && data.agents.length > 0) {
                currentApiAgentsCache = data.agents;
            }
        } catch (e) {
            console.warn("Could not load /api/ai/agents fallback:", e);
        }
    }

    // مزامنة وكلاء الجلسة مع الخادم في الخلفية
    syncAssistantsWithServer(currentApiAgentsCache);

    // 2. تعيين التحديد الأولي
    if (preferredAgentId) {
        selectedAgentApiIds = [preferredAgentId];
    } else {
        // تحديد أول 2 أو الوكلاء المفعلين افتراضياً
        const enabledIds = currentApiAgentsCache.filter(a => a.enabled !== false).map(a => a.id);
        if (enabledIds.length > 0) {
            selectedAgentApiIds = enabledIds.slice(0, 3);
        } else if (currentApiAgentsCache.length > 0) {
            selectedAgentApiIds = [currentApiAgentsCache[0].id];
        }
    }

    // 3. بناء واجهة كروت الاختيار المتعدد
    renderAgentApiCheckboxes();

    // 4. تحديث الأكواد والبيانات
    await updateAgentApiCodeSnippets();
}

function closeAgentApiModal() {
    const modal = document.getElementById("agentApiModal");
    if (modal) {
        modal.classList.remove("active");
        modal.style.display = "none";
    }
}

async function syncAssistantsWithServer(assistantsToSync) {
    if (!assistantsToSync || assistantsToSync.length === 0) return;
    try {
        await fetch("/api/ai/agents/sync", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ assistants: assistantsToSync })
        });
    } catch (e) {
        console.warn("Failed to sync session assistants to server:", e);
    }
}

async function syncAndReloadAgentApi() {
    const sessionList = getSessionAssistantsList();
    if (sessionList && sessionList.length > 0) {
        currentApiAgentsCache = sessionList;
        await syncAssistantsWithServer(currentApiAgentsCache);
        showToast("✓ تم تحديث ومزامنة الوكلاء من الجلسة المفتوحة بنجاح");
    } else {
        showToast("ℹ️ يتم استخدام وكلاء النظام المعتمدين");
    }
    renderAgentApiCheckboxes();
    await updateAgentApiCodeSnippets();
}

function renderAgentApiCheckboxes() {
    const container = document.getElementById("agentApiCheckboxesContainer");
    if (!container) return;

    if (!currentApiAgentsCache || currentApiAgentsCache.length === 0) {
        container.innerHTML = '<span style="color: #94a3b8; font-size: 0.8rem;">لا توجد وكلاء مساعدين متاحين حالياً.</span>';
        return;
    }

    container.innerHTML = currentApiAgentsCache.map(ast => {
        const isSelected = selectedAgentApiIds.includes(ast.id);
        const isCustom = ast.is_custom || (ast.id && String(ast.id).startsWith("ast_"));
        const bCount = ast.books_count !== undefined ? ast.books_count : (ast.book_titles ? ast.book_titles.length : 0);
        const icon = (typeof getAssistantAvatarIcon === "function") ? getAssistantAvatarIcon(ast.name, ast.role) : "🤖";

        return `
            <div class="agent-api-card-chip ${isSelected ? 'selected' : ''}" 
                 onclick="toggleAgentApiSelection('${escapeHtml(ast.id)}')"
                 style="display: flex; align-items: flex-start; gap: 0.5rem; padding: 0.55rem 0.75rem; background: ${isSelected ? 'rgba(56, 189, 248, 0.14)' : 'rgba(15, 23, 42, 0.6)'}; border: 1px solid ${isSelected ? '#38bdf8' : 'rgba(255, 255, 255, 0.1)'}; border-radius: var(--radius-sm); cursor: pointer; transition: all 0.15s ease;">
                <input type="checkbox" id="chk_agent_${escapeHtml(ast.id)}" ${isSelected ? 'checked' : ''} 
                       onclick="event.stopPropagation(); toggleAgentApiSelection('${escapeHtml(ast.id)}')"
                       style="margin-top: 3px; cursor: pointer; accent-color: #38bdf8;">
                <div style="flex: 1; min-width: 0;">
                    <div style="display: flex; align-items: center; gap: 0.35rem; justify-content: space-between;">
                        <span style="font-weight: 700; font-size: 0.82rem; color: ${isSelected ? '#38bdf8' : '#f8fafc'}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                            ${icon} ${escapeHtml(ast.name || "مساعد")}
                        </span>
                        ${isCustom ? '<span style="font-size: 0.65rem; background: rgba(168, 85, 247, 0.25); color: #c084fc; padding: 1px 5px; border-radius: 4px; white-space: nowrap;">✨ مخصص</span>' : ''}
                    </div>
                    <div style="font-size: 0.72rem; color: #94a3b8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 2px;">
                        ${escapeHtml(ast.role || "باحث ومحقق")}
                    </div>
                    <div style="font-size: 0.68rem; color: #34d399; margin-top: 2px;">
                        📚 ${bCount} كتب محصورة
                    </div>
                </div>
            </div>
        `;
    }).join("");

    updateAgentApiBadge();
}

function toggleAgentApiSelection(agentId) {
    if (selectedAgentApiIds.includes(agentId)) {
        if (selectedAgentApiIds.length === 1) {
            showToast("⚠️ يجب إبقاء وكيل مساعد واحد على الأقل محدداً");
            return;
        }
        selectedAgentApiIds = selectedAgentApiIds.filter(id => id !== agentId);
    } else {
        selectedAgentApiIds.push(agentId);
    }

    renderAgentApiCheckboxes();
    updateAgentApiCodeSnippets();
}

function selectAllAgentApiCheckboxes(selectBool) {
    if (selectBool) {
        selectedAgentApiIds = currentApiAgentsCache.map(a => a.id);
    } else {
        if (currentApiAgentsCache.length > 0) {
            selectedAgentApiIds = [currentApiAgentsCache[0].id];
        } else {
            selectedAgentApiIds = [];
        }
    }
    renderAgentApiCheckboxes();
    updateAgentApiCodeSnippets();
}

function updateAgentApiBadge() {
    const badge = document.getElementById("agentApiSelectedCountBadge");
    if (badge) {
        badge.textContent = `تم تحديد ${selectedAgentApiIds.length} من ${currentApiAgentsCache.length} وكلاء`;
    }
    const btnText = document.getElementById("btnRunAgentApiTestText");
    if (btnText) {
        btnText.textContent = `🚀 إرسال تجربة الآن (${selectedAgentApiIds.length} وكلاء)`;
    }
}

function switchAgentApiTab(tabName) {
    const tabs = ['python', 'url', 'js', 'curl', 'openai'];
    tabs.forEach(t => {
        const btn = document.getElementById(`tabBtnAgent${t.charAt(0).toUpperCase() + t.slice(1)}`);
        const pane = document.getElementById(`agentCodeTab${t.charAt(0).toUpperCase() + t.slice(1)}`);
        if (btn) btn.classList.toggle("active", t === tabName);
        if (pane) pane.style.display = (t === tabName) ? "block" : "none";
    });
}

async function updateAgentApiCodeSnippets() {
    updateAgentApiBadge();

    const selectedObjs = currentApiAgentsCache.filter(a => selectedAgentApiIds.includes(a.id));
    const descBox = document.getElementById("agentApiDescBox");
    if (descBox) {
        if (selectedObjs.length === 0) {
            descBox.innerHTML = '<span style="color: #f87171;">لم يتم تحديد أي وكيل مساعد.</span>';
        } else if (selectedObjs.length === 1) {
            const ast = selectedObjs[0];
            descBox.innerHTML = `
                <b>الوكيل المختار:</b> ${escapeHtml(ast.name)} — <span style="color: #38bdf8;">${escapeHtml(ast.role || '')}</span><br>
                <span style="font-size: 0.74rem; color: #94a3b8;">المعرف: <code>${escapeHtml(ast.id)}</code> | المزود: <code>${escapeHtml(ast.provider || ast.default_provider || 'openrouter')}</code> | النموذج: <code>${escapeHtml(ast.model || ast.default_model || 'google/gemini-2.5-flash')}</code></span>
            `;
        } else {
            const namesList = selectedObjs.map(a => `<code>${escapeHtml(a.name)}</code>`).join("، ");
            descBox.innerHTML = `
                <b>الوكلاء المحددون بالتوازي (${selectedObjs.length}):</b> ${namesList}<br>
                <span style="font-size: 0.74rem; color: #34d399;">⚡ سيتم إرسال الاستعلام لكافة هؤلاء الوكلاء بالتوازي واسترجاع إجاباتهم ومراجعهم التراثية معاً.</span>
            `;
        }
    }

    const openAiModelSpan = document.getElementById("agentOpenaiModelName");
    if (openAiModelSpan) {
        openAiModelSpan.textContent = selectedAgentApiIds.length > 0 ? selectedAgentApiIds[0] : "bukhari";
    }

    const idsParam = encodeURIComponent(selectedAgentApiIds.join(","));
    try {
        const res = await fetch(`/api/ai/agent/code-examples?agent_ids=${idsParam}`);
        const data = await res.json();

        const pyElem = document.getElementById("agentPythonCodePre");
        if (pyElem) pyElem.textContent = data.python || "";

        const jsElem = document.getElementById("agentJsCodePre");
        if (jsElem) jsElem.textContent = data.javascript || "";

        const curlElem = document.getElementById("agentCurlCodePre");
        if (curlElem) curlElem.textContent = data.curl || "";

        const urlBox = document.getElementById("agentUrlBox");
        const urlLink = document.getElementById("agentUrlTestLink");
        if (urlBox) urlBox.textContent = data.get_url || "";
        if (urlLink) urlLink.href = data.get_url || "#";
    } catch (e) {
        console.error("Failed to load multi-agent code examples:", e);
    }
}

function copyAgentApiCode(elemId) {
    const el = document.getElementById(elemId);
    if (!el) return;
    const text = el.textContent || el.innerText || "";
    if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(() => {
            showToast("✓ تم نسخ الكود إلى الحافظة بنجاح");
        }).catch(() => {
            prompt("انسخ الكود يدوياً:", text);
        });
    } else {
        prompt("انسخ الكود يدوياً:", text);
    }
}

async function testAgentApiLive() {
    if (!selectedAgentApiIds || selectedAgentApiIds.length === 0) {
        showToast("⚠️ يرجى تحديد وكيل مساعد واحد على الأقل للتجربة");
        return;
    }

    const qInput = document.getElementById("agentApiTestQueryInput");
    const query = qInput ? qInput.value.trim() : "";
    const runBtn = document.getElementById("btnRunAgentApiTest");
    const timerElem = document.getElementById("agentApiTestTimer");
    const resBox = document.getElementById("agentApiTestResultContainer");
    const multiContainer = document.getElementById("agentApiTestMultiResultsContainer");

    if (!query) {
        showToast("⚠️ اكتب مسألة أو سؤالاً للتجربة أولاً");
        return;
    }

    if (runBtn) {
        runBtn.disabled = true;
        runBtn.innerHTML = "⏳ جاري استنطاق الوكلاء بالتوازي...";
    }
    if (timerElem) timerElem.textContent = "⏱️ جاري المعالجة بالتوازي...";
    if (resBox) resBox.style.display = "block";
    if (multiContainer) {
        multiContainer.innerHTML = `
            <div style="text-align: center; padding: 2rem; color: #38bdf8;">
                <span class="spinner-sm" style="display: inline-block; margin-left: 0.5rem;"></span>
                <span>جاري البحث في نصوص الشاملة واستنطاق ${selectedAgentApiIds.length} وكلاء مساعدين بالتوازي...</span>
            </div>
        `;
    }

    const userKey = (typeof localStorage !== "undefined" ? localStorage.getItem("shamela_openrouter_api_key") : "") || "";

    const t0 = performance.now();
    try {
        const res = await fetch("/api/ai/agent/query", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                agent_ids: selectedAgentApiIds,
                custom_assistants: currentApiAgentsCache,
                query: query,
                api_key: userKey || undefined,
                limit: 8
            })
        });

        const data = await res.json();
        const durationSec = ((performance.now() - t0) / 1000).toFixed(2);

        if (!res.ok || data.status === "error" || data.detail) {
            const err = data.detail || data.error || "خطأ أثناء استدعاء الوكلاء المساعدين";
            if (multiContainer) {
                multiContainer.innerHTML = `<div style="background: rgba(239, 68, 68, 0.12); border: 1px solid rgba(239, 68, 68, 0.35); color: #f87171; padding: 1rem; border-radius: 8px;">❌ ${escapeHtml(err)}</div>`;
            }
            if (timerElem) timerElem.textContent = `❌ تعذر الإكمال (${durationSec} ث)`;
            return;
        }

        if (timerElem) timerElem.textContent = `⚡ اكتمل استنطاق ${data.agents_count || selectedAgentApiIds.length} وكلاء في ${data.duration_seconds || durationSec} ثانية`;

        const resultsList = data.results || (data.answer ? [data] : []);

        if (multiContainer) {
            multiContainer.innerHTML = resultsList.map((item, idx) => {
                const agent = item.agent || {};
                const name = agent.name || `الوكيل #${idx + 1}`;
                const role = agent.role || "تحقيق وبحث شرعي";
                const icon = (typeof getAssistantAvatarIcon === "function") ? getAssistantAvatarIcon(name, role) : "📖";
                const answerHtml = (typeof renderMarkdown === "function") ? renderMarkdown(item.answer || "") : escapeHtml(item.answer || "").replace(/\n/g, '<br>');
                const sources = item.sources || [];

                return `
                    <div style="background: rgba(15, 23, 42, 0.8); border: 1px solid rgba(56, 189, 248, 0.25); border-radius: var(--radius-md); padding: 1rem; box-shadow: 0 4px 12px rgba(0,0,0,0.25);">
                        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.08); padding-bottom: 0.5rem; margin-bottom: 0.75rem;">
                            <div style="display: flex; align-items: center; gap: 0.4rem;">
                                <span style="font-size: 1.1rem;">${icon}</span>
                                <div>
                                    <span style="font-weight: 700; font-size: 0.9rem; color: #38bdf8;">${escapeHtml(name)}</span>
                                    <span style="font-size: 0.75rem; color: #94a3b8; margin-right: 0.4rem;">(${escapeHtml(role)})</span>
                                </div>
                            </div>
                            <div style="display: flex; gap: 0.4rem; align-items: center;">
                                <span style="font-size: 0.7rem; background: rgba(56, 189, 248, 0.15); color: #38bdf8; padding: 2px 7px; border-radius: 4px;">⚡ ${item.duration_seconds || 0}s</span>
                                <span style="font-size: 0.7rem; background: rgba(16, 185, 129, 0.18); color: #34d399; padding: 2px 7px; border-radius: 4px;">📚 ${item.sources_count || sources.length} مراجع معزوة</span>
                            </div>
                        </div>

                        <!-- إجابة الوكيل -->
                        <div style="font-size: 0.84rem; line-height: 1.7; color: #f8fafc; font-family: var(--font-ui); margin-bottom: 0.75rem; white-space: pre-wrap;">
                            ${answerHtml}
                        </div>

                        <!-- قائمة المراجع المعزوة -->
                        ${sources.length > 0 ? `
                            <div style="border-top: 1px dashed rgba(255,255,255,0.1); padding-top: 0.5rem;">
                                <span style="font-size: 0.74rem; font-weight: 700; color: #cbd5e1; display: block; margin-bottom: 0.35rem;">📜 المراجع التراثية المعزوة لهذا الوكيل:</span>
                                <div style="display: flex; flex-direction: column; gap: 0.3rem; max-height: 140px; overflow-y: auto;">
                                    ${sources.map((s, sIdx) => `
                                        <div style="background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.05); padding: 5px 8px; border-radius: 4px; font-size: 0.73rem;">
                                            <span style="color: #fef08a; font-weight: 600;">[${sIdx + 1}] ${escapeHtml(s.citation || s.book_title)}</span>
                                            ${s.publisher || s.edition ? `<span style="color: #94a3b8; font-size: 0.69rem;"> — ${s.edition ? `ط: ${escapeHtml(s.edition)} ` : ''}${s.publisher ? `| ن: ${escapeHtml(s.publisher)}` : ''}</span>` : ''}
                                        </div>
                                    `).join("")}
                                </div>
                            </div>
                        ` : ''}
                    </div>
                `;
            }).join("");
        }

    } catch (e) {
        console.error("testAgentApiLive error:", e);
        if (multiContainer) {
            multiContainer.innerHTML = `<div style="background: rgba(239, 68, 68, 0.12); color: #f87171; padding: 1rem; border-radius: 8px;">❌ حدث خطأ في الاتصال بالخادم: ${escapeHtml(e.message)}</div>`;
        }
    } finally {
        if (runBtn) {
            runBtn.disabled = false;
            updateAgentApiBadge();
        }
    }
}





