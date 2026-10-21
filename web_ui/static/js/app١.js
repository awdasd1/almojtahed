// =============================================================================
// منظومة المجتهد - الكود الأساسي (app.js)
// إدارة التبويبات، الإعدادات، والسمات البصرية
// =============================================================================

// المفاتيح في التخزين المحلي (LocalStorage)
const STORAGE_KEYS = {
  SETTINGS: 'almojtahed_settings',
  THEME: 'almojtahed_theme',
  FONT_SIZE: 'almojtahed_text_size',
  ACTIVE_TAB: 'almojtahed_active_tab',
};

// الإعدادات الافتراضية
const DEFAULT_SETTINGS = {
  themePreset: 'claude-warm',
  fontFamily: "'Amiri', serif",
  textSize: 19,
  providers: {
    claude: '',
    google: '',
    deepseek: '',
    openai: '',
    openrouter: ''
  },
  modelParams: {
    systemPrompt: `أنت "المجتهد"، باحث تراثي وعالم فقهي رقمي دقيق متصل بالمكتبة الشاملة الكاملة. استند بدقة إلى النصوص الموثقة من كتب التراث، واذكر اسم الكتاب، والمؤلف، والجزء والصفحة بدقة مع الالتزام بالحياد العلمي والأمانة في النقل.`,
    temperature: 0.2,
    topK: 40,
    repPenalty: 1.1,
    maxTokens: 65536
  },
  reranker: {
    poolSize: 250,
    topK: 15,
    minScore: 0.35,
    enabled: true
  }
};

let currentSettings = { ...DEFAULT_SETTINGS };

// تهيئة التطبيق عند اكتمال تحميل الصفحة
document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  initTheme();
  setupEventListeners();

  // استعادة التبويب النشط من الـ URL hash أو التخزين المحلي
  const hashTab = (window.location.hash || '').replace('#', '');
  const savedTab = hashTab || localStorage.getItem(STORAGE_KEYS.ACTIVE_TAB) || 'search';
  if (['search', 'chat', 'agents', 'projects', 'providers'].includes(savedTab)) {
    switchMainTab(savedTab);
  }
});

// =============================================================================
// إدارة التبويبات الرئيسية (Main Navigation Tabs)
// =============================================================================
function switchMainTab(tabName) {
  // إخفاء كافة الألواح
  document.querySelectorAll('.tab-pane').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-tab-btn').forEach(el => el.classList.remove('active'));

  // تفعيل اللوح المطلوب والزر المقابل
  if (tabName === 'search') {
    document.getElementById('paneSearch').classList.add('active');
    document.getElementById('tabNavSearch').classList.add('active');
  } else if (tabName === 'chat') {
    document.getElementById('paneChat').classList.add('active');
    document.getElementById('tabNavChat').classList.add('active');
    if (typeof syncChatModelDropdown === 'function') {
      syncChatModelDropdown();
    }
  } else if (tabName === 'agents') {
    document.getElementById('paneAgents').classList.add('active');
    document.getElementById('tabNavAgents').classList.add('active');
    if (typeof renderGroupsTable === 'function') {
      renderGroupsTable();
    }
  } else if (tabName === 'projects') {
    const pane = document.getElementById('paneProjects');
    if (pane) pane.classList.add('active');
    const btn = document.getElementById('tabNavProjects');
    if (btn) btn.classList.add('active');
    if (typeof initProjectsTab === 'function') {
      initProjectsTab();
    }
  } else if (tabName === 'tools') {
    const pane = document.getElementById('paneTools');
    if (pane) pane.classList.add('active');
    const btn = document.getElementById('tabNavTools');
    if (btn) btn.classList.add('active');
    if (typeof initToolsTab === 'function') {
      initToolsTab();
    }
  } else if (tabName === 'providers') {
    document.getElementById('paneProviders').classList.add('active');
    document.getElementById('tabNavProviders').classList.add('active');
  }

  localStorage.setItem(STORAGE_KEYS.ACTIVE_TAB, tabName);
}

