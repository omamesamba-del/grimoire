import fs from 'node:fs';
import path from 'node:path';

export class PresetService {
  constructor(dataDirPath) {
    this.presetPath = path.join(dataDirPath, 'presets.json');
    this.ensurePresetExists();
  }

  ensurePresetExists() {
    if (!fs.existsSync(path.dirname(this.presetPath))) {
      fs.mkdirSync(path.dirname(this.presetPath), { recursive: true });
    }
    if (!fs.existsSync(this.presetPath)) {
      // Default empty object
      fs.writeFileSync(this.presetPath, JSON.stringify({}, null, 2), 'utf8');
    }
  }

  getAllPresets() {
    try {
      const data = fs.readFileSync(this.presetPath, 'utf8');
      return JSON.parse(data);
    } catch (e) {
      console.error('[PresetService] Failed to read presets.json', e);
      return {};
    }
  }

  savePreset(name, positiveContent, negativeContent) {
    try {
      const presets = this.getAllPresets();
      presets[name] = {
        positive: positiveContent,
        negative: negativeContent,
        updatedAt: new Date().toISOString()
      };
      fs.writeFileSync(this.presetPath, JSON.stringify(presets, null, 2), 'utf8');
      return { success: true, presets };
    } catch (e) {
      console.error('[PresetService] Failed to save preset', e);
      return { success: false, error: e.message };
    }
  }

  deletePreset(name) {
    try {
      const presets = this.getAllPresets();
      if (presets[name]) {
        delete presets[name];
        fs.writeFileSync(this.presetPath, JSON.stringify(presets, null, 2), 'utf8');
      }
      return { success: true, presets };
    } catch (e) {
      console.error('[PresetService] Failed to delete preset', e);
      return { success: false, error: e.message };
    }
  }
}
