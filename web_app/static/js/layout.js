/* =====================================================================
   layout.js — إعادة ترتيب الصفحة دون المساس بالمعرّفات أو مستمعي الأحداث
   يعمل بعد main.js: يحرّك العناصر الموجودة فقط (لا يحذف ولا يعيد إنشاء)
   ===================================================================== */
(function () {
    'use strict';

    const $all = (sel, root = document) => Array.from(root.querySelectorAll(sel));
    const txt = el => (el && el.textContent || '').replace(/\s+/g, ' ').trim();

    /* أصغر عنصر يحوي النص المطلوب */
    function findByText(text, selector) {
        selector = selector || 'h1,h2,h3,h4,h5,h6,label,legend,summary,span,div,p,button,option,strong,b';
        const list = $all(selector).filter(el => txt(el).includes(text));
        if (!list.length) return null;
        return list.reduce((a, b) => (txt(a).length <= txt(b).length ? a : b));
    }

    /* الجدّ المشترك لمجموعة عناصر */
    function commonAncestor(els) {
        els = els.filter(Boolean);
        if (!els.length) return null;
        let node = els[0];
        while (node && node !== document.body && !els.every(e => node.contains(e))) node = node.parentElement;
        return node && node !== document.body ? node : null;
    }

    /* حاوية الحقل: العنوان + عنصر التحكم الذي يليه */
    function fieldOf(label) {
        if (!label) return null;
        if (label.tagName === 'SELECT' || label.tagName === 'INPUT') {
            const prev = label.previousElementSibling;
            if (prev && /LABEL|SPAN|DIV|H\d/.test(prev.tagName) && !prev.querySelector('select,input')) label = prev;
            else {
                const p = label.parentElement;
                return p && p.querySelectorAll('select,input:not([type=hidden]),textarea').length <= 1 ? p : label;
            }
        }
        const p = label.parentElement;
        if (!p || p === document.body) return null;
        const controls = p.querySelectorAll('select,input:not([type=hidden]),textarea');
        if (controls.length <= 1 && p.children.length <= 3) return p;
        const wrap = document.createElement('div');
        wrap.className = 'layout-field';
        const next = label.nextElementSibling;
        p.insertBefore(wrap, label);
        wrap.appendChild(label);
        if (next && next.matches('select,input,textarea,div,span')) wrap.appendChild(next);
        return wrap;
    }

    /* بطاقة القسم: أول أب يحوي عناصر تحكم وأكثر من ابن */
    function cardOf(heading) {
        let el = heading;
        while (el && el.parentElement && el.parentElement !== document.body) {
            const p = el.parentElement;
            if (p.querySelector('input,select,textarea,button') && p.children.length > 1) return p;
            el = p;
        }
        return heading.parentElement;
    }

    function toDetails(card, title, open) {
        if (!card || card.closest('details.layout-group')) return null;
        const details = document.createElement('details');
        details.className = 'layout-group';
        details.open = !!open;
        const summary = document.createElement('summary');
        summary.textContent = title;
        details.appendChild(summary);
        card.parentNode.insertBefore(details, card);
        details.appendChild(card);
        return details;
    }

    function removeEmpty(el) {
        while (el && el !== document.body && el.children.length === 0 && !txt(el)) {
            const p = el.parentElement; el.remove(); el = p;
        }
    }

    /* ========== أ. طيّ خيارات البحث المتقدمة ========== */
    function buildAdvancedSearch() {
        const labelTexts = ['فهرس البحث والتضمين', 'القسم / التصنيف', 'عدد النتائج', 'فرز متقاطع (Reranker)'];
        const fields = labelTexts
            .map(t => findByText(t, 'label,legend,h3,h4,h5,span,div,strong,b'))
            .map(fieldOf).filter(Boolean);

        const modeEls = ['بحث هجين متقدم (RRF)', 'بحث دلالي عصبي (Dense)', 'بحث لفظي دقيق (Sparse)']
            .map(t => findByText(t, 'option,button,label,span,div'));
        let modes = null;
        if (modeEls[0] && modeEls[0].tagName === 'OPTION') modes = fieldOf(modeEls[0].closest('select'));
        else modes = commonAncestor(modeEls);

        const all = [modes, ...fields].filter((f, i, arr) => f && arr.indexOf(f) === i);
        if (all.length < 2) return;

        /* نقطة الإدراج: بعد شريط نطاق البحث أو قبل الإحصائيات */
        let anchor = findByText('نطاق البحث: جميع كتب المكتبة الشاملة');
        anchor = anchor ? cardOf(anchor) : null;
        if (!anchor || all.some(f => anchor.contains(f))) {
            const stat = findByText('صفحة مفهرسة بالكامل');
            anchor = stat ? cardOf(stat).parentElement : null;
            if (anchor) anchor = anchor.previousElementSibling || anchor;
        }
        if (!anchor) return;

        const details = document.createElement('details');
        details.className = 'layout-group advanced-search';
        const summary = document.createElement('summary');
        summary.textContent = '⚙️ خيارات البحث المتقدمة (وضع البحث، الفهرس، التصنيف، عدد النتائج، Reranker)';
        const grid = document.createElement('div');
        grid.className = 'advanced-grid';
        details.append(summary, grid);

        const parents = all.map(f => f.parentElement);
        all.forEach(f => grid.appendChild(f));
        if (modes) modes.classList.add('span-2');
        anchor.after(details);
        parents.forEach(removeEmpty);
    }

    /* ========== ب. لوحة RAG: محادثة + إعدادات جانبية مطوية ========== */
    function buildRagLayout() {
        const title = findByText('التحقيق العلمي وربط الشاملة بالذكاء الاصطناعي', 'h1,h2,h3,h4')
            || findByText('التحقيق والذكاء الاصطناعي', 'h1,h2,h3,h4');
        const section = title && (title.closest('section') || cardOf(title));
        if (!section) return;

        /* لوحة المحادثة: أصغر حاوية تضم زر "مسح المحادثة" أو textarea الرسائل */
        let chat = null;
        const clearBtn = findByText('مسح المحادثة', 'button,a,span');
        if (clearBtn && section.contains(clearBtn)) {
            chat = clearBtn.parentElement;
            while (chat && chat !== section && !chat.querySelector('textarea,input[type=text]')) chat = chat.parentElement;
        }
        if (!chat || chat === section) {
            const ta = section.querySelector('textarea');
            if (!ta) return;
            chat = ta.parentElement;
            while (chat && chat.parentElement !== section && chat.parentElement) chat = chat.parentElement;
        }
        if (!chat || chat === section) return;
        chat.classList.add('chat-panel');

        const groups = [];

        const providerOpt = findByText('OpenRouter', 'option');
        const fetchBtn = findByText('جلب النماذج', 'button');
        const providerCard = commonAncestor([providerOpt && providerOpt.closest('select'), fetchBtn]);
        if (providerCard && !providerCard.contains(chat) && !chat.contains(providerCard) && providerCard !== section) {
            groups.push([providerCard, '🌐 المزوّد والنموذج', true]);
        }

        [
            ['استرجاع نصوص الشاملة', '📚 استرجاع الشاملة (RAG)', true],
            ['تجميع كتب محددة', '📦 تجميعات الكتب', false],
            ['معلمات التوليد', '🎛️ معلمات التوليد', false],
            ['تعليمات النظام', '📜 تعليمات النظام', false],
            ['النماذج المساعدة (Multi-Agent', '🤖 النماذج المساعدة', false],
            ['هيكلة الإخراج', '📐 هيكلة الإخراج JSON', false],
            ['منصة CraftMyPDF', '🎨 تقارير CraftMyPDF', false],
        ].forEach(([needle, label, open]) => {
            const h = findByText(needle, 'h2,h3,h4,h5,legend,span,div,strong,b');
            const card = h && cardOf(h);
            if (!card || card === section || card.contains(chat) || chat.contains(card)) return;
            if (groups.some(g => g[0] === card || g[0].contains(card) || card.contains(g[0]))) return;
            h.classList.add('layout-hidden-heading');
            groups.push([card, label, open]);
        });
        if (!groups.length) return;

        const layout = document.createElement('div');
        layout.className = 'rag-layout';
        const main = document.createElement('div');
        main.className = 'rag-main';
        const aside = document.createElement('aside');
        aside.className = 'settings-panel';

        chat.parentNode.insertBefore(layout, chat);
        main.appendChild(chat);
        const oldParents = groups.map(([card]) => card.parentElement);
        groups.forEach(([card, label, open]) => {
            const d = toDetails(card, label, open);
            if (d) aside.appendChild(d);
        });
        layout.append(main, aside);
        oldParents.forEach(removeEmpty);
    }

    /* ========== ج. تبديل السمة (الزر ☀️ في الهيدر) ========== */
    function initTheme() {
        const root = document.documentElement;
        const saved = localStorage.getItem('theme');
        root.dataset.theme = saved === 'light' ? 'light' : 'dark';

        const btn = document.querySelector('.theme-toggle') ||
            $all('button,a,span').find(b => ['☀️', '🌙'].includes(txt(b)));
        const paint = () => { if (btn) btn.textContent = root.dataset.theme === 'dark' ? '☀️' : '🌙'; };

        /* مزامنة مع أي نظام سمة قديم في main.js يعتمد على فئة في body */
        const sync = () => {
            const cls = (document.body.className + ' ' + root.className).toLowerCase();
            if (/\blight/.test(cls)) root.dataset.theme = 'light';
            else if (/\bdark/.test(cls)) root.dataset.theme = 'dark';
            paint();
        };
        new MutationObserver(sync).observe(document.body, { attributes: true, attributeFilter: ['class'] });

        paint();
        if (!btn) return;
        btn.addEventListener('click', () => {
            setTimeout(() => {
                const cls = (document.body.className + ' ' + root.className).toLowerCase();
                if (!/\b(light|dark)/.test(cls)) {
                    root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
                }
                localStorage.setItem('theme', root.dataset.theme);
                paint();
            }, 0);
        });
    }

    function run() {
        [buildAdvancedSearch, buildRagLayout, initTheme].forEach(fn => {
            try { fn(); } catch (e) { console.warn('[layout.js]', fn.name, e); }
        });
        document.documentElement.classList.add('layout-ready');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(run, 50));
    } else {
        setTimeout(run, 50);
    }
})();