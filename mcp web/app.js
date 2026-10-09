/**
 * CLAUDE DESKTOP WEB — ENHANCED APPLICATION
 * Manages Chat Sessions, Dynamic OpenRouter 460+ Models Discovery,
 * Real MCP stdio Child Process Handshake, Tool Calling Loop, and UI Customizations.
 */

// Application State
const AppState = {
  chats: [],
  currentChatId: null,
  allModelsCache: {},
  discoveredMcpTools: [],
  settings: {
    provider: 'openrouter',
    apiKeys: {
      openrouter: '',
      anthropic: '',
      openai: '',
      google: ''
    },
    models: {
      openrouter: 'deepseek/deepseek-r1',
      anthropic: 'claude-3-7-sonnet-20250219',
      openai: 'gpt-4o',
      google: 'gemini-2.5-flash'
    },
    enableMcp: true,
    mcpLimit: 15,
    mcpBookDiversity: true,
    mcpWindowExpansion: true,
    enableRag: true,
    ragAgentId: 'shatibi',
    ragAgentName: 'الشاطبي (الأصولي)',
    activeMcpId: 'shamela-scholarly',
    temperature: 0.7,
    systemPrompt: 'أنت باحث ومساعد علمي فائق الدقة والاحترافية، تجيب باللغة العربية بأسلوب راقٍ. عندما يُطرح عليك سؤال شرعي أو حديثي أو فقهي، اعتمد على نصوص المكتبة الشاملة المرفقة واستخدم أدوات MCP لتحقيق المسائل وعزوها بدقة لأرقام الأجزاء والصفحات.',
    mcpServers: [
      {
        id: 'shamela-scholarly',
        title: 'المكتبة الشاملة (Shamela Scholarly MCP)',
        type: 'stdio',
        active: true,
        config: JSON.stringify({
          "mcpServers": {
            "shamela-scholarly": {
              "command": "/Users/maa/Shamela Snapshot/.venv/bin/python",
              "args": [
                "/Users/maa/Shamela Snapshot/shamela_mcp.py"
              ],
              "env": {
                "PYTHONUNBUFFERED": "1"
              }
            }
          }
        }, null, 2)
      },
      {
        id: 'khizanat-almaarif',
        title: 'خزانة المعارف (Khizanat al-Ma\'arif - 93 أداة شرعية ولغوية)',
        type: 'sse',
        active: false,
        config: JSON.stringify({
          "mcpServers": {
            "khizanat-almaarif": {
              "url": "https://mcp.khizanat-almaarif.com/mcp"
            }
          }
        }, null, 2)
      }
    ],
    theme: 'claude-warm',
    fontFamily: "'Cairo', sans-serif",
    fontSize: 15,
    fontColor: '#201F1D',
    accentColor: '#DA7756'
  },
  isGenerating: false,
  activeAttachment: null
};

// DOM Elements
const DOM = {
  appLayout: document.getElementById('appLayout'),
  sidebar: document.getElementById('sidebar'),
  collapseSidebarBtn: document.getElementById('collapseSidebarBtn'),
  expandSidebarBtn: document.getElementById('expandSidebarBtn'),
  newChatBtn: document.getElementById('newChatBtn'),
  chatSearchInput: document.getElementById('chatSearchInput'),
  chatList: document.getElementById('chatList'),
  
  // Header Elements
  chatIdBadge: document.getElementById('chatIdBadge'),
  currentChatIdText: document.getElementById('currentChatIdText'),
  currentChatTitle: document.getElementById('currentChatTitle'),
  headerModelPill: document.getElementById('headerModelPill'),
  headerModelName: document.getElementById('headerModelName'),
  exportChatCsvBtn: document.getElementById('exportChatCsvBtn'),
  exportChatPdfBtn: document.getElementById('exportChatPdfBtn'),
  clearChatBtn: document.getElementById('clearChatBtn'),

  // Messages Elements
  messagesContainer: document.getElementById('messagesContainer'),
  welcomeScreen: document.getElementById('welcomeScreen'),
  messagesList: document.getElementById('messagesList'),

  // Input Elements
  chatInputCapsule: document.getElementById('chatInputCapsule'),
  chatTextarea: document.getElementById('chatTextarea'),
  sendBtn: document.getElementById('sendBtn'),
  sendIcon: document.getElementById('sendIcon'),
  fileAttachmentInput: document.getElementById('fileAttachmentInput'),
  inputContextBar: document.getElementById('inputContextBar'),
  contextTagName: document.getElementById('contextTagName'),
  removeContextBtn: document.getElementById('removeContextBtn'),
  tokenEstimate: document.getElementById('tokenEstimate'),
  mcpActiveIndicator: document.getElementById('mcpActiveIndicator'),
  mcpCountBadge: document.getElementById('mcpCountBadge'),
  webSearchToggle: document.getElementById('webSearchToggle'),

  // Sidebar Footer
  currentModelDisplay: document.getElementById('currentModelDisplay'),
  currentProviderDisplay: document.getElementById('currentProviderDisplay'),
  themeToggleBtn: document.getElementById('themeToggleBtn'),
  themeIcon: document.getElementById('themeIcon'),
  openSettingsBtn: document.getElementById('openSettingsBtn'),

  // Settings Modal Elements
  settingsModal: document.getElementById('settingsModal'),
  closeSettingsBtn: document.getElementById('closeSettingsBtn'),
  saveSettingsBtn: document.getElementById('saveSettingsBtn'),
  resetSettingsDefaultsBtn: document.getElementById('resetSettingsDefaultsBtn'),
  settingsTabs: document.querySelectorAll('.settings-tabs .tab-btn'),
  tabPanes: document.querySelectorAll('.tab-pane'),

  // Provider & Models Inputs
  providerRadioCards: document.querySelectorAll('.provider-radio-card'),
  apiKeyInput: document.getElementById('apiKeyInput'),
  toggleApiKeyVisibility: document.getElementById('toggleApiKeyVisibility'),
  apiKeyEyeIcon: document.getElementById('apiKeyEyeIcon'),
  modelSelect: document.getElementById('modelSelect'),
  modelSearchInput: document.getElementById('modelSearchInput'),
  modelsCountBadge: document.getElementById('modelsCountBadge'),
  refreshModelsBtn: document.getElementById('refreshModelsBtn'),
  temperatureInput: document.getElementById('temperatureInput'),
  tempValueDisplay: document.getElementById('tempValueDisplay'),
  enableMcpCheckbox: document.getElementById('enableMcpCheckbox'),
  systemPromptInput: document.getElementById('systemPromptInput'),

  // MCP Inputs
  mcpServerTitle: document.getElementById('mcpServerTitle'),
  mcpServerType: document.getElementById('mcpServerType'),
  mcpJsonConfig: document.getElementById('mcpJsonConfig'),
  mcpJsonStatus: document.getElementById('mcpJsonStatus'),
  loadKhizanaTemplate: document.getElementById('loadKhizanaTemplate'),
  loadShamelaTemplate: document.getElementById('loadShamelaTemplate'),
  loadFilesystemTemplate: document.getElementById('loadFilesystemTemplate'),
  loadSqliteTemplate: document.getElementById('loadSqliteTemplate'),
  loadFetchTemplate: document.getElementById('loadFetchTemplate'),
  formatMcpJsonBtn: document.getElementById('formatMcpJsonBtn'),
  saveMcpServerBtn: document.getElementById('saveMcpServerBtn'),
  mcpServersGrid: document.getElementById('mcpServersGrid'),
  mcpLiveStatusBadge: document.getElementById('mcpLiveStatusBadge'),
  mcpToolsViewer: document.getElementById('mcpToolsViewer'),
  discoveredToolsCount: document.getElementById('discoveredToolsCount'),
  discoveredToolsList: document.getElementById('discoveredToolsList'),

  // MCP Deep Retrieval Inputs
  mcpLimitSelectPopover: document.getElementById('mcpLimitSelectPopover'),
  mcpLimitPopoverBadge: document.getElementById('mcpLimitPopoverBadge'),
  mcpBookDiversityTogglePopover: document.getElementById('mcpBookDiversityTogglePopover'),
  mcpWindowExpansionTogglePopover: document.getElementById('mcpWindowExpansionTogglePopover'),
  mcpLimitSelectModal: document.getElementById('mcpLimitSelectModal'),
  mcpBookDiversityToggleModal: document.getElementById('mcpBookDiversityToggleModal'),
  mcpWindowExpansionToggleModal: document.getElementById('mcpWindowExpansionToggleModal'),

  // Appearance Inputs
  themeCards: document.querySelectorAll('.theme-card'),
  fontFamilySelect: document.getElementById('fontFamilySelect'),
  fontSizeSlider: document.getElementById('fontSizeSlider'),
  fontSizeDisplay: document.getElementById('fontSizeDisplay'),
  fontColorPicker: document.getElementById('fontColorPicker'),
  fontColorHex: document.getElementById('fontColorHex'),
  accentColorPicker: document.getElementById('accentColorPicker'),
  accentColorHex: document.getElementById('accentColorHex'),
  resetFontColorBtn: document.getElementById('resetFontColorBtn'),
  resetAccentColorBtn: document.getElementById('resetAccentColorBtn'),

  // Toast
  toastContainer: document.getElementById('toastContainer')
};

/* ===================================================================
   INITIALIZATION
=================================================================== */

document.addEventListener('DOMContentLoaded', async () => {
  loadStateFromStorage();

  // Auto-fetch saved central API key if not yet populated
  try {
    const keyRes = await fetch('/api/settings/get-key');
    if (keyRes.ok) {
      const keyData = await keyRes.json();
      if (keyData.apiKey && !AppState.settings.apiKeys.openrouter) {
        AppState.settings.apiKeys.openrouter = keyData.apiKey;
        saveStateToStorage();
      }
    }
  } catch (e) {}

  initMarkedRenderer();
  initEventListeners();
  applySettingsToUI();

  // Load OpenRouter models dynamically
  loadDynamicModels();

  // Connect active MCP server automatically
  connectActiveMcpServer();

  // If no chats exist, generate initial welcome chat
  if (AppState.chats.length === 0) {
    createNewChat();
  } else {
    switchChat(AppState.chats[0].id);
  }

  if (window.lucide) {
    lucide.createIcons();
  }
});

/* ===================================================================
   STORAGE & PERSISTENCE
=================================================================== */

function loadStateFromStorage() {
  try {
    const savedChats = localStorage.getItem('claude_desktop_chats');
    if (savedChats) {
      AppState.chats = JSON.parse(savedChats);
    }

    const savedSettings = localStorage.getItem('claude_desktop_settings');
    if (savedSettings) {
      AppState.settings = { ...AppState.settings, ...JSON.parse(savedSettings) };
      if (!AppState.settings.mcpLimit) AppState.settings.mcpLimit = 15;
      if (AppState.settings.mcpBookDiversity === undefined) AppState.settings.mcpBookDiversity = true;
      if (AppState.settings.mcpWindowExpansion === undefined) AppState.settings.mcpWindowExpansion = true;
      // Ensure Khizanat al-Ma'arif is available
      if (AppState.settings.mcpServers && !AppState.settings.mcpServers.some(s => s.id === 'khizanat-almaarif')) {
        AppState.settings.mcpServers.unshift({
          id: 'khizanat-almaarif',
          title: 'خزانة المعارف (Khizanat al-Ma\'arif - 93 أداة شرعية ولغوية)',
          type: 'sse',
          active: true,
          config: JSON.stringify({
            "mcpServers": {
              "khizanat-almaarif": {
                "url": "https://mcp.khizanat-almaarif.com/mcp"
              }
            }
          }, null, 2)
        });
      }
    }
  } catch (e) {
    console.error('Error loading state from localStorage:', e);
  }
}

