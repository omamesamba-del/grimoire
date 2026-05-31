/**
 * Centralized IPC Bridge for grimoire
 * Handles Electron communication and provides Mock Data for AI verification mode.
 */

const isElectron = !!(window.electronAPI);

export const IPC = {
    async log(msg, level = 'info') {
        if (isElectron) return await window.electronAPI.log(msg, level);
        console.log(`[MOCK-LOG] [${level.toUpperCase()}] ${msg}`);
    },

    async getConfig() {
        if (isElectron) return await window.electronAPI.getConfig();
        return {
            loraPath: 'C:\\Mock\\Loras',
            embeddingsPath: 'C:\\Mock\\Embeddings',
            tagsPath: 'C:\\Mock\\Tags',
            yamlOutputPath: 'C:\\Mock\\Export',
            customARs: '1:1, 4:3, 16:9, 21:9',
            customResolutions: '1024x1024, 1280x720, 1920x1080'
        };
    },

    async saveConfig(data) {
        if (isElectron) return await window.electronAPI.saveConfig(data);
        console.log('[MOCK-CONFIG-SAVE]', data);
        return { success: true };
    },

    async getAllTags() {
        if (isElectron) return await window.electronAPI.getAllTags();
        // Return dummy tags for AI verification
        return [
            {
                id: '01_Basic',
                name: 'Basic Tags',
                children: [
                    { type: 'tag', name: 'Masterpiece', value: 'masterpiece' },
                    { type: 'tag', name: 'Best Quality', value: 'best quality' },
                    { 
                        type: 'group', 
                        name: 'Lighting', 
                        children: [
                            { type: 'tag', name: 'Cinematic Lighting', value: 'cinematic lighting' },
                            { type: 'tag', name: 'Volumetric Soft', value: 'volumetric lighting' }
                        ]
                    }
                ]
            }
        ];
    },

    async getAllAssets() {
        if (isElectron) return await window.electronAPI.getAllAssets();
        return {
            loras: [
                { name: 'Mock_LoRA_1', type: 'lora', triggerWords: ['trigger1'], thumbnail: null },
                { name: 'Artist/Style_A', type: 'lora', triggerWords: ['style1'], thumbnail: null },
                { name: 'Artist/Style_B', type: 'lora', triggerWords: ['style2'], thumbnail: null }
            ],
            embeddings: [
                { name: 'EasyNegative', type: 'embedding', thumbnail: null }
            ]
        };
    },

    async reimportYAML() {
        if (isElectron) return await window.electronAPI.reimportYAML();
        return { success: true, count: 0 };
    },

    async exportToYAML(data, destPath) {
        if (isElectron) return await window.electronAPI.exportToYAML(data, destPath);
        console.log('[MOCK-YAML-EXPORT]', destPath, data);
        return { success: true, count: data.length, path: destPath || 'mock' };
    },

    async checkExportConflicts(destPath) {
        if (isElectron) return await window.electronAPI.checkExportConflicts(destPath);
        return { files: [] };
    },

    async saveTags(data) {
        if (isElectron) return await window.electronAPI.saveTags(data);
        console.log('[MOCK-TAGS-SAVE]', data);
        return { success: true };
    },

    async browseFolder(defaultPath) {
        if (isElectron) return await window.electronAPI.selectDirectory();
        return '/mock/path/selected';
    },

    async getAppVersion() {
        if (isElectron) return await window.electronAPI.getAppVersion();
        return '4.0.0-mock';
    },

    async searchDanbooru(query) {
        if (isElectron) return await window.electronAPI.searchDanbooru(query);
        return []; // No mock data for remote search
    },
    
    async selectImageFile() {
        if (isElectron) return await window.electronAPI.selectImageFile();
        return null;
    },

    async registerTagImageBuffer(tagName, buffer, ext) {
        if (isElectron) return await window.electronAPI.registerTagImageBuffer(tagName, buffer, ext);
        return { success: true, path: `thumb:///mock/${tagName}__thumbnail.${ext}` };
    },

    async registerTagImage(tagName, filePath) {
        if (isElectron) return await window.electronAPI.registerTagImage(tagName, filePath);
        return { success: true, path: `asset:///mock/${tagName}__thumbnail.png` };
    },

    async moveAssetFolder(oldPath, newPath) {
        if (isElectron) return await window.electronAPI.moveAssetFolder(oldPath, newPath);
        return { success: true };
    },

    async moveAssetFile(fullPath, destDir, conflictMode) {
        if (isElectron) return await window.electronAPI.moveAssetFile(fullPath, destDir, conflictMode);
        return { success: true };
    },

    async createAssetFolder(folderPath) {
        if (isElectron) return await window.electronAPI.createAssetFolder(folderPath);
        return { success: true };
    },

    async getGenModels() {
        if (isElectron) return await window.electronAPI.getGenModels();
        return { checkpoints: ['mock_model.safetensors'], vaes: ['Automatic'], upscalers: ['None'] };
    },

    async sendToWebUI(payload) {
        if (isElectron) return await window.electronAPI.sendToWebUI(payload);
        console.log('[MOCK-SEND]', payload);
        return { success: true };
    },

    async resetWebuiBusy() {
        if (isElectron) return await window.electronAPI.resetWebuiBusy();
        return { success: true };
    },

    async checkWebuiBridge() {
        if (isElectron) return await window.electronAPI.checkWebuiBridge();
        return { connected: true, version: 'mock' };
    },

    async getWebuiState() {
        if (isElectron) return await window.electronAPI.getWebuiState();
        return null;
    },

    async checkComfyBridge() {
        if (isElectron) return await window.electronAPI.checkComfyBridge();
        return { ok: false };
    },

    async sendToComfy(payload) {
        if (isElectron) return await window.electronAPI.sendToComfy(payload);
        console.log('[MOCK-COMFY-SEND]', payload);
        return { success: true };
    },

    async getComfyState(slot) {
        if (isElectron) return await window.electronAPI.getComfyState(slot);
        return { success: false };
    },

    async getComfySlots() {
        if (isElectron) return await window.electronAPI.getComfySlots();
        return { success: true, slots: ['slot_1'] };
    },

    async triggerComfy() {
        if (isElectron) return await window.electronAPI.triggerComfy();
        return { success: true };
    },

    async requestComfyScan() {
        if (isElectron) return await window.electronAPI.requestComfyScan();
        return { success: true };
    },

    async sendGenToComfy(slot, gen) {
        if (isElectron) return await window.electronAPI.sendGenToComfy(slot, gen);
        console.log('[MOCK-COMFY-GEN-SEND]', { slot, gen });
        return { success: true };
    },

    async getComfyGen(slot) {
        if (isElectron) return await window.electronAPI.getComfyGen(slot);
        return { success: false };
    },

    async fetchCivitaiMetadata(fullPath, apiKey) {
        if (isElectron) return await window.electronAPI.fetchCivitaiMetadata(fullPath, apiKey);
        return { success: true, info: { trainedWords: [], baseModel: 'mock', description: '' } };
    },

    openExternal(url) {
        if (isElectron) window.electronAPI.openExternal(url);
        else window.open(url, '_blank');
    },

    async openPreviewWindow() {
        if (isElectron) return await window.electronAPI.openPreviewWindow();
    },

    setPreviewTheme(theme) {
        if (isElectron) window.electronAPI.setPreviewTheme?.(theme);
    },

    async getUserDataPath() {
        if (isElectron) return await window.electronAPI.getUserDataPath();
        return '';
    },

    async setUserDataPath(p) {
        if (isElectron) return await window.electronAPI.setUserDataPath(p);
    },

    async saveCheckpointSettings(fullPath, settings) {
        if (isElectron) return await window.electronAPI.saveCheckpointSettings(fullPath, settings);
        console.log('[MOCK] saveCheckpointSettings', fullPath, settings);
        return { success: true };
    },

    /** Fetch a remote image via main process and return base64 string (for PNG parsing). */
    async fetchCheckpointImageBuffer(url) {
        if (isElectron) return await window.electronAPI.fetchCheckpointImageBuffer(url);
        return null;
    },

    async setAssetThumbnail(fullPath, imageUrl) {
        if (isElectron) return await window.electronAPI.setAssetThumbnail(fullPath, imageUrl);
        return { success: false };
    },

    /** Build a CivitAI model page URL using the configured domain.
     *  Auto mode uses civitai.com — the browser follows any redirect to civitai.red. */
    async civitaiPageUrl(modelId, versionId) {
        let domain = 'civitai.com';
        try {
            const cfg = await this.getConfig();
            if (cfg.civitaiDomain && cfg.civitaiDomain !== 'auto') {
                domain = cfg.civitaiDomain;
            }
        } catch (_) {}
        const base = `https://${domain}/models/${modelId}`;
        return versionId ? `${base}?modelVersionId=${versionId}` : base;
    },

    async getGenPresetsTree() {
        if (isElectron) return await window.electronAPI.getGenPresetsTree();
        return { _files: [{ name: 'Mock Preset', relPath: 'Mock Preset.json' }], _children: {} };
    },
    async saveGenPreset(name, folder, data) {
        if (isElectron) return await window.electronAPI.saveGenPreset(name, folder, data);
        console.log('[MOCK-SAVE-PRESET]', name, folder, data);
        return { success: true };
    },
    async loadGenPreset(relPath) {
        if (isElectron) return await window.electronAPI.loadGenPreset(relPath);
        return null;
    },
    async deleteGenPreset(relPath) {
        if (isElectron) return await window.electronAPI.deleteGenPreset(relPath);
        return { success: true };
    },
    async renameGenPreset(relPath, newName) {
        if (isElectron) return await window.electronAPI.renameGenPreset(relPath, newName);
        return { success: true };
    },
    async createGenPresetFolder(folderPath) {
        if (isElectron) return await window.electronAPI.createGenPresetFolder(folderPath);
        return { success: true };
    },
    async deleteGenPresetFolder(folderPath) {
        if (isElectron) return await window.electronAPI.deleteGenPresetFolder(folderPath);
        return { success: true };
    },
    async renameGenPresetFolder(oldPath, newName) {
        if (isElectron) return await window.electronAPI.renameGenPresetFolder(oldPath, newName);
        return { success: true };
    },
    async moveGenPreset(relPath, targetFolder) {
        if (isElectron) return await window.electronAPI.moveGenPreset(relPath, targetFolder);
        return { success: true };
    },

    async getPromptPresetList() {
        if (isElectron) return await window.electronAPI.getPromptPresetList();
        return ['Mock Preset'];
    },
    async savePromptPreset(name, positive, negative, gen, suffix) {
        if (isElectron) return await window.electronAPI.savePromptPreset(name, positive, negative, gen, suffix);
        return { success: true };
    },
    async loadPromptPreset(name) {
        if (isElectron) return await window.electronAPI.loadPromptPreset(name);
        return { positive: '', negative: '' };
    },
    async deletePromptPreset(name) {
        if (isElectron) return await window.electronAPI.deletePromptPreset(name);
        return { success: true };
    },

    async generateAiPrompt(params) {
        if (isElectron) return await window.electronAPI.generateAiPrompt(params);
        return { success: false, error: 'Not in Electron' };
    },

    async cancelAiPrompt(params) {
        if (isElectron) return await window.electronAPI.cancelAiPrompt(params);
        return { success: true };
    },

    async checkOllama(params) {
        if (isElectron) return await window.electronAPI.checkOllama(params);
        return { running: false };
    },

    async fetchAiModels(params) {
        if (isElectron) return await window.electronAPI.fetchAiModels(params);
        return { success: false, models: [] };
    },

    async getCheckpointMeta(params) {
        if (isElectron) return await window.electronAPI.getCheckpointMeta(params);
        return { baseModel: null };
    },

    async getCheckpointsWithMeta() {
        if (isElectron) return await window.electronAPI.getCheckpointsWithMeta();
        return { checkpoints: [] };
    },

    async deleteAssetFile(fullPath) {
        if (isElectron) return await window.electronAPI.deleteAssetFile(fullPath);
        return { success: true, deletedFiles: [] };
    },

    async deleteAssetMetadata(fullPath) {
        if (isElectron) return await window.electronAPI.deleteAssetMetadata(fullPath);
        return { success: true, deletedFiles: [] };
    },

};

// Window controls
export const Win = {
    minimize() { if (isElectron) window.electronAPI.minimize(); },
    maximize() { if (isElectron) window.electronAPI.maximize(); },
    close() { if (isElectron) window.electronAPI.close(); },
    reset() { if (isElectron) window.electronAPI.resetWindow(); }
};
