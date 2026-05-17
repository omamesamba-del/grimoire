import json

import comfy.samplers
import comfy.sd
import comfy.utils
import folder_paths

from .state import gen_params


class PromptBuilderParams:
    """
    Prompt Builder の gen パラメータをすべて受け取り、
    CheckpointLoader + KSampler + EmptyLatentImage の代替として動作する統合ノード。
    """

    _SAMPLERS   = comfy.samplers.KSampler.SAMPLERS
    _SCHEDULERS = comfy.samplers.KSampler.SCHEDULERS

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "checkpoint":   ("STRING", {"default": ""}),
                "vae":          ("STRING", {"default": ""}),
                "sampler_name": (cls._SAMPLERS,   {"default": "euler"}),
                "scheduler":    (cls._SCHEDULERS, {"default": "normal"}),
                "steps":        ("INT",   {"default": 20,   "min": 1,   "max": 150}),
                "cfg":          ("FLOAT", {"default": 7.0,  "min": 0.0, "max": 30.0, "step": 0.5}),
                "seed":         ("INT",   {"default": 0,    "min": 0,   "max": 0xffffffffffffffff}),
                "width":        ("INT",   {"default": 832,  "min": 64,  "max": 8192, "step": 8}),
                "height":       ("INT",   {"default": 1216, "min": 64,  "max": 8192, "step": 8}),
                "clip_skip":    ("INT",   {"default": 2,    "min": 1,   "max": 12}),
                "batch_size":   ("INT",   {"default": 1,    "min": 1,   "max": 64}),
                "denoise":      ("FLOAT", {"default": 1.0,  "min": 0.0, "max": 1.0,  "step": 0.01}),
                "upscale_by":   ("FLOAT", {"default": 2.0,  "min": 1.0, "max": 8.0,  "step": 0.25}),
            }
        }

    RETURN_TYPES = (
        "MODEL", "CLIP", "VAE",
        comfy.samplers.KSampler.SAMPLERS,
        comfy.samplers.KSampler.SCHEDULERS,
        "INT", "FLOAT", "INT", "INT", "INT", "INT", "INT", "FLOAT", "FLOAT",
    )
    RETURN_NAMES = (
        "MODEL", "CLIP", "VAE",
        "sampler_name", "scheduler",
        "steps", "cfg", "seed",
        "width", "height", "stop_at_clip_layer",
        "batch_size", "denoise", "upscale_by",
    )
    FUNCTION  = "execute"
    CATEGORY  = "PromptBuilder"
    DESCRIPTION = "All-in-one node. Receives gen params from Prompt Builder and loads checkpoint."

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        return json.dumps(gen_params, sort_keys=True)

    def execute(self, checkpoint, vae, sampler_name, scheduler,
                steps, cfg, seed, width, height,
                clip_skip, batch_size, denoise, upscale_by):
        p = gen_params

        # ── checkpoint ────────────────────────────────────────────────────
        ckpt_name = p.get("checkpoint", checkpoint)
        available = folder_paths.get_filename_list("checkpoints")
        if ckpt_name not in available:
            ckpt_name = available[0] if available else None
        if not ckpt_name:
            raise ValueError("No checkpoints found.")
        ckpt_path = folder_paths.get_full_path("checkpoints", ckpt_name)
        model, clip, vae_obj = comfy.sd.load_checkpoint_guess_config(
            ckpt_path,
            output_vae=True,
            output_clip=True,
            embedding_directory=folder_paths.get_folder_paths("embeddings"),
        )[:3]

        # ── VAE: Automatic 以外なら外部ファイルをロード ───────────────────
        vae_name = p.get("vae", vae) or "Automatic"
        if vae_name not in ("Automatic", "", None):
            vae_available = folder_paths.get_filename_list("vae")
            if vae_name in vae_available:
                vae_path = folder_paths.get_full_path("vae", vae_name)
                vae_sd   = comfy.utils.load_torch_file(vae_path)
                vae_obj  = comfy.sd.VAE(sd=vae_sd)

        # ── sampler / scheduler ───────────────────────────────────────────
        s = p.get("sampler_name", "")
        if s in self._SAMPLERS:
            sampler_name = s
        sc = p.get("scheduler", "")
        if sc in self._SCHEDULERS:
            scheduler = sc

        # ── numeric params ────────────────────────────────────────────────
        return (
            model, clip, vae_obj,
            sampler_name, scheduler,
            int(p.get("steps",        steps)),
            float(p.get("cfg",        cfg)),
            int(p.get("seed",         seed)),
            int(p.get("width",        width)),
            int(p.get("height",       height)),
            int(p.get("clip_skip",    clip_skip)),
            int(p.get("batch_size",   batch_size)),
            float(p.get("denoise",    denoise)),
            float(p.get("upscale_by", upscale_by)),
        )


NODE_CLASS_MAPPINGS = {
    "PromptBuilderParams": PromptBuilderParams,
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "PromptBuilderParams": "PB Params",
}