function saveStateToStorage() {
  try {
    localStorage.setItem('claude_desktop_chats', JSON.stringify(AppState.chats));
    localStorage.setItem('claude_desktop_settings', JSON.stringify(AppState.settings));
  } catch (e) {
    console.error('Error saving state to localStorage:', e);
  }
}

/* ===================================================================
   DYNAMIC MODELS LOADER & SEARCH
=================================================================== */

async function loadDynamicModels(forceRefresh = false) {
  if (DOM.modelsCountBadge) {
    DOM.modelsCountBadge.textContent = 'جاري الجلب...';
  }

  const provider = AppState.settings.provider;
  if (provider === 'openrouter') {
    const models = await AIProviderService.loadOpenRouterModels(forceRefresh);
    AppState.allModelsCache['openrouter'] = models;
    populateModelsDropdown('openrouter', AppState.settings.models['openrouter']);
  } else {
    const models = AIProviderService.PROVIDERS_CONFIG[provider]?.models || [];
    AppState.allModelsCache[provider] = models;
    populateModelsDropdown(provider, AppState.settings.models[provider]);
  }
}

function populateModelsDropdown(provider, selectedModelId, searchQuery = '') {
  DOM.modelSelect.innerHTML = '';
  const allModels = AppState.allModelsCache[provider] || AIProviderService.PROVIDERS_CONFIG[provider]?.models || [];

  const filterTerm = searchQuery.toLowerCase().trim();
  const filtered = allModels.filter(m => {
    if (!filterTerm) return true;
    return m.id.toLowerCase().includes(filterTerm) || m.name.toLowerCase().includes(filterTerm);
  });

  if (DOM.modelsCountBadge) {
    DOM.modelsCountBadge.textContent = `${filtered.length} من ${allModels.length} نموذج`;
  }

  if (filtered.length === 0) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'لا توجد نماذج مطابقة لكلمة البحث';
    opt.disabled = true;
    DOM.modelSelect.appendChild(opt);
    return;
  }

  filtered.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m.id;
    opt.textContent = m.name;
    if (m.id === selectedModelId) {
      opt.selected = true;
    }
    DOM.modelSelect.appendChild(opt);
  });
}

/* ===================================================================
   MCP SERVER AUTOMATIC CONNECT & TOOL DISCOVERY
=================================================================== */

async function connectActiveMcpServer() {
  const activeServer = AppState.settings.mcpServers.find(s => s.active);
  if (!activeServer) {
    DOM.mcpLiveStatusBadge.textContent = 'لا يوجد خادم مفعل';
    DOM.mcpToolsViewer.style.display = 'none';
    DOM.mcpCountBadge.textContent = '0';
    return;
  }

  // 1. First, check if already connected on backend to preserve active process
  try {
    const status = await AIProviderService.checkMcpStatus();
    if (status && status.connected && status.tools && status.tools.length > 0) {
      let matches = false;
      try {
        const cfg = JSON.parse(activeServer.config);
        const serverKey = cfg.mcpServers ? Object.keys(cfg.mcpServers)[0] : null;
        const s = serverKey ? cfg.mcpServers[serverKey] : cfg;
        const targetUrl = s.url;
        const targetCmd = s.command;
        if (targetUrl && status.config && status.config.url === targetUrl) {
          matches = true;
        } else if (targetCmd && status.config && status.config.command === targetCmd) {
          matches = true;
        }
      } catch(e) {}

      if (matches) {
        AppState.discoveredMcpTools = status.tools;
        const sName = status.config?.serverInfo?.title || status.config?.serverInfo?.name || activeServer.title;
        DOM.mcpLiveStatusBadge.textContent = `✓ متصل: ${sName} (${status.tools.length} أداة)`;
        DOM.mcpLiveStatusBadge.style.color = '#10B981';
        DOM.mcpCountBadge.textContent = status.tools.length;
        renderDiscoveredTools(status.tools);
        return;
      }
    }
  } catch (e) {
    console.warn('Status check before connect error:', e);
  }

  DOM.mcpLiveStatusBadge.textContent = 'جاري الاتصال...';

  try {
    const configObj = JSON.parse(activeServer.config);
    const result = await AIProviderService.connectMcpServer(configObj);

    if (result && result.tools) {
      AppState.discoveredMcpTools = result.tools;
      const sName = result.serverInfo?.title || result.serverInfo?.name || activeServer.title;
      DOM.mcpLiveStatusBadge.textContent = `✓ متصل: ${sName} (${result.tools.length} أداة)`;
      DOM.mcpLiveStatusBadge.style.color = '#10B981';
      DOM.mcpCountBadge.textContent = result.tools.length;

      // Render tools in settings viewer
      renderDiscoveredTools(result.tools);
    }
  } catch (err) {
    console.warn('Failed to auto-connect MCP server:', err);
    DOM.mcpLiveStatusBadge.textContent = `خطأ في الاتصال: ${err.message}`;
    DOM.mcpLiveStatusBadge.style.color = '#EF4444';
  }
}

function renderDiscoveredTools(tools) {
  if (!tools || tools.length === 0) {
    DOM.mcpToolsViewer.style.display = 'none';
    return;
  }

  DOM.mcpToolsViewer.style.display = 'block';
  DOM.discoveredToolsCount.textContent = tools.length;
  DOM.discoveredToolsList.innerHTML = '';

  tools.forEach(tool => {
    const item = document.createElement('div');
    item.style.padding = '8px 10px';
    item.style.background = 'var(--card-bg)';
    item.style.border = '1px solid var(--claude-border)';
    item.style.borderRadius = '6px';
    item.style.fontSize = '12px';

    item.innerHTML = `
      <div style="font-weight: 700; color: var(--accent-color); font-family: 'JetBrains Mono', monospace;">
        🔧 ${escapeHtml(tool.name)}
      </div>
      <div style="color: var(--claude-text-secondary); margin-top: 3px; font-size: 11.5px; line-height: 1.4;">
        ${escapeHtml(tool.description || 'أداة تابعة لخادم MCP')}
      </div>
    `;
    DOM.discoveredToolsList.appendChild(item);
  });
}

/* ===================================================================
   MARKDOWN & HIGHLIGHT INITIALIZATION
=================================================================== */

function initMarkedRenderer() {
  if (!window.marked) return;

  const renderer = new marked.Renderer();

  // Custom Code block renderer with language banner & copy button or rich HTML document card
  renderer.code = function(codeOrToken, language) {
    let code = codeOrToken;
    let lang = language;
    if (typeof codeOrToken === 'object' && codeOrToken !== null) {
      code = codeOrToken.text || '';
      lang = codeOrToken.lang || '';
    }
    lang = (lang || 'code').toLowerCase();

    // Check if this is an embedded HTML document or rich scholarly HTML
    const isHtmlDoc = lang === 'html' || 
                      code.includes('<!DOCTYPE') || 
                      code.includes('<html') || 
                      code.includes('<body') || 
                      (code.includes('<h2') && code.includes('<p'));

    if (isHtmlDoc) {
      // Extract title
      let docTitle = 'بحث علمي محرر (مستند منسق)';
      const titleMatch = code.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      if (titleMatch && titleMatch[1].trim()) {
        docTitle = titleMatch[1].trim();
      } else {
        const h2Match = code.match(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/i);
        if (h2Match && h2Match[1].trim()) {
          docTitle = h2Match[1].replace(/<[^>]*>/g, '').trim();
        }
      }

      // Extract body content even if cut off
      let bodyContent = code;
      const bodyStartMatch = code.match(/<body[^>]*>([\s\S]*)/i);
      if (bodyStartMatch) {
        bodyContent = bodyStartMatch[1].replace(/<\/body>[\s\S]*/i, '');
      } else {
        bodyContent = bodyContent
          .replace(/<!DOCTYPE[^>]*>/gi, '')
          .replace(/<\/?html[^>]*>/gi, '')
          .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '')
          .replace(/<\/?head>/gi, '')
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
          .replace(/<\/?body[^>]*>/gi, '');
      }

      const validLang = (typeof hljs !== 'undefined' && hljs.getLanguage('html')) ? 'html' : 'plaintext';
      let highlighted;
      try {
        highlighted = (typeof hljs !== 'undefined') ? hljs.highlight(code, { language: validLang }).value : escapeHtml(code);
      } catch {
        highlighted = escapeHtml(code);
      }

      return `
        <div class="rich-document-preview-card">
          <div class="rich-doc-header">
            <div class="rich-doc-title-box">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
              <span>${escapeHtml(docTitle)}</span>
            </div>
            <div class="rich-doc-actions">
              <button class="btn-doc-action primary" onclick="exportDocCardToPDF(this)" title="تحميل ملف PDF منسق مباشرة">
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                <span>تحميل PDF</span>
              </button>
              <button class="btn-doc-action" onclick="toggleDocView(this)" title="التبديل بين المعاينة المنسقة وعرض الكود">
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>
                <span>عرض الكود</span>
              </button>
            </div>
          </div>
          <div class="rich-doc-content-body rendered-rich-doc">
            ${bodyContent.trim()}
          </div>
          <div class="rich-doc-code-view">
            <pre>
              <div class="code-header-bar">
                <span class="code-lang-tag">html</span>
                <button class="copy-code-btn" onclick="copyCodeSnippet(this)">
                  <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                  <span>نسخ الكود</span>
                </button>
              </div>
              <code>${highlighted}</code>
            </pre>
          </div>
        </div>
      `;
    }

    const validLang = (typeof hljs !== 'undefined' && hljs.getLanguage(lang)) ? lang : 'plaintext';
    let highlighted;
    try {
      if (typeof hljs !== 'undefined') {
        highlighted = hljs.highlight(code, { language: validLang }).value;
      } else {
        highlighted = escapeHtml(code);
      }
    } catch {
      highlighted = escapeHtml(code);
    }

    return `
      <pre>
        <div class="code-header-bar">
          <span class="code-lang-tag">${lang}</span>
          <button class="copy-code-btn" onclick="copyCodeSnippet(this)">
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
            <span>نسخ الكود</span>
          </button>
        </div>
        <code>${highlighted}</code>
      </pre>
    `;
  };

  // Custom Table renderer wrapping table with export button
  renderer.table = function(header, body) {
    return `
      <div class="table-wrapper">
        <div class="table-toolbar">
          <div class="table-info-title">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v18"></path><rect width="18" height="18" x="3" y="3" rx="2"></rect><path d="M3 9h18"></path><path d="M3 15h18"></path></svg>
            <span>جدول بيانات متوافق مع إكسل</span>
          </div>
          <button class="btn-table-csv" onclick="exportSingleTableToCSV(this)" title="تحميل هذا الجدول كملف CSV">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
            <span>تصدير CSV</span>
          </button>
        </div>
        <table>
          <thead>${header}</thead>
          <tbody>${body}</tbody>
        </table>
      </div>
    `;
  };

  marked.setOptions({
    renderer: renderer,
    gfm: true,
    breaks: true,
    smartypants: true
  });
}

/* ===================================================================
   CHAT MANAGEMENT & ID GENERATION
=================================================================== */

function generateChatId() {
  const randNum1 = Math.floor(1000 + Math.random() * 9000);
  const randNum2 = Math.floor(10 + Math.random() * 90);
  return `CL-${randNum1}-${randNum2}`;
}

function createNewChat() {
  const newId = generateChatId();
  const newChat = {
    id: newId,
    title: 'محادثة جديدة',
    createdAt: new Date().toISOString(),
    messages: []
  };

  AppState.chats.unshift(newChat);
  AppState.currentChatId = newId;
  saveStateToStorage();

  renderSidebarChats();
  renderCurrentChat();
  DOM.chatTextarea.focus();
  showToast(`تم إنشاء محادثة جديدة رقم #${newId}`, 'info');
}

