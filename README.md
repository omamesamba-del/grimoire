# grimoire

A prompt library and builder for Stable Diffusion / ComfyUI.

Organize your favorite tags in YAML files, build prompts visually, and send them directly to your WebUI or ComfyUI workflow.

## Features

- **Library** — Browse tags organized by category. Import from YAML files.
- **Builder** — Drag-and-drop prompt chips with positive/negative separation.
- **AI Assist** — Generate prompt ideas via Ollama, Claude API, or OpenAI.
- **WebUI Bridge** — Send prompts directly to AUTOMATIC1111 / Forge / SD.Next.
- **ComfyUI Bridge** — Send prompts to ComfyUI workflow slots.
- **Images** — Browse generated output images with built-in metadata viewer.

## Requirements

- [Node.js](https://nodejs.org/) v18 or later
- [Git](https://git-scm.com/)

## Getting Started

```bash
git clone https://github.com/omamesamba-del/grimoire.git
cd grimoire
npm install
npm start
```

Or download the portable `.exe` from [Releases](../../releases).

## YAML Library Format

Place `.yml` files in the `tag/` folder. Each file defines categories and tags:

```yaml
- category: My Category
  color: "#4a9eff"
  tags:
    - name: My Group
      tags:
        - masterpiece
        - best quality
```

## WebUI Bridge

**Repository:** [sd-webui-grimoire-bridge](https://github.com/omamesamba-del/sd-webui-grimoire-bridge)

1. Clone or download the repository into your WebUI's `extensions/` folder:
   ```bash
   cd extensions
   git clone https://github.com/omamesamba-del/sd-webui-grimoire-bridge.git
   ```
2. Restart WebUI.
3. In grimoire, go to **Settings → Generation** and set the WebUI URL (default: `http://127.0.0.1:7860`).

## ComfyUI Bridge

**Repository:** [comfyui-grimoire-bridge](https://github.com/omamesamba-del/comfyui-grimoire-bridge)

1. Clone or download the repository into your ComfyUI's `custom_nodes/` folder:
   ```bash
   cd custom_nodes
   git clone https://github.com/omamesamba-del/comfyui-grimoire-bridge.git
   ```
2. Restart ComfyUI.
3. Add a **Grimoire Slot** node to your workflow and give it a slot name.
4. In grimoire, go to **Settings → Generation** and set the ComfyUI URL (default: `http://127.0.0.1:8188`) and the slot name.

## License

MIT