// =============================================================================
// السمات البصرية وتبديل الألوان (Claude Theme & Fonts)
// =============================================================================
function initTheme() {
  const savedTheme = localStorage.getItem(STORAGE_KEYS.THEME) || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);
  updateThemeIcon(savedTheme);

  const savedSize = localStorage.getItem(STORAGE_KEYS.FONT_SIZE) || 19;
  updateTextSize(savedSize, false);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'light';
  const newTheme = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', newTheme);
  localStorage.setItem(STORAGE_KEYS.THEME, newTheme);
  updateThemeIcon(newTheme);
  showToast(`تم التبديل إلى ${newTheme === 'dark' ? 'النمط الليلي' : 'النمط النهاري الدافئ'}`);
}

function updateThemeIcon(theme) {
  const icon = document.getElementById('themeIconSun');
  if (!icon) return;
  if (theme === 'dark') {
    icon.innerHTML = `<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>`;
  } else {
    icon.innerHTML = `<circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>`;
  }
}

function applyVisualThemePreset(preset) {
  if (preset === 'claude-dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
    localStorage.setItem(STORAGE_KEYS.THEME, 'dark');
    updateThemeIcon('dark');
  } else if (preset === 'claude-warm') {
    document.documentElement.setAttribute('data-theme', 'light');
    localStorage.setItem(STORAGE_KEYS.THEME, 'light');
    updateThemeIcon('light');
  } else if (preset === 'manuscript') {
    document.documentElement.setAttribute('data-theme', 'light');
    document.documentElement.style.setProperty('--bg-canvas', '#F5EFE0');
    document.documentElement.style.setProperty('--bg-surface', '#FCFAF2');
    document.documentElement.style.setProperty('--accent-clay', '#8B4513');
  }
}

function applyFontFamily(font) {
  document.documentElement.style.setProperty('--font-amiri', font);
}

function updateTextSize(size, save = true) {
  document.documentElement.style.setProperty('--text-passage-size', size + 'px');
  const valEl = document.getElementById('textSizeValue');
  if (valEl) valEl.textContent = size + 'px';
  const slider = document.getElementById('textSizeSlider');
  if (slider && slider.value != size) slider.value = size;

  // تحديث النصوص المعروضة
  document.querySelectorAll('.result-text').forEach(el => {
    el.style.fontSize = size + 'px';
  });

  if (save) localStorage.setItem(STORAGE_KEYS.FONT_SIZE, size);
}

// =============================================================================
// نافذة الإعدادات الشاملة (Settings Modal)
// =============================================================================
function openSettingsModal() {
  syncSettingsToUI();
  if (typeof updateAuxiliaryModelsList === 'function') {
    updateAuxiliaryModelsList();
  }
  document.getElementById('settingsModalOverlay').classList.add('open');
}

function closeSettingsModal() {
  document.getElementById('settingsModalOverlay').classList.remove('open');
}

function handleModalOverlayClick(e) {
  if (e.target.id === 'settingsModalOverlay') {
    closeSettingsModal();
  }
}

function switchSettingsTab(tabKey) {
  // إخفاء محتوى التبويبات وإلغاء تنشيط الأزرار
  document.querySelectorAll('.settings-pane').forEach(el => el.style.display = 'none');
  document.querySelectorAll('.settings-tab-btn').forEach(el => el.classList.remove('active'));

  // الخريطة بين المفاتيح والألواح
  const map = {
    'visual': { pane: 'setPaneVisual', btn: 'setNavVisual' },
    'providers': { pane: 'setPaneProviders', btn: 'setNavProviders' },
    'modelParams': { pane: 'setPaneModelParams', btn: 'setNavModelParams' },
    'reranker': { pane: 'setPaneReranker', btn: 'setNavReranker' },
    'auxiliary': { pane: 'setPaneAuxiliary', btn: 'setNavAuxiliary' }
  };

  const target = map[tabKey];
  if (target) {
    const pane = document.getElementById(target.pane);
    const btn = document.getElementById(target.btn);
    if (pane) pane.style.display = 'flex';
    if (btn) btn.classList.add('active');
  }
}