function switchChat(chatId) {
  AppState.currentChatId = chatId;
  renderSidebarChats();
  renderCurrentChat();

  if (window.innerWidth <= 768) {
    DOM.sidebar.classList.remove('open');
  }
}

function deleteChat(chatId, event) {
  if (event) event.stopPropagation();

  const confirmDelete = confirm('هل أنت متأكد من رغبتك في حذف هذه المحادثة؟');
  if (!confirmDelete) return;

  AppState.chats = AppState.chats.filter(c => c.id !== chatId);
  
  if (AppState.currentChatId === chatId) {
    if (AppState.chats.length > 0) {
      AppState.currentChatId = AppState.chats[0].id;
    } else {
      createNewChat();
      return;
    }
  }

  saveStateToStorage();
  renderSidebarChats();
  renderCurrentChat();
  showToast('تم حذف المحادثة', 'info');
}

function renameChat(chatId, event) {
  if (event) event.stopPropagation();

  const chat = AppState.chats.find(c => c.id === chatId);
  if (!chat) return;

  const newTitle = prompt('أدخل عنواناً جديداً للمحادثة:', chat.title);
  if (newTitle && newTitle.trim() !== '') {
    chat.title = newTitle.trim();
    saveStateToStorage();
    renderSidebarChats();
    if (AppState.currentChatId === chatId) {
      DOM.currentChatTitle.textContent = chat.title;
    }
    showToast('تم تعديل عنوان المحادثة', 'success');
  }
}

function getCurrentChat() {
  if (!AppState.currentChatId && AppState.chats && AppState.chats.length > 0) {
    AppState.currentChatId = AppState.chats[0].id;
  }
  let chat = AppState.chats.find(c => c.id === AppState.currentChatId);
  if (!chat && AppState.chats && AppState.chats.length > 0) {
    chat = AppState.chats[0];
    AppState.currentChatId = chat.id;
  }
  return chat;
}

/* ===================================================================
   RENDERING FUNCTIONS
=================================================================== */

function renderSidebarChats(searchTerm = '') {
  DOM.chatList.innerHTML = '';

  const filteredChats = AppState.chats.filter(chat => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    const matchTitle = chat.title.toLowerCase().includes(term);
    const matchId = chat.id.toLowerCase().includes(term);
    const matchMessages = chat.messages.some(m => m.content.toLowerCase().includes(term));
    return matchTitle || matchId || matchMessages;
  });

  if (filteredChats.length === 0) {
    DOM.chatList.innerHTML = `
      <div style="text-align: center; padding: 20px; font-size: 12px; color: var(--claude-text-muted);">
        لا توجد محادثات سابقة
      </div>
    `;
    return;
  }

  filteredChats.forEach(chat => {
    const li = document.createElement('li');
    li.className = `chat-item ${chat.id === AppState.currentChatId ? 'active' : ''}`;
    li.onclick = () => switchChat(chat.id);

    li.innerHTML = `
      <div class="chat-item-main">
        <div class="chat-item-title">${escapeHtml(chat.title)}</div>
        <div class="chat-item-meta">
          <span class="chat-item-id-badge">#${chat.id}</span>
          <span>• ${formatTimeAgo(chat.createdAt)}</span>
        </div>
      </div>
      <div class="chat-item-actions">
        <button class="chat-action-btn" title="إعادة تسمية" onclick="renameChat('${chat.id}', event)">
          <i data-lucide="edit-2" style="width: 13px; height: 13px;"></i>
        </button>
        <button class="chat-action-btn delete" title="حذف" onclick="deleteChat('${chat.id}', event)">
          <i data-lucide="trash-2" style="width: 13px; height: 13px;"></i>
        </button>
      </div>
    `;

    DOM.chatList.appendChild(li);
  });

  if (window.lucide) lucide.createIcons();
}

function renderCurrentChat() {
  const chat = getCurrentChat();
  if (!chat) return;

  DOM.currentChatIdText.textContent = `#${chat.id}`;
  DOM.currentChatTitle.textContent = chat.title;

  if (chat.messages.length === 0) {
    DOM.welcomeScreen.style.display = 'flex';
    DOM.messagesList.innerHTML = '';
  } else {
    DOM.welcomeScreen.style.display = 'none';
    DOM.messagesList.innerHTML = '';

    chat.messages.forEach((msg, index) => {
      appendMessageToDOM(msg, index);
    });

    scrollToBottom();
  }

  if (window.lucide) lucide.createIcons();
}

