const { contextBridge, ipcRenderer } = require('electron');

// Since we have contextIsolation: false, we can attach this to the window natively.
// But we still structure it like a bridge for semantic cleanliness.
window.electronAPI = {
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  
  // Tags & Assets
  getAllTags: () => ipcRenderer.invoke('tags:get-all'),
  saveTags: (data) => ipcRenderer.invoke('tags:save', data),
  exportToYAML: (data, destPath) => ipcRenderer.invoke('tags:export-yaml', { data, destPath }),
  checkExportConflicts: (destPath) => ipcRenderer.invoke('tags:export-yaml-conflicts', destPath),
  reimportYAML: () => ipcRenderer.invoke('tags:reimport-yaml'),
  getAllAssets: () => ipcRenderer.invoke('assets:get-all'),
  moveAssetFolder: (oldPath, newPath) => ipcRenderer.invoke('assets:move-folder', { oldPath, newPath }),
  moveAssetFile: (fullPath, destDir, conflictMode) => ipcRenderer.invoke('assets:move-file', { fullPath, destDir, conflictMode }),
  createAssetFolder: (folderPath) => ipcRenderer.invoke('assets:create-folder', { folderPath }),
  getGenModels: () => ipcRenderer.invoke('gen:get-models'),
  fetchCivitaiMetadata: (fullPath, apiKey) => ipcRenderer.invoke('civitai:fetch-metadata', { fullPath, apiKey }),
  searchDanbooru: (query) => ipcRenderer.invoke('danbooru:search', query),
  registerTagImage: (tagName, filePath) => ipcRenderer.invoke('tags:register-image', { tagName, filePath }),
  registerTagImageBuffer: (tagName, buffer, ext) => ipcRenderer.invoke('tags:register-image-buffer', { tagName, buffer, ext }),
  sendToWebUI: (payload) => ipcRenderer.invoke('webui:send', payload),
  checkWebuiBridge: () => ipcRenderer.invoke('webui:checkBridge'),
  getWebuiState:    () => ipcRenderer.invoke('webui:getState'),
  checkComfyBridge: ()              => ipcRenderer.invoke('comfy:checkBridge'),
  sendToComfy:      (payload)       => ipcRenderer.invoke('comfy:sendSlot', payload),
  getComfyState:    (slot)          => ipcRenderer.invoke('comfy:getSlot', slot),
  getComfySlots:    ()              => ipcRenderer.invoke('comfy:getSlots'),
  triggerComfy:     ()              => ipcRenderer.invoke('comfy:trigger'),
  requestComfyScan: ()              => ipcRenderer.invoke('comfy:requestScan'),
  sendGenToComfy:   (slot, gen)     => ipcRenderer.invoke('comfy:sendGen', { slot, gen }),
  getComfyGen:      (slot)          => ipcRenderer.invoke('comfy:getGen', slot),
  
  // Configs
  getConfig: () => ipcRenderer.invoke('config:get'),
  saveConfig: (config) => ipcRenderer.invoke('config:save', config),
  
  // Presets
  savePreset: (name, positive, negative) => ipcRenderer.invoke('preset:save', { name, positive, negative }),
  deletePreset: (name) => ipcRenderer.invoke('preset:delete', { name }),
  
  // Menu Listeners
  onRequestImport: (cb) => ipcRenderer.on('tags:request-import', cb),
  onSettingsOpen: (cb) => ipcRenderer.on('settings:open', cb),
  onPresetLoad: (cb) => ipcRenderer.on('preset:load', (e, args) => cb(args)),
  onPresetRequestSave: (cb) => ipcRenderer.on('preset:request-save', cb),
  onMenuAlert: (cb) => ipcRenderer.on('menu:alert', (e, msg) => cb(msg)),
  onTagsReloaded: (cb) => ipcRenderer.on('tags:reloaded', cb),
  onToggleLayout: (cb) => ipcRenderer.on('menu:toggle-layout', cb),
  onResetLayout: (cb) => ipcRenderer.on('menu:reset-layout', cb),
  
  // Dialogs & Parsing
  selectDirectory: () => ipcRenderer.invoke('dialog:select-directory'),
  selectYAMLFiles: () => ipcRenderer.invoke('dialog:select-yaml'),
  selectImageFile: () => ipcRenderer.invoke('dialog:select-image'),
  parseYAML: (paths) => ipcRenderer.invoke('tags:parse-yaml', paths),
  getAllPresets: () => ipcRenderer.invoke('preset:get-all'),
  
  // General
  onMainMessage: (cb) => ipcRenderer.on('main-process-message', (e, ...args) => cb(...args)),
  
  // Window Controls
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
  resetWindow: () => ipcRenderer.invoke('window:reset'),
  openDevTools: () => ipcRenderer.send('devtools:open'),
  restartApp: () => ipcRenderer.send('app:restart'),
  quitApp: () => ipcRenderer.send('app:quit'),
  setTitlebarOverlay: (opts) => ipcRenderer.send('titlebar:set-overlay', opts),
  
  // Gen Presets
  getGenPresetsTree: () => ipcRenderer.invoke('gen-presets:get-tree'),
  saveGenPreset: (name, folder, data) => ipcRenderer.invoke('gen-presets:save', { name, folder, data }),
  loadGenPreset: (relPath) => ipcRenderer.invoke('gen-presets:load', { relPath }),
  deleteGenPreset: (relPath) => ipcRenderer.invoke('gen-presets:delete', { relPath }),
  renameGenPreset: (relPath, newName) => ipcRenderer.invoke('gen-presets:rename', { relPath, newName }),
  createGenPresetFolder: (folderPath) => ipcRenderer.invoke('gen-presets:create-folder', { folderPath }),
  deleteGenPresetFolder: (folderPath) => ipcRenderer.invoke('gen-presets:delete-folder', { folderPath }),
  renameGenPresetFolder: (oldPath, newName) => ipcRenderer.invoke('gen-presets:rename-folder', { oldPath, newName }),
  moveGenPreset: (relPath, targetFolder) => ipcRenderer.invoke('gen-presets:move', { relPath, targetFolder }),

  // Prompt Presets
  getPromptPresetList: () => ipcRenderer.invoke('prompt-presets:get-list'),
  savePromptPreset: (name, positive, negative, gen) => ipcRenderer.invoke('prompt-presets:save', { name, positive, negative, gen }),
  loadPromptPreset: (name) => ipcRenderer.invoke('prompt-presets:load', { name }),
  deletePromptPreset: (name) => ipcRenderer.invoke('prompt-presets:delete', { name }),

  // Logging
  log: (msg, level) => ipcRenderer.invoke('log:write', { msg, level }),

  // Image Browser
  getImageFolders: (rootPath) => ipcRenderer.invoke('images:get-folders', rootPath),
  getImagesInFolder: (folderPath) => ipcRenderer.invoke('images:get-images', folderPath),
  getPngInfo: (filePath) => ipcRenderer.invoke('images:get-pnginfo', filePath),

  // Updates
  checkForUpdates: () => ipcRenderer.invoke('app:check-updates'),

  // Shell
  openExternal: (url) => ipcRenderer.invoke('shell:open-external', url),
  showItemInFolder: (filePath) => ipcRenderer.invoke('shell:show-item-in-folder', filePath),
  deleteImageFile: (filePath) => ipcRenderer.invoke('images:delete-file', filePath),
  getFavImageDir: () => ipcRenderer.invoke('images:get-fav-dir'),
  addFavoriteImage: (filePath) => ipcRenderer.invoke('images:add-favorite', { filePath }),

  // AI Prompt Generation
  generateAiPrompt: (params) => ipcRenderer.invoke('ai:generate-prompt', params),
  cancelAiPrompt: (params) => ipcRenderer.invoke('ai:cancel-prompt', params),
  checkOllama: (params) => ipcRenderer.invoke('ai:check-ollama', params),
  fetchAiModels: (params) => ipcRenderer.invoke('ai:fetch-models', params),
  getCheckpointMeta: (params) => ipcRenderer.invoke('ai:get-checkpoint-meta', params),
  getCheckpointsWithMeta: () => ipcRenderer.invoke('ai:get-checkpoints-with-meta'),

  // Checkpoint recommended settings
  saveCheckpointSettings: (fullPath, settings) => ipcRenderer.invoke('checkpoint:save-settings', { fullPath, settings }),
  fetchCheckpointImageBuffer: (url) => ipcRenderer.invoke('checkpoint:fetch-image-buffer', url),

  // Asset delete
  deleteAssetFile: (fullPath) => ipcRenderer.invoke('assets:delete-file', { fullPath }),
};