// قراءة الإعدادات من التخزين وحقنها في الحقول
function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    if (raw) {
      currentSettings = { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    }
  } catch (e) {
    console.error('Error reading settings from localStorage:', e);
  }
}

// عكس الإعدادات على عناصر واجهة المستخدم في Modal
function syncSettingsToUI() {
  // المزودون والمفاتيح
  const p = currentSettings.providers || {};
  if (document.getElementById('apiKeyClaude')) document.getElementById('apiKeyClaude').value = p.claude || '';
  if (document.getElementById('apiKeyGoogle')) document.getElementById('apiKeyGoogle').value = p.google || '';
  if (document.getElementById('apiKeyDeepSeek')) document.getElementById('apiKeyDeepSeek').value = p.deepseek || '';
  if (document.getElementById('apiKeyOpenAI')) document.getElementById('apiKeyOpenAI').value = p.openai || '';
  if (document.getElementById('apiKeyOpenRouter')) document.getElementById('apiKeyOpenRouter').value = p.openrouter || '';

  // معلمات النموذج
  const m = currentSettings.modelParams || {};
  if (document.getElementById('systemPromptInput')) document.getElementById('systemPromptInput').value = m.systemPrompt || '';
  if (document.getElementById('paramTemperature')) {
    document.getElementById('paramTemperature').value = m.temperature ?? 0.2;
    document.getElementById('valTemp').textContent = m.temperature ?? 0.2;
  }
  if (document.getElementById('paramTopK')) {
    document.getElementById('paramTopK').value = m.topK ?? 40;
    document.getElementById('valTopK').textContent = m.topK ?? 40;
  }
  if (document.getElementById('paramRepPenalty')) {
    document.getElementById('paramRepPenalty').value = m.repPenalty ?? 1.1;
    document.getElementById('valRepPenalty').textContent = m.repPenalty ?? 1.1;
  }
  if (document.getElementById('paramMaxTokens')) {
    document.getElementById('paramMaxTokens').value = m.maxTokens ?? 65536;
    document.getElementById('valMaxTokens').textContent = Number(m.maxTokens ?? 65536).toLocaleString() + ' توكن';
  }

  // معلمات Reranker
  const r = currentSettings.reranker || {};
  if (document.getElementById('rerankPoolSize')) {
    document.getElementById('rerankPoolSize').value = r.poolSize ?? 250;
    document.getElementById('valPoolSize').textContent = r.poolSize ?? 250;
  }
  if (document.getElementById('rerankTopK')) {
    document.getElementById('rerankTopK').value = r.topK ?? 15;
    document.getElementById('valRerankTopK').textContent = r.topK ?? 15;
  }
  if (document.getElementById('rerankMinScore')) {
    document.getElementById('rerankMinScore').value = r.minScore ?? 0.35;
    document.getElementById('valMinScore').textContent = r.minScore ?? 0.35;
  }
}

// حفظ كافة الإعدادات
function saveAllSettings() {
  currentSettings.providers = {
    claude: document.getElementById('apiKeyClaude')?.value.trim() || '',
    google: document.getElementById('apiKeyGoogle')?.value.trim() || '',
    deepseek: document.getElementById('apiKeyDeepSeek')?.value.trim() || '',
    openai: document.getElementById('apiKeyOpenAI')?.value.trim() || '',
    openrouter: document.getElementById('apiKeyOpenRouter')?.value.trim() || '',
  };

  currentSettings.modelParams = {
    systemPrompt: document.getElementById('systemPromptInput')?.value.trim() || '',
    temperature: parseFloat(document.getElementById('paramTemperature')?.value || 0.2),
    topK: parseInt(document.getElementById('paramTopK')?.value || 40),
    repPenalty: parseFloat(document.getElementById('paramRepPenalty')?.value || 1.1),
    maxTokens: parseInt(document.getElementById('paramMaxTokens')?.value || 65536),
  };

  currentSettings.reranker = {
    poolSize: parseInt(document.getElementById('rerankPoolSize')?.value || 250),
    topK: parseInt(document.getElementById('rerankTopK')?.value || 15),
    minScore: parseFloat(document.getElementById('rerankMinScore')?.value || 0.35),
    enabled: true
  };

  localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(currentSettings));
  closeSettingsModal();
  showToast('تم حفظ كافة الإعدادات بنجاح');
}