function appendMessageToDOM(message, index) {
  const isAssistant = message.role === 'assistant';
  const wrapper = document.createElement('div');
  wrapper.className = `message-wrapper ${message.role}`;
  wrapper.id = `msg-${index}`;

  const avatarContent = isAssistant ? `
    <div class="msg-avatar claude-avatar">
      <svg viewBox="0 0 100 100" width="20" height="20" fill="currentColor">
        <path d="M50 18 C50 35, 65 50, 82 50 C65 50, 50 65, 50 82 C50 65, 35 50, 18 50 C35 50, 50 35, 50 18 Z"/>
      </svg>
    </div>
  ` : `
    <div class="msg-avatar user-avatar">
      <i data-lucide="user" style="width: 16px; height: 16px;"></i>
    </div>
  `;

  // Render Assistant Models Consultations Banner if present!
  let assistantsBannerHtml = '';
  if (message.assistantConsultations && message.assistantConsultations.length > 0) {
    const astCount = message.assistantConsultations.length;
    assistantsBannerHtml = `
      <div class="assistant-consultations-banner" style="margin-bottom: 12px; background: rgba(37, 99, 235, 0.06); border: 1px solid rgba(59, 130, 246, 0.35); border-radius: 9px; overflow: hidden;">
        <div onclick="toggleAstReportsAccordion(${index})" style="display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; cursor: pointer; background: rgba(37, 99, 235, 0.08); user-select: none;">
          <div style="font-size: 13px; font-weight: 700; color: #2563eb; display: flex; align-items: center; gap: 8px;">
            <i data-lucide="users" style="width: 16px; height: 16px;"></i>
            <span>🤝 تم استنطاق والاستعانة بـ (${astCount}) نماذج مساعدة متخصصة بنجاح:</span>
          </div>
          <div style="display: flex; align-items: center; gap: 6px; font-size: 12px; color: #3b82f6; font-weight: 600;">
            <span id="ast-reports-label-${index}">عرض تقارير النماذج المساعدة ▾</span>
          </div>
        </div>
        <div id="ast-reports-container-${index}" style="display: none; padding: 12px 14px; border-top: 1px solid rgba(59, 130, 246, 0.2); background: var(--card-bg, #ffffff);">
          <div style="font-size: 12px; color: var(--claude-text-muted); margin-bottom: 10px;">
            استعان النموذج المشرف بتقارير النماذج المساعدة التالية واستوعب استخلاصاتها ونصوص الشاملة في جوابه التحريري:
          </div>
          <div style="display: flex; flex-direction: column; gap: 10px;">
            ${message.assistantConsultations.map((ast) => `
              <div style="border: 1px solid var(--claude-border, #e2e8f0); border-radius: 8px; padding: 10px 12px; background: var(--bg-secondary, #f8fafc);">
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; border-bottom: 1px dashed var(--claude-border, #e2e8f0); padding-bottom: 6px;">
                  <div style="font-size: 13px; font-weight: 700; color: var(--claude-text-primary, #0f172a); display: flex; align-items: center; gap: 6px;">
                    <span>🎙️ ${escapeHtml(ast.name || 'نموذج مساعد')}</span>
                  </div>
                  <span style="font-size: 11px; padding: 2px 7px; background: rgba(37, 99, 235, 0.1); color: #2563eb; border-radius: 12px; font-weight: 600;">
                    ${escapeHtml(ast.role || 'خبير تخصصي')}
                  </span>
                </div>
                <div style="font-size: 12px; line-height: 1.6; color: var(--claude-text-primary, #334155); white-space: pre-wrap; max-height: 250px; overflow-y: auto;">${escapeHtml(ast.report || '')}</div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;
  }

  // Render Tool Invocations Banner if present!
  let toolBannerHtml = '';
  if (message.toolInvocations && message.toolInvocations.length > 0) {
    toolBannerHtml = `
      <div style="margin-bottom: 12px; background: rgba(218, 119, 86, 0.08); border: 1px solid var(--claude-coral); border-radius: 8px; padding: 10px 14px;">
        <div style="font-size: 12.5px; font-weight: 700; color: var(--accent-color); display: flex; align-items: center; gap: 6px;">
          <i data-lucide="cable" style="width: 14px; height: 14px;"></i>
          <span>تم استدعاء أدوات خادم الشاملة MCP بنجاح (${message.toolInvocations.length} أداة):</span>
        </div>
        <div style="display: flex; flex-direction: column; gap: 4px; margin-top: 6px;">
          ${message.toolInvocations.map(t => `
            <div style="font-size: 11.5px; font-family: 'JetBrains Mono', monospace; color: var(--claude-text-primary); background: var(--card-bg); padding: 4px 8px; border-radius: 4px; border: 1px solid var(--claude-border);">
              ⚡ <strong>${escapeHtml(t.name)}</strong>: ${escapeHtml(JSON.stringify(t.arguments || {}))}
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  const safeContent = (message.content != null) ? String(message.content) : '';
  const renderedContent = isAssistant 
    ? (window.marked ? marked.parse(safeContent) : escapeHtml(safeContent))
    : escapeHtml(safeContent).replace(/\n/g, '<br>');

  const hasTable = safeContent.includes('|') && isAssistant;

  const actionsBar = isAssistant ? `
    <div class="msg-actions-bar">
      <button class="msg-action-btn pdf-btn" onclick="exportResponseToPDF(${index})" title="تحميل هذه الإجابة فوراً كملف PDF عالي الدقة">
        <i data-lucide="file-text"></i>
        <span>تصدير PDF</span>
      </button>

      <button class="msg-action-btn" onclick="openPdfDesignerForMsg(${index})" title="تخصيص القالب والخطوط والمعاينة الحية">
        <i data-lucide="palette"></i>
        <span>تخصيص القالب</span>
      </button>

      ${hasTable ? `
        <button class="msg-action-btn csv-btn" onclick="exportResponseToCSV(${index})" title="تحويل جداول هذه الإجابة إلى CSV">
          <i data-lucide="sheet"></i>
          <span>تصدير CSV</span>
        </button>
      ` : ''}

      <button class="msg-action-btn" onclick="copyMessageMarkdown(${index})" title="نسخ نص الإجابة كـ Markdown">
        <i data-lucide="copy"></i>
        <span>نسخ</span>
      </button>

      <button class="msg-action-btn continue-btn" id="continue-btn-${index}" onclick="continueResponse(${index})" title="متابعة وإكمال الإجابة من حيث توقفت">
        <i data-lucide="play"></i>
        <span>إكمال الإجابة</span>
      </button>

      <button class="msg-action-btn" onclick="regenerateMessage(${index})" title="إعادة التوليد">
        <i data-lucide="rotate-cw"></i>
        <span>إعادة توليد</span>
      </button>
    </div>
  ` : '';

  wrapper.innerHTML = `
    ${avatarContent}
    <div class="msg-content-wrapper">
      <div class="msg-header-info">
        <span class="msg-sender-name">${isAssistant ? 'Claude' : 'أنت'}</span>
        <span>• ${message.timestamp ? formatTime(message.timestamp) : ''}</span>
      </div>
      ${assistantsBannerHtml}
      ${toolBannerHtml}
      <div class="msg-bubble" id="bubble-${index}">
        ${renderedContent}
      </div>
      ${actionsBar}
    </div>
  `;

  DOM.messagesList.appendChild(wrapper);
}

window.toggleAstReportsAccordion = function(index) {
  const container = document.getElementById(`ast-reports-container-${index}`);
  const label = document.getElementById(`ast-reports-label-${index}`);
  if (!container) return;
  const isHidden = container.style.display === 'none';
  container.style.display = isHidden ? 'block' : 'none';
  if (label) {
    label.textContent = isHidden ? 'إخفاء تقارير النماذج المساعدة ▴' : 'عرض تقارير النماذج المساعدة ▾';
  }
};

function scrollToBottom() {
  setTimeout(() => {
    DOM.messagesContainer.scrollTop = DOM.messagesContainer.scrollHeight;
  }, 50);
}

/* ===================================================================
   MESSAGE SENDING & AI GENERATION
=================================================================== */

async function handleSendMessage() {
  const text = DOM.chatTextarea.value.trim();
  if (!text || AppState.isGenerating) return;

  const chat = getCurrentChat();
  if (!chat) return;

  const lowerText = text.toLowerCase();
  
  // Smart conversational export detection: if user types "حول النتيجة الى pdf" etc.
  const isPdfRequest = (lowerText.includes('pdf') || lowerText.includes('بي دي اف')) && 
                        (lowerText.includes('حول') || lowerText.includes('تصدير') || lowerText.includes('حفظ') || lowerText.includes('ملف') || lowerText.includes('طباعة') || lowerText.includes('تنزيل'));
  
  const isCsvRequest = (lowerText.includes('csv') || lowerText.includes('إكسل') || lowerText.includes('اكسل') || lowerText.includes('جدول')) && 
                        (lowerText.includes('حول') || lowerText.includes('تصدير') || lowerText.includes('حفظ') || lowerText.includes('تنزيل'));

  const isContinueRequest = /^(أكمل|اكمل|تابع|واصل|أكمل الإجابة|اكمل البحث|تابع البحث|متابعة|إكمال)$/i.test(text.trim());

  if (isContinueRequest) {
    let lastAssistantIdx = -1;
    for (let i = chat.messages.length - 1; i >= 0; i--) {
      if (chat.messages[i].role === 'assistant') {
        lastAssistantIdx = i;
        break;
      }
    }
    if (lastAssistantIdx !== -1) {
      DOM.chatTextarea.value = '';
      DOM.chatTextarea.style.height = 'auto';
      continueResponse(lastAssistantIdx);
      return;
    }
  }

  if (isPdfRequest) {
    let lastAssistantIdx = -1;
    for (let i = chat.messages.length - 1; i >= 0; i--) {
      if (chat.messages[i].role === 'assistant') {
        lastAssistantIdx = i;
        break;
      }
    }

    chat.messages.push({
      role: 'user',
      content: text,
      timestamp: new Date().toISOString()
    });

    if (lastAssistantIdx !== -1) {
      chat.messages.push({
        role: 'assistant',
        content: `### 📄 جاري تصدير النتيجة إلى ملف PDF منسق...

تم تجهيز البحث الأصولي، وبدأ المتصفح بتحميل ملف **PDF** المنسق فوراً على جهازك.

> **💡 ملاحظة:** يمكنك أيضاً الضغط في أي وقت على زر **«تصدير PDF»** الموجود مباشرة في شريط الأدوات أسفل أي إجابة!`,
        timestamp: new Date().toISOString()
      });
      DOM.chatTextarea.value = '';
      DOM.chatTextarea.style.height = 'auto';
      saveStateToStorage();
      renderCurrentChat();
      setTimeout(() => {
        exportResponseToPDF(lastAssistantIdx);
      }, 350);
      return;
    }
  }

  if (isCsvRequest) {
    let lastAssistantIdx = -1;
    for (let i = chat.messages.length - 1; i >= 0; i--) {
      if (chat.messages[i].role === 'assistant') {
        lastAssistantIdx = i;
        break;
      }
    }
    chat.messages.push({
      role: 'user',
      content: text,
      timestamp: new Date().toISOString()
    });
    chat.messages.push({
      role: 'assistant',
      content: `### 📊 جاري تصدير الجداول إلى ملف CSV...

تم استخراج جداول البيانات وتنزيلها كملف **CSV** متوافق مع Excel باللغة العربية.`,
      timestamp: new Date().toISOString()
    });
    DOM.chatTextarea.value = '';
    DOM.chatTextarea.style.height = 'auto';
    saveStateToStorage();
    renderCurrentChat();
    setTimeout(() => {
      if (lastAssistantIdx !== -1) {
        exportResponseToCSV(lastAssistantIdx);
      } else {
        exportChatTables();
      }
    }, 350);
    return;
  }

  const userMsg = {
    role: 'user',
    content: text + (AppState.activeAttachment ? `\n\n[مرفق: ${AppState.activeAttachment.name}]\n\`\`\`\n${AppState.activeAttachment.content}\n\`\`\`` : ''),
    timestamp: new Date().toISOString()
  };

  chat.messages.push(userMsg);

  if (chat.messages.length === 1) {
    chat.title = text.slice(0, 38) + (text.length > 38 ? '...' : '');
    DOM.currentChatTitle.textContent = chat.title;
  }

  DOM.chatTextarea.value = '';
  DOM.chatTextarea.style.height = 'auto';
  clearAttachment();
  DOM.tokenEstimate.textContent = '0 كلمة';

  saveStateToStorage();
  renderSidebarChats();
  renderCurrentChat();

  const assistantMsgIndex = chat.messages.length;
  chat.messages.push({
    role: 'assistant',
    content: 'جاري التفكير والتواصل مع خادم الأدوات...',
    timestamp: new Date().toISOString()
  });
  renderCurrentChat();

  setGenerationState(true);

  try {
    const provider = AppState.settings.provider;
    const apiKey = AppState.settings.apiKeys[provider];
    const model = AppState.settings.models[provider];

    const result = await AIProviderService.sendMessage({
      provider: provider,
      apiKey: apiKey,
      model: model,
      messages: chat.messages.slice(0, -1),
      systemPrompt: AppState.settings.systemPrompt,
      temperature: AppState.settings.temperature,
      enableMcp: AppState.settings.enableMcp,
      mcpLimit: AppState.settings.mcpLimit || 15,
      mcpBookDiversity: AppState.settings.mcpBookDiversity !== false,
      mcpWindowExpansion: AppState.settings.mcpWindowExpansion !== false,
      enableRag: AppState.settings.enableRag,
      ragAgentId: AppState.settings.ragAgentId,
      ragAgentIds: AppState.settings.selectedRagAgentIds || []
    });

    chat.messages[assistantMsgIndex].content = result.content;
    chat.messages[assistantMsgIndex].toolInvocations = result.toolInvocations || [];
    chat.messages[assistantMsgIndex].assistantConsultations = result.assistantConsultations || [];
    saveStateToStorage();
    renderCurrentChat();
  } catch (error) {
    console.error('Error generating AI response:', error);
    chat.messages[assistantMsgIndex].content = `⚠️ عذراً، تعذر استلام الرد: ${error.message}`;
    saveStateToStorage();
    renderCurrentChat();
    showToast('حدث خطأ أثناء الاتصال بمزود الخدمة', 'error');
  } finally {
    setGenerationState(false);
  }
}

function setGenerationState(isGenerating) {
  AppState.isGenerating = isGenerating;
  DOM.sendBtn.disabled = isGenerating;
  if (isGenerating) {
    DOM.sendIcon.setAttribute('data-lucide', 'loader-2');
    DOM.sendBtn.classList.add('spinning');
  } else {
    DOM.sendIcon.setAttribute('data-lucide', 'arrow-up');
    DOM.sendBtn.classList.remove('spinning');
  }
  if (window.lucide) lucide.createIcons();
}

async function regenerateMessage(index) {
  const chat = getCurrentChat();
  if (!chat || AppState.isGenerating) return;

  const userMsgIndex = index - 1;
  if (userMsgIndex < 0 || chat.messages[userMsgIndex].role !== 'user') return;

  chat.messages = chat.messages.slice(0, userMsgIndex + 1);
  saveStateToStorage();
  renderCurrentChat();

  const lastUserText = chat.messages[userMsgIndex].content;
  chat.messages.pop();
  DOM.chatTextarea.value = lastUserText;
  handleSendMessage();
}

async function continueResponse(index) {
  const chat = getCurrentChat();
  if (!chat || !chat.messages[index] || AppState.isGenerating) return;

  const targetMsg = chat.messages[index];
  if (targetMsg.role !== 'assistant') return;

  const btn = document.getElementById(`continue-btn-${index}`);
  const originalBtnHtml = btn ? btn.innerHTML : '';
  
  // Transform the button into an animated spinning loader
  if (btn) {
    btn.classList.add('loading');
    btn.disabled = true;
    btn.innerHTML = `
      <svg class="btn-spinner" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5">
        <path d="M21 12a9 9 0 1 1-6.219-8.56"></path>
      </svg>
      <span>جاري الإكمال...</span>
    `;
  }

  // Also append an inline live indicator inside the bubble so user sees progress
  const bubble = document.getElementById(`bubble-${index}`);
  let indicator = null;
  if (bubble) {
    indicator = document.createElement('div');
    indicator.className = 'continuation-indicator';
    indicator.id = `cont-indicator-${index}`;
    indicator.innerHTML = `
      <svg class="btn-spinner" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5">
        <path d="M21 12a9 9 0 1 1-6.219-8.56"></path>
      </svg>
      <span>جاري معالجة وتكملة البحث الأصولي من حيث توقف مباشرة...</span>
    `;
    bubble.appendChild(indicator);
    scrollToBottom();
  }

  showToast('جاري استكمال وتتمة البحث العلمي من حيث توقف...', 'info');
  setGenerationState(true);

  try {
    const provider = AppState.settings.provider;
    const apiKey = AppState.settings.apiKeys[provider];
    const model = AppState.settings.models[provider];

    const messagesToSend = chat.messages.slice(0, index + 1).map(m => ({ role: m.role, content: m.content }));
    messagesToSend.push({
      role: 'user',
      content: 'تابع وأكمل البحث الأصولي من حيث توقفت مباشرة دون تكرار ما سبق (أكمل بقية القواعد الأصولية، ثم الترجيح، وخاتمة المسألة، وفهرس المراجع الموثقة).'
    });

    const result = await AIProviderService.sendMessage({
      provider,
      apiKey,
      model,
      messages: messagesToSend,
      systemPrompt: AppState.settings.systemPrompt,
      temperature: AppState.settings.temperature,
      enableMcp: false
    });

    if (result && result.content) {
      targetMsg.content = targetMsg.content + "\n\n" + result.content.trim();
      saveStateToStorage();
      renderCurrentChat();
      showToast('تم استكمال وتتمة البحث الأصولي بنجاح! 🎉', 'success');
    }
  } catch (err) {
    console.error('Continuation error:', err);
    showToast(`تعذر إكمال الرد: ${err.message}`, 'error');
    if (indicator) indicator.remove();
    if (btn) {
      btn.classList.remove('loading');
      btn.disabled = false;
      btn.innerHTML = originalBtnHtml;
      if (window.lucide) lucide.createIcons();
    }
  } finally {
    setGenerationState(false);
  }
}
window.continueResponse = continueResponse;

/* ===================================================================
   EXPORT ENGINE BRIDGES (PDF & CSV)
=================================================================== */

function exportResponseToPDF(index) {
  try {
    const chat = getCurrentChat();
    if (!chat || !chat.messages || !chat.messages[index]) {
      console.warn('exportResponseToPDF: chat or message not found at index', index);
      if (window.showToast) showToast('لم يتم العثور على الإجابة لتصديرها', 'error');
      return;
    }

    const bubbleElement = document.getElementById(`bubble-${index}`);
    let htmlContent = '';
    if (bubbleElement) {
      htmlContent = bubbleElement.innerHTML;
    } else {
      const msg = chat.messages[index];
      const safeMsg = (msg.content != null) ? String(msg.content) : '';
      htmlContent = window.marked ? marked.parse(safeMsg) : escapeHtml(safeMsg);
    }

    const provider = AppState.settings?.provider || 'claude';
    const modelName = AppState.settings?.models?.[provider] || AppState.settings?.model || provider;

    ExportEngine.exportToPDF({
      title: chat.title,
      subtitle: `تحرير علمي موثق — خزانة المعارف والمكتبة الشاملة`,
      meta: `الموديل: ${modelName}`,
      htmlContent: htmlContent,
      filename: `Claude-${chat.id}-Response-${index + 1}.pdf`
    });
  } catch (err) {
    console.error('Error in exportResponseToPDF:', err);
    if (window.showToast) showToast('حدث خطأ أثناء تصدير PDF: ' + err.message, 'error');
  }
}

function openPdfDesignerForMsg(index) {
  try {
    const chat = getCurrentChat();
    if (!chat || !chat.messages || !chat.messages[index]) {
      if (window.showToast) showToast('لم يتم العثور على الإجابة لتخصيص قالبها', 'error');
      return;
    }

    const bubbleElement = document.getElementById(`bubble-${index}`);
    let htmlContent = '';
    if (bubbleElement) {
      htmlContent = bubbleElement.innerHTML;
    } else {
      const msg = chat.messages[index];
      const safeMsg = (msg.content != null) ? String(msg.content) : '';
      htmlContent = window.marked ? marked.parse(safeMsg) : escapeHtml(safeMsg);
    }

    const provider = AppState.settings?.provider || 'claude';
    const modelName = AppState.settings?.models?.[provider] || AppState.settings?.model || provider;

    ExportEngine.openPdfDesigner({
      title: chat.title,
      subtitle: `تحرير علمي موثق — خزانة المعارف والمكتبة الشاملة`,
      meta: `الموديل: ${modelName}`,
      htmlContent: htmlContent,
      filename: `Claude-${chat.id}-Response-${index + 1}.pdf`
    });
  } catch (err) {
    console.error('Error in openPdfDesignerForMsg:', err);
    if (window.showToast) showToast('حدث خطأ أثناء فتح مصمم القالب: ' + err.message, 'error');
  }
}
window.openPdfDesignerForMsg = openPdfDesignerForMsg;

function exportChatToPDF() {
  try {
    const chat = getCurrentChat();
    if (!chat || !chat.messages || chat.messages.length === 0) {
      if (window.showToast) showToast('المحادثة فارغة، لا يوجد ما يتم تصديره', 'error');
      return;
    }

    let fullHtml = '';
    chat.messages.forEach(msg => {
      const isAssistant = msg.role === 'assistant';
      const roleTitle = isAssistant ? 'Claude (كلاود)' : 'المستخدم';
      const safeMsg = (msg.content != null) ? String(msg.content) : '';
      const content = isAssistant ? (window.marked ? marked.parse(safeMsg) : escapeHtml(safeMsg)) : escapeHtml(safeMsg).replace(/\n/g, '<br>');
      fullHtml += `
        <div style="margin-bottom: 24px; padding: 14px; border: 1px solid #E8E4DC; border-radius: 8px; background: ${isAssistant ? '#FAF9F5' : '#FFFFFF'};">
          <div style="font-weight: 700; color: #8E3A24; margin-bottom: 8px; font-size: 13px;">${roleTitle}</div>
          <div>${content}</div>
        </div>
      `;
    });

    ExportEngine.exportToPDF({
      title: chat.title,
      subtitle: `سجل المحادثة الكامل — #${chat.id}`,
      meta: `إجمالي الرسائل: ${chat.messages.length}`,
      htmlContent: fullHtml,
      filename: `Claude-FullChat-${chat.id}.pdf`
    });
  } catch (err) {
    console.error('Error in exportChatToPDF:', err);
    if (window.showToast) showToast('تعذر تصدير المحادثة: ' + err.message, 'error');
  }
}

function exportResponseToCSV(index) {
  const bubbleElement = document.getElementById(`bubble-${index}`);
  if (!bubbleElement) return;

  const chat = getCurrentChat();
  const success = ExportEngine.exportMessageTablesToCSV(
    bubbleElement, 
    `Claude-Table-${chat ? chat.id : 'export'}-msg${index + 1}.csv`
  );

  if (success) {
    showToast('تم تصدير الجدول إلى ملف CSV بنجاح!', 'success');
  } else {
    showToast('لم يتم العثور على جداول في هذه الإجابة', 'error');
  }
}

window.exportResponseToPDF = exportResponseToPDF;
window.exportChatToPDF = exportChatToPDF;
window.exportResponseToCSV = exportResponseToCSV;

window.exportSingleTableToCSV = function(buttonElement) {
  const tableWrapper = buttonElement.closest('.table-wrapper');
  if (!tableWrapper) return;
  const table = tableWrapper.querySelector('table');
  if (!table) return;

  const csv = ExportEngine.tableToCSV(table);
  const chat = getCurrentChat();
  ExportEngine.downloadCSV(csv, `Claude-Table-${chat ? chat.id : 'export'}.csv`);
  showToast('تم تنزيل الجدول كملف CSV لـ Excel!', 'success');
};

function exportChatTables() {
  const chat = getCurrentChat();
  if (!chat || chat.messages.length === 0) {
    showToast('المحادثة فارغة', 'error');
    return;
  }

  const result = ExportEngine.exportChatTablesToCSV(chat);
  if (result.success) {
    if (result.isStructuredData) {
      showToast('تم تصدير بيانات سجل المحادثة إلى ملف CSV', 'info');
    } else {
      showToast(`تم استخراج وتصدير ${result.count} جداول إلى CSV بنجاح!`, 'success');
    }
  }
}

function copyMessageMarkdown(index) {
  const chat = getCurrentChat();
  if (!chat || !chat.messages[index]) return;

  navigator.clipboard.writeText(chat.messages[index].content).then(() => {
    showToast('تم نسخ نص الرد (Markdown) إلى الحافظة', 'success');
  });
}

window.copyCodeSnippet = function(buttonElement) {
  const pre = buttonElement.closest('pre');
  if (!pre) return;
  const code = pre.querySelector('code');
  if (!code) return;

  navigator.clipboard.writeText(code.innerText).then(() => {
    const span = buttonElement.querySelector('span');
    const originalText = span.textContent;
    span.textContent = 'تم النسخ!';
    setTimeout(() => {
      span.textContent = originalText;
    }, 1800);
  });
};

window.toggleDocView = function(btn) {
  const card = btn.closest('.rich-document-preview-card');
  if (!card) return;
  const contentBody = card.querySelector('.rich-doc-content-body');
  const codeView = card.querySelector('.rich-doc-code-view');
  const btnSpan = btn.querySelector('span');

  const isHidden = window.getComputedStyle(contentBody).display === 'none';
  if (isHidden) {
    contentBody.style.display = 'block';
    codeView.style.display = 'none';
    if (btnSpan) btnSpan.textContent = 'عرض الكود';
  } else {
    contentBody.style.display = 'none';
    codeView.style.display = 'block';
    if (btnSpan) btnSpan.textContent = 'معاينة المستند';
  }
};

window.exportDocCardToPDF = function(btn) {
  const card = btn.closest('.rich-document-preview-card');
  if (!card) return;
  const contentBody = card.querySelector('.rich-doc-content-body');
  const titleSpan = card.querySelector('.rich-doc-title-box span');
  const docTitle = titleSpan ? titleSpan.textContent.trim() : 'بحث علمي محرر';

  showToast('جاري إنشاء وتنسيق ملف PDF عالي الجودة...', 'info');

  ExportEngine.exportToPDF({
    title: docTitle,
    subtitle: 'مستند بحثي محرر — المكتبة الشاملة والذكاء الاصطناعي',
    meta: `تنسيق: الخط الأميري التراثي | تم التصدير: ${new Date().toLocaleDateString('ar-EG')}`,
    htmlContent: contentBody.innerHTML,
    filename: `${docTitle.replace(/[^\w\u0600-\u06FF\s-]/g, '').trim().replace(/\s+/g, '_')}.pdf`
  }).then(() => {
    showToast('تم تصدير ملف PDF بنجاح! 🎉', 'success');
  }).catch(err => {
    console.error('PDF export error:', err);
    showToast('حدث خطأ أثناء تصدير PDF', 'error');
  });
};

/* ===================================================================
   SETTINGS & CUSTOMIZATION ENGINE
=================================================================== */

function applySettingsToUI() {
  const s = AppState.settings;

  document.documentElement.setAttribute('data-theme', s.theme);
  document.documentElement.style.setProperty('--user-font-family', s.fontFamily);
  document.documentElement.style.setProperty('--user-font-size', `${s.fontSize}px`);
  document.documentElement.style.setProperty('--user-font-color', s.fontColor);
  document.documentElement.style.setProperty('--accent-color', s.accentColor);
  document.documentElement.style.setProperty('--accent-hover', s.accentColor);

  if (s.theme === 'claude-dark') {
    DOM.themeIcon.setAttribute('data-lucide', 'moon');
  } else {
    DOM.themeIcon.setAttribute('data-lucide', 'sun');
  }

  const activeModelId = s.models[s.provider];
  DOM.headerModelName.textContent = activeModelId;
  DOM.currentModelDisplay.textContent = activeModelId;
  DOM.currentProviderDisplay.textContent = AIProviderService.PROVIDERS_CONFIG[s.provider]?.name || s.provider;

  syncModalInputs();

  if (window.lucide) lucide.createIcons();
}

function syncModalInputs() {
  const s = AppState.settings;

  DOM.providerRadioCards.forEach(card => {
    const p = card.getAttribute('data-provider');
    if (p === s.provider) {
      card.classList.add('active');
    } else {
      card.classList.remove('active');
    }
  });

  DOM.apiKeyInput.value = s.apiKeys[s.provider] || '';
  populateModelsDropdown(s.provider, s.models[s.provider], DOM.modelSearchInput ? DOM.modelSearchInput.value : '');

  DOM.systemPromptInput.value = s.systemPrompt;
  DOM.temperatureInput.value = s.temperature;
  DOM.tempValueDisplay.textContent = s.temperature;
  if (DOM.enableMcpCheckbox) {
    DOM.enableMcpCheckbox.checked = s.enableMcp !== false;
  }

  // Sync MCP Deep Retrieval Settings
  const curLimit = s.mcpLimit || 15;
  if (DOM.mcpLimitSelectPopover) DOM.mcpLimitSelectPopover.value = String(curLimit);
  if (DOM.mcpLimitSelectModal) DOM.mcpLimitSelectModal.value = String(curLimit);
  if (DOM.mcpLimitPopoverBadge) DOM.mcpLimitPopoverBadge.textContent = `${curLimit} نصاً`;

  const curDiversity = (s.mcpBookDiversity !== false);
  if (DOM.mcpBookDiversityTogglePopover) DOM.mcpBookDiversityTogglePopover.checked = curDiversity;
  if (DOM.mcpBookDiversityToggleModal) DOM.mcpBookDiversityToggleModal.checked = curDiversity;

  const curExpansion = (s.mcpWindowExpansion !== false);
  if (DOM.mcpWindowExpansionTogglePopover) DOM.mcpWindowExpansionTogglePopover.checked = curExpansion;
  if (DOM.mcpWindowExpansionToggleModal) DOM.mcpWindowExpansionToggleModal.checked = curExpansion;

  DOM.themeCards.forEach(card => {
    if (card.getAttribute('data-theme-id') === s.theme) {
      card.classList.add('active');
    } else {
      card.classList.remove('active');
    }
  });

  DOM.fontFamilySelect.value = s.fontFamily;
  DOM.fontSizeSlider.value = s.fontSize;
  DOM.fontSizeDisplay.textContent = `${s.fontSize}px`;
  DOM.fontColorPicker.value = s.fontColor;
  DOM.fontColorHex.textContent = s.fontColor;
  DOM.accentColorPicker.value = s.accentColor;
  DOM.accentColorHex.textContent = s.accentColor;

  renderMcpServersList();
}

function toggleThemeQuick() {
  if (AppState.settings.theme === 'claude-dark') {
    AppState.settings.theme = 'claude-warm';
  } else {
    AppState.settings.theme = 'claude-dark';
  }
  saveStateToStorage();
  applySettingsToUI();
  showToast(`تم التبديل إلى: ${AppState.settings.theme === 'claude-dark' ? 'النمط الليلي' : 'النمط الرملي الفاتح'}`, 'info');
}

/* ===================================================================
   MCP SERVER MANAGEMENT
=================================================================== */

function renderMcpServersList() {
  DOM.mcpServersGrid.innerHTML = '';
  
  if (AppState.settings.mcpServers.length === 0) {
    DOM.mcpServersGrid.innerHTML = `
      <div style="font-size: 13px; color: var(--claude-text-muted); text-align: center; padding: 12px;">
        لا توجد خوادم MCP مضافة حالياً. اختر قالباً أو أضف خادماً جديداً أعلاه.
      </div>
    `;
    return;
  }

  AppState.settings.mcpServers.forEach(server => {
    const item = document.createElement('div');
    item.className = 'mcp-server-item';
    item.innerHTML = `
      <div class="mcp-item-info">
        <span class="mcp-status-indicator ${server.active ? '' : 'inactive'}" title="${server.active ? 'نشط ومتصل' : 'معطل'}"></span>
        <div>
          <div class="mcp-item-name">${escapeHtml(server.title)}</div>
          <div class="mcp-item-type">${server.type} • ${server.active ? 'مفعل ومتصل' : 'متوقف'}</div>
        </div>
      </div>
      <div class="mcp-item-actions">
        <button class="btn-micro" onclick="toggleMcpServer('${server.id}')">
          ${server.active ? 'تعطيل' : 'تفعيل والاتصال'}
        </button>
        <button class="btn-micro" onclick="deleteMcpServer('${server.id}')" style="color: #EF4444;">
          حذف
        </button>
      </div>
    `;
    DOM.mcpServersGrid.appendChild(item);
  });
}

window.toggleMcpServer = async function(serverId) {
  const server = AppState.settings.mcpServers.find(s => s.id === serverId);
  if (server) {
    const willBeActive = !server.active;
    if (willBeActive) {
      AppState.settings.mcpServers.forEach(s => s.active = false);
    }
    server.active = willBeActive;
    saveStateToStorage();
    renderMcpServersList();
    if (server.active) {
      DOM.mcpLiveStatusBadge.textContent = 'جاري الاتصال...';
      await connectActiveMcpServer();
      showToast(`تم تفعيل والاتصال بخادم MCP: ${server.title}`, 'success');
    } else {
      DOM.mcpLiveStatusBadge.textContent = 'الخادم معطل';
      DOM.mcpToolsViewer.style.display = 'none';
      DOM.mcpCountBadge.textContent = '0';
    }
  }
};

window.deleteMcpServer = function(serverId) {
  AppState.settings.mcpServers = AppState.settings.mcpServers.filter(s => s.id !== serverId);
  saveStateToStorage();
  renderMcpServersList();
  showToast('تم حذف خادم MCP', 'info');
};

async function saveNewMcpServer() {
  let title = DOM.mcpServerTitle.value.trim();
  let type = DOM.mcpServerType.value;
  let jsonStr = DOM.mcpJsonConfig.value.trim();

  // If user pasted a direct URL starting with http/https
  if (jsonStr.startsWith('http://') || jsonStr.startsWith('https://')) {
    const rawUrl = jsonStr;
    if (!title) {
      title = rawUrl.includes('khizanat-almaarif') ? 'خزانة المعارف (Khizanat al-Ma\'arif)' : 'خادم MCP عن بعد';
    }
    type = 'sse';
    jsonStr = JSON.stringify({
      "mcpServers": {
        "remote-mcp": {
          "url": rawUrl
        }
      }
    }, null, 2);
  }

  if (!title) {
    showToast('يرجى إدخال عنوان خادم MCP', 'error');
    return;
  }

  let parsedConfig;
  try {
    parsedConfig = JSON.parse(jsonStr);
  } catch (e) {
    showToast('كود JSON غير صالح! تأكد من صحة الصياغة أو الصق رابط URL يبدأ بـ https://', 'error');
    return;
  }

  const newServer = {
    id: 'mcp-' + Date.now(),
    title: title,
    type: type,
    active: true,
    config: jsonStr
  };

  AppState.settings.mcpServers.forEach(s => s.active = false);
  AppState.settings.mcpServers.unshift(newServer);
  saveStateToStorage();
  renderMcpServersList();

  showToast('جاري الاتصال والتحقق من أدوات خادم MCP...', 'info');
  await connectActiveMcpServer();

  DOM.mcpServerTitle.value = '';
  DOM.mcpJsonConfig.value = '';
  DOM.mcpJsonStatus.textContent = '';
  showToast(`تم حفظ والاتصال بخادم MCP بنجاح! 🎉`, 'success');
}

/* ===================================================================
   EVENT LISTENERS & BINDINGS
=================================================================== */

function initEventListeners() {
  DOM.collapseSidebarBtn.addEventListener('click', () => DOM.sidebar.classList.add('collapsed'));
  DOM.expandSidebarBtn.addEventListener('click', () => {
    DOM.sidebar.classList.remove('collapsed');
    if (window.innerWidth <= 768) DOM.sidebar.classList.add('open');
  });

  DOM.newChatBtn.addEventListener('click', createNewChat);

  window.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      createNewChat();
    }
  });

  DOM.chatSearchInput.addEventListener('input', (e) => {
    renderSidebarChats(e.target.value.trim());
  });

  DOM.chatIdBadge.addEventListener('click', () => {
    const chat = getCurrentChat();
    if (chat) {
      navigator.clipboard.writeText(chat.id);
      showToast(`تم نسخ رقم المحادثة: #${chat.id}`, 'info');
    }
  });

  DOM.exportChatCsvBtn.addEventListener('click', exportChatTables);
  DOM.exportChatPdfBtn.addEventListener('click', exportChatToPDF);
  DOM.clearChatBtn.addEventListener('click', () => {
    const chat = getCurrentChat();
    if (!chat || chat.messages.length === 0) return;
    if (confirm('هل تريد بالتأكيد إفراغ محتوى هذه المحادثة؟')) {
      chat.messages = [];
      saveStateToStorage();
      renderCurrentChat();
      showToast('تم إفراغ رسائل المحادثة', 'info');
    }
  });

  DOM.themeToggleBtn.addEventListener('click', toggleThemeQuick);
  DOM.openSettingsBtn.addEventListener('click', openSettings);
  DOM.headerModelPill.addEventListener('click', openSettings);
  DOM.closeSettingsBtn.addEventListener('click', closeSettings);

  DOM.settingsModal.addEventListener('click', (e) => {
    if (e.target === DOM.settingsModal) closeSettings();
  });

  // Settings Tab Switching
  DOM.settingsTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      DOM.settingsTabs.forEach(t => t.classList.remove('active'));
      DOM.tabPanes.forEach(p => p.classList.remove('active'));

      tab.classList.add('active');
      const targetPane = document.getElementById(tab.getAttribute('data-tab'));
      if (targetPane) targetPane.classList.add('active');
    });
  });

  // Provider Selection Radio Cards
  DOM.providerRadioCards.forEach(card => {
    card.addEventListener('click', () => {
      DOM.providerRadioCards.forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      const provider = card.getAttribute('data-provider');
      AppState.settings.provider = provider;
      DOM.apiKeyInput.value = AppState.settings.apiKeys[provider] || '';
      loadDynamicModels();
    });
  });

  // Model Search Live Filter
  if (DOM.modelSearchInput) {
    DOM.modelSearchInput.addEventListener('input', (e) => {
      populateModelsDropdown(AppState.settings.provider, AppState.settings.models[AppState.settings.provider], e.target.value);
    });
  }

  // Refresh Models Button
  if (DOM.refreshModelsBtn) {
    DOM.refreshModelsBtn.addEventListener('click', async () => {
      showToast('جاري تحديث وجلب أحدث النماذج من المزود...', 'info');
      await loadDynamicModels(true);
      showToast('تم تحديث قائمة النماذج بنجاح!', 'success');
    });
  }

  // Model Selection Dropdown
  DOM.modelSelect.addEventListener('change', (e) => {
    AppState.settings.models[AppState.settings.provider] = e.target.value;
  });

  // API Key Visibility Toggle
  DOM.toggleApiKeyVisibility.addEventListener('click', () => {
    const isPassword = DOM.apiKeyInput.type === 'password';
    DOM.apiKeyInput.type = isPassword ? 'text' : 'password';
    DOM.apiKeyEyeIcon.setAttribute('data-lucide', isPassword ? 'eye-off' : 'eye');
    if (window.lucide) lucide.createIcons();
  });

  // Temperature Slider
  DOM.temperatureInput.addEventListener('input', (e) => {
    DOM.tempValueDisplay.textContent = e.target.value;
    AppState.settings.temperature = parseFloat(e.target.value);
  });

  // Theme Palettes Picker
  DOM.themeCards.forEach(card => {
    card.addEventListener('click', () => {
      DOM.themeCards.forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      AppState.settings.theme = card.getAttribute('data-theme-id');
      applySettingsToUI();
    });
  });

  // Font Family Select
  DOM.fontFamilySelect.addEventListener('change', (e) => {
    AppState.settings.fontFamily = e.target.value;
    applySettingsToUI();
  });

  // Font Size Slider
  DOM.fontSizeSlider.addEventListener('input', (e) => {
    AppState.settings.fontSize = parseInt(e.target.value, 10);
    DOM.fontSizeDisplay.textContent = `${AppState.settings.fontSize}px`;
    applySettingsToUI();
  });

  // Font Color Picker
  DOM.fontColorPicker.addEventListener('input', (e) => {
    AppState.settings.fontColor = e.target.value;
    DOM.fontColorHex.textContent = e.target.value;
    applySettingsToUI();
  });

  DOM.resetFontColorBtn.addEventListener('click', () => {
    const defaultColor = AppState.settings.theme === 'claude-dark' ? '#ECE8E0' : '#201F1D';
    AppState.settings.fontColor = defaultColor;
    DOM.fontColorPicker.value = defaultColor;
    DOM.fontColorHex.textContent = defaultColor;
    applySettingsToUI();
  });

  // Accent Color Picker
  DOM.accentColorPicker.addEventListener('input', (e) => {
    AppState.settings.accentColor = e.target.value;
    DOM.accentColorHex.textContent = e.target.value;
    applySettingsToUI();
  });

  DOM.resetAccentColorBtn.addEventListener('click', () => {
    AppState.settings.accentColor = '#DA7756';
    DOM.accentColorPicker.value = '#DA7756';
    DOM.accentColorHex.textContent = '#DA7756';
    applySettingsToUI();
  });

  // MCP Depth Controls Synchronization
  const updateMcpLimitSetting = (val) => {
    const num = parseInt(val, 10) || 15;
    AppState.settings.mcpLimit = num;
    if (DOM.mcpLimitSelectPopover) DOM.mcpLimitSelectPopover.value = String(num);
    if (DOM.mcpLimitSelectModal) DOM.mcpLimitSelectModal.value = String(num);
    if (DOM.mcpLimitPopoverBadge) DOM.mcpLimitPopoverBadge.textContent = `${num} نصاً`;
    saveStateToStorage();
    showToast(`✓ تم ضبط سقف استخراج النصوص إلى ${num} نصاً`, 'success');
  };

  if (DOM.mcpLimitSelectPopover) {
    DOM.mcpLimitSelectPopover.addEventListener('change', (e) => updateMcpLimitSetting(e.target.value));
  }
  if (DOM.mcpLimitSelectModal) {
    DOM.mcpLimitSelectModal.addEventListener('change', (e) => updateMcpLimitSetting(e.target.value));
  }

  const updateMcpBookDiversitySetting = (checked) => {
    AppState.settings.mcpBookDiversity = Boolean(checked);
    if (DOM.mcpBookDiversityTogglePopover) DOM.mcpBookDiversityTogglePopover.checked = AppState.settings.mcpBookDiversity;
    if (DOM.mcpBookDiversityToggleModal) DOM.mcpBookDiversityToggleModal.checked = AppState.settings.mcpBookDiversity;
    saveStateToStorage();
    showToast(AppState.settings.mcpBookDiversity ? '✓ تم تفعيل تنويع أمهات الكتب (Book Diversity)' : 'تم تعطيل تنويع الكتب', 'info');
  };

  if (DOM.mcpBookDiversityTogglePopover) {
    DOM.mcpBookDiversityTogglePopover.addEventListener('change', (e) => updateMcpBookDiversitySetting(e.target.checked));
  }
  if (DOM.mcpBookDiversityToggleModal) {
    DOM.mcpBookDiversityToggleModal.addEventListener('change', (e) => updateMcpBookDiversitySetting(e.target.checked));
  }

  const updateMcpWindowExpansionSetting = (checked) => {
    AppState.settings.mcpWindowExpansion = Boolean(checked);
    if (DOM.mcpWindowExpansionTogglePopover) DOM.mcpWindowExpansionTogglePopover.checked = AppState.settings.mcpWindowExpansion;
    if (DOM.mcpWindowExpansionToggleModal) DOM.mcpWindowExpansionToggleModal.checked = AppState.settings.mcpWindowExpansion;
    saveStateToStorage();
    showToast(AppState.settings.mcpWindowExpansion ? '✓ تم تفعيل توسيع سياق الصفحة (Window Expansion)' : 'تم تعطيل توسيع سياق الصفحة', 'info');
  };

  if (DOM.mcpWindowExpansionTogglePopover) {
    DOM.mcpWindowExpansionTogglePopover.addEventListener('change', (e) => updateMcpWindowExpansionSetting(e.target.checked));
  }
  if (DOM.mcpWindowExpansionToggleModal) {
    DOM.mcpWindowExpansionToggleModal.addEventListener('change', (e) => updateMcpWindowExpansionSetting(e.target.checked));
  }

  // MCP Templates
  if (DOM.loadKhizanaTemplate) {
    DOM.loadKhizanaTemplate.addEventListener('click', () => {
      DOM.mcpServerTitle.value = 'خزانة المعارف (Khizanat al-Ma\'arif)';
      DOM.mcpServerType.value = 'sse';
      DOM.mcpJsonConfig.value = AIProviderService.MCP_TEMPLATES.khizana.json;
      validateMcpJson();
    });
  }

  if (DOM.loadShamelaTemplate) {
    DOM.loadShamelaTemplate.addEventListener('click', () => {
      DOM.mcpServerTitle.value = 'المكتبة الشاملة (Shamela Scholarly MCP)';
      DOM.mcpServerType.value = 'stdio';
      DOM.mcpJsonConfig.value = AIProviderService.MCP_TEMPLATES.shamela.json;
      validateMcpJson();
    });
  }

  DOM.loadFilesystemTemplate.addEventListener('click', () => {
    DOM.mcpServerTitle.value = 'Filesystem Local Explorer';
    DOM.mcpServerType.value = 'stdio';
    DOM.mcpJsonConfig.value = AIProviderService.MCP_TEMPLATES.filesystem.json;
    validateMcpJson();
  });

  DOM.loadSqliteTemplate.addEventListener('click', () => {
    DOM.mcpServerTitle.value = 'SQLite Database Tool';
    DOM.mcpServerType.value = 'stdio';
    DOM.mcpJsonConfig.value = AIProviderService.MCP_TEMPLATES.sqlite.json;
    validateMcpJson();
  });

  DOM.loadFetchTemplate.addEventListener('click', () => {
    DOM.mcpServerTitle.value = 'Web Scraper & Fetcher';
    DOM.mcpServerType.value = 'stdio';
    DOM.mcpJsonConfig.value = AIProviderService.MCP_TEMPLATES.fetch.json;
    validateMcpJson();
  });

  DOM.formatMcpJsonBtn.addEventListener('click', () => {
    try {
      const parsed = JSON.parse(DOM.mcpJsonConfig.value);
      DOM.mcpJsonConfig.value = JSON.stringify(parsed, null, 2);
      validateMcpJson();
      showToast('تم تنسيق كود JSON بنجاح', 'success');
    } catch {
      showToast('كود JSON غير صالح للترتيب والتنسيق', 'error');
    }
  });

  DOM.mcpJsonConfig.addEventListener('input', validateMcpJson);
  DOM.saveMcpServerBtn.addEventListener('click', saveNewMcpServer);

  // Save Settings Modal
  DOM.saveSettingsBtn.addEventListener('click', async () => {
    const prov = AppState.settings.provider;
    const curKey = DOM.apiKeyInput.value.trim();
    AppState.settings.apiKeys[prov] = curKey;
    AppState.settings.systemPrompt = DOM.systemPromptInput.value.trim();
    if (DOM.enableMcpCheckbox) {
      AppState.settings.enableMcp = DOM.enableMcpCheckbox.checked;
    }

    if (curKey) {
      try {
        await fetch('/api/settings/save-key', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider: prov, apiKey: curKey })
        });
      } catch (e) {}
    }

    saveStateToStorage();
    applySettingsToUI();
    closeSettings();
    showToast('تم حفظ وتطبيق جميع الإعدادات بنجاح', 'success');
  });

  DOM.resetSettingsDefaultsBtn.addEventListener('click', () => {
    if (confirm('هل ترغب في استعادة الإعدادات الافتراضية للنظام؟')) {
      AppState.settings.theme = 'claude-warm';
      AppState.settings.fontFamily = "'Cairo', sans-serif";
      AppState.settings.fontSize = 15;
      AppState.settings.fontColor = '#201F1D';
      AppState.settings.accentColor = '#DA7756';
      AppState.settings.temperature = 0.7;
      saveStateToStorage();
      applySettingsToUI();
      showToast('تمت استعادة الإعدادات الافتراضية', 'info');
    }
  });

  // Starter Cards in Welcome Screen
  document.querySelectorAll('.starter-card').forEach(card => {
    card.addEventListener('click', () => {
      const prompt = card.getAttribute('data-prompt');
      if (prompt) {
        DOM.chatTextarea.value = prompt;
        DOM.chatTextarea.focus();
        handleSendMessage();
      }
    });
  });

  // Textarea Auto-expand & Enter sending
  DOM.chatTextarea.addEventListener('input', () => {
    DOM.chatTextarea.style.height = 'auto';
    DOM.chatTextarea.style.height = Math.min(DOM.chatTextarea.scrollHeight, 220) + 'px';
    const words = DOM.chatTextarea.value.trim().split(/\s+/).filter(Boolean).length;
    DOM.tokenEstimate.textContent = `${words} كلمة`;
  });

  DOM.chatTextarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  });

  DOM.sendBtn.addEventListener('click', handleSendMessage);

  // File Attachment Handling
  DOM.fileAttachmentInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      AppState.activeAttachment = {
        name: file.name,
        content: evt.target.result
      };
      DOM.contextTagName.textContent = file.name;
      DOM.inputContextBar.style.display = 'flex';
      showToast(`تم إرفاق الملف: ${file.name}`, 'info');
    };
    reader.readAsText(file);
  });

  DOM.removeContextBtn.addEventListener('click', clearAttachment);

  // RAG toggle & popover
  const ragToggle = document.getElementById('ragAgentsToggle');
  const ragPopover = document.getElementById('ragAgentPopover');
  if (ragToggle && ragPopover) {
    ragToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      const isVisible = (ragPopover.style.display === 'flex');
      closeAllCapsulePopovers();
      if (!isVisible) {
        ragPopover.style.display = 'flex';
        loadShamelaAgentsForRag();
      }
    });
  }

  // MCP indicator & popover
  const mcpIndicator = document.getElementById('mcpActiveIndicator');
  const mcpPopover = document.getElementById('mcpServerPopover');
  if (mcpIndicator && mcpPopover) {
    mcpIndicator.addEventListener('click', (e) => {
      e.stopPropagation();
      const isVisible = (mcpPopover.style.display === 'flex');
      closeAllCapsulePopovers();
      if (!isVisible) {
        mcpPopover.style.display = 'flex';
      }
    });
  }

  // Close popovers on click outside
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.capsule-pill-wrapper')) {
      closeAllCapsulePopovers();
    }
  });

  // تهيئة الواجهة للـ RAG
  setTimeout(() => {
    updateRagUI();
  }, 200);
}

