<!DOCTYPE html>
<html lang="ar" dir="rtl" data-theme="dark">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>المكتبة الشاملة — محرك البحث الدلالي الذكي وداشبورد النماذج المتخصصة</title>
    <meta name="description"
        content="محرك بحث دلالي عصبي وهجين لقاعدة بيانات المكتبة الشاملة يغطي أكثر من 5 ملايين صفحة مع داشبورد متكامل للذكاء الاصطناعي وتصدير التقارير العلمية الاحترافية">

    <!-- Stylesheet -->
    <link rel="stylesheet" href="/static/css/style.css">
    <link rel="icon"
        href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>📚</text></svg>">

    <!-- Markdown Parser for AI responses -->
    <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
</head>

<body>

    <!-- الهيدر العلوي العصبي الموحد -->
    <header class="site-header">
        <div class="header-container">
            <div class="brand">
                <div class="brand-icon pulse-glow">📚</div>
                <div class="brand-text">
                    <h1>المكتبة الشاملة <span class="brand-badge">الجيل الرابع AI</span></h1>
                </div>
            </div>

            <!-- أزرار التنقل الرئيسية بتصميم Tabs احترافي -->
            <nav class="nav-tabs">
                <button type="button" class="nav-tab active" id="tabSearchBtn" onclick="switchMainView('search')">
                    <span class="tab-ico">🔍</span> البحث الذكي في الشاملة
                </button>
                <button type="button" class="nav-tab" id="tabAiBtn" onclick="switchMainView('ai')">
                    <span class="tab-ico">🤖</span> التحقيق والذكاء الاصطناعي
                    <span class="ai-sparkle-dot"></span>
                </button>
                <button type="button" class="nav-tab" id="tabPipelineBtn" onclick="switchMainView('pipeline')">
                    <span class="tab-ico">🚀</span> منظومة النماذج المساعدة
                    <span class="pipeline-count-pill" id="navPipelineBadge">4</span>
                </button>
                <a href="http://localhost:6333/dashboard" target="_blank" class="nav-tab nav-tab-external"
                    title="فتح لوحة تحكم Qdrant في نافذة جديدة">
                    <span class="tab-ico">📊</span> داشبورد Qdrant
                </a>
            </nav>

            <div class="header-actions">
                <div class="status-badge" id="qdrantBadge" title="حالة الاتصال بمخزن المتجهات العصبي">
                    <span class="pulse-dot"></span>
                    <span>Qdrant متصل (٥ ملايين صفحة)</span>
                </div>
                <button class="btn-icon" id="themeToggleBtn" onclick="toggleTheme()"
                    title="تبديل المظهر النهاري/الليلي">
                    ☀️
                </button>
            </div>
        </div>
    </header>

    <!-- المحتوى الرئيسي -->
    <main class="main-content">

        <!-- ==================== 1. واجهة البحث في الشاملة (Search View) ==================== -->
        <div id="searchView">
            <!-- القسم الترحيبي -->
            <section class="hero-section">
                <div class="hero-badge-pill">✨ محرك البحث العصبي والهجين المطوّر بـ BGE-M3</div>
                <h2 class="hero-title">الاستعلام الدلالي العميق في أمهات كتب التراث الإسلامي</h2>
                <p class="hero-subtitle">
                    نظام يجمع بين دقة المطابقة اللفظية وعمق الفهم المعنوي عبر مخزن المتجهات Qdrant لتغطية آلاف الكتب والمؤلفات الفقهية والعقدية والحديثية.
                </p>
            </section>

            <!-- صندوق البحث وأدوات التحكم -->
            <section class="search-section">
                <div class="search-wrapper glass-panel">
                    <form id="searchForm">
                        <div class="search-input-group">
                            <span class="search-icon">🔍</span>
                            <input type="text" id="searchInput" class="search-input"
                                placeholder="اكتب مسألة فقهية، حديثاً نبوياً، أو استفساراً دلالياً عميقاً..."
                                autocomplete="off" autofocus>
                            <button type="submit" class="btn-search" id="searchSubmitBtn">
                                <span>ابحث الآن</span>
                                <span class="btn-arrow">⚡</span>
                            </button>
                        </div>

                        <!-- شريط نطاق البحث وتحديد الكتب -->
                        <div class="scope-indicator-bar" id="scopeIndicatorBar">
                            <div class="active-scope-badge" id="activeScopeBadge">
                                <span class="scope-icon">🌐</span>
                                <span id="scopeText">نطاق البحث: جميع كتب المكتبة الشاملة (٨,٥٨٩ كتاباً)</span>
                            </div>
                            <button type="button" class="btn-select-books" id="openBookSelectorBtn"
                                onclick="openBookSelectorModal()">
                                <span>☑️ تحديد كتب معينة بالصح</span>
                                <span class="selected-count-badge" id="selectedCountBadge"
                                    style="display: none;">0</span>
                            </button>
                        </div>

                        <!-- أزرار أوضاع البحث والفلاتر -->
                        <div class="search-controls">
                            <div class="mode-selector">
                                <button type="button" class="mode-chip active" data-mode="hybrid">
                                    ⚡ بحث هجين متقدم (RRF)
                                </button>
                                <button type="button" class="mode-chip" data-mode="dense">
                                    🧠 بحث دلالي عصبي (Dense)
                                </button>
                                <button type="button" class="mode-chip" data-mode="sparse">
                                    🔍 بحث لفظي دقيق (Sparse)
                                </button>
                            </div>

                            <div class="filter-group">
                                <div class="filter-item">
                                    <label for="collectionSelect">فهرس البحث والتضمين:</label>
                                    <select id="collectionSelect" class="filter-select"
                                        onchange="onCollectionChanged()">
                                        <option value="badr_all_tsh_corpus" selected>⚡ بدر الهجين المطور (Badr 768 + BM25 — ٧.٥٨M)</option>
                                        <option value="badr_corpus">✨ لقطة بدر المشكولة (Badr Embedding — ٧.٥٨M)</option>
                                        <option value="badr_tch_corpus">🔤 لقطة بدر بدون تشكيل (Badr Unvoweled — ٧.٥٨M)</option>
                                        <option value="shamela_corpus">📚 شاملة BGE-M3 (هجين — ٥.١٥M)</option>
                                    </select>
                                </div>

                                <div class="filter-item">
                                    <label for="categorySelect">القسم / التصنيف:</label>
                                    <select id="categorySelect" class="filter-select" onchange="onCategoryChanged()">
                                        <option value="">كل التصنيفات (جميع الأقسام)</option>
                                    </select>
                                </div>

                                <div class="filter-item">
                                    <label for="limitSelect">عدد النتائج:</label>
                                    <select id="limitSelect" class="filter-select">
                                        <option value="5">٥ نتائج</option>
                                        <option value="10">١٠ نتائج</option>
                                        <option value="15" selected>١٥ نتيجة</option>
                                        <option value="25">٢٥ نتيجة</option>
                                        <option value="50">٥٠ نتيجة</option>
                                        <option value="100">١٠٠ نتيجة</option>
                                    </select>
                                </div>

                                <div class="filter-item filter-item-reranker">
                                    <label class="custom-toggle-label">
                                        <input type="checkbox" id="useRerankerToggle" checked
                                            onchange="const s = document.getElementById('searchRerankerModelSelect'); if (s) { s.disabled = !this.checked; s.style.opacity = this.checked ? '1' : '0.45'; }">
                                        <span>🎯 فرز متقاطع (Reranker)</span>
                                    </label>
                                    <select id="searchRerankerModelSelect" class="filter-select"
                                        title="اختيار نموذج الـ Reranker لتصفية وترتيب النتائج">
                                        <option value="BAAI/bge-reranker-v2-m3" selected>⭐ BGE-Reranker-v2-m3 (سياق 8K)</option>
                                        <option value="NAMAA-Space/Namaa-ARA-Reranker-V1">🇸🇦 نماء Namaa ARA Reranker V1</option>
                                        <option value="AzeerDev/arabic-reranker">⚡ AzeerDev Arabic Reranker</option>
                                        <option value="Qwen/Qwen3-Reranker-4B">🚀 Qwen3 Reranker 4B (العملاق)</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                    </form>
                </div>

                <!-- مقترحات البحث السريع -->
                <div class="suggestions-bar">
                    <span class="suggestions-label">💡 اقتراحات سريعة:</span>
                    <span class="suggestion-pill" data-query="إنما الأعمال بالنيات">حديث النية</span>
                    <span class="suggestion-pill" data-query="حكم بيع العينة والتورق والربا">بيع العينة والتورق</span>
                    <span class="suggestion-pill" data-query="صفة صلاة الكسوف والخسوف">صلاة الكسوف</span>
                    <span class="suggestion-pill" data-query="تفسير آية الكرسي وفضلها">تفسير آية الكرسي</span>
                    <span class="suggestion-pill" data-query="شروط التوبة النصوح وضوابطها">شروط التوبة</span>
                    <span class="suggestion-pill" data-query="حكم صلاة الجماعة في المسجد">حكم صلاة الجماعة</span>
                </div>
            </section>

            <!-- شريط الإحصائيات الحية -->
            <section class="stats-ribbon">
                <div class="stat-card">
                    <div class="stat-icon">📄</div>
                    <div>
                        <div class="stat-val" id="statPoints">٥,١٤٥,٥٢٣</div>
                        <div class="stat-name">صفحة مفهرسة بالكامل</div>
                    </div>
                </div>

                <div class="stat-card">
                    <div class="stat-icon">📖</div>
                    <div>
                        <div class="stat-val" id="statBooks">٨,٥٨٩</div>
                        <div class="stat-name">كتاب ومجلد في الشاملة</div>
                    </div>
                </div>

                <div class="stat-card">
                    <div class="stat-icon">🏷️</div>
                    <div>
                        <div class="stat-val" id="statCats">٤٠</div>
                        <div class="stat-name">تصنيفاً وعلماً شرعياً</div>
                    </div>
                </div>

                <div class="stat-card">
                    <div class="stat-icon">⚡</div>
                    <div>
                        <div class="stat-val" id="statDevice">Apple MPS</div>
                        <div class="stat-name">تسريع عتادي فوري</div>
                    </div>
                </div>
            </section>

            <!-- منطقة النتائج -->
            <section class="results-section">
                <div class="results-header">
                    <div class="results-meta" id="resultsMeta">
                        ابدأ بكتابة عبارة البحث أو اضغط على أحد الاقتراحات أعلاه...
                    </div>
                </div>

                <!-- مؤشر التحميل -->
                <div class="loading-box" id="loadingBox">
                    <div class="spinner"></div>
                    <div style="font-weight: 700; color: var(--accent-emerald);">جاري استخراج المتجهات والبحث الهجين في ٥ ملايين صفحة...</div>
                </div>

                <!-- حاوية بطاقات النتائج -->
                <div class="results-grid" id="resultsContainer"></div>

                <!-- حالة عدم وجود نتائج -->
                <div id="emptyState" class="empty-state-box" style="display: none;">
                    <div style="font-size: 3rem; margin-bottom: 1rem;">🍃</div>
                    <h3>لم يتم العثور على نتائج مطابقة</h3>
                    <p style="margin-top: 0.5rem;">جرب تغيير عبارة البحث أو اختيار وضع البحث الدلالي أو إزالة تصنيف التصفية.</p>
                </div>
            </section>
        </div>

        <!-- ==================== 2. داشبورد الذكاء الاصطناعي (AI Dashboard View) ==================== -->
        <div id="aiDashboardView" style="display: none;">

            <!-- بنر ترحيبي لداشبورد الذكاء الاصطناعي -->
            <section class="ai-hero-section">
                <div class="ai-hero-content">
                    <div class="ai-hero-badge">🤖 RAG & AI RESEARCH DASHBOARD | دعم كامل لـ OLLAMA & LM STUDIO محلياً</div>
                    <h2 class="ai-hero-title">التحقيق العلمي وربط الشاملة بالذكاء الاصطناعي</h2>
                    <p class="ai-hero-subtitle">
                        استنطاق أمهات كتب التراث وربطها بنماذج الذكاء الاصطناعي السحابية أو المحلية مجاناً دون إنترنت عبر Ollama و LM Studio
                    </p>
                </div>
            </section>

            <!-- شبكة العمل الرئيسية لداشبورد الذكاء الاصطناعي -->
            <div class="ai-dashboard-layout">

                <!-- عمود المحادثة والدردشة (العمود الأيسر الرئيسي) -->
                <div class="ai-chat-column">
                    <div class="ai-chat-card glass-panel">
                        <!-- ترويسة الشات -->
                        <div class="chat-header">
                            <div class="chat-header-info">
                                <span class="chat-model-badge" id="chatActiveProviderBadge">🌐 OpenRouter</span>
                                <span class="chat-model-badge" id="chatActiveModelBadge">Model: gpt-4o</span>
                                <span class="chat-rag-badge" id="chatRagStatusBadge">📚 RAG نشط (٥ مصادر)</span>
                            </div>
                            <div class="chat-header-actions">
                                <button type="button" class="btn-tool" onclick="clearAiChat()"
                                    title="مسح المحادثة وبدء تحقيق جديد">
                                    🗑️ مسح المحادثة
                                </button>
                            </div>
                        </div>

                        <!-- حاوية رسائل المحادثة -->
                        <div class="chat-messages-container" id="chatMessagesContainer">
                            <!-- رسالة الترحيب الأولى -->
                            <div class="chat-message assistant-message">
                                <div class="msg-avatar">🤖</div>
                                <div class="msg-body">
                                    <div class="msg-author">المحقق الذكي لمكتبة الشاملة</div>
                                    <div class="msg-content">
                                        مرحباً بك! أنا مساعدك التراثي المتخصص. أستطيع البحث في أكثر من <strong>٥ ملايين صفحة</strong> و <strong>٨,٥٨٩ كتاباً</strong> من كتب التراث عبر البحث الهجين بـ Qdrant ونموذج BGE-M3، ثم تحرير المسائل وتخريج الأقوال وتوثيقها بدقة.<br><br>
                                        💡 <em>يمكنك ضبط المزود والمفتاح والمعلمات من لوحة الإعدادات على اليمين، ثم كتابة مسألتك الفقهية أو استفسارك.</em>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- مؤشر الكتابة للذكاء الاصطناعي -->
                        <div class="chat-typing-indicator" id="chatTypingIndicator" style="display: none;">
                            <div class="spinner-sm"></div>
                            <span id="chatTypingText">جاري البحث في الشاملة وتوليد التحقيق العلمي...</span>
                        </div>

                        <!-- صندوق إدخال السؤال والتحقيق -->
                        <div class="chat-input-area">
                            <!-- مقترحات أسئلة سريعة للذكاء الاصطناعي -->
                            <div class="ai-quick-prompts">
                                <span class="quick-label">⚡ أسئلة تحقيق مقترحة:</span>
                                <span class="ai-prompt-pill"
                                    onclick="setAiPrompt('حرر مسألة بيع العينة والتورق مبيناً خلاف الفقهاء وأدلتهم والقول الراجح مع العزو المكتبي')">تحرير مسألة التورق والعينة</span>
                                <span class="ai-prompt-pill"
                                    onclick="setAiPrompt('ما حكم صلاة الكسوف وصفتها عند المذاهب الأربعة مع توثيق الأحاديث؟')">صفة صلاة الكسوف</span>
                                <span class="ai-prompt-pill"
                                    onclick="setAiPrompt('استخرج شروط التوبة النصوح وفضائلها من كتب الرقائق والعقيدة')">شروط التوبة النصوح</span>
                            </div>

                            <!-- شريط أدوات وخيارات البحث الذكي السريعة -->
                            <div class="chat-input-toolbar">
                                <label class="quick-toggle-pill" id="quickPipelineToggleLabel">
                                    <input type="checkbox" id="aiQuickPipeline"
                                        onchange="syncPipelineQuickToggle(this.checked)">
                                    <span>🤖 بايبلاين النماذج المساعدة</span>
                                </label>
                                <label class="quick-toggle-pill">
                                    <input type="checkbox" id="aiQuickIterative" checked
                                        onchange="syncIterativeQuickToggle(this.checked)">
                                    <span>🔄 بحث تكميلي ذكي</span>
                                </label>
                                <label class="quick-toggle-pill">
                                    <input type="checkbox" id="aiQuickReformulate" checked
                                        onchange="syncReformulateQuickToggle(this.checked)">
                                    <span>✍️ صياغة السؤال فقهياً وتراثياً</span>
                                </label>
                            </div>

                            <form id="aiChatForm" class="chat-form">
                                <textarea id="aiInputText" class="chat-textarea" rows="2"
                                    placeholder="اكتب مسألتك أو استفسارك التراثي هنا... (اضغط Enter للإرسال)"
                                    required></textarea>
                                <button type="submit" class="btn-chat-send" id="aiSendBtn">
                                    <span>إرسال</span>
                                    <span>🚀</span>
                                </button>
                            </form>
                        </div>
                    </div>
                </div>

                <!-- عمود إعدادات الذكاء الاصطناعي (العمود الجانبي) -->
                <div class="ai-settings-column">

                    <!-- شريط تبويبات أقسام الإعدادات السريعة -->
                    <div class="settings-nav-ribbon">
                        <button type="button" class="set-tab-btn active" data-tab="provider"
                            onclick="switchSettingsSection('provider')">
                            <span class="tab-icon">🔑</span>
                            <span class="tab-text">المزود والنموذج</span>
                        </button>
                        <button type="button" class="set-tab-btn" data-tab="rag" onclick="switchSettingsSection('rag')">
                            <span class="tab-icon">📚</span>
                            <span class="tab-text">سياق الشاملة</span>
                        </button>
                        <button type="button" class="set-tab-btn" data-tab="params"
                            onclick="switchSettingsSection('params')">
                            <span class="tab-icon">🎛️</span>
                            <span class="tab-text">المعلمات</span>
                        </button>
                        <button type="button" class="set-tab-btn" data-tab="assistants"
                            onclick="switchSettingsSection('assistants')">
                            <span class="tab-icon">🤖</span>
                            <span class="tab-text">النماذج المساعدة</span>
                        </button>
                        <button type="button" class="set-tab-btn" data-tab="structure"
                            onclick="switchSettingsSection('structure')">
                            <span class="tab-icon">📐</span>
                            <span class="tab-text">هيكلة JSON</span>
                        </button>
                        <button type="button" class="set-tab-btn" data-tab="craft"
                            onclick="switchSettingsSection('craft')">
                            <span class="tab-icon">🎨</span>
                            <span class="tab-text">CraftMyPDF</span>
                        </button>
                    </div>

                    <!-- حاوية البطاقات القابلة للتمرير والتنقل بالتبويبات -->
                    <div class="settings-cards-wrapper" id="settingsCardsWrapper">

                        <!-- 1. إعدادات المزود ومفتاح API -->
                        <div class="settings-card section-provider" id="card-provider">
                            <div class="settings-card-header">
                                <span class="settings-icon">🔑</span>
                                <h3>مزود الذكاء الاصطناعي والنموذج</h3>
                            </div>
                            <div class="settings-card-body">
                                <div class="form-group">
                                    <label for="aiProviderSelect">اختر المزود (AI Provider):</label>
                                    <div class="provider-quick-pills">
                                        <button type="button" class="btn-prov-pill active" id="provPill-openrouter" onclick="selectProviderPill('openrouter')">🌐 OpenRouter</button>
                                        <button type="button" class="btn-prov-pill pill-local" id="provPill-ollama" onclick="selectProviderPill('ollama')">🦙 Ollama</button>
                                        <button type="button" class="btn-prov-pill pill-local" id="provPill-lmstudio" onclick="selectProviderPill('lmstudio')">🧪 LM Studio</button>
                                        <button type="button" class="btn-prov-pill" id="provPill-openai" onclick="selectProviderPill('openai')">✳️ OpenAI</button>
                                    </div>

                                    <select id="aiProviderSelect" class="filter-select w-100"
                                        onchange="onAiProviderChanged()">
                                        <option value="openrouter" selected>OpenRouter (دعم كافة النماذج + DeepSeek R1)</option>
                                        <option value="ollama">🦙 Ollama (تشغيل نماذج محلية مجاناً دون إنترنت)</option>
                                        <option value="lmstudio">🧪 LM Studio (تشغيل نماذج محلية على جهازك)</option>
                                        <option value="openai">OpenAI (GPT-4o, o1-mini)</option>
                                        <option value="google">Google Gemini (Gemini 1.5 Pro / Flash)</option>
                                    </select>
                                </div>

                                <!-- خيار عنوان الخادم المحلي لـ Ollama أو LM Studio -->
                                <div class="form-group" id="aiLocalEndpointGroup" style="display: none;">
                                    <label for="aiEndpointUrlInput">🌐 عنوان الخادم المحلي (Local Endpoint):</label>
                                    <div style="display: flex; gap: 0.4rem;">
                                        <input type="text" id="aiEndpointUrlInput" class="filter-select w-100"
                                            placeholder="http://localhost:11434" dir="ltr" oninput="saveAiSettings()">
                                        <button type="button" class="btn-tool-action" onclick="resetDefaultEndpoint()">🔄 افتراضي</button>
                                    </div>
                                </div>

                                <div class="form-group" id="aiApiKeyGroup">
                                    <label for="aiApiKeyInput">مفتاح API Key:</label>
                                    <div class="input-password-wrapper">
                                        <input type="password" id="aiApiKeyInput" class="filter-select w-100"
                                            placeholder="sk-..." autocomplete="off" oninput="saveAiSettings()">
                                        <button type="button" class="btn-toggle-eye" onclick="toggleApiKeyVisibility()">👁️</button>
                                    </div>
                                </div>

                                <div class="form-group">
                                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.35rem;">
                                        <label for="aiModelSelect" style="margin: 0; font-weight: 700;">النموذج (Model):</label>
                                        <button type="button" class="btn-fetch-models" onclick="fetchLiveModels()">🔄 جلب النماذج</button>
                                    </div>

                                    <!-- بطاقة شعار الشركة والنموذج المختار -->
                                    <div id="activeModelCompanyCard" class="model-company-banner">
                                        <div id="companyLogoSlot" class="company-logo-slot"></div>
                                        <div style="overflow: hidden; flex: 1;">
                                            <div style="display: flex; align-items: center; justify-content: space-between;">
                                                <span id="companyProviderName" style="font-size: 0.85rem; font-weight: 800; color: #34d399;">OpenRouter</span>
                                                <span id="companyModelTypeTag" class="model-active-pill">النموذج النشط</span>
                                            </div>
                                            <div id="activeModelFullTitle" style="font-size: 0.76rem; color: #94a3b8; font-family: monospace;" dir="ltr">anthropic/claude-3.5-sonnet</div>
                                        </div>
                                    </div>

                                    <div class="custom-model-dropdown-container" id="customModelDropdownContainer">
                                        <div class="model-filter-wrapper">
                                            <input type="text" id="aiModelSearchInput" class="filter-select w-100"
                                                placeholder="🔍 ابحث واختر النموذج..."
                                                onfocus="openCustomModelDropdown()" onclick="openCustomModelDropdown()"
                                                oninput="filterCustomModelDropdown()" autocomplete="off">
                                            <span id="aiModelCountBadge" class="model-count-badge" onclick="toggleCustomModelDropdown()">0 نموذج</span>
                                        </div>
                                        <div id="customModelDropdownMenu" class="custom-model-menu" style="display: none;">
                                            <div class="model-quick-filters" id="modelQuickCompanyChips"></div>
                                            <div id="customModelOptionsList" class="custom-model-options-list"></div>
                                        </div>
                                    </div>
                                    <select id="aiModelSelect" style="display: none;" onchange="onModelSelectChanged()"></select>
                                </div>
                            </div>
                        </div>

                        <!-- 2. إعدادات استرجاع نصوص الشاملة (Qdrant RAG) -->
                        <div class="settings-card section-rag" id="card-rag">
                            <div class="settings-card-header">
                                <span class="settings-icon">📚</span>
                                <h3>استرجاع نصوص الشاملة (Qdrant RAG)</h3>
                            </div>
                            <div class="settings-card-body">
                                <div class="form-group">
                                    <label class="checkbox-label">
                                        <input type="checkbox" id="aiRagEnabled" checked onchange="saveAiSettings()">
                                        <span><strong>تضمين نصوص الشاملة كمرجع للنموذج</strong></span>
                                    </label>
                                </div>

                                <div class="form-group">
                                    <label for="aiRagLimitSelect">عدد صفحات وسياقات الشاملة:</label>
                                    <select id="aiRagLimitSelect" class="filter-select w-100" onchange="saveAiSettings()">
                                        <option value="5" selected>٥ صفحات سياق (موصى به)</option>
                                        <option value="10">١٠ صفحات سياق</option>
                                        <option value="20">٢٠ صفحة سياق</option>
                                        <option value="50">٥٠ صفحة سياق</option>
                                    </select>
                                </div>

                                <div class="form-group">
                                    <label for="aiRagCollectionSelect">قاعدة وفهرس المتجهات (Corpus):</label>
                                    <select id="aiRagCollectionSelect" class="filter-select w-100" onchange="saveAiSettings()">
                                        <option value="badr_all_tsh_corpus" selected>⚡ بدر الهجين المطور (٧.٥٨M صفحة)</option>
                                        <option value="shamela_corpus">📚 شاملة BGE-M3 (٥.١٥M صفحة)</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        <!-- 3. المعلمات المتقدمة -->
                        <div class="settings-card section-params" id="card-params">
                            <div class="settings-card-header">
                                <span class="settings-icon">🎛️</span>
                                <h3>معلمات التوليد والتحكم</h3>
                            </div>
                            <div class="settings-card-body">
                                <div class="form-group">
                                    <div class="range-header">
                                        <label for="aiTemperature">درجة الحرارة (Temperature):</label>
                                        <span class="range-val" id="tempVal">0.3</span>
                                    </div>
                                    <input type="range" id="aiTemperature" min="0" max="1.5" step="0.05" value="0.3"
                                        class="range-slider"
                                        oninput="document.getElementById('tempVal').innerText = this.value; saveAiSettings();">
                                </div>
                                <div class="form-group">
                                    <label for="aiMaxTokens">الحد الأقصى لرموز التوليد:</label>
                                    <input type="number" id="aiMaxTokens" class="filter-select w-100" value="8000" oninput="saveAiSettings()">
                                </div>
                            </div>
                        </div>

                        <!-- 4. النماذج المساعدة -->
                        <div class="settings-card section-assistants" id="card-assistants">
                            <div class="settings-card-header">
                                <span class="settings-icon">🤖</span>
                                <h3>النماذج المساعدة (Multi-Agent)</h3>
                            </div>
                            <div class="settings-card-body">
                                <div class="pipeline-master-box">
                                    <label class="checkbox-label" style="font-weight: 800; color: #34d399;">
                                        <input type="checkbox" id="aiPipelineEnabled" onchange="togglePipelineMode(this.checked)">
                                        <span>🚀 تشغيل بايبلاين النماذج المساعدة</span>
                                    </label>
                                </div>
                                <button type="button" class="btn-action-primary w-100" onclick="switchMainView('pipeline')" style="margin-top: 0.75rem;">
                                    إدارة النماذج المساعدة بالصفحة المخصصة ↗
                                </button>
                            </div>
                        </div>

                        <!-- 5. هيكلة JSON -->
                        <div class="settings-card section-structure" id="card-structure">
                            <div class="settings-card-header">
                                <span class="settings-icon">📐</span>
                                <h3>هيكلة الإخراج (JSON Schema)</h3>
                            </div>
                            <div class="settings-card-body">
                                <div class="form-group">
                                    <label class="checkbox-label">
                                        <input type="checkbox" id="aiStructuredEnabled" onchange="toggleStructuredFormatBox(); saveAiSettings();">
                                        <span>تفعيل الإخراج بهيكلة مخصصة</span>
                                    </label>
                                </div>
                            </div>
                        </div>

                        <!-- 6. CraftMyPDF -->
                        <div class="settings-card section-craft" id="card-craft">
                            <div class="settings-card-header">
                                <span class="settings-icon">🎨</span>
                                <h3>منصة CraftMyPDF للتقارير</h3>
                            </div>
                            <div class="settings-card-body">
                                <div class="form-group">
                                    <label for="craftApiKeyInput">CraftMyPDF API Key:</label>
                                    <input type="password" id="craftApiKeyInput" class="filter-select w-100" placeholder="مفتاح API..." oninput="saveAiSettings()">
                                </div>
                                <div class="form-group">
                                    <label for="craftTemplateIdInput">Template ID:</label>
                                    <input type="text" id="craftTemplateIdInput" class="filter-select w-100" placeholder="معرف القالب..." oninput="saveAiSettings()">
                                </div>
                            </div>
                        </div>

                    </div>
                </div>
            </div>
        </div>

        <!-- ==================== 3. صفحة النماذج المساعدة وأتمتة البايبلاين ==================== -->
        <div id="pipelineDashboardView" style="display: none;">
            <section class="pipeline-hero-banner">
                <div class="pipeline-hero-content">
                    <div class="pipeline-badge-tag">
                        <span>🚀 منظومة الوكلاء المتعددين (Multi-Agent Heritage Pipeline)</span>
                        <span class="live-dot-pulse"></span>
                    </div>
                    <h2 class="pipeline-hero-title">منظومة النماذج المساعدة والبايبلاين التخصصي</h2>
                    <p class="pipeline-hero-subtitle">
                        توزيع الاستعلام الفقهي على فرق وكلاء متخصصة (فقه، تخريج حديث، لغة، أصول) مع استعلام دلالي وهجين لكل نموذج.
                    </p>
                </div>
            </section>

            <div class="pipeline-toolbar-bar">
                <div class="pipeline-tools-left">
                    <button type="button" class="btn-action-primary" onclick="addNewAssistantCard()">
                        <span>➕ إضافة نموذج مساعد جديد</span>
                    </button>
                    <button type="button" class="btn-action-secondary" onclick="loadDefaultScholarlyAssistants()">
                        <span>⚡ استعادة النماذج التراثية الأساسية</span>
                    </button>
                </div>
            </div>

            <div class="pipeline-grid-container" id="pipelinePageAssistantsGrid"></div>
        </div>

    </main>

    <!-- النوافذ المنبثقة (Modals) الأساسية -->
    <div class="modal-overlay" id="readerModal">
        <div class="modal-dialog">
            <div class="modal-header">
                <h3 id="readerTitle">قراءة الصفحة</h3>
                <button class="btn-icon" onclick="closeReaderModal()">✕</button>
            </div>
            <div class="modal-body">
                <div class="reader-text" id="readerContent"></div>
            </div>
        </div>
    </div>

    <!-- نافذة تحديد الكتب -->
    <div class="modal-overlay" id="bookSelectorModal">
        <div class="modal-dialog book-selector-dialog">
            <div class="modal-header">
                <h3>📚 تحديد الكتب للبحث المخصص</h3>
                <button class="btn-icon" onclick="closeBookSelectorModal()">✕</button>
            </div>
            <div class="modal-body book-list-body">
                <div class="book-list-container" id="bookListContainer"></div>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn-action" onclick="closeBookSelectorModal()">إلغاء</button>
                <button type="button" class="btn-action btn-primary-action" onclick="confirmBookSelection()">✓ اعتماد وتطبيق</button>
            </div>
        </div>
    </div>

    <!-- Toast Notification -->
    <div class="toast" id="toast"></div>

    <!-- Scripts -->
    <script src="/static/js/main.js?v=3.0"></script>
</body>

</html>