// معالجة رفع التمبلت الجديد
function handleTemplateUpload(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(evt) {
    try {
      if (file.name.endsWith('.json')) {
        const custom = JSON.parse(evt.target.result);
        if (custom.colors) {
          for (const [k, v] of Object.entries(custom.colors)) {
            document.documentElement.style.setProperty(k, v);
          }
        }
        showToast('تم تحميل وتطبيق التمبلت بنجاح');
      } else if (file.name.endsWith('.css')) {
        const style = document.createElement('style');
        style.textContent = evt.target.result;
        document.head.appendChild(style);
        showToast('تم تطبيق ملف الستايل بنجاح');
      }
    } catch (err) {
      showToast('تعذر قراءة ملف التمبلت: ' + err.message);
    }
  };
  reader.readAsText(file);
}

// عرض رسالة سريعة Toast
function showToast(msg, duration = 3500) {
  let toast = document.getElementById('appGlobalToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'appGlobalToast';
    document.body.appendChild(toast);
  }
  toast.style.cssText = `
    position: fixed;
    bottom: 30px;
    left: 50%;
    transform: translateX(-50%);
    background: var(--text-main);
    color: var(--bg-canvas);
    padding: 12px 26px;
    border-radius: var(--radius-pill);
    font-family: var(--font-amiri);
    font-size: 15.5px;
    font-weight: 700;
    box-shadow: 0 6px 24px rgba(0,0,0,0.35);
    z-index: 999999 !important;
    opacity: 0;
    transition: opacity 0.25s, transform 0.25s;
    pointer-events: none;
  `;

  toast.textContent = msg;
  toast.style.opacity = '1';
  toast.style.transform = 'translateX(-50%) translateY(0)';

  clearTimeout(toast._timeout);
  toast._timeout = setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(-50%) translateY(8px)';
  }, duration);
}

function setupEventListeners() {
  // اختصارات لوحة المفاتيح
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeSettingsModal();
      closeMaintenanceModal();
      if (typeof closeAgentModal === 'function') closeAgentModal();
    }
  });

  const maintBtn = document.getElementById('systemMaintenanceBtn');
  if (maintBtn) {
    maintBtn.addEventListener('click', (e) => {
      e.preventDefault();
      openMaintenanceModal();
    });
  }
}

// =============================================================================
// مركز الفحص الذاتي والصيانة التلقائية الشاملة للمنظومة
// =============================================================================
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function openMaintenanceModal() {
  const modal = document.getElementById('systemMaintenanceModal');
  if (modal) {
    modal.style.display = 'flex';
    modal.classList.add('active', 'open');
    loadBackupsList();
  }
}

function closeMaintenanceModal() {
  const modal = document.getElementById('systemMaintenanceModal');
  if (modal) {
    modal.style.display = 'none';
    modal.classList.remove('active', 'open');
  }
}

// -----------------------------------------------------------------------------
// إدارة واسترجاع النسخ الاحتياطية (Backup & Restore)
// -----------------------------------------------------------------------------
let currentBackupsList = [];