function closeAllCapsulePopovers() {
  const p1 = document.getElementById('ragAgentPopover');
  const p2 = document.getElementById('mcpServerPopover');
  if (p1) p1.style.display = 'none';
  if (p2) p2.style.display = 'none';
}

let _cachedAgentsList = [];
let _lastRagAgentsHash = "";

function toggleSelectAllRagAgents(event) {
  if (event) event.stopPropagation();
  const allIds = _cachedAgentsList.map(a => a.id);
  const selected = AppState.settings.selectedRagAgentIds || [];
  const isAllCurrentlySelected = (_cachedAgentsList.length > 0 && selected.length === _cachedAgentsList.length);

  if (isAllCurrentlySelected) {
    AppState.settings.selectedRagAgentIds = [];
    AppState.settings.ragAgentId = '';
    AppState.settings.ragAgentName = '';
    showToast('تم إلغاء تحديد كافة الوكلاء', 'info');
  } else {
    AppState.settings.selectedRagAgentIds = [...allIds];
    AppState.settings.ragAgentId = 'all';
    AppState.settings.ragAgentName = 'جميع الوكلاء المساعدين';
    showToast(`✓ تم تحديد كافة الوكلاء (${allIds.length} وكيل)`, 'success');
  }
  AppState.settings.enableRag = (AppState.settings.selectedRagAgentIds.length > 0);
  saveStateToStorage();
  updateRagUI();
}

