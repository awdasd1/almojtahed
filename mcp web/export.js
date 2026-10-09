/**
 * EXPORT MODULE: PDF & CSV ENGINE
 * Specially designed for Arabic & Multi-language content, UTF-8 Excel support,
 * and high quality formatted PDF rendering.
 */

const ExportEngine = {
  /**
   * Convert an HTML table element or Markdown table text into a valid CSV string with UTF-8 BOM
   */
  tableToCSV(tableElement) {
    const rows = [];
    const trElements = tableElement.querySelectorAll('tr');

    trElements.forEach(tr => {
      const row = [];
      const cells = tr.querySelectorAll('th, td');
      cells.forEach(cell => {
        // Clean cell text, remove excess newlines and quotes
        let text = cell.innerText.trim();
        // Escape quotes by doubling them
        text = text.replace(/"/g, '""');
        // Wrap in quotes
        row.push(`"${text}"`);
      });
      if (row.length > 0) {
        rows.push(row.join(','));
      }
    });

    return rows.join('\r\n');
  },

  /**
   * Parse markdown text to search for Markdown tables and convert them to CSV
   */
  markdownTablesToCSV(markdownText) {
    const lines = markdownText.split('\n');
    const tables = [];
    let currentTable = [];
    let inTable = false;

    lines.forEach(line => {
      const trimmed = line.trim();
      if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
        // Skip separator row (|---|---|)
        if (!/^\|(\s*:?-+:?\s*\|)+$/.test(trimmed)) {
          const cells = trimmed
            .slice(1, -1)
            .split('|')
            .map(c => `"${c.trim().replace(/"/g, '""')}"`);
          currentTable.push(cells.join(','));
        }
        inTable = true;
      } else {
        if (inTable && currentTable.length > 0) {
          tables.push(currentTable.join('\r\n'));
          currentTable = [];
          inTable = false;
        }
      }
    });

    if (inTable && currentTable.length > 0) {
      tables.push(currentTable.join('\r\n'));
    }

    return tables;
  },

  /**
   * Download a CSV string as a file with UTF-8 BOM for Arabic Excel
   */
  downloadCSV(csvString, filename = 'claude_data.csv') {
    // \uFEFF is the UTF-8 Byte Order Mark required by Microsoft Excel to display Arabic properly
    const bom = '\uFEFF';
    const blob = new Blob([bom + csvString], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  },

  /**
   * Export tables found in a specific message element or markdown text
   */
  exportMessageTablesToCSV(messageElement, defaultFilename = 'table_export.csv') {
    const tables = messageElement.querySelectorAll('table');
    if (tables.length === 0) {
      return false;
    }

    let combinedCSV = '';
    tables.forEach((table, index) => {
      const csv = this.tableToCSV(table);
      if (tables.length > 1) {
        combinedCSV += `"--- جدول رقم ${index + 1} ---"\r\n` + csv + '\r\n\r\n';
      } else {
        combinedCSV += csv;
      }
    });

    this.downloadCSV(combinedCSV, defaultFilename);
    return true;
  },

  /**
   * Export all tables in the entire active conversation into CSV
   */
  exportChatTablesToCSV(chat, defaultFilename) {
    const filename = defaultFilename || `Claude-Tables-${chat.id || 'chat'}.csv`;
    let allTablesCSV = [];

    chat.messages.forEach((msg, idx) => {
      if (msg.role === 'assistant') {
        const tables = this.markdownTablesToCSV(msg.content);
        tables.forEach((t, tIdx) => {
          allTablesCSV.push(`"=== رسالة ${idx + 1} - جدول ${tIdx + 1} ==="\r\n` + t);
        });
      }
    });

    if (allTablesCSV.length === 0) {
      // If no markdown table was detected, create a structured CSV of the conversation Q&A
      const fallbackRows = [
        '"رقم المحادثة","الدور","الوقت","المحتوى"'
      ];
      chat.messages.forEach((msg, i) => {
        const cleanContent = msg.content.replace(/"/g, '""');
        const roleName = msg.role === 'user' ? 'المستخدم' : 'كلاود الذكي';
        fallbackRows.push(`"${chat.id}","${roleName}","${msg.timestamp || ''}","${cleanContent}"`);
      });
      this.downloadCSV(fallbackRows.join('\r\n'), `Claude-Chat-Data-${chat.id}.csv`);
      return { success: true, isStructuredData: true };
    }

    this.downloadCSV(allTablesCSV.join('\r\n\r\n'), filename);
    return { success: true, isStructuredData: false, count: allTablesCSV.length };
  },

  /**
   * Intelligently extract a clean, concise, academic title from the document or raw prompt
   */
  extractConciseTitle(rawTitle = '', htmlContent = '') {
    // 1. Check if the generated HTML already contains a clean title or heading
    if (htmlContent) {
      const titleTag = htmlContent.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      if (titleTag && titleTag[1].trim()) {
        const clean = this.sanitizeTitle(titleTag[1]);
        if (clean) return clean;
      }

      // Check first h1 or h2
      const headingMatch = htmlContent.match(/<h[12][^>]*>([\s\S]*?)<\/h[12]>/i);
      if (headingMatch && headingMatch[1].trim()) {
        const clean = this.sanitizeTitle(headingMatch[1]);
        if (clean && clean.length <= 70) return clean;
      }
    }

    // 2. Extract from raw user prompt (often containing search commands)
    if (rawTitle) {
      let t = String(rawTitle).trim();
      
      // Strip common Arabic search and prompt command prefixes
      t = t.replace(/^(ابحث\s+(فقط\s+)?(في\s+[^ع]+)?عن\s+|ابحث\s+عن\s+|حرر\s+|تحرير\s+|ما\s+هو\s+|ما\s+حكم\s+|حول\s+النتيجة\s+الى\s+ملف\s+pdf|هل\s+|سؤال\s+عن\s+)/i, '');
      
      // If prompt has "مسألة: ...", extract that
      const masalaMatch = t.match(/مسألة\s*[:：]?\s*([^،\n\r.]+)/);
      if (masalaMatch && masalaMatch[1]) {
        let m = masalaMatch[1].trim();
        m = m.replace(/(باستيعاب\s+تام|باستيعاب|بدقة\s+وتفصيل|مع\s+الأدلة|بالتفصيل|الموثق)\s*$/gi, '').trim();
        return `مسألة: ${m}`;
      }

      // Remove trailing search qualifiers like "باستيعاب تام", "بدقة", etc.
      t = t.replace(/(باستيعاب\s+تام|باستيعاب|بدقة\s+وتفصيل|مع\s+الأدلة|بالتفصيل|الموثق)\s*$/gi, '').trim();
      t = t.replace(/[؟?.:!]+$/, '').trim();

      if (t.length > 55) {
        t = t.substring(0, 52).trim() + '...';
      }
      if (t) return t;
    }

    return 'بحث علمي موثق';
  },

  sanitizeTitle(str) {
    return str
      .replace(/<[^>]+>/g, '')
      .replace(/^(بحث\s+في\s+|مسألة\s+في\s+)/i, 'مسألة: ')
      .replace(/[\r\n]+/g, ' ')
      .trim();
  },

  /**
   * Available Scholarly & Academic PDF Templates
   */
  TEMPLATES: {
    scholarly: {
      id: 'scholarly',
      name: 'تحقيق وتراث أصيل',
      fontFamily: "'Amiri', 'Traditional Arabic', serif",
      fontSize: '16px',
      lineHeight: '2.0',
      margin: 'normal',
      footnoteLine: '25%',
      frame: 'none',
      showHeader: true,
      showDate: true,
      showPageNumbers: true,
      accentColor: '#8E3A24'
    },
    academic: {
      id: 'academic',
      name: 'بحث جامعي محكم',
      fontFamily: "'Cairo', sans-serif",
      fontSize: '15px',
      lineHeight: '1.85',
      margin: 'normal',
      footnoteLine: '25%',
      frame: 'none',
      showHeader: true,
      showDate: true,
      showPageNumbers: true,
      accentColor: '#2B5B84'
    },
    book: {
      id: 'book',
      name: 'كتاب أصولي فاخر',
      fontFamily: "'Amiri', 'Traditional Arabic', serif",
      fontSize: '17px',
      lineHeight: '2.1',
      margin: 'wide',
      footnoteLine: '35%',
      frame: 'classic',
      showHeader: true,
      showDate: false,
      showPageNumbers: true,
      accentColor: '#8E3A24'
    },
    clean: {
      id: 'clean',
      name: 'تقرير بسيط مركز',
      fontFamily: "'Noto Naskh Arabic', serif",
      fontSize: '15px',
      lineHeight: '1.85',
      margin: 'compact',
      footnoteLine: 'none',
      frame: 'none',
      showHeader: false,
      showDate: true,
      showPageNumbers: false,
      accentColor: '#4A5568'
    }
  },

  // Active designer state
  currentDesignerData: null,
  activeTemplateConfig: null,

  /**
   * Intelligently clean, decode, and unwrap HTML documents or rich markup
   */
  prepareHtmlForPdf(htmlContent, footnoteLineWidth = '25%') {
    if (!htmlContent) return { html: '', customStyle: '', docTitle: '' };

    let processed = String(htmlContent);

    // 1. Remove introductory conversational chatter from LLM (e.g. "لا أستطيع إنشاء ملف PDF هنا...")
    processed = processed.replace(/<p>[^<]*(لا أستطيع إنشاء ملف PDF|انسخه في ملف|احفظه PDF|أنقله بتنسيق HTML)[^<]*<\/p>/gi, '');

    // Helper to decode HTML entities
    const decodeHtml = (str) => {
      const txt = document.createElement('textarea');
      txt.innerHTML = str;
      return txt.value;
    };

    let extractedStyle = '';
    let extractedDocTitle = '';

    // 2. Search for <pre><code> blocks that wrap full HTML documents or rich markup
    processed = processed.replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, (preMatch, preInner) => {
      const codeMatch = preInner.match(/<code[^>]*>([\s\S]*?)<\/code>/i);
      const codeRaw = codeMatch ? codeMatch[1] : preInner;
      let decoded = decodeHtml(codeRaw).trim();

      const hasDoctype = /<!DOCTYPE/i.test(decoded);
      const hasHtmlTag = /<html/i.test(decoded);
      const hasBodyTag = /<body/i.test(decoded);
      const hasHeadings = /<h[1-6]/i.test(decoded);

      if (hasDoctype || hasHtmlTag || hasBodyTag || (hasHeadings && /<p/i.test(decoded))) {
        const styleMatch = decoded.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
        if (styleMatch) {
          extractedStyle += styleMatch[1] + '\n';
        }

        const titleMatch = decoded.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
        if (titleMatch && !extractedDocTitle) {
          extractedDocTitle = titleMatch[1].trim();
        }

        let bodyContent = decoded;
        const bodyStartMatch = decoded.match(/<body[^>]*>([\s\S]*)/i);
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

        return `<div class="rendered-rich-doc">${bodyContent.trim()}</div>`;
      }

      return preMatch;
    });

    // 3. Raw HTML documents
    const trimmed = processed.trim();
    if (trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html') || (trimmed.startsWith('<h2') && trimmed.includes('<p'))) {
      const styleMatch = trimmed.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
      if (styleMatch) extractedStyle += styleMatch[1] + '\n';

      const titleMatch = trimmed.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      if (titleMatch && !extractedDocTitle) extractedDocTitle = titleMatch[1].trim();

      const bodyStartMatch = trimmed.match(/<body[^>]*>([\s\S]*)/i);
      if (bodyStartMatch) {
        processed = `<div class="rendered-rich-doc">${bodyStartMatch[1].replace(/<\/body>[\s\S]*/i, '').trim()}</div>`;
      }
    }

    // 4. Format Footnotes: Replace "الحواشي:" heading with the 25% divider line
    const dividerStyle = footnoteLineWidth === 'none' 
      ? 'display: none;' 
      : `width: ${footnoteLineWidth}; border-top: 1.5px solid #222; margin-top: 26px; margin-bottom: 12px;`;

    const footnoteDivider = `<div class="scholarly-footnote-separator" style="${dividerStyle}"></div>`;

    // Replace any heading or paragraph saying "الحواشي" or "الهوامش" (even if wrapped in <strong> or <b>)
    processed = processed.replace(
      /<(h[1-6]|p|div)[^>]*>(?:\s*<(?:strong|b|span)[^>]*>)?\s*([(\[]?\s*(?:الحواشي|الهوامش|الحواشي والمراجع|المراجع والتوثيق)\s*[:：]?[)\]]?)\s*(?:<\/(?:strong|b|span)>)?\s*<\/\1>/gi,
      footnoteDivider
    );

    // 5. Clean up remaining interactive UI buttons
    const container = document.createElement('div');
    container.innerHTML = processed;

    container.querySelectorAll('.code-header-bar, .copy-code-btn, .table-toolbar, .msg-action-btn, button').forEach(el => el.remove());
    container.querySelectorAll('p').forEach(p => {
      const text = (p.innerText || p.textContent || '').trim();
      if (text.includes('لا أستطيع إنشاء ملف PDF') || text.includes('انسخه في ملف') || text.includes('احفظه PDF')) {
        p.remove();
      }
    });

    // 6. Detect Footnote Items and apply proper class + RTL attributes
    let pastFootnoteSep = false;
    Array.from(container.children).forEach(child => {
      if (child.classList && child.classList.contains('scholarly-footnote-separator')) {
        pastFootnoteSep = true;
        return;
      }
      const txt = (child.textContent || '').trim();
      const isFootnoteItem = pastFootnoteSep || /^[(\[]?[\d\u0660-\u0669]+[)\]]/.test(txt);

      if (isFootnoteItem && (child.tagName === 'P' || child.tagName === 'DIV' || child.tagName === 'LI')) {
        child.className = (child.className ? child.className + ' ' : '') + 'scholarly-footnote-item';
        child.setAttribute('dir', 'rtl');
      }
    });

    let finalHtml = container.innerHTML;

    // 7. Robust BiDi formatting for Aya brackets, Parentheses, and Citation numbers
    // A) Quranic Aya brackets: ﴿...﴾ - normalize to U+FD3E (open) and U+FD3F (close) wrapped in isolated BDI
    finalHtml = finalHtml.replace(/[﴿﴾]\s*([^﴿﴾\r\n]+?)\s*[﴿﴾]/g, (match, aya) => {
      return `<bdi class="quran-verse" dir="rtl">&#xFD3E;${aya.trim()}&#xFD3F;</bdi>`;
    });

    // B) Volume / Page citations with slashes like ٢٤/٦٢١٠ or 1/320
    finalHtml = finalHtml.replace(/([\u0660-\u0669\d]+\/[\u0660-\u0669\d]+)/g, (match, cit) => {
      return `<bdi class="citation-num" dir="rtl">&rlm;${cit}&rlm;</bdi>`;
    });

    // C) Parentheses containing Arabic words: (كلمة)
    finalHtml = finalHtml.replace(/(^|[\s>،؛.:])\(([\u0600-\u06FF\s،؛.ـ\d\u0660-\u0669]+)\)(?=[\s<،؛.:!]|$)/g, (match, lead, inside) => {
      return `${lead}<bdi class="bidi-bracket" dir="rtl">&rlm;(${inside.trim()})&rlm;</bdi>`;
    });

    return {
      html: finalHtml,
      customStyle: extractedStyle,
      docTitle: extractedDocTitle
    };
  },

  /**
   * Compile complete document HTML with typography, CSS reset, and print settings
   */
  compileFullDocumentHtml({ title, subtitle, meta, htmlContent, templateConfig, isForPrint = false }) {
    const cfg = templateConfig || this.TEMPLATES.scholarly;
    const parsed = this.prepareHtmlForPdf(htmlContent, cfg.footnoteLine);
    const displayTitle = title || parsed.docTitle || 'تحرير مسألة علمية';

    // Margins mapping
    let pageMargins = '20mm 16mm';
    if (cfg.margin === 'wide') pageMargins = '26mm 22mm';
    if (cfg.margin === 'compact') pageMargins = '14mm 12mm';

    // Frame styling
    let frameCss = '';
    if (cfg.frame === 'classic') {
      frameCss = 'border: 4px double #8E3A24; outline: 1px solid #C4A482; outline-offset: -8px; padding: 18px;';
    } else if (cfg.frame === 'simple') {
      frameCss = 'border: 1px solid #D5CFC5; padding: 18px;';
    }

    const headerHtml = cfg.showHeader ? `
      <div class="pdf-header" style="border-bottom: 2px solid ${cfg.accentColor}; padding-bottom: 12px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: flex-end; page-break-after: avoid; break-after: avoid;">
        <div style="flex: 1;">
          <div style="font-size: 21px; font-weight: 800; color: #1A1917; line-height: 1.35; margin-bottom: 4px;">
            ${displayTitle}
          </div>
          ${subtitle ? `<div style="font-size: 13px; color: #666; margin-top: 2px;">${subtitle}</div>` : ''}
        </div>
        ${cfg.showDate ? `
          <div style="font-size: 11.5px; color: #777; text-align: left; line-height: 1.6;">
            <div><strong>تاريخ التحرير:</strong> ${new Date().toLocaleDateString('ar-EG', { dateStyle: 'long' })}</div>
            ${meta ? `<div>${meta}</div>` : ''}
          </div>
        ` : ''}
      </div>
    ` : '';

    const footerHtml = cfg.showPageNumbers ? `
      <div class="pdf-footer" style="margin-top: 36px; border-top: 1px solid #E5DFD5; padding-top: 10px; font-size: 11px; color: #888; text-align: center; page-break-before: avoid;">
        <span>تحرير علمي موثق — خزانة المعارف والمكتبة الشاملة</span>
      </div>
    ` : '';

    return `
      <!DOCTYPE html>
      <html lang="ar" dir="rtl">
      <head>
        <meta charset="UTF-8">
        <title>${displayTitle}</title>
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Amiri:ital,wght@0,400;0,700;1,400;1,700&family=Cairo:wght@400;600;700;800&family=Noto+Naskh+Arabic:wght@400;600;700&display=swap" rel="stylesheet">
        <style>
          @page {
            size: A4 portrait;
            margin: ${pageMargins};
          }
          @media print {
            body {
              background: #FFFFFF !important;
              color: #1A1917 !important;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            p, h1, h2, h3, h4, blockquote, table, tr, .scholarly-footnote-item, .scholarly-footnote-separator {
              page-break-inside: avoid !important;
              break-inside: avoid !important;
            }
          }
          * {
            box-sizing: border-box;
          }
          body {
            margin: 0;
            padding: 0;
            background-color: #FFFFFF;
            color: #1A1917;
            font-family: ${cfg.fontFamily};
            font-size: ${cfg.fontSize};
            line-height: ${cfg.lineHeight};
            direction: rtl;
            text-align: justify;
            text-justify: inter-word;
            unicode-bidi: isolate;
          }
          .pdf-document-body {
            ${frameCss}
          }
          h1, h2, h3, h4 {
            font-family: ${cfg.fontFamily};
            color: ${cfg.accentColor};
            page-break-after: avoid;
            break-after: avoid;
            margin-top: 22px;
            margin-bottom: 10px;
          }
          h1 { font-size: 20px; font-weight: 800; border-bottom: 1.5px solid ${cfg.accentColor}; padding-bottom: 6px; }
          h2 { font-size: 18px; font-weight: 800; }
          h3 { font-size: 16.5px; font-weight: 700; }
          h4 { font-size: 15px; font-weight: 700; }
          p {
            margin-top: 0;
            margin-bottom: 14px;
            text-indent: 26px;
            orphans: 3;
            widows: 3;
          }
          b, strong {
            font-weight: 700;
            color: #000;
          }
          blockquote {
            margin: 14px 18px;
            padding: 8px 16px;
            border-right: 3px solid ${cfg.accentColor};
            background: #FAF9F6;
            page-break-inside: avoid;
            break-inside: avoid;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin: 18px 0;
            page-break-inside: avoid;
            break-inside: avoid;
          }
          th, td {
            border: 1px solid #D5CFC5;
            padding: 7px 11px;
            font-size: 13px;
            text-align: right;
          }
          th {
            background-color: #F6F3EC;
            font-weight: 700;
          }
          .scholarly-footnote-separator {
            width: ${cfg.footnoteLine} !important;
            border-top: 1.5px solid #222 !important;
            margin-top: 26px !important;
            margin-bottom: 12px !important;
            display: ${cfg.footnoteLine === 'none' ? 'none' : 'block'} !important;
          }
          .scholarly-footnote-item {
            font-size: 13.5px !important;
            line-height: 1.8 !important;
            color: #2D2A26 !important;
            text-indent: 0 !important;
            margin-bottom: 7px !important;
            direction: rtl !important;
            text-align: right !important;
            unicode-bidi: isolate !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          .quran-verse {
            font-family: ${cfg.fontFamily};
            font-weight: 700;
            color: #1A532C;
            direction: rtl !important;
            unicode-bidi: isolate !important;
          }
          .bidi-bracket {
            direction: rtl !important;
            unicode-bidi: isolate !important;
          }
          .citation-num {
            direction: rtl !important;
            unicode-bidi: isolate !important;
            font-feature-settings: "tnum";
          }
          ${parsed.customStyle || ''}
        </style>
      </head>
      <body>
        <div class="pdf-document-body">
          ${headerHtml}
          <div class="pdf-content">
            ${parsed.html}
          </div>
          ${footerHtml}
        </div>
      </body>
      </html>
    `;
  },

  /**
   * Native Browser Vector Print Engine
   * Generates 100% vector, crisp typography with zero cut lines and zero character scrambling.
   */
  printNativePDF({ title, subtitle, meta, htmlContent, templateConfig }) {
    return new Promise((resolve) => {
      const fullHtml = this.compileFullDocumentHtml({
        title,
        subtitle,
        meta,
        htmlContent,
        templateConfig,
        isForPrint: true
      });

      let iframe = document.getElementById('pdfPrintIframe');
      if (iframe) iframe.remove();

      iframe = document.createElement('iframe');
      iframe.id = 'pdfPrintIframe';
      // Use off-screen positioning with valid layout dimensions so all modern browsers permit printing
      iframe.style.position = 'fixed';
      iframe.style.right = '-9999px';
      iframe.style.bottom = '-9999px';
      iframe.style.width = '1024px';
      iframe.style.height = '768px';
      iframe.style.border = 'none';
      iframe.style.opacity = '0.01';
      iframe.style.pointerEvents = 'none';
      document.body.appendChild(iframe);

      const doc = iframe.contentWindow.document;
      doc.open();
      doc.write(fullHtml);
      doc.close();

      const triggerPrint = () => {
        try {
          iframe.contentWindow.focus();
          iframe.contentWindow.print();
        } catch(e) {
          console.warn('Iframe print failed, opening print window:', e);
          const printWin = window.open('', '_blank');
          if (printWin) {
            printWin.document.write(fullHtml);
            printWin.document.close();
            setTimeout(() => {
              printWin.focus();
              printWin.print();
            }, 300);
          }
        }
        resolve();
      };

      // Ensure fonts and layout are ready before invoking print dialog
      if (doc.fonts && doc.fonts.ready) {
        doc.fonts.ready.then(() => {
          setTimeout(triggerPrint, 250);
        }).catch(() => {
          setTimeout(triggerPrint, 350);
        });
      } else {
        setTimeout(triggerPrint, 350);
      }
    });
  },

  /**
   * Direct PDF File Download: Generates a 100% Vector PDF via Native Chromium Engine
   * Eliminates all character flipping, bracket displacement, and footnote reversals.
   */
  async downloadPdfDirect({ title, subtitle, meta, htmlContent, templateConfig, filename }) {
    const cfg = templateConfig || this.TEMPLATES.scholarly;
    const fullHtml = this.compileFullDocumentHtml({
      title,
      subtitle,
      meta,
      htmlContent,
      templateConfig: cfg,
      isForPrint: true
    });

    const cleanFilename = (filename || `${title || 'بحث_علمي'}.pdf`).replace(/[^\w\u0600-\u06FF.-]/g, '_');

    try {
      const response = await fetch('/api/export/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          html: fullHtml,
          filename: cleanFilename
        })
      });

      if (response.ok) {
        const blob = await response.blob();
        if (blob && blob.size > 0) {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = cleanFilename;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          setTimeout(() => URL.revokeObjectURL(url), 2000);
          return true;
        }
      }
    } catch (err) {
      console.warn('Backend vector PDF download error, falling back to native print dialog:', err);
    }

    // High quality fallback: Open Native Print dialog where user can save as Vector PDF
    return this.printNativePDF({ title, subtitle, meta, htmlContent, templateConfig });
  },

  /**
   * Open the PDF Template Designer & Live Customizer Modal
   */
  openPdfDesigner(data) {
    this.currentDesignerData = data;
    
    // Ensure designer events and buttons are connected
    this.initDesignerEvents();

    // Auto extract concise title if not provided or if too verbose
    const conciseTitle = this.extractConciseTitle(data.title, data.htmlContent);
    
    // Default to scholarly heritage template
    this.activeTemplateConfig = { ...this.TEMPLATES.scholarly };

    const modal = document.getElementById('pdfDesignerModal');
    if (!modal) {
      // Fallback directly to native print if modal missing
      return this.printNativePDF({ ...data, title: conciseTitle });
    }

    // 1. Immediately show modal so the user gets instant visual confirmation
    modal.style.display = 'flex';

    // 2. Ensure Lucide icons inside modal are rendered
    if (window.lucide) {
      try { lucide.createIcons(); } catch(e) {}
    }

    // 3. Populate inputs safely
    const titleInput = document.getElementById('pdfTitleInput');
    const subtitleInput = document.getElementById('pdfSubtitleInput');
    const fontSelect = document.getElementById('pdfFontFamilySelect');
    const fontSizeSelect = document.getElementById('pdfFontSizeSelect');
    const lineHeightSelect = document.getElementById('pdfLineHeightSelect');
    const marginSelect = document.getElementById('pdfMarginSelect');
    const footnoteLineSelect = document.getElementById('pdfFootnoteLineSelect');
    const frameSelect = document.getElementById('pdfFrameSelect');
    const showHeaderCheck = document.getElementById('pdfShowHeaderCheck');
    const showDateCheck = document.getElementById('pdfShowDateCheck');
    const showPageNumbersCheck = document.getElementById('pdfShowPageNumbersCheck');

    if (titleInput) titleInput.value = conciseTitle;
    if (subtitleInput) subtitleInput.value = data.subtitle || 'تحرير علمي موثق من أمهات المصادر';
    if (fontSelect) fontSelect.value = this.activeTemplateConfig.fontFamily;
    if (fontSizeSelect) fontSizeSelect.value = this.activeTemplateConfig.fontSize;
    if (lineHeightSelect) lineHeightSelect.value = this.activeTemplateConfig.lineHeight;
    if (marginSelect) marginSelect.value = this.activeTemplateConfig.margin;
    if (footnoteLineSelect) footnoteLineSelect.value = this.activeTemplateConfig.footnoteLine;
    if (frameSelect) frameSelect.value = this.activeTemplateConfig.frame;
    if (showHeaderCheck) showHeaderCheck.checked = this.activeTemplateConfig.showHeader;
    if (showDateCheck) showDateCheck.checked = this.activeTemplateConfig.showDate;
    if (showPageNumbersCheck) showPageNumbersCheck.checked = this.activeTemplateConfig.showPageNumbers;

    // Set preset chip active
    document.querySelectorAll('.template-chip').forEach(chip => {
      chip.classList.toggle('active', chip.getAttribute('data-preset') === 'scholarly');
    });

    // 4. Render live preview sheet with error insulation
    try {
      this.updateLivePreviewSheet();
    } catch(err) {
      console.error('Error updating live preview sheet:', err);
    }
  },

  /**
   * Update the live sheet preview inside the modal
   */
  updateLivePreviewSheet() {
    const liveSheet = document.getElementById('pdfLiveSheet');
    if (!liveSheet || !this.currentDesignerData) return;

    const title = document.getElementById('pdfTitleInput')?.value.trim() || 'عنوان البحث';
    const subtitle = document.getElementById('pdfSubtitleInput')?.value.trim() || '';

    // Collect config from controls
    const cfg = {
      fontFamily: document.getElementById('pdfFontFamilySelect')?.value || "'Amiri', serif",
      fontSize: document.getElementById('pdfFontSizeSelect')?.value || '16px',
      lineHeight: document.getElementById('pdfLineHeightSelect')?.value || '2.0',
      margin: document.getElementById('pdfMarginSelect')?.value || 'normal',
      footnoteLine: document.getElementById('pdfFootnoteLineSelect')?.value || '25%',
      frame: document.getElementById('pdfFrameSelect')?.value || 'none',
      showHeader: document.getElementById('pdfShowHeaderCheck')?.checked ?? true,
      showDate: document.getElementById('pdfShowDateCheck')?.checked ?? true,
      showPageNumbers: document.getElementById('pdfShowPageNumbersCheck')?.checked ?? true,
      accentColor: this.activeTemplateConfig?.accentColor || '#8E3A24'
    };

    this.activeTemplateConfig = cfg;

    // Apply frame & margin class to sheet
    liveSheet.className = `pdf-sheet frame-${cfg.frame} margin-${cfg.margin}`;
    liveSheet.style.fontFamily = cfg.fontFamily;
    liveSheet.style.fontSize = cfg.fontSize;
    liveSheet.style.lineHeight = cfg.lineHeight;

    const parsed = this.prepareHtmlForPdf(this.currentDesignerData.htmlContent, cfg.footnoteLine);

    const headerHtml = cfg.showHeader ? `
      <div class="pdf-header" style="border-bottom: 2px solid ${cfg.accentColor}; padding-bottom: 12px; margin-bottom: 22px; display: flex; justify-content: space-between; align-items: flex-end;">
        <div style="flex: 1;">
          <div style="font-size: 20px; font-weight: 800; color: #1A1917; line-height: 1.35;">
            ${title}
          </div>
          ${subtitle ? `<div style="font-size: 12.5px; color: #666; margin-top: 3px;">${subtitle}</div>` : ''}
        </div>
        ${cfg.showDate ? `
          <div style="font-size: 11px; color: #777; text-align: left; line-height: 1.5;">
            <div><strong>التاريخ:</strong> ${new Date().toLocaleDateString('ar-EG', { dateStyle: 'long' })}</div>
            ${this.currentDesignerData.meta ? `<div>${this.currentDesignerData.meta}</div>` : ''}
          </div>
        ` : ''}
      </div>
    ` : '';

    const footerHtml = cfg.showPageNumbers ? `
      <div style="margin-top: 32px; border-top: 1px solid #E5DFD5; padding-top: 10px; font-size: 11px; color: #888; text-align: center;">
        <span>تحرير علمي موثق — خزانة المعارف والمكتبة الشاملة</span>
      </div>
    ` : '';

    liveSheet.innerHTML = `
      ${headerHtml}
      <div class="pdf-content">
        ${parsed.html}
      </div>
      ${footerHtml}
    `;
  },

  /**
   * Apply one of the preset templates
   */
  applyTemplatePreset(presetName) {
    const preset = this.TEMPLATES[presetName];
    if (!preset) return;

    this.activeTemplateConfig = { ...preset };

    const fontSelect = document.getElementById('pdfFontFamilySelect');
    const fontSizeSelect = document.getElementById('pdfFontSizeSelect');
    const lineHeightSelect = document.getElementById('pdfLineHeightSelect');
    const marginSelect = document.getElementById('pdfMarginSelect');
    const footnoteLineSelect = document.getElementById('pdfFootnoteLineSelect');
    const frameSelect = document.getElementById('pdfFrameSelect');
    const showHeaderCheck = document.getElementById('pdfShowHeaderCheck');
    const showDateCheck = document.getElementById('pdfShowDateCheck');
    const showPageNumbersCheck = document.getElementById('pdfShowPageNumbersCheck');

    if (fontSelect) fontSelect.value = preset.fontFamily;
    if (fontSizeSelect) fontSizeSelect.value = preset.fontSize;
    if (lineHeightSelect) lineHeightSelect.value = preset.lineHeight;
    if (marginSelect) marginSelect.value = preset.margin;
    if (footnoteLineSelect) footnoteLineSelect.value = preset.footnoteLine;
    if (frameSelect) frameSelect.value = preset.frame;
    if (showHeaderCheck) showHeaderCheck.checked = preset.showHeader;
    if (showDateCheck) showDateCheck.checked = preset.showDate;
    if (showPageNumbersCheck) showPageNumbersCheck.checked = preset.showPageNumbers;

    document.querySelectorAll('.template-chip').forEach(chip => {
      chip.classList.toggle('active', chip.getAttribute('data-preset') === presetName);
    });

    this.updateLivePreviewSheet();
  },

  /**
   * Export the current custom template settings to a downloadable JSON file
   */
  exportTemplateAsJson() {
    const cfg = this.activeTemplateConfig || this.TEMPLATES.scholarly;
    const jsonStr = JSON.stringify(cfg, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pdf_template_${cfg.id || 'custom'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  },

  /**
   * Import custom template settings from a JSON file
   */
  importTemplateFromJson(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const imported = JSON.parse(e.target.result);
        this.activeTemplateConfig = { ...this.TEMPLATES.scholarly, ...imported };
        
        // Sync UI inputs
        const fontSelect = document.getElementById('pdfFontFamilySelect');
        const fontSizeSelect = document.getElementById('pdfFontSizeSelect');
        const lineHeightSelect = document.getElementById('pdfLineHeightSelect');
        const marginSelect = document.getElementById('pdfMarginSelect');
        const footnoteLineSelect = document.getElementById('pdfFootnoteLineSelect');
        const frameSelect = document.getElementById('pdfFrameSelect');
        const showHeaderCheck = document.getElementById('pdfShowHeaderCheck');
        const showDateCheck = document.getElementById('pdfShowDateCheck');
        const showPageNumbersCheck = document.getElementById('pdfShowPageNumbersCheck');

        if (fontSelect && imported.fontFamily) fontSelect.value = imported.fontFamily;
        if (fontSizeSelect && imported.fontSize) fontSizeSelect.value = imported.fontSize;
        if (lineHeightSelect && imported.lineHeight) lineHeightSelect.value = imported.lineHeight;
        if (marginSelect && imported.margin) marginSelect.value = imported.margin;
        if (footnoteLineSelect && imported.footnoteLine) footnoteLineSelect.value = imported.footnoteLine;
        if (frameSelect && imported.frame) frameSelect.value = imported.frame;
        if (showHeaderCheck && typeof imported.showHeader === 'boolean') showHeaderCheck.checked = imported.showHeader;
        if (showDateCheck && typeof imported.showDate === 'boolean') showDateCheck.checked = imported.showDate;
        if (showPageNumbersCheck && typeof imported.showPageNumbers === 'boolean') showPageNumbersCheck.checked = imported.showPageNumbers;

        this.updateLivePreviewSheet();
        if (window.showToast) window.showToast('تم استيراد وتطبيق قالب PDF بنجاح! 🎉', 'success');
      } catch(err) {
        if (window.showToast) window.showToast('ملف القالب غير صالح!', 'error');
      }
    };
    reader.readAsText(file);
  },

  /**
   * Main PDF Export Entry Point: 1-Click Direct Vector PDF Generation & Download
   */
  async exportToPDF(data) {
    if (window.showToast) {
      window.showToast('جاري إنشاء وتنزيل ملف PDF عالي الدقة...', 'info');
    }
    try {
      await this.downloadPdfDirect(data);
      if (window.showToast) {
        window.showToast('تم تصدير ملف PDF بنجاح! 🎉', 'success');
      }
    } catch (err) {
      console.error('Error in exportToPDF:', err);
      // Fallback to html2pdf if client-side library is loaded
      if (window.html2pdf) {
        try {
          const printContainer = document.getElementById('pdfPrintContainer') || document.body;
          const tempDiv = document.createElement('div');
          tempDiv.style.padding = '24px';
          tempDiv.style.direction = 'rtl';
          tempDiv.style.fontFamily = "'Amiri', serif";
          tempDiv.innerHTML = `
            <div style="font-size: 18px; font-weight: bold; margin-bottom: 12px; color: #8E3A24;">${data.title || 'بحث علمي'}</div>
            ${data.subtitle ? `<div style="font-size: 13px; color: #666; margin-bottom: 16px;">${data.subtitle}</div>` : ''}
            <div>${data.htmlContent || ''}</div>
          `;
          printContainer.appendChild(tempDiv);
          await window.html2pdf().from(tempDiv).set({
            margin: [10, 10, 10, 10],
            filename: data.filename || 'report.pdf',
            html2canvas: { scale: 2 },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
          }).save();
          tempDiv.remove();
          if (window.showToast) window.showToast('تم تصدير PDF بنجاح! 🎉', 'success');
          return;
        } catch(hErr) {
          console.error('html2pdf fallback error:', hErr);
        }
      }
      if (window.showToast) {
        window.showToast('تعذر تصدير PDF: ' + err.message, 'error');
      }
    }
  },

  /**
   * Initialize Designer Event Listeners
   */
  initDesignerEvents() {
    const modal = document.getElementById('pdfDesignerModal');
    if (!modal) return;
    if (this.eventsInitialized) return;
    this.eventsInitialized = true;

    const closeBtn = document.getElementById('closePdfDesignerBtn');
    const cancelBtn = document.getElementById('cancelPdfDesignerBtn');
    const printBtn = document.getElementById('printVectorPdfBtn');
    const downloadBtn = document.getElementById('downloadPdfDirectBtn');
    const exportJsonBtn = document.getElementById('exportTemplateJsonBtn');
    const importInput = document.getElementById('importTemplateJsonInput');

    const closeModal = () => {
      modal.style.display = 'none';
    };

    if (closeBtn) closeBtn.onclick = closeModal;
    if (cancelBtn) cancelBtn.onclick = closeModal;

    // Close on clicking backdrop
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });

    // Close on Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modal.style.display === 'flex') {
        closeModal();
      }
    });

    // Live update on input changes
    const inputsToWatch = [
      'pdfTitleInput', 'pdfSubtitleInput', 'pdfFontFamilySelect', 
      'pdfFontSizeSelect', 'pdfLineHeightSelect', 'pdfMarginSelect', 
      'pdfFootnoteLineSelect', 'pdfFrameSelect', 'pdfShowHeaderCheck', 
      'pdfShowDateCheck', 'pdfShowPageNumbersCheck'
    ];

    inputsToWatch.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('input', () => this.updateLivePreviewSheet());
        el.addEventListener('change', () => this.updateLivePreviewSheet());
      }
    });

    // Preset chip clicks
    document.querySelectorAll('.template-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const preset = chip.getAttribute('data-preset');
        this.applyTemplatePreset(preset);
      });
    });

    // Action: Native Print (Vector PDF)
    if (printBtn) {
      printBtn.onclick = async () => {
        if (!this.currentDesignerData) return;
        const title = document.getElementById('pdfTitleInput')?.value.trim() || 'بحث علمي';
        const subtitle = document.getElementById('pdfSubtitleInput')?.value.trim() || '';

        const origHtml = printBtn.innerHTML;
        printBtn.disabled = true;
        printBtn.innerHTML = `<span>جاري فتح أمر الطباعة...</span>`;

        try {
          await this.printNativePDF({
            ...this.currentDesignerData,
            title,
            subtitle,
            templateConfig: this.activeTemplateConfig
          });
          setTimeout(closeModal, 600);
        } catch(e) {
          console.error(e);
        } finally {
          printBtn.disabled = false;
          printBtn.innerHTML = origHtml;
          if (window.lucide) lucide.createIcons();
        }
      };
    }

    // Action: Direct Download
    if (downloadBtn) {
      downloadBtn.onclick = async () => {
        if (!this.currentDesignerData) return;
        const title = document.getElementById('pdfTitleInput')?.value.trim() || 'بحث علمي';
        const subtitle = document.getElementById('pdfSubtitleInput')?.value.trim() || '';

        const origHtml = downloadBtn.innerHTML;
        downloadBtn.disabled = true;
        downloadBtn.innerHTML = `<span>جاري التحميل...</span>`;

        if (window.showToast) window.showToast('جاري إنشاء وتحميل ملف PDF عبر محرك المتصفح...', 'info');

        try {
          await this.downloadPdfDirect({
            ...this.currentDesignerData,
            title,
            subtitle,
            templateConfig: this.activeTemplateConfig
          });
          if (window.showToast) window.showToast('تم تصدير ملف PDF بنجاح! 🎉', 'success');
          setTimeout(closeModal, 800);
        } catch(err) {
          console.error(err);
          if (window.showToast) window.showToast('تعذر التنزيل المباشر، جرب زر الطباعة المباشرة', 'error');
        } finally {
          downloadBtn.disabled = false;
          downloadBtn.innerHTML = origHtml;
          if (window.lucide) lucide.createIcons();
        }
      };
    }

    // Action: Export Template JSON
    if (exportJsonBtn) {
      exportJsonBtn.onclick = () => this.exportTemplateAsJson();
    }

    // Action: Import Template JSON
    if (importInput) {
      importInput.onchange = (e) => {
        if (e.target.files && e.target.files[0]) {
          this.importTemplateFromJson(e.target.files[0]);
        }
      };
    }
  }
};

// Auto initialize designer events immediately if DOM is ready, or on DOMContentLoaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    ExportEngine.initDesignerEvents();
  });
} else {
  ExportEngine.initDesignerEvents();
}

window.ExportEngine = ExportEngine;
