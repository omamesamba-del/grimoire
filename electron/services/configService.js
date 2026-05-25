import fs from 'node:fs';
import path from 'node:path';

export class ConfigService {
  constructor(dataDirPath) {
    this.configPath = path.join(dataDirPath, 'config.json');
    this.defaults = {
      loraPath: '',
      embeddingsPath: '',
      tagsPath: '',
      yamlOutputPath: '',
      windowBounds: { width: 1400, height: 900, x: undefined, y: undefined },
      isMaximized: false,
      checkpointsPath: '',
      vaesPath: '',
      upscalersPath: '',
      customARs: "1:1, 4:3, 3:4, 3:2, 2:3, 16:9, 9:16, 21:9, 9:21",
      customResolutions: "512x512, 512x768, 768x512, 1024x1024, 832x1216, 1216x832, 896x1152, 1152x896, 768x1344, 1344x768, 640x1536, 1536x640",
      webuiUrl: 'http://127.0.0.1:7860',
      sendPromptEnabled: true,
      sendGenSettingsEnabled: true,
      aiProvider: 'ollama',
      ollamaUrl: 'http://localhost:11434',
      ollamaModel: 'llama3',
      claudeApiKey: '',
      claudeModel: '',
      openaiApiKey: '',
      openaiModel: '',
      yamlAutoSave: false,
      allowMultipleInstances: false,
      danbooruUnderscoreToSpace: true,
      shortcuts: {},
      language: 'en'
    };
    
    // Ensure data directory exists
    if (!fs.existsSync(dataDirPath)) {
      fs.mkdirSync(dataDirPath, { recursive: true });
    }

    this.ensureConfigExists();
  }

  ensureConfigExists() {
    if (!fs.existsSync(this.configPath)) {
      fs.writeFileSync(this.configPath, JSON.stringify(this.defaults, null, 2), 'utf8');
    }
  }

  getConfig() {
    try {
      const data = fs.readFileSync(this.configPath, 'utf8');
      const loaded = JSON.parse(data);
      // Merge with defaults in case of new fields
      return { ...this.defaults, ...loaded };
    } catch (e) {
      console.error('[ConfigService] Failed to read config.json, using defaults.', e);
      return this.defaults;
    }
  }

  saveConfig(newConfig) {
    try {
      const currentConfig = this.getConfig();
      const finalConfig = { ...currentConfig, ...newConfig };
      fs.writeFileSync(this.configPath, JSON.stringify(finalConfig, null, 2), 'utf8');
      return { success: true, config: finalConfig };
    } catch (e) {
      console.error('[ConfigService] Failed to save config.json', e);
      return { success: false, error: e.message };
    }
  }
}