function toggleRagAgentItem(agentId, event) {
  if (event) event.stopPropagation();
  if (!Array.isArray(AppState.settings.selectedRagAgentIds)) {
    AppState.settings.selectedRagAgentIds = [];
  }

  const idx = AppState.settings.selectedRagAgentIds.indexOf(agentId);
  if (idx !== -1) {
    AppState.settings.selectedRagAgentIds.splice(idx, 1);
  } else {
    AppState.settings.selectedRagAgentIds.push(agentId);
  }

  const total = _cachedAgentsList.length;
  const selCount = AppState.settings.selectedRagAgentIds.length;

  if (selCount === total && total > 0) {
    AppState.settings.ragAgentId = 'all';
    AppState.settings.ragAgentName = 'جميع الوكلاء المساعدين';
  } else if (selCount === 1) {
    const single = _cachedAgentsList.find(a => a.id === AppState.settings.selectedRagAgentIds[0]);
    AppState.settings.ragAgentId = single ? single.id : AppState.settings.selectedRagAgentIds[0];
    AppState.settings.ragAgentName = single ? single.name : 'وكيل محدد';
  } else if (selCount > 1) {
    AppState.settings.ragAgentId = AppState.settings.selectedRagAgentIds.join(',');
    AppState.settings.ragAgentName = `${selCount} وكلاء محددين`;
  } else {
    AppState.settings.ragAgentId = '';
    AppState.settings.ragAgentName = '';
  }

  AppState.settings.enableRag = (selCount > 0);
  saveStateToStorage();
  updateRagUI();
}

