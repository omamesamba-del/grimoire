/**
 * grimoire Bridge — WebUI Frontend v1.3.0
 * Compatible with: AUTOMATIC1111 WebUI / SD.Next / Forge / Forge Neo
 * Polls /pb/poll for pending prompts and fills txt2img form + clicks Generate.
 * State is pushed on-demand only (when grimoire requests it via /pb/request-state).
 */
(function () {
    'use strict';

    const POLL_INTERVAL_MS = 500;
    const STARTUP_DELAY_MS = 1500;
    const VERSION = '1.3.0';

    // ── DOM ヘルパー ──────────────────────────────────────────────────────────

    /** Gradio のルート要素を返す（shadow DOM 対応・Forge Neo 対応） */
    function gradioApp() {
        const el = document.querySelector('gradio-app');
        if (el) return el.shadowRoot || el;
        // Forge Neo / React フロントエンド向けフォールバック
        return document.body;
    }

    /**
     * 複数セレクタを順番に試し、最初にヒットした要素を返す。
     * 第1引数に root 要素、以降にセレクタ文字列を渡す。
     */
    function findFirst(root, ...selectors) {
        for (const sel of selectors) {
            try {
                const el = root.querySelector(sel);
                if (el) return el;
            } catch (_) {}
        }
        return null;
    }

    /** テキストエリアを Gradio の state を壊さずに書き換える */
    function setTextarea(el, value) {
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
        setter.call(el, value);
        el.dispatchEvent(new Event('input', { bubbles: true }));
    }

    // ── 要素取得ヘルパー（A1111 / Forge / Forge Neo 対応フォールバック） ────

    function getPositiveTextarea(root) {
        return findFirst(root,
            '#txt2img_prompt textarea',
            '#txt2img_toprow_prompt textarea',
            // Forge Neo が採用する可能性のある新 ID
            '#txt2img-prompt textarea',
            '[id^="txt2img"][id$="prompt"]:not([id*="neg"]) textarea',
        );
    }

    function getNegativeTextarea(root) {
        return findFirst(root,
            '#txt2img_neg_prompt textarea',
            '#txt2img_toprow_negative_prompt textarea',
            '#txt2img-neg-prompt textarea',
            '[id^="txt2img"][id*="neg"] textarea',
        );
    }

    function getGenerateBtn(root) {
        return findFirst(root,
            '#txt2img_generate',
            'button#txt2img_generate',
            // Forge Neo ボタン ID パターン
            '[id$="_generate"][id^="txt2img"]',
            'button[id*="txt2img"][id*="generate"]',
        );
    }

    function getInterruptBtn(root) {
        return findFirst(root,
            '#txt2img_interrupt',
            '[id$="_interrupt"][id^="txt2img"]',
            'button[id*="txt2img"][id*="interrupt"]',
        );
    }

    // ── State 読み取り（複数 ID フォールバック） ─────────────────────────────

    /** 数値 Gradio コンポーネントから値を読む（複数 ID 対応） */
    function readNum(root, ...ids) {
        for (const id of ids) {
            const el = root.querySelector(`#${id}`);
            if (!el) continue;
            const inp = el.querySelector('input[type="number"]') || el.querySelector('input');
            if (!inp) continue;
            const v = parseFloat(inp.value);
            if (!isNaN(v)) return v;
        }
        return undefined;
    }

    /** ドロップダウン / select から現在値を読む（複数 ID 対応） */
    function readDropdown(root, ...ids) {
        for (const id of ids) {
            const el = root.querySelector(`#${id}`);
            if (!el) continue;
            // パターン①: native select
            const sel = el.querySelector('select');
            if (sel && sel.value) return sel.value;
            // パターン②: Gradio 4 カスタムドロップダウン (input[type="text"])
            const inp = el.querySelector('input[type="text"]');
            if (inp && inp.value) return inp.value;
            // パターン③: ボタン式 (selected / aria-selected)
            const btn = el.querySelector('button.selected, [aria-selected="true"]');
            if (btn && btn.textContent.trim()) return btn.textContent.trim();
        }
        return undefined;
    }

    /** checkbox から checked を読む（複数 ID 対応） */
    function readCheckbox(root, ...ids) {
        for (const id of ids) {
            const el = root.querySelector(`#${id}`);
            if (!el) continue;
            const cb = el.querySelector('input[type="checkbox"]');
            if (cb) return cb.checked;
        }
        return undefined;
    }

    // ── 数値 / ドロップダウン / チェックボックス 書き込みヘルパー ─────────────

    /** Gradio の数値スライダーに値をセットして input/change イベントを発火する */
    function setNum(root, id, value) {
        if (value == null || isNaN(value)) return;
        const el = root.querySelector(`#${id}`);
        if (!el) return;
        const inp = el.querySelector('input[type="number"]') || el.querySelector('input');
        if (!inp) return;
        const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        nativeSetter.call(inp, String(value));
        inp.dispatchEvent(new Event('input',  { bubbles: true }));
        inp.dispatchEvent(new Event('change', { bubbles: true }));
    }

    /** Gradio のドロップダウンに値をセットする（select / カスタム input 両対応） */
    function setDropdown(root, value, ...ids) {
        if (value == null) return;
        for (const id of ids) {
            const el = root.querySelector(`#${id}`);
            if (!el) continue;
            // パターン①: native select
            const sel = el.querySelector('select');
            if (sel) {
                const nativeSetter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
                nativeSetter.call(sel, value);
                sel.dispatchEvent(new Event('change', { bubbles: true }));
                return;
            }
            // パターン②: Gradio 4 カスタムドロップダウン (input[type="text"])
            const inp = el.querySelector('input[type="text"]');
            if (inp) {
                const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
                nativeSetter.call(inp, value);
                inp.dispatchEvent(new Event('input',  { bubbles: true }));
                inp.dispatchEvent(new Event('change', { bubbles: true }));
                return;
            }
        }
    }

    /** Gradio のチェックボックスに値をセットする */
    function setCheckbox(root, checked, ...ids) {
        if (checked == null) return;
        for (const id of ids) {
            const el = root.querySelector(`#${id}`);
            if (!el) continue;
            const cb = el.querySelector('input[type="checkbox"]');
            if (!cb) continue;
            if (cb.checked !== !!checked) {
                cb.click();
            }
            return;
        }
    }

    /** gen オブジェクトの各フィールドを WebUI フォームに適用する */
    function applyGen(root, gen) {
        if (!gen) return;
        setNum(root, 'txt2img_steps',             gen.steps);
        setNum(root, 'txt2img_cfg_scale',          gen.cfg);
        setNum(root, 'txt2img_width',              gen.width);
        setNum(root, 'txt2img_height',             gen.height);
        setNum(root, 'txt2img_seed',               gen.seed);
        setNum(root, 'txt2img_batch_count',        gen.batchCount);
        setNum(root, 'txt2img_batch_size',         gen.batchSize);
        setNum(root, 'txt2img_hires_steps',        gen.hiresSteps);
        setNum(root, 'txt2img_denoising_strength', gen.hiresDenoising);
        setNum(root, 'txt2img_hr_scale',           gen.hiresUpscaleBy);
        setDropdown(root, gen.sampler,       'txt2img_sampling', 'txt2img_sampler_name', 'txt2img_sampler');
        setDropdown(root, gen.schedule,      'txt2img_scheduler', 'txt2img_scheduler_type');
        setDropdown(root, gen.hiresUpscaler, 'txt2img_hr_upscaler', 'txt2img_hr_upscaler_name');
        setCheckbox(root, gen.hiresFix,      'txt2img_enable_hr', 'txt2img_hr_enable');
    }

    // ── プロンプト適用 ────────────────────────────────────────────────────────

    function applyPrompt(data) {
        const root  = gradioApp();
        const posEl = getPositiveTextarea(root);
        const negEl = getNegativeTextarea(root);

        if (!posEl || !negEl) {
            console.warn('[PB Bridge] txt2img の prompt textarea が見つかりません。WebUI が完全に読み込まれるまで待ってください。');
            return;
        }

        if (data.mode === 'generate-only') {
            // プロンプトは変更せず Generate だけクリック
        } else if (data.mode === 'append') {
            const posSep = posEl.value.trim() ? ', ' : '';
            const negSep = negEl.value.trim() ? ', ' : '';
            setTextarea(posEl, posEl.value + posSep + (data.positive || ''));
            if (data.negative) setTextarea(negEl, negEl.value + negSep + data.negative);
        } else {
            // overwrite
            setTextarea(posEl, data.positive || '');
            setTextarea(negEl, data.negative || '');
        }

        // gen 設定を WebUI フォームに適用
        if (data.gen) applyGen(root, data.gen);

        if (data.trigger !== false) {
            setTimeout(() => {
                const root2 = gradioApp();
                const btn = getGenerateBtn(root2);
                if (!btn) {
                    console.warn('[PB Bridge] Generate ボタンが見つかりません。');
                    return;
                }
                // 生成中（Interrupt ボタン表示中）はスキップ
                const interrupt = getInterruptBtn(root2);
                const isGenerating = interrupt && interrupt.offsetParent !== null;
                if (isGenerating) {
                    console.warn('[PB Bridge] WebUI は生成中のため Generate をスキップしました。');
                    return;
                }
                btn.click();
            }, 150);
        }
    }

    // ── ポーリング ────────────────────────────────────────────────────────────

    async function poll() {
        try {
            const res = await fetch('/pb/poll');
            if (res.ok) {
                const data = await res.json();
                if (data) {
                    if (data.__state_request__) {
                        pushStateNow();
                        const { __state_request__: _, ...rest } = data;
                        if (Object.keys(rest).length > 0) applyPrompt(rest);
                    } else {
                        applyPrompt(data);
                    }
                }
            }
        } catch (_) {
            // WebUI がまだ起動中などは無視
        }
        setTimeout(poll, POLL_INTERVAL_MS);
    }

    // ── State push (WebUI → grimoire) ────────────────────────────────────────

    function readCurrentState() {
        const root  = gradioApp();
        const posEl = getPositiveTextarea(root);
        const negEl = getNegativeTextarea(root);
        if (!posEl) return null;

        return {
            positive: posEl.value,
            negative: negEl ? negEl.value : '',
            gen: {
                steps:          readNum(root, 'txt2img_steps'),
                cfg:            readNum(root, 'txt2img_cfg_scale'),
                width:          readNum(root, 'txt2img_width'),
                height:         readNum(root, 'txt2img_height'),
                seed:           readNum(root, 'txt2img_seed'),
                batchCount:     readNum(root, 'txt2img_batch_count'),
                batchSize:      readNum(root, 'txt2img_batch_size'),
                // サンプラー: A1111=txt2img_sampling, Forge/Forge Neo=txt2img_sampler_name or txt2img_sampler
                sampler:        readDropdown(root, 'txt2img_sampling', 'txt2img_sampler_name', 'txt2img_sampler'),
                // スケジューラー: A1111/Forge=txt2img_scheduler, Forge Neo=txt2img_scheduler_type
                schedule:       readDropdown(root, 'txt2img_scheduler', 'txt2img_scheduler_type'),
                hiresFix:       readCheckbox(root, 'txt2img_enable_hr', 'txt2img_hr_enable'),
                hiresUpscaler:  readDropdown(root, 'txt2img_hr_upscaler', 'txt2img_hr_upscaler_name'),
                hiresSteps:     readNum(root, 'txt2img_hires_steps', 'txt2img_hr_steps'),
                hiresDenoising: readNum(root, 'txt2img_denoising_strength', 'txt2img_hr_denoising_strength'),
                hiresUpscaleBy: readNum(root, 'txt2img_hr_scale'),
            },
        };
    }

    async function pushStateNow() {
        try {
            const state = readCurrentState();
            if (state) {
                await fetch('/pb/push-state', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(state),
                });
            }
        } catch (_) {}
    }

    setTimeout(poll, STARTUP_DELAY_MS);
    console.log(`[grimoire Bridge] loaded v${VERSION}`);
})();
