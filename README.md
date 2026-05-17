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
git clone https://github.com/your-username/grimoire.git
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

Copy `webui-extension/grimoire-bridge/` into your WebUI's `extensions/` folder and restart WebUI.

## License

MIT