async function loadBackupsList() {
  const select = document.getElementById('backupSelectDropdown');
  const btn = document.getElementById('btnRestoreBackup');
  if (!select) return;

  select.innerHTML = '<option value="">جارٍ فحص وجلب النسخ الاحتياطية... ⏳</option>';
  try {
    const res = await fetch('/api/system/backups');
    if (!res.ok) throw new Error('فشل جلب قائمة النسخ');
    const data = await res.json();
    const backups = data.backups || [];
    currentBackupsList = backups;

    if (backups.length === 0) {
      select.innerHTML = '<option value="">لا توجد نسخ احتياطية محفوظة حالياً</option>';
      if (btn) btn.disabled = true;
      return;
    }

    let html = '';
    backups.forEach((b, idx) => {
      const selected = (idx === 0) ? 'selected' : '';
      html += `<option value="${escapeHtml(b.id)}" ${selected}>${escapeHtml(b.label)}</option>`;
    });
    select.innerHTML = html;
    if (btn) btn.disabled = false;
  } catch (err) {
    console.error('Error loading backups:', err);
    select.innerHTML = `<option value="">خطأ: ${escapeHtml(err.message)}</option>`;
    if (btn) btn.disabled = true;
  }
}

function promptRestoreBackup() {
  const select = document.getElementById('backupSelectDropdown');
  const feedback = document.getElementById('restoreStatusFeedback');
  if (!select || !feedback) return;

  const backupId = select.value;
  if (!backupId) {
    showToast('⚠️ يرجى اختيار نسخة احتياطية من القائمة أولاً');
    return;
  }

  const backupObj = currentBackupsList.find(b => b.id === backupId) || { id: backupId, label: backupId };

  feedback.style.display = 'block';
  feedback.innerHTML = `
    <div style="background: rgba(239, 68, 68, 0.08); border: 1.5px solid rgba(239, 68, 68, 0.35); border-radius: 8px; padding: 16px; margin-top: 6px;">
      <div style="display: flex; align-items: center; gap: 8px; font-weight: 700; color: #ef4444; font-size: 14px; margin-bottom: 6px;">
        <span>⚠️</span>
        <span>تأكيد استرجاع النسخة الاحتياطية:</span>
      </div>
      <div style="font-size: 13px; line-height: 1.6; color: var(--text-main); margin-bottom: 12px;">
        أنت على وشك استرجاع بياناتك إلى: <strong>${escapeHtml(backupObj.label)}</strong>.
        <div style="font-size: 12px; color: var(--text-muted); margin-top: 4px;">
          سيقوم النظام تلقائياً بأخذ نقطة أمان سريعة للوضع الحالي، ثم استبدال ملفات المشاريع والأدوات الحالية بملفات النسخة المحددة.
        </div>
      </div>
      <div style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap;">
        <button type="button" class="btn-primary-gradient" onclick="executeRestoreBackupNow('${escapeHtml(backupId)}')" style="background: #dc2626; border-color: #b91c1c; padding: 8px 22px; font-size: 13px; font-weight: 700;">
          <span>⏪ نعم، استرجع هذه النسخة الآن</span>
        </button>
        <button type="button" class="btn-secondary-action" onclick="cancelRestoreBackupPrompt()" style="padding: 8px 16px; font-size: 12.5px;">
          <span>إلغاء</span>
        </button>
      </div>
    </div>
  `;
}

function cancelRestoreBackupPrompt() {
  const feedback = document.getElementById('restoreStatusFeedback');
  if (feedback) feedback.style.display = 'none';
}