function selectRagAgent(agentId, agentName) {
  toggleRagAgentItem(agentId);
}

function toggleRagState() {
  AppState.settings.enableRag = !AppState.settings.enableRag;
  updateRagUI();
  saveStateToStorage();
  showToast(AppState.settings.enableRag ? '✓ تم تفعيل محرك RAG الشاملة' : 'تم تعطيل RAG الشاملة', 'info');
}

function updateRagUI() {
  const ragToggle = document.getElementById('ragAgentsToggle');
  const ragText = document.getElementById('ragAgentPillText');
  const statusLabel = document.getElementById('ragStatusLabel');
  const countTag = document.getElementById('ragAgentCountTag');
  const selectAllCb = document.getElementById('ragSelectAllCheckbox');

  const total = _cachedAgentsList.length;
  const selected = AppState.settings.selectedRagAgentIds || [];
  const selCount = selected.length;

  if (ragToggle) {
    ragToggle.classList.toggle('active', !!AppState.settings.enableRag && selCount > 0);
  }
  if (statusLabel) {
    statusLabel.textContent = (AppState.settings.enableRag && selCount > 0) ? 'مفعل' : 'معطل';
    statusLabel.style.color = (AppState.settings.enableRag && selCount > 0) ? '#10b981' : '#94a3b8';
  }
  if (countTag) {
    countTag.textContent = `${selCount} / ${total} محدد`;
  }
  if (selectAllCb) {
    selectAllCb.checked = (total > 0 && selCount === total);
    selectAllCb.indeterminate = (selCount > 0 && selCount < total);
  }

  // تحديث مربعات الاختيار الفردية
  document.querySelectorAll('#ragAgentPopover .capsule-popover-item[data-agent]').forEach(item => {
    const aId = item.getAttribute('data-agent');
    if (aId === 'all') return;
    const isChecked = selected.includes(aId);
    item.classList.toggle('active', isChecked);
    const cb = item.querySelector('.rag-agent-cb');
    if (cb) cb.checked = isChecked;
  });

  if (ragText) {
    if (!AppState.settings.enableRag || selCount === 0) {
      ragText.textContent = 'RAG الشاملة: معطل';
    } else if (selCount === total && total > 0) {
      ragText.textContent = `RAG: تحديد الكل (${total} وكيل)`;
    } else if (selCount === 1) {
      const single = _cachedAgentsList.find(a => a.id === selected[0]);
      ragText.textContent = `RAG: ${single ? single.name : 'وكيل واحد'}`;
    } else {
      ragText.textContent = `RAG: ${selCount} وكلاء محددين`;
    }
  }
}

