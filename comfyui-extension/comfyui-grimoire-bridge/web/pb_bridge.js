import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";


app.registerExtension({
    name: "PromptBuilder.Bridge",

    nodeCreated(node) {
        if (node.type !== "PromptBuilderJoin") return;

        // text_1 がなければ追加
        if (!node.inputs?.find(i => i.name === "text_1")) {
            node.addInput("text_1", "STRING");
        }

        node.addWidget("button", "+ Add input", null, () => {
            const count = node.inputs.filter(i => i.name.startsWith("text_")).length;
            node.addInput(`text_${count + 1}`, "STRING");
            app.graph.setDirtyCanvas(true, true);
        });

        node.addWidget("button", "- Remove input", null, () => {
            const textInputs = node.inputs
                .map((inp, idx) => ({ inp, idx }))
                .filter(({ inp }) => inp.name.startsWith("text_"));
            if (textInputs.length <= 1) return;
            const { idx } = textInputs[textInputs.length - 1];
            node.removeInput(idx);
            app.graph.setDirtyCanvas(true, true);
        });
    },

    setup() {
        // ── スロット更新 → PromptBuilderSlot の text ウィジェットを書き換え ──
        api.addEventListener("pb:slot-updated", ({ detail }) => {
            const { slot, text } = detail;
            for (const node of app.graph._nodes ?? []) {
                if (node.type !== "PromptBuilderSlot") continue;
                const slotW = node.widgets?.find(w => w.name === "slot_name");
                const textW = node.widgets?.find(w => w.name === "text");
                if (slotW?.value === slot && textW) {
                    textW.value = text;
                    if (textW.inputEl) textW.inputEl.value = text;
                    node.setDirtyCanvas(true, true);
                }
            }
        });

        // ── Gen 更新 → PB Gen Params の各ウィジェットを個別更新 ────────────
        api.addEventListener("pb:gen-updated", ({ detail: p }) => {
            const fields = {
                checkpoint: p.checkpoint   ?? "",
                vae:        p.vae          ?? "",
                sampler_name: p.sampler_name ?? "",
                scheduler:  p.scheduler    ?? "",
                steps:      p.steps        ?? 20,
                cfg:        p.cfg          ?? 7.0,
                seed:       p.seed         ?? 0,
                width:      p.width        ?? 832,
                height:     p.height       ?? 1216,
                clip_skip:  p.clip_skip    ?? 2,
                batch_size: p.batch_size   ?? 1,
                denoise:    p.denoise      ?? 1.0,
                upscale_by: p.upscale_by   ?? 2.0,
            };
            for (const node of app.graph._nodes ?? []) {
                if (node.type !== "PromptBuilderParams") continue;
                for (const [name, val] of Object.entries(fields)) {
                    const w = node.widgets?.find(w => w.name === name);
                    if (!w) continue;
                    w.value = val;
                    if (w.inputEl) w.inputEl.value = val;
                }
                node.setDirtyCanvas(true, true);
            }
        });

        // ── スキャン要求 → スロット名を収集して登録 ──────────────────────
        api.addEventListener("pb:request-scan", async () => {
            const slots = [];
            for (const node of app.graph._nodes ?? []) {
                if (node.type === "PromptBuilderSlot") {
                    const w = node.widgets?.find(w => w.name === "slot_name");
                    if (w?.value) slots.push(w.value);
                }
            }
            try {
                await fetch("/pb/register-slots", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ slots }),
                });
            } catch (e) {
                console.warn("[PB Bridge] register-slots failed:", e);
            }
        });

        // ── 生成トリガー ──────────────────────────────────────────────────
        api.addEventListener("pb:trigger", async () => {
            try {
                await app.queuePrompt(0, 1);
            } catch (e) {
                console.warn("[PB Bridge] queuePrompt failed:", e);
            }
        });
    },
});
