/**
 * AI PROVIDERS & MCP PROTOCOL SERVICE
 * Handles communication with Anthropic Claude, OpenAI, Google Gemini, and OpenRouter,
 * alongside real local MCP Server stdio bridging and dynamic model discovery.
 */

const AIProviderService = {
  // Available models registry
  PROVIDERS_CONFIG: {
    openrouter: {
      name: 'OpenRouter (أوبن راوتر)',
      defaultModel: 'deepseek/deepseek-r1',
      models: [
        { id: 'deepseek/deepseek-r1', name: 'DeepSeek R1 (نموذج استدلال مفتوح)' },
        { id: 'deepseek/deepseek-chat', name: 'DeepSeek V3' },
        { id: 'anthropic/claude-3.7-sonnet', name: 'Claude 3.7 Sonnet (الأحدث والأذكى)' },
        { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet' },
        { id: 'openai/gpt-4o', name: 'OpenAI GPT-4o' },
        { id: 'google/gemini-2.5-flash', name: 'Google Gemini 2.5 Flash' },
        { id: 'meta-llama/llama-3.3-70b-instruct', name: 'Meta Llama 3.3 70B' },
        { id: 'qwen/qwen-2.5-72b-instruct', name: 'Qwen 2.5 72B' }
      ]
    },
    anthropic: {
      name: 'Claude (Anthropic)',
      defaultModel: 'claude-3-7-sonnet-20250219',
      models: [
        { id: 'claude-3-7-sonnet-20250219', name: 'Claude 3.7 Sonnet (الأحدث والأذكى)' },
        { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet (سريع وقوي)' },
        { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku (فائق السرعة)' },
        { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus (عميق التحليل)' }
      ]
    },
    openai: {
      name: 'OpenAI (أوبن أي اي)',
      defaultModel: 'gpt-4o',
      models: [
        { id: 'gpt-4o', name: 'GPT-4o (متعدد الوسائط الرائد)' },
        { id: 'gpt-4o-mini', name: 'GPT-4o Mini (خفيف واقتصادي)' },
        { id: 'o3-mini', name: 'o3-mini (استدلال وتفكير فائق)' },
        { id: 'o1', name: 'o1 (استدلال عميق للمسائل المعقدة)' },
        { id: 'gpt-4-turbo', name: 'GPT-4 Turbo' }
      ]
    },
    google: {
      name: 'Google Gemini (جوجل)',
      defaultModel: 'gemini-2.5-flash',
      models: [
        { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash (الأحدث مع التفكير)' },
        { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash (الجيل الثاني)' },
        { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro (سياق مليون توكن)' },
        { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash' }
      ]
    }
  },

  // MCP Default Templates
  MCP_TEMPLATES: {
    khizana: {
      name: 'خزانة المعارف (Khizanat al-Ma\'arif - 93 أداة شرعية ولغوية)',
      type: 'sse',
      json: JSON.stringify({
        "mcpServers": {
          "khizanat-almaarif": {
            "url": "https://mcp.khizanat-almaarif.com/mcp"
          }
        }
      }, null, 2)
    },
    shamela: {
      name: 'Shamela Scholarly MCP (المكتبة الشاملة)',
      type: 'stdio',
      json: JSON.stringify({
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
    filesystem: {
      name: 'Filesystem Explorer',
      type: 'stdio',
      json: JSON.stringify({
        "mcpServers": {
          "filesystem": {
            "command": "npx",
            "args": ["-y", "@modelcontextprotocol/server-filesystem", "./workspace"]
          }
        }
      }, null, 2)
    },
    sqlite: {
      name: 'SQLite Database',
      type: 'stdio',
      json: JSON.stringify({
        "mcpServers": {
          "sqlite": {
            "command": "uvx",
            "args": ["mcp-server-sqlite", "--db-path", "./data.db"]
          }
        }
      }, null, 2)
    },
    fetch: {
      name: 'Web Fetch & Scrape',
      type: 'stdio',
      json: JSON.stringify({
        "mcpServers": {
          "fetch": {
            "command": "uvx",
            "args": ["mcp-server-fetch"]
          }
        }
      }, null, 2)
    }
  },

  /**
   * Fetch all 450+ models from OpenRouter dynamically
   */
  async loadOpenRouterModels(force = false) {
    try {
      // First try local bridge endpoint for speed & CORS avoidance
      let response = await fetch('/api/openrouter/models').catch(() => null);
      if (!response || !response.ok) {
        // Fallback to direct OpenRouter endpoint
        response = await fetch('https://openrouter.ai/api/v1/models');
      }

      if (response && response.ok) {
        const data = await response.json();
        const modelsList = data.models || data.data || [];
        if (modelsList.length > 0) {
          // Format into clean list
          const formatted = modelsList.map(m => {
            const contextLen = m.context_length ? ` (${Math.round(m.context_length / 1000)}k)` : '';
            return {
              id: m.id,
              name: `${m.name || m.id}${contextLen}`,
              description: m.description || '',
              pricing: m.pricing || null
            };
          });

          // Sort alphabetically by name
          formatted.sort((a, b) => a.name.localeCompare(b.name));
          this.PROVIDERS_CONFIG.openrouter.models = formatted;
          return formatted;
        }
      }
    } catch (e) {
      console.warn('Failed to dynamically load OpenRouter models:', e);
    }
    return this.PROVIDERS_CONFIG.openrouter.models;
  },

  /**
   * Connect to an MCP server (Local stdio process or Remote HTTP/SSE URL) via Python bridge server
   */
  async connectMcpServer(configObj) {
    try {
      let cmd = '';
      let args = [];
      let env = {};
      let url = '';

      if (typeof configObj === 'string') {
        const trimmed = configObj.trim();
        if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
          url = trimmed;
        } else {
          try {
            configObj = JSON.parse(trimmed);
          } catch (e) {}
        }
      }

      if (configObj && typeof configObj === 'object') {
        if (configObj.mcpServers) {
          const serverKey = Object.keys(configObj.mcpServers)[0];
          const s = configObj.mcpServers[serverKey];
          url = s.url || '';
          cmd = s.command || '';
          args = s.args || [];
          env = s.env || {};
        } else {
          url = configObj.url || '';
          cmd = configObj.command || '';
          args = configObj.args || [];
          env = configObj.env || {};
        }
      }

      if (!url && cmd && (cmd.startsWith('http://') || cmd.startsWith('https://'))) {
        url = cmd;
        cmd = '';
      }

      if (!url && !cmd) {
        throw new Error('لم يتم العثور على رابط URL أو أمر تشغيل command داخل ملف تكوين MCP');
      }

      const payload = url ? { url } : { command: cmd, args, env };

      const res = await fetch('/api/mcp/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      return data;
    } catch (error) {
      console.error('MCP Connect error:', error);
      throw error;
    }
  },

  /**
   * Check MCP server connection status and tools list
   */
  async checkMcpStatus() {
    try {
      const res = await fetch('/api/mcp/status');
      if (res.ok) {
        return await res.json();
      }
    } catch (e) {
      console.warn('Could not check MCP status:', e);
    }
    return { connected: false, tools: [] };
  },

  /**
   * Send chat request to chosen provider
   * If MCP is enabled, uses the bridge server which executes the tool loop!
   */
  async sendMessage({ provider, apiKey, model, messages, systemPrompt, temperature = 0.7, enableMcp = true, enableRag = true, ragAgentId = 'all', ragAgentIds = [], mcpLimit = 15, mcpBookDiversity = true, mcpWindowExpansion = true }) {
    try {
      // Route through our backend bridge so MCP tool calls, assistant models RAG, and scholarly citations are seamlessly executed!
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider,
          apiKey,
          model,
          messages,
          systemPrompt,
          temperature,
          enableMcp,
          enableRag,
          ragAgentId,
          ragAgentIds,
          mcpLimit,
          mcpBookDiversity,
          mcpWindowExpansion
        })
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          return {
            content: data.content,
            toolInvocations: data.toolInvocations || [],
            assistantConsultations: data.assistantConsultations || []
          };
        } else {
          throw new Error(data.error || 'فشل في استلام الرد من خادم النماذج');
        }
      } else {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }
    } catch (error) {
      console.error('API Call Error:', error);
      throw error;
    }
  },

  /**
   * Anthropic Claude API Direct Call
   */
  async callAnthropic({ apiKey, model, messages, systemPrompt, temperature }) {
    const formattedMessages = messages.map(m => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content
    }));

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: model || 'claude-3-7-sonnet-20250219',
        max_tokens: 4000,
        system: systemPrompt || 'أنت مساعد ذكي ومتعاون تجيب بلغة عربية فصحى ومصممة بأناقة مع استخدام الجداول والأكواد.',
        messages: formattedMessages,
        temperature: parseFloat(temperature)
      })
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error?.message || `HTTP ${response.status}`);
    }

    const data = await response.json();
    return data.content?.[0]?.text || '';
  },

  /**
   * Google Gemini API Call
   */
  async callGoogle({ apiKey, model, messages, systemPrompt }) {
    const cleanModel = model || 'gemini-2.5-flash';
    const contents = messages.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }));

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${cleanModel}:generateContent?key=${apiKey}`;
    
    const body = {
      contents: contents
    };
    if (systemPrompt) {
      body.systemInstruction = { parts: [{ text: systemPrompt }] };
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error?.message || `HTTP ${response.status}`);
    }

    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  },

  /**
   * Fallback simulator
   */
  async simulateClaudeResponse(messages, prefixNote = '') {
    await new Promise(r => setTimeout(r, 600));
    const lastMsg = messages[messages.length - 1]?.content?.toLowerCase() || '';

    if (lastMsg.includes('جدول') || lastMsg.includes('مقارنة') || lastMsg.includes('table')) {
      return `${prefixNote}### 📊 جدول مقارنة نماذج الذكاء الاصطناعي الرائدة (2026)