async function switchActiveMcp(mcpId, displayName) {
  AppState.settings.activeMcpId = mcpId;
  closeAllCapsulePopovers();

  const pillText = document.getElementById('mcpPillText');
  const badge = document.getElementById('mcpCountBadge');
  if (pillText) pillText.textContent = `MCP: ${displayName}`;

  AppState.settings.mcpServers.forEach(s => {
    s.active = (s.id === mcpId);
  });
  saveStateToStorage();

  const optShamela = document.getElementById('mcpOptShamela');
  const optKhizana = document.getElementById('mcpOptKhizana');
  if (optShamela) optShamela.classList.toggle('active', mcpId === 'shamela-scholarly');
  if (optKhizana) optKhizana.classList.toggle('active', mcpId === 'khizanat-almaarif');

  const targetServer = AppState.settings.mcpServers.find(s => s.id === mcpId);
  if (targetServer) {
    try {
      showToast(`جاري الاتصال بـ ${displayName}...`, 'info');
      const res = await AIProviderService.connectMcpServer(targetServer.config);
      if (res && res.tools) {
        if (badge) badge.textContent = res.tools.length;
        showToast(`✓ متصل بنجاح: ${displayName} (${res.tools.length} أداة)`, 'success');
      }
    } catch (e) {
      console.warn("MCP switch connect error:", e);
      showToast(`⚠️ تعذر الاتصال بـ ${displayName}: ${e.message}`, 'error');
    }
  }
}

async function loadShamelaAgentsForRag(silent = false) {
  const container = document.getElementById('ragAgentsListContainer');
  if (!container) return;

  try {
    const res = await fetch('/api/shamela/agents?_t=' + Date.now(), { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      const agents = data.agents || [];
      _cachedAgentsList = agents;

      const currentHash = agents.map(a => a.id + ':' + a.name + ':' + (a.books_count || 0)).join('|');
      if (silent && currentHash === _lastRagAgentsHash && container.children.length > 0) {
        updateRagUI();
        return;
      }
      _lastRagAgentsHash = currentHash;

      if (agents.length === 0) {
        container.innerHTML = `<div style="padding: 12px; font-size: 12px; color: var(--claude-text-muted); text-align: center;">لا يوجد وكلاء مساعدون محددون في الجلسة</div>`;
        return;
      }

      // إذا لم تكن هناك قائمة محددة بعد، نحدد كافة الوكلاء افتراضياً
      if (!Array.isArray(AppState.settings.selectedRagAgentIds) || AppState.settings.selectedRagAgentIds.length === 0) {
        AppState.settings.selectedRagAgentIds = agents.map(a => a.id);
        AppState.settings.ragAgentId = 'all';
        AppState.settings.ragAgentName = 'جميع الوكلاء المساعدين';
      }

      const selected = AppState.settings.selectedRagAgentIds;
      const isAllActive = (agents.length > 0 && selected.length === agents.length);

      // 1. خيار: مربع تحديد الكل
      let html = `
        <div class="capsule-popover-item" style="cursor: pointer; padding: 7px 10px;" onclick="toggleSelectAllRagAgents(event)">
          <label style="display: flex; align-items: center; gap: 9px; width: 100%; cursor: pointer;" onclick="event.stopPropagation(); toggleSelectAllRagAgents(event);">
            <input type="checkbox" id="ragSelectAllCheckbox" ${isAllActive ? 'checked' : ''} style="width: 17px; height: 17px; cursor: pointer; accent-color: var(--accent-color);" onclick="event.stopPropagation(); toggleSelectAllRagAgents(event);">
            <div style="display: flex; flex-direction: column; gap: 1px; flex: 1; text-align: right;">
              <span style="font-weight: 700; font-size: 13px;">تحديد الكل (كافة الوكلاء المساعدين)</span>
              <span style="font-size: 10.5px; opacity: 0.75;">استيعاب وتحقيق جماعي يجمع مسارات الـ ${agents.length} وكيل</span>
            </div>
          </label>
        </div>
        <div style="border-top: 1.5px solid #E2E8F0; margin: 4px 0;"></div>
      `;

      // 2. قائمة مربعات تحديد الوكلاء الفرديين
      html += agents.map(a => {
        const isChecked = selected.includes(a.id);
        const bCount = a.books_count || (a.book_titles ? a.book_titles.length : 0);
        const booksBadge = bCount ? `<span style="font-size: 10px; font-weight: 700; background: rgba(218, 119, 86, 0.12); color: #DA7756; padding: 2px 6px; border-radius: 4px;">${bCount} كتب</span>` : '';
        return `
          <div class="capsule-popover-item ${isChecked ? 'active' : ''}" 
               data-agent="${escapeHtml(a.id)}" 
               style="cursor: pointer; padding: 7px 10px;"
               onclick="toggleRagAgentItem('${escapeHtml(a.id)}', event)">
            <label style="display: flex; align-items: center; gap: 9px; width: 100%; cursor: pointer;" onclick="event.stopPropagation(); toggleRagAgentItem('${escapeHtml(a.id)}', event);">
              <input type="checkbox" class="rag-agent-cb" data-id="${escapeHtml(a.id)}" ${isChecked ? 'checked' : ''} style="width: 16px; height: 16px; cursor: pointer; accent-color: var(--accent-color);" onclick="event.stopPropagation(); toggleRagAgentItem('${escapeHtml(a.id)}', event);">
              <div style="display: flex; flex-direction: column; gap: 1px; flex: 1; text-align: right;">
                <span style="font-weight: 600; font-size: 12.5px;">${escapeHtml(a.name)}</span>
                <span style="font-size: 10.5px; opacity: 0.75;">${escapeHtml(a.role || '')}</span>
              </div>
              <div style="display: flex; align-items: center; gap: 6px;">
                ${booksBadge}
              </div>
            </label>
          </div>
        `;
      }).join('');

      // 3. شريط إجراءات سفلي لإغلاق القائمة وتأكيد الاختيار
      html += `
        <div style="border-top: 1.5px solid #E2E8F0; margin: 4px 0 2px;"></div>
        <div style="display: flex; justify-content: flex-end; padding: 4px 6px 2px;">
          <button type="button" class="btn-action-primary" style="font-size: 11.5px; padding: 4px 12px; border-radius: 6px;" onclick="closeAllCapsulePopovers()">
            ✓ تم التحديد
          </button>
        </div>
      `;

      container.innerHTML = html;
      if (window.lucide) window.lucide.createIcons();
      updateRagUI();
    }
  } catch (e) {
    console.warn("Could not load shamela agents for RAG:", e);
  }
}

// تحديث فوري ديناميكي عند الانتقال للتبويب أو دورياً كل 2.5 ثانية
window.addEventListener('focus', () => {
  loadShamelaAgentsForRag(true);
});
setInterval(() => {
  loadShamelaAgentsForRag(true);
}, 2500);

function clearAttachment() {
  AppState.activeAttachment = null;
  DOM.inputContextBar.style.display = 'none';
  DOM.fileAttachmentInput.value = '';
}

function validateMcpJson() {
  const val = DOM.mcpJsonConfig.value.trim();
  if (!val) {
    DOM.mcpJsonStatus.textContent = '';
    return;
  }
  if (val.startsWith('http://') || val.startsWith('https://')) {
    DOM.mcpJsonStatus.textContent = '✓ رابط خادم MCP عن بعد صالح (سيتم تحويله والاتصال به فوراً)';
    DOM.mcpJsonStatus.className = 'json-status-msg valid';
    return;
  }
  try {
    JSON.parse(val);
    DOM.mcpJsonStatus.textContent = '✓ كود JSON صالح ومنسق';
    DOM.mcpJsonStatus.className = 'json-status-msg valid';
  } catch (err) {
    DOM.mcpJsonStatus.textContent = '✗ خطأ في بنية JSON: ' + err.message;
    DOM.mcpJsonStatus.className = 'json-status-msg invalid';
  }
}

function openSettings() {
  syncModalInputs();
  DOM.settingsModal.style.display = 'flex';
}

function closeSettings() {
  DOM.settingsModal.style.display = 'none';
}

/* ===================================================================
   UTILITIES & HELPERS
=================================================================== */

function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  let iconName = 'info';
  if (type === 'success') iconName = 'check-circle';
  if (type === 'error') iconName = 'alert-circle';

  toast.innerHTML = `
    <i data-lucide="${iconName}" style="width: 18px; height: 18px;"></i>
    <span>${escapeHtml(message)}</span>
  `;

  DOM.toastContainer.appendChild(toast);
  if (window.lucide) lucide.createIcons();

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3200);
}

function formatTime(isoString) {
  try {
    const d = new Date(isoString);
    return d.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function formatTimeAgo(isoString) {
  try {
    const diff = Math.floor((new Date() - new Date(isoString)) / 1000);
    if (diff < 60) return 'الآن';
    if (diff < 3600) return `منذ ${Math.floor(diff / 60)} دقيقة`;
    if (diff < 86400) return `منذ ${Math.floor(diff / 3600)} ساعة`;
    return new Date(isoString).toLocaleDateString('ar-EG', { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

function escapeHtml(string) {
  const entityMap = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  };
  return String(string).replace(/[&<>"']/g, s => entityMap[s]);
}