async function executeRestoreBackupNow(backupId) {
  const feedback = document.getElementById('restoreStatusFeedback');
  const btn = document.getElementById('btnRestoreBackup');
  if (!feedback) return;

  if (btn) btn.disabled = true;
  feedback.style.display = 'block';
  feedback.innerHTML = `
    <div style="text-align: center; padding: 16px; color: var(--accent-gold);">
      <div style="font-size: 24px; margin-bottom: 6px;">⏳</div>
      <div style="font-weight: 700; font-size: 14px;">جارٍ استرجاع النسخة الاحتياطية وإعادة مزامنة الملفات...</div>
    </div>
  `;

  try {
    const res = await fetch('/api/system/restore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ backup_id: backupId })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'فشل استرجاع النسخة الاحتياطية');
    }
    const data = await res.json();

    const filesList = (data.restored_files || []).join('، ');
    feedback.innerHTML = `
      <div style="background: rgba(16, 185, 129, 0.12); border: 1px solid rgba(16, 185, 129, 0.4); border-radius: 8px; padding: 14px 16px;">
        <div style="font-weight: 700; color: #10b981; font-size: 14px; margin-bottom: 4px;">
          ✅ ${escapeHtml(data.message)}
        </div>
        <div style="font-size: 12.5px; color: var(--text-secondary); line-height: 1.6;">
          الملفات المسترجعة: <strong>${escapeHtml(filesList)}</strong>
        </div>
        <div style="font-size: 11.5px; color: var(--text-muted); margin-top: 4px;">
          تم حفظ نقطة أمان قبل الاسترجاع: <code>${escapeHtml(data.pre_restore_backup)}</code>
        </div>
      </div>
    `;

    showToast('🎉 تم استرجاع النسخة الاحتياطية بنجاح!');

    // تحديث فوري للمشاريع والأدوات
    if (typeof loadProjectsList === 'function') loadProjectsList();
    if (typeof loadStoredTools === 'function') loadStoredTools();
    if (typeof loadToolsList === 'function') loadToolsList();
    if (typeof loadTools === 'function') loadTools();

    // تحديث القائمة بعد قليل لظهور نقطة الأمان الجديدة
    setTimeout(loadBackupsList, 1200);
  } catch (err) {
    console.error('Error during restore:', err);
    feedback.innerHTML = `
      <div style="background: rgba(239, 68, 68, 0.12); border: 1px solid rgba(239, 68, 68, 0.4); border-radius: 8px; padding: 14px 16px; color: #ef4444; font-size: 13px;">
        ❌ خطأ أثناء الاسترجاع: ${escapeHtml(err.message)}
      </div>
    `;
  } finally {
    if (btn) btn.disabled = false;
  }
}

function quickSaveCurrentWorkspace() {
  let savedSomething = false;
  try {
    if (typeof saveCardsConfiguration === 'function') {
      saveCardsConfiguration();
      savedSomething = true;
    }
  } catch (e) {
    console.warn('saveCardsConfiguration not applicable:', e);
  }

  try {
    if (typeof saveCurrentProject === 'function') {
      saveCurrentProject();
      savedSomething = true;
    }
  } catch (e) {
    console.warn('saveCurrentProject not applicable:', e);
  }

  // إشعار فوري داخل المودال نفسه
  const feedback = document.getElementById('quickSaveFeedback');
  if (feedback) {
    feedback.style.display = 'inline-flex';
    feedback.innerHTML = '✅ تم حفظ ومزامنة المشروع بنجاح!';
    setTimeout(() => {
      feedback.style.display = 'none';
    }, 4500);
  }

  showToast('💾 تم حفظ كافة إعدادات وبطاقات المشروع المفتوح بنجاح!');
}

async function runSystemDiagnose() {
  const container = document.getElementById('maintenanceResultsContainer');
  const btn = document.getElementById('btnRunDiagnose');
  if (!container) return;

  if (btn) btn.disabled = true;
  container.innerHTML = `
    <div style="text-align: center; padding: 28px; color: var(--accent-gold);">
      <div style="font-size: 24px; margin-bottom: 8px;">⏳</div>
      <div style="font-weight: 700;">جارٍ الفحص والتشخيص الشامل لكافة ملفات وأصول المنظومة...</div>
    </div>
  `;

  try {
    const res = await fetch('/api/system/diagnose');
    if (!res.ok) throw new Error('فشل جلب تقرير الفحص');
    const data = await res.json();

    renderDiagnoseResults(data);
  } catch (err) {
    console.error('Diagnose error:', err);
    container.innerHTML = `<div style="color: #ef4444; padding: 16px; text-align: center;">خطأ أثناء الفحص: ${escapeHtml(err.message)}</div>`;
  } finally {
    if (btn) btn.disabled = false;
  }
}