| النموذج (Model) | المزود (Provider) | التكلفة لكل مليون توكن | نافذة السياق (Context) | دعم بروتوكول MCP | أفضل استخدام |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Claude 3.7 Sonnet** | Anthropic / OpenRouter | $3.00 / $15.00 | 200,000 توكن | مدمج بالكامل وخبير | البرمجة المعقدة، والتحليل المنطقي العميق |
| **DeepSeek R1** | OpenRouter | $0.55 / $2.19 | 64,000 توكن | عبر أدوات Function Calling | الاستدلال الرياضي والبرمجي الاقتصادي |
| **GPT-4o** | OpenAI / OpenRouter | $2.50 / $10.00 | 128,000 توكن | مدعوم عبر أدوات | وسائط متعددة ورؤية حاسوبية |
| **Gemini 2.5 Flash** | Google / OpenRouter | $0.15 / $0.60 | 1,000,000 توكن | مدعوم وممتاز | تحليل المستندات الضخمة والفيديو |

> اضغط على زر **«تصدير CSV»** الموجود أعلى هذا الجدول لتنزيل البيانات كملف إكسل باللغة العربية!`;
    }

    return `${prefixNote}### 💬 إجابة منسقة من واجهة Claude Desktop

أهلاً بك! لقد استلمت رسالتك بنجاح في بيئة **Claude Desktop Web**.
خادم بروتوكول **MCP** متصل بنجاح ومربوط بقواعد البيانات ومحرك النماذج.

هل ترغب في البحث في أمهات كتب الفقه، أو استخراج أحاديث، أو إنشاء مقارنات جداول؟ يسعدني مساعدتك!`;
  }
};

window.AIProviderService = AIProviderService;