function runSystemRepair() {
  const container = document.getElementById('maintenanceResultsContainer');
  if (!container) return;

  // عرض بطاقة تأكيد داخلية أنيقة بدلاً من confirm() القياسية للمتصفح
  container.innerHTML = `
    <div style="background: rgba(184, 115, 51, 0.08); border: 1.5px solid var(--accent-clay); border-radius: 8px; padding: 20px; text-align: center; margin-bottom: 14px;">
      <div style="font-size: 32px; margin-bottom: 8px;">🛡️</div>
      <div style="font-size: 16px; font-weight: 700; color: var(--text-main); margin-bottom: 6px;">
        تأكيد بدء الصيانة والإصلاح والنسخ الاحتياطي
      </div>
      <div style="font-size: 13px; color: var(--text-secondary); max-width: 520px; margin: 0 auto 16px; line-height: 1.6;">
        سيقوم النظام فوراً بـ <strong>أخذ نسخة احتياطية كاملة ومؤرخة</strong> لمشاريعك، وترميم الملفات التالفة أو المفقودة، وتحديث الذاكرة المؤقتة لضمان عمل كافة الوظائف.
      </div>
      <div style="display: flex; gap: 12px; justify-content: center; flex-wrap: wrap;">
        <button type="button" class="btn-primary-gradient" onclick="executeSystemRepairNow()" style="padding: 9px 24px; font-weight: 700; font-size: 13.5px;">
          <span>🚀 نعم، ابدأ الصيانة والنسخ الاحتياطي الآن</span>
        </button>
        <button type="button" class="btn-secondary-action" onclick="cancelRepairConfirm()" style="padding: 9px 18px; font-size: 13px;">
          <span>إلغاء</span>
        </button>
      </div>
    </div>
  `;
}

function cancelRepairConfirm() {
  const container = document.getElementById('maintenanceResultsContainer');
  if (!container) return;
  container.innerHTML = `
    <div style="text-align: center; padding: 24px 12px; color: var(--text-muted); font-size: 13px;">
      تم إلغاء إجراء الصيانة. يمكنك الضغط على «فحص وتشخيص النظام» أو «بدء الصيانة والإصلاح» في أي وقت...
    </div>
  `;
}

async function executeSystemRepairNow() {
  const container = document.getElementById('maintenanceResultsContainer');
  const btn = document.getElementById('btnRunRepair');
  if (!container) return;

  if (btn) btn.disabled = true;
  container.innerHTML = `
    <div style="text-align: center; padding: 28px; color: var(--accent-gold);">
      <div style="font-size: 28px; margin-bottom: 8px;">🔄</div>
      <div style="font-weight: 700; font-size: 15px;">جارٍ تأمين النسخة الاحتياطية وإصلاح الملفات وتحديث الذاكرة...</div>
      <div style="font-size: 12.5px; color: var(--text-muted); margin-top: 6px;">يرجى الانتظار لحظات لإتمام الفحص والترميم...</div>
    </div>
  `;

  try {
    const res = await fetch('/api/system/repair', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    if (!res.ok) throw new Error('فشلت عملية الإصلاح');
    const data = await res.json();

    renderRepairResults(data);
    showToast('🎉 اكتملت الصيانة والإصلاح والنسخ الاحتياطي بنجاح!');
  } catch (err) {
    console.error('Repair error:', err);
    container.innerHTML = `<div style="color: #ef4444; padding: 16px; text-align: center;">خطأ أثناء الإصلاح: ${escapeHtml(err.message)}</div>`;
  } finally {
    if (btn) btn.disabled = false;
  }
}

function renderDiagnoseResults(data) {
  const container = document.getElementById('maintenanceResultsContainer');
  if (!container) return;

  const isHealthy = data.status === 'healthy';
  const checks = data.checks || [];

  let html = `
    <div style="margin-bottom: 14px; display: flex; justify-content: space-between; align-items: center; background: var(--bg-surface); padding: 12px 16px; border-radius: 8px; border: 1px solid var(--border-subtle);">
      <div>
        <strong style="font-size: 14px; color: ${isHealthy ? '#10b981' : '#f59e0b'};">
          ${isHealthy ? '✅ المنظومة سليمة 100%' : '⚠️ توجد بعض الملاحظات تحتاج صيانة'}
        </strong>
        <div style="font-size: 12px; color: var(--text-muted); margin-top: 3px;">${escapeHtml(data.summary)} - توقيت الفحص: ${escapeHtml(data.timestamp)}</div>
      </div>
    </div>

    <div style="display: flex; flex-direction: column; gap: 8px;">
  `;

  checks.forEach(c => {
    const icon = c.status === 'ok' ? '✅' : (c.status === 'warning' ? '⚠️' : '❌');
    const color = c.status === 'ok' ? '#10b981' : (c.status === 'warning' ? '#f59e0b' : '#ef4444');
    html += `
      <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: 6px; font-size: 13px;">
        <div>
          <span style="font-size: 11px; background: var(--bg-muted); padding: 2px 8px; border-radius: 10px; color: var(--text-secondary); margin-left: 6px;">${escapeHtml(c.category)}</span>
          <strong style="color: var(--text-main);">${escapeHtml(c.item)}</strong>
          <div style="font-size: 12px; color: var(--text-muted); margin-top: 2px;">${escapeHtml(c.message)}</div>
        </div>
        <span style="font-weight: 700; color: ${color}; white-space: nowrap;">${icon} ${c.status === 'ok' ? 'سليم' : (c.status === 'warning' ? 'تنبيه' : 'خطأ')}</span>
      </div>
    `;
  });

  html += `</div>`;
  container.innerHTML = html;
}

function renderRepairResults(data) {
  const container = document.getElementById('maintenanceResultsContainer');
  if (!container) return;

  const actions = data.actions_taken || [];
  let html = `
    <div style="margin-bottom: 14px; background: rgba(16, 185, 129, 0.1); padding: 12px 16px; border-radius: 8px; border: 1px solid rgba(16, 185, 129, 0.3);">
      <div style="font-weight: 700; color: #10b981; font-size: 14px;">✅ تم إنجاز الصيانة والإصلاح بنجاح!</div>
      <div style="font-size: 12px; color: var(--text-secondary); margin-top: 4px;">مسار النسخة الاحتياطية: <code style="direction: ltr; display: inline-block;">${escapeHtml(data.backup_path)}</code></div>
    </div>
    <div style="font-size: 13px; font-weight: 700; margin-bottom: 8px; color: var(--text-main);">الإجراءات التي تمت:</div>
    <ul style="padding-right: 20px; font-size: 12.5px; line-height: 1.8; color: var(--text-secondary);">
  `;

  actions.forEach(a => {
    html += `<li>${escapeHtml(a)}</li>`;
  });

  html += `</ul>`;
  container.innerHTML = html;
}

window.openMaintenanceModal = openMaintenanceModal;
window.closeMaintenanceModal = closeMaintenanceModal;
window.quickSaveCurrentWorkspace = quickSaveCurrentWorkspace;
window.runSystemDiagnose = runSystemDiagnose;
window.runSystemRepair = runSystemRepair;
window.executeSystemRepairNow = executeSystemRepairNow;
window.cancelRepairConfirm = cancelRepairConfirm;
window.loadBackupsList = loadBackupsList;
window.promptRestoreBackup = promptRestoreBackup;
window.cancelRestoreBackupPrompt = cancelRestoreBackupPrompt;
window.executeRestoreBackupNow = executeRestoreBackupNow;
