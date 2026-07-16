import { app, BrowserWindow, ipcMain, protocol, Menu, dialog, nativeImage, net, shell, session } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { ConfigService } from './services/configService.js';
import { PresetService } from './services/presetService.js';

// 高リフレッシュレートモニターでのチラツキ防止
app.disableHardwareAcceleration();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const debugPath = path.join(process.cwd(), 'debug.log');
const debugBakPath = path.join(process.cwd(), 'debug.log.bak');

// Rotate log: move previous session's log to .bak, start fresh
try {
  if (fs.existsSync(debugPath)) {
    fs.renameSync(debugPath, debugBakPath);
  }
  fs.writeFileSync(debugPath, '');
} catch (e) {
  // If rotation fails (e.g. file locked), just continue
}

function log(msg, level = 'INFO', proc = 'MAIN') {
  const time = new Date().toISOString().replace('T', ' ').substring(0, 19);
  const formattedMsg = `[${time}] [${proc}] [${level}] ${msg}\n`;
  // Use async appendFile to never block the main thread
  fs.appendFile(debugPath, formattedMsg, (err) => {
    if (err) console.error('Logging failed:', err);
  });
}

log('--- MAIN PROCESS STARTING ---');
log(`CWD: ${process.cwd()}`);
log(`isPackaged: ${app.isPackaged}`);
log(`execPath: ${process.execPath}`);
log(`resourcesPath: ${process.resourcesPath}`);

// packaged portable: PORTABLE_EXECUTABLE_DIR is the actual exe location (set by electron-builder)
// dev mode: data lives in cwd (project root)
const appRoot = app.isPackaged
  ? (process.env.PORTABLE_EXECUTABLE_DIR || path.dirname(process.execPath))
  : process.cwd();
const dataDir = path.join(appRoot, 'data');

// userdata.txt があればそのパスを userData として使用（app.ready より前に設定必須）
const userDataTxtPath = path.join(dataDir, 'userdata.txt');
try {
  if (fs.existsSync(userDataTxtPath)) {
    const customUserData = fs.readFileSync(userDataTxtPath, 'utf8').trim();
    if (customUserData) {
      app.setPath('userData', customUserData);
    }
  }
} catch (e) {
  // 読み込み失敗時はデフォルトのまま
}
const tagImagesDir = path.join(dataDir, 'tag_images');

// First-run: copy bundled defaults from resources to exe's directory
if (app.isPackaged) {
  const resData = path.join(process.resourcesPath, 'data');
  const resTag  = path.join(process.resourcesPath, 'tag');
  if (!fs.existsSync(dataDir) && fs.existsSync(resData)) {
    fs.mkdirSync(dataDir, { recursive: true });
    for (const f of fs.readdirSync(resData)) {
      fs.copyFileSync(path.join(resData, f), path.join(dataDir, f));
    }
    log('Copied default data/ from resources');
  }
  const tagDir = path.join(appRoot, 'tag');
  if (!fs.existsSync(tagDir) && fs.existsSync(resTag)) {
    fs.mkdirSync(tagDir, { recursive: true });
    for (const f of fs.readdirSync(resTag)) {
      fs.copyFileSync(path.join(resTag, f), path.join(tagDir, f));
    }
    log('Copied default tag/ from resources');
  }
}

function resolveAppPath(p) {
  if (!p) return p;
  return path.isAbsolute(p) ? p : path.resolve(appRoot, p);
}

function toRelPath(p) {
  if (!p) return p;
  const rel = path.relative(appRoot, path.resolve(p));
  return (!rel.startsWith('..') && !path.isAbsolute(rel))
    ? ('./' + rel.replace(/\\/g, '/'))
    : p;
}

function resolveConfigPaths(cfg) {
  return {
    ...cfg,
    tagsPath:        resolveAppPath(cfg.tagsPath),
    yamlOutputPath:  resolveAppPath(cfg.yamlOutputPath),
    genPresetsPath:  resolveAppPath(cfg.genPresetsPath   || './gen_presets'),
    promptPresetsPath: resolveAppPath(cfg.promptPresetsPath || './prompt_presets'),
  };
}

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}
if (!fs.existsSync(tagImagesDir)) {
  fs.mkdirSync(tagImagesDir, { recursive: true });
}

const configService    = new ConfigService(dataDir);
const presetService    = new PresetService(dataDir);

// First-run in packaged mode: auto-set tagsPath to the tag/ folder next to the exe
if (app.isPackaged) {
  const cfg = configService.getConfig();
  const tagDir = path.join(appRoot, 'tag');
  if (!cfg.tagsPath && fs.existsSync(tagDir)) {
    configService.saveConfig({ tagsPath: tagDir });
    log(`Auto-set tagsPath to: ${tagDir}`);
  }
}

// 多重起動制御 (app.whenReady より前に呼ぶ必要がある)
if (!configService.getConfig().allowMultipleInstances) {
  const gotLock = app.requestSingleInstanceLock();
  if (!gotLock) {
    log('Another instance is already running. Quitting.');
    app.quit();
    process.exit(0);
  }
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
}

const CATEGORIES_PALETTE = [
  'danbooru-general', 'danbooru-character', 'danbooru-copyright',
  'danbooru-artist', 'danbooru-meta',
  'indigo', 'sky', 'emerald', 'amber', 'rose', 'purple', 'teal'
];

// --- Internal Tag Service (JSON Based) ---
class TagService {
  constructor(tagDirPath, dataDirPath) {
    this.tagDirPath = tagDirPath;
    this.jsonFilePath = path.join(dataDirPath, 'tags.json');
    log(`[TagService] Initialized. YAML path: ${tagDirPath}, JSON path: ${this.jsonFilePath}`);
  }

  // Parses YAML object into Array-based JSON
  _convertYamlToJsonTree(key, node) {
    if (typeof node === 'string' || typeof node === 'number') {
      return { type: 'tag', name: key, value: String(node) };
    } else if (typeof node === 'object' && node !== null) {
      const children = [];
      for (const [k, v] of Object.entries(node)) {
        children.push(this._convertYamlToJsonTree(k, v));
      }
      return { type: 'group', name: key, children };
    }
    return { type: 'tag', name: key, value: String(node) };
  }

  // Parses Array-based JSON back to nested JS Object for yaml.dump
  _convertJsonTreeToYamlObj(children) {
    const obj = {};
    for (const item of children) {
      if (item.type === 'tag') {
        obj[item.name] = item.value;
      } else if (item.type === 'group' || item.type === 'category') {
        obj[item.name] = this._convertJsonTreeToYamlObj(item.children || item.items || []);
      }
    }
    return obj;
  }

  async getAllTags() {
    try {
      if (fs.existsSync(this.jsonFilePath)) {
        log(`[TagService] Reading from JSON db.`);
        const content = fs.readFileSync(this.jsonFilePath, 'utf8');
        return JSON.parse(content);
      }
      
      // First run: auto-import YAML files from tag directory
      if (fs.existsSync(this.tagDirPath)) {
        const yamlFiles = fs.readdirSync(this.tagDirPath)
          .filter(f => f.endsWith('.yml') || f.endsWith('.yaml'))
          .sort()
          .map(f => path.join(this.tagDirPath, f));
        if (yamlFiles.length > 0) {
          log(`[TagService] First run: importing ${yamlFiles.length} YAML files.`);
          const categories = await this.parseYamlFiles(yamlFiles);
          this.mergeColors(categories);
          await this.saveTags(categories);
          return categories;
        }
      }

      log(`[TagService] tags.json not found. Returning empty DB.`);
      return [];
    } catch (err) {
      log(`[TagService] GLOBAL ERR: ${err.stack}`);
      throw err;
    }
  }

  async parseYamlFiles(files) {
    const categories = [];
    for (const filePath of files) {
      try {
        const file = path.basename(filePath);
        const content = fs.readFileSync(filePath, 'utf8');
        const data = yaml.load(content);
        
        const rawName = path.parse(file).name;
        const cleanName = rawName.replace(/^\d+_/, '').replace(/_/g, ' ');

        const contentArray = [];
        for (const [k, v] of Object.entries(data || {})) {
          contentArray.push(this._convertYamlToJsonTree(k, v));
        }

        categories.push({
          id: rawName,
          filename: file,
          name: cleanName,
          children: contentArray
        });
        log(`[TagService] Parsed YAML: ${file}`);
      } catch (fileErr) {
        log(`[TagService] ERR: Failed to parse ${filePath}: ${fileErr.message}`);
      }
    }
    return categories;
  }

  // Restores thumbnail fields from existing tags.json after YAML reimport.
  // Only restores thumbnails whose files actually exist on disk (skips stale refs).
  mergeThumbnails(newCategories) {
    const thumbMap = {};
    if (fs.existsSync(this.jsonFilePath)) {
      try {
        const existing = JSON.parse(fs.readFileSync(this.jsonFilePath, 'utf8'));
        const collect = (nodes) => {
          for (const node of nodes || []) {
            if (node.type === 'tag' && node.thumbnail) thumbMap[node.name] = node.thumbnail;
            if (node.children) collect(node.children);
          }
        };
        for (const cat of existing) collect(cat.children || cat.items || []);
      } catch (_) {}
    }
    const apply = (nodes) => {
      for (const node of nodes || []) {
        if (node.type === 'tag' && thumbMap[node.name]) {
          // Verify the file still exists before restoring the reference
          const thumbUrl = thumbMap[node.name];
          const rawPath = decodeURIComponent(thumbUrl.replace(/^thumb:\/\/\//, ''));
          const resolved = path.isAbsolute(rawPath) ? rawPath : path.join(appRoot, rawPath);
          const fallback = path.join(tagImagesDir, path.basename(resolved));
          if (fs.existsSync(resolved) || fs.existsSync(fallback)) {
            node.thumbnail = thumbUrl;
          }
        }
        if (node.children) apply(node.children);
      }
    };
    for (const cat of newCategories) apply(cat.children || cat.items || []);
    return newCategories;
  }

  mergeColors(newCategories) {
    const colorMap = {};
    if (fs.existsSync(this.jsonFilePath)) {
      try {
        const existing = JSON.parse(fs.readFileSync(this.jsonFilePath, 'utf8'));
        for (const cat of existing) {
          if (cat.name && cat.color) colorMap[cat.name] = cat.color;
        }
      } catch (_) {}
    }

    // Track used colors: start with colors already assigned to existing categories
    const usedColors = new Set(newCategories
      .filter(c => colorMap[c.name])
      .map(c => colorMap[c.name])
    );

    // Shuffle palette to randomize assignment order
    const shuffled = [...CATEGORIES_PALETTE].sort(() => Math.random() - 0.5);

    for (const cat of newCategories) {
      if (colorMap[cat.name]) {
        cat.color = colorMap[cat.name];
      } else {
        // Pick first unused color; if all used, cycle through shuffled palette
        const pick = shuffled.find(c => !usedColors.has(c)) ?? shuffled[Math.floor(Math.random() * shuffled.length)];
        cat.color = pick;
        usedColors.add(pick);
      }
    }
    return newCategories;
  }

  async saveTags(dataArray) {
    // Best-effort backup of the previous JSON; failure here must not block the save.
    if (fs.existsSync(this.jsonFilePath)) {
      try {
        fs.copyFileSync(this.jsonFilePath, `${this.jsonFilePath}.bak`);
      } catch (err) {
        log(`[TagService] saveTags: backup failed (continuing): ${err.message}`);
      }
    }
    // Auto-export disabled: use menu "YAMLへ保存" or settings button to export manually
    try {
      fs.writeFileSync(this.jsonFilePath, JSON.stringify(dataArray, null, 2), 'utf8');
    } catch (err) {
      log(`[TagService] saveTags: write failed: ${err.message}`);
      return { success: false, error: err.message };
    }

    return { success: true, categories: dataArray };
  }

  async exportToYAML(dataArray, destPath) {
    log(`[TagService] Exporting to YAML...`);
    const outPath = destPath ? path.resolve(destPath) : resolveAppPath(this.tagDirPath);
    if (!fs.existsSync(outPath)) {
      fs.mkdirSync(outPath, { recursive: true });
    }

    // Clean up old yml files before export to ensure no orphans
    const oldFiles = fs.readdirSync(outPath).filter(f => f.endsWith('.yml') || f.endsWith('.yaml'));
    for (const f of oldFiles) fs.unlinkSync(path.join(outPath, f));
    
    // Write out each category with numeric prefix matching their index
    for (let i = 0; i < dataArray.length; i++) {
      const cat = dataArray[i];
      try {
        const yamlObj = this._convertJsonTreeToYamlObj(cat.children || cat.items || cat.content || []);
        const yamlStr = yaml.dump(yamlObj, { indent: 2, lineWidth: -1, noRefs: true });
        
        // Generate new filename with correct order prefix
        const prefix = String(i).padStart(2, '0');
        // Use cat.name for filename generation to ensure it matches UI
        const cleanName = (cat.name || 'category').replace(/[\\\/:*?"<>|]/g, '_').trim();
        const newFilename = `${prefix}_${cleanName}.yml`;
        
        const filePath = path.join(outPath, newFilename);
        fs.writeFileSync(filePath, yamlStr, 'utf8');

        // Update filename and id in JSON state to stay in sync with the new YAML filename
        cat.filename = newFilename;
        cat.id = path.parse(newFilename).name; // e.g. "00_fav"

        log(`[TagService] Exported: ${newFilename} (id → ${cat.id})`);
      } catch (e) {
        log(`[TagService] ERR: Failed to export ${cat.name || 'unnamed'}: ${e.message}`);
      }
    }
    
    return { success: true, count: dataArray.length, path: outPath };
  }
}

// --- Danbooru Tag Service (for Autocomplete) ---
class DanbooruService {
  constructor(csvPath) {
    this.csvPath = csvPath;
    this.tags = [];
    this.ready = false;
    this.statePath = csvPath.replace(/\.csv$/, '_update_state.json');
    log(`[DanbooruService] Initialized with path: ${csvPath}`);
  }

  loadResumeState() {
    try {
      if (!fs.existsSync(this.statePath)) return null;
      const raw = JSON.parse(fs.readFileSync(this.statePath, 'utf8'));
      if (!raw || typeof raw.cursor !== 'number' || !Array.isArray(raw.updated)) return null;
      return { cursor: raw.cursor, total: raw.total, updated: new Map(raw.updated), savedAt: raw.savedAt };
    } catch (e) {
      log(`[DanbooruService] Resume state read error: ${e.message}`, 'WARN', 'Danbooru');
      return null;
    }
  }

  async saveResumeState(cursor, total, updatedMap) {
    try {
      const raw = { cursor, total, updated: Array.from(updatedMap.entries()), savedAt: Date.now() };
      await fs.promises.writeFile(this.statePath, JSON.stringify(raw), 'utf8');
    } catch (e) {
      log(`[DanbooruService] Resume state write error: ${e.message}`, 'WARN', 'Danbooru');
    }
  }

  async clearResumeState() {
    try { if (fs.existsSync(this.statePath)) await fs.promises.unlink(this.statePath); } catch { /* noop */ }
  }

  async load() {
    if (!fs.existsSync(this.csvPath)) {
      log(`CSV not found: ${this.csvPath}`, 'WARN', 'Danbooru');
      return;
    }

    try {
      log(`Loading tags from CSV (Async)...`, 'INFO', 'Danbooru');
      const start = Date.now();
      const content = await fs.promises.readFile(this.csvPath, 'utf8');
      const lines = content.split('\n');
      
      this.tags = [];
      for (const line of lines) {
        if (!line.trim()) continue;
        const parts = this._parseCsvLine(line);
        if (parts.length < 3) continue;

        const [name, type, count, aliases] = parts;
        this.tags.push({
          n: name,
          t: parseInt(type) || 0,
          c: parseInt(count) || 0,
          a: aliases ? aliases.replace(/"/g, '').split(',').map(s => s.trim().toLowerCase()).filter(s => s) : []
        });
      }

      this.tags.sort((a, b) => b.c - a.c);
      this.ready = true;
      const end = Date.now();
      log(`Loaded ${this.tags.length} tags in ${end - start}ms.`, 'INFO', 'Danbooru');
    } catch (e) {
      log(`Load error: ${e.stack}`, 'ERROR', 'Danbooru');
    }
  }

  _parseCsvLine(line) {
    const parts = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        parts.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    parts.push(current);
    return parts;
  }

  async search(query, limit = 20) {
    if (!this.ready || !query) return [];
    const q = query.toLowerCase();
    const results = [];

    // 1. Prefix match on name (Highest priority)
    for (const tag of this.tags) {
      if (tag.n.startsWith(q)) {
        results.push(tag);
        if (results.length >= limit) return results;
      }
    }

    // 2. Alias match or contains match (Next priority)
    if (results.length < limit) {
      for (const tag of this.tags) {
        // Skip already found
        if (tag.n.startsWith(q)) continue;

        if (tag.a.some(alias => alias.startsWith(q)) || tag.n.includes(q)) {
          results.push(tag);
          if (results.length >= limit) break;
        }
      }
    }

    return results;
  }

  _csvEscapeAliases(aliases) {
    if (!aliases || aliases.length === 0) return '';
    const joined = aliases.join(',');
    return aliases.length > 1 ? `"${joined}"` : joined;
  }

  async updateFromApi({ onProgress, signal, resume } = {}) {
    if (!this.ready) return { success: false, error: 'not_ready' };

    const BATCH_SIZE = 150;
    const DELAY_MS = 400;
    const names = this.tags.map(t => t.n);
    const total = names.length;

    let updated = new Map(); // name -> { category, count, is_deprecated }
    let startIndex = 0;
    if (resume) {
      const state = this.loadResumeState();
      if (state && state.total === total) {
        updated = state.updated;
        startIndex = Math.min(state.cursor, total);
        log(`[DanbooruService] Resuming update from ${startIndex}/${total}`, 'INFO', 'Danbooru');
      }
    } else {
      await this.clearResumeState();
    }

    let done = startIndex;
    const startTime = Date.now();

    for (let i = startIndex; i < names.length; i += BATCH_SIZE) {
      if (signal?.aborted) {
        log('[DanbooruService] Update aborted by user', 'INFO', 'Danbooru');
        await this.saveResumeState(i, total, updated);
        return { success: false, aborted: true, updated: updated.size, total, cursor: i };
      }

      const batch = names.slice(i, i + BATCH_SIZE);
      const params = new URLSearchParams();
      for (const n of batch) params.append('search[name][]', n);
      params.append('limit', String(batch.length));
      const url = `https://danbooru.donmai.us/tags.json?${params.toString()}`;

      try {
        const res = await net.fetch(url, {
          headers: { 'User-Agent': 'grimoire-prompt-builder (tag-updater)' },
        });
        if (res.status === 429) {
          log('[DanbooruService] Rate limited, retrying after backoff', 'WARN', 'Danbooru');
          await new Promise(r => setTimeout(r, DELAY_MS * 4));
          const retry = await net.fetch(url, {
            headers: { 'User-Agent': 'grimoire-prompt-builder (tag-updater)' },
          });
          if (retry.ok) {
            const arr = await retry.json();
            for (const t of arr) updated.set(t.name, { category: t.category, count: t.post_count, deprecated: !!t.is_deprecated });
          } else {
            log(`[DanbooruService] Batch failed after retry: HTTP ${retry.status}`, 'WARN', 'Danbooru');
          }
        } else if (res.ok) {
          const arr = await res.json();
          for (const t of arr) updated.set(t.name, { category: t.category, count: t.post_count, deprecated: !!t.is_deprecated });
        } else {
          log(`[DanbooruService] Batch failed: HTTP ${res.status}`, 'WARN', 'Danbooru');
        }
      } catch (e) {
        log(`[DanbooruService] Batch error: ${e.message}`, 'WARN', 'Danbooru');
      }

      done += batch.length;
      onProgress?.({ done: Math.min(done, total), total, elapsedMs: Date.now() - startTime });

      if (i + BATCH_SIZE < names.length) {
        await new Promise(r => setTimeout(r, DELAY_MS));
      }
    }

    return { success: true, updated, total };
  }

  async writeCsv(updatedMap) {
    await this.clearResumeState();
    let notFound = 0;
    let changed = 0;
    for (const tag of this.tags) {
      const found = updatedMap.get(tag.n);
      if (!found) { notFound++; continue; }
      if (found.count !== tag.c || found.category !== tag.t) changed++;
      tag.c = found.count;
      tag.t = found.category;
    }

    this.tags.sort((a, b) => b.c - a.c);

    const lines = this.tags.map(tag => `${tag.n},${tag.t},${tag.c},${this._csvEscapeAliases(tag.a)}`);
    const csvContent = lines.join('\n') + '\n';

    try {
      if (fs.existsSync(this.csvPath)) {
        await fs.promises.copyFile(this.csvPath, this.csvPath + '.bak');
      }
      await fs.promises.writeFile(this.csvPath, csvContent, 'utf8');
    } catch (e) {
      log(`[DanbooruService] Write error: ${e.stack}`, 'ERROR', 'Danbooru');
      return { success: false, error: e.message };
    }

    await this.load();
    return { success: true, updated: changed, notFound, total: this.tags.length };
  }

  getInfo() {
    let lastModified = null;
    try {
      if (fs.existsSync(this.csvPath)) lastModified = fs.statSync(this.csvPath).mtimeMs;
    } catch { /* noop */ }
    return { lastModified, total: this.tags.length };
  }

  async checkForUpdates(sampleSize = 30) {
    if (!this.ready || this.tags.length === 0) return { success: false, error: 'not_ready' };

    const sample = this.tags.slice(0, sampleSize); // already sorted by count desc
    const params = new URLSearchParams();
    for (const t of sample) params.append('search[name][]', t.n);
    params.append('limit', String(sample.length));
    const url = `https://danbooru.donmai.us/tags.json?${params.toString()}`;

    try {
      const res = await net.fetch(url, {
        headers: { 'User-Agent': 'grimoire-prompt-builder (tag-updater)' },
      });
      if (!res.ok) return { success: false, error: `HTTP ${res.status}` };
      const arr = await res.json();
      const liveByName = new Map(arr.map(t => [t.name, t.post_count]));

      let comparedCount = 0;
      let totalOldCount = 0;
      let totalNewCount = 0;
      const examples = [];
      for (const t of sample) {
        const liveCount = liveByName.get(t.n);
        if (liveCount == null) continue;
        comparedCount++;
        totalOldCount += t.c;
        totalNewCount += liveCount;
        if (t.c !== liveCount && examples.length < 3) {
          examples.push({ name: t.n, oldCount: t.c, newCount: liveCount });
        }
      }
      const diffPct = totalOldCount > 0 ? ((totalNewCount - totalOldCount) / totalOldCount) * 100 : 0;
      return { success: true, sampleSize: comparedCount, diffPct, examples };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }
}
// --- Thumbnail Service (Caching & Resizing) ---
class ThumbnailService {
  constructor() {
    this.cacheDir = path.join(app.getPath('userData'), 'thumbnails');
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  getCachePath(originalPath, mtime) {
    const hash = crypto.createHash('md5').update(originalPath + mtime).digest('hex');
    return path.join(this.cacheDir, `${hash}.jpg`);
  }

  async getThumbnail(originalPath) {
    try {
      if (!fs.existsSync(originalPath)) return null;
      const stats = fs.statSync(originalPath);
      const mtime = stats.mtimeMs;
      const cachePath = this.getCachePath(originalPath, mtime);

      if (fs.existsSync(cachePath)) {
        return cachePath;
      }

      // Generate thumbnail
      const img = nativeImage.createFromPath(originalPath);
      if (img.isEmpty()) return null;

      const size = img.getSize();
      const scale = 512 / Math.min(size.width, size.height);
      const targetWidth = Math.round(size.width * scale);
      const targetHeight = Math.round(size.height * scale);

      const resized = img.resize({ width: targetWidth, height: targetHeight, quality: 'better' });
      const buffer = resized.toJPEG(80);
      fs.writeFileSync(cachePath, buffer);

      return cachePath;
    } catch (e) {
      log(`[ThumbnailService] Error: ${e.message}`);
      return null;
    }
  }
}

const thumbnailService = new ThumbnailService();

// --- Background thumbnail cache warm-up ---
// getThumbnail() resizes images synchronously; with many LoRAs this freezes the UI
// the first time the library grid requests them all at once. Pre-generate the cache
// in the background after startup instead, yielding between items so IPC/UI stay responsive.
let _thumbWarmupRunning = false;
async function warmThumbnailCache(result) {
  if (_thumbWarmupRunning) return;
  _thumbWarmupRunning = true;
  try {
    const items = [...(result.loras || []), ...(result.checkpoints || []), ...(result.embeddings || [])];
    for (const item of items) {
      if (!item.thumbnail || !item.thumbnail.startsWith('thumb:///')) continue;
      const rawPath = decodeURIComponent(item.thumbnail.replace(/^thumb:\/\/\//, '').split('?')[0]);
      const resolvedPath = path.isAbsolute(rawPath) ? rawPath : path.join(appRoot, rawPath);
      const basename = path.basename(resolvedPath).toLowerCase();
      if (basename.includes('.preview.') || basename.includes('.example.')) continue; // served directly, no cache needed
      await thumbnailService.getThumbnail(resolvedPath);
      await new Promise((r) => setImmediate(r));
    }
  } catch (e) {
    log(`[ThumbnailWarmup] Error: ${e.message}`);
  } finally {
    _thumbWarmupRunning = false;
  }
}

// --- Asset Service (LoRA / Embeddings) ---
class AssetService {
  constructor(paths) {
    this.paths = paths; // { lora: string, embedding: string }
  }

  async getAllAssets() {
    log('[AssetService] Scanning for assets...');
    const loraResult       = await this.scanDir(this.paths.lora,       'lora');
    const embResult        = await this.scanDir(this.paths.embedding,  'embedding');
    const ckptResult       = await this.scanDir(this.paths.checkpoint, 'checkpoint');
    const result = {
      loras:            loraResult.items,
      embeddings:       embResult.items,
      checkpoints:      ckptResult.items,
      loraFolders:      loraResult.folders,
      embeddingFolders: embResult.folders,
      checkpointFolders: ckptResult.folders,
    };
    log(`[AssetService] Scan complete. Found ${result.loras.length} LoRAs, ${result.embeddings.length} Embeddings, ${result.checkpoints.length} Checkpoints.`);
    return result;
  }

  async scanDir(baseDir, type) {
    if (!fs.existsSync(baseDir)) {
      log(`[AssetService] ERR: Directory not found: ${baseDir}`);
      return { items: [], folders: [] };
    }

    const items = [];
    const folders = new Set();
    const scan = (dir, relativeDir = '') => {
      try {
        const files = fs.readdirSync(dir);
        for (const file of files) {
          const fullPath = path.join(dir, file);
          const stat = fs.statSync(fullPath);

          if (stat.isDirectory()) {
            const relFolder = relativeDir ? path.join(relativeDir, file) : file;
            folders.add(relFolder.replace(/\\/g, '/'));
            scan(fullPath, path.join(relativeDir, file));
          } else if (stat.isFile()) {
            const ext = path.extname(file).toLowerCase();
            if (ext === '.safetensors' || ext === '.pt' || ext === '.ckpt') {
              const name = path.parse(file).name;
              const relPath = path.join(relativeDir, file);

              // --- Enhanced Image Discovery (CivitAI Helper compatible) ---
              let thumbnail = null;
              const imgExts = ['.png', '.jpg', '.jpeg', '.webp'];
              const thumbUrl = (p) => {
                const mt = Math.floor(fs.statSync(p).mtimeMs);
                return `thumb:///${encodeURIComponent(p.replace(/\\/g, '/'))}?t=${mt}`;
              };

              // 1. CivitAI Helper priority: model.png (no suffix) is highest
              for (const imgExt of imgExts) {
                const imgPath = path.join(dir, name + imgExt);
                if (fs.existsSync(imgPath)) {
                  thumbnail = thumbUrl(imgPath);
                  break;
                }
              }

              // 2. .preview suffix (CivitAI Helper standard)
              if (!thumbnail) {
                for (const imgExt of imgExts) {
                  const imgPath = path.join(dir, name + '.preview' + imgExt);
                  if (fs.existsSync(imgPath)) {
                    thumbnail = thumbUrl(imgPath);
                    break;
                  }
                }
              }

              // 3. .example.N suffix (CivitAI Helper v1.8.3+ multiple previews)
              if (!thumbnail) {
                try {
                  const siblingFiles = fs.readdirSync(dir);
                  const baseEsc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                  const exampleRegex = new RegExp(`^${baseEsc}\\.example\\.\\d+\\.(${imgExts.map(e => e.slice(1)).join('|')})$`, 'i');
                  const exampleMatch = siblingFiles.find(f => exampleRegex.test(f));
                  if (exampleMatch) {
                    thumbnail = thumbUrl(path.join(dir, exampleMatch));
                  }
                } catch (e) {}
              }

              // 4. Other legacy patterns
              if (!thumbnail) {
                const legacyPatterns = ['.sample', '_preview', '_thumb', '.view'];
                outer: for (const pattern of legacyPatterns) {
                  for (const imgExt of imgExts) {
                    const imgPath = path.join(dir, name + pattern + imgExt);
                    if (fs.existsSync(imgPath)) {
                      thumbnail = thumbUrl(imgPath);
                      break outer;
                    }
                  }
                }
              }

              // 5. Flexible matching for download duplicates like "name (1).png"
              if (!thumbnail) {
                try {
                  const siblingFiles = fs.readdirSync(dir);
                  const basePattern = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                  const flexRegex = new RegExp(`^${basePattern}\\s*\\(\\d+\\)\\.(${imgExts.map(e => e.slice(1)).join('|')})$`, 'i');
                  const flexMatch = siblingFiles.find(f => flexRegex.test(f));
                  if (flexMatch) {
                    thumbnail = thumbUrl(path.join(dir, flexMatch));
                  }
                } catch (e) {}
              }

              // 6. Hidden file discovery
              if (!thumbnail) {
                for (const imgExt of imgExts) {
                  const imgPath = path.join(dir, '.' + name + imgExt);
                  if (fs.existsSync(imgPath)) {
                    const mt = fs.statSync(imgPath).mtimeMs | 0;
                    thumbnail = `asset:///${encodeURIComponent(imgPath.replace(/\\/g, '/'))}?t=${mt}`;
                    break;
                  }
                }
              }

              // Trigger words and metadata extraction
              let triggerWords = [];
              let baseModel = null;
              let description = null;

              let modelId  = null;
              let versionId = null;
              let modelName = null;
              let versionName = null;
              let modelType = null;
              let civitaiImages = [];
              let legacyMeta = false;
              const infoPath = path.join(dir, name + '.civitai.info');
              if (fs.existsSync(infoPath)) {
                try {
                  const info = JSON.parse(fs.readFileSync(infoPath, 'utf8'));
                  // Detect legacy Grimoire format: has 'versionId' but no 'id', or has flat 'modelName' but no 'model' object
                  if ((info.versionId && !info.id) || (info.modelName && !info.model)) {
                    legacyMeta = true;
                  }
                  if (info.trainedWords && Array.isArray(info.trainedWords)) {
                    triggerWords = [...new Set([...triggerWords, ...info.trainedWords])];
                  }
                  if (info.baseModel) baseModel = info.baseModel;
                  // Helper stores description at root or under model.description
                  const rawDesc = info.description || info.model?.description || '';
                  if (rawDesc) {
                    description = rawDesc.replace(/<[^>]*>?/gm, '').substring(0, 200);
                  }
                  modelId = info.modelId ?? null;
                  versionId = info.versionId ?? info.id ?? null;
                  if (Array.isArray(info.images)) civitaiImages = info.images;
                  if (!modelName && info.model?.name) modelName = info.model.name;
                  if (!modelName && info.modelName) modelName = info.modelName;
                  if (!versionName && info.name) versionName = info.name;
                  if (!versionName && info.versionName) versionName = info.versionName;
                  if (info.model?.type) modelType = info.model.type;
                } catch (e) {}
              }

              // Read .pb_settings.json (checkpoint recommended settings)
              let pbSettings = null;
              const pbSettingsPath = path.join(dir, name + '.pb_settings.json');
              if (fs.existsSync(pbSettingsPath)) {
                try { pbSettings = JSON.parse(fs.readFileSync(pbSettingsPath, 'utf8')); } catch (_) {}
              }
              const txtPath = path.join(dir, name + '.txt');
              if (fs.existsSync(txtPath)) {
                try {
                  const words = fs.readFileSync(txtPath, 'utf8').split(',').map(s => s.trim()).filter(s => s);
                  triggerWords = [...new Set([...triggerWords, ...words])];
                } catch (e) {}
              }
              const jsonPath = path.join(dir, name + '.json');
              if (fs.existsSync(jsonPath)) {
                try {
                  const metadata = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
                  if (metadata['activation text']) {
                    const words = metadata['activation text'].split(',').map(s => s.trim()).filter(s => s);
                    triggerWords = [...new Set([...triggerWords, ...words])];
                  }
                  if (!baseModel && metadata.sd_model_name) baseModel = metadata.sd_model_name;
                } catch (e) {}
              }

              items.push({
                name,
                type,
                fullPath,
                relPath,
                thumbnail,
                triggerWords: triggerWords.slice(0, 15),
                baseModel,
                description,
                modelId,
                versionId,
                modelName,
                versionName,
                modelType,
                civitaiImages,
                pbSettings,
                hasInfoFile: fs.existsSync(path.join(dir, name + '.civitai.info')),
                legacyMeta,
                category: relativeDir || 'root'
              });
            }
          }
        }
      } catch (e) {
        log(`[AssetService] Scan error in ${dir}: ${e.message}`);
      }
    };

    scan(baseDir);
    return { items, folders: [...folders] };
  }

  /**
   * Move a physical folder on disk
   */
  async moveAssetFolder(oldPath, newPath) {
    if (!fs.existsSync(oldPath)) throw new Error(`Source folder not found: ${oldPath}`);
    if (fs.existsSync(newPath)) throw new Error(`Destination already exists: ${newPath}`);
    
    // Ensure parent dir of newPath exists
    const parent = path.dirname(newPath);
    if (!fs.existsSync(parent)) fs.mkdirSync(parent, { recursive: true });

    fs.renameSync(oldPath, newPath);
    return { success: true };
  }

  /**
   * Move an individual asset file and all its sidecars (.info, .json, .png, etc.)
   */
  async moveAssetFile(fullPath, destDir, conflictMode = 'ask') {
    if (!fs.existsSync(fullPath)) throw new Error(`Source file not found: ${fullPath}`);
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

    const sourceDir = path.dirname(fullPath);
    const basename = path.parse(fullPath).name;
    const files = fs.readdirSync(sourceDir);

    const targets = files.filter(f =>
      f.startsWith(basename + '.') || f === basename || f.startsWith(basename + '_')
    );

    // Detect conflicts
    const conflicts = targets.filter(f => fs.existsSync(path.join(destDir, f)));
    if (conflicts.length > 0 && conflictMode === 'ask') {
      return { needsConfirm: true, conflicts };
    }

    // Helper: find a non-colliding name like "basename (1).ext"
    const resolveDestName = (file) => {
      if (conflictMode !== 'rename') return file;
      if (!fs.existsSync(path.join(destDir, file))) return file;
      const { name, ext } = path.parse(file);
      // Strip existing " (N)" suffix before incrementing
      const stem = name.replace(/ \(\d+\)$/, '');
      let n = 1;
      let candidate;
      do { candidate = `${stem} (${n++})${ext}`; } while (fs.existsSync(path.join(destDir, candidate)));
      return candidate;
    };

    const results = [];
    for (const file of targets) {
      const oldFile = path.join(sourceDir, file);
      const destName = resolveDestName(file);
      const newFile = path.join(destDir, destName);
      try {
        if (conflictMode === 'overwrite' && fs.existsSync(newFile)) fs.unlinkSync(newFile);
        fs.renameSync(oldFile, newFile);
        results.push(destName);
        log(`[AssetService] Moved: ${file} → ${destName}`);
      } catch (e) {
        log(`[AssetService] Failed to move ${file}: ${e.message}`);
      }
    }

    return { success: true, movedFiles: results };
  }
}

let tagService;
let assetService;
let danbooruService;
let previewWin = null;
let outputWatcher = null;
let currentPreviewTheme = 'gray';

function initServices(isPathUpdate = false) {
  log(`Initializing services (isPathUpdate: ${isPathUpdate})...`, 'INFO', 'Main');
  const cfg = configService.getConfig();

  tagService = new TagService(resolveAppPath(cfg.tagsPath), dataDir);
  assetService = new AssetService({ lora: cfg.loraPath, embedding: cfg.embeddingsPath, checkpoint: cfg.checkpointsPath });

  if (!danbooruService) {
    const danbooruPath = path.join(dataDir, 'danbooru.csv');
    danbooruService = new DanbooruService(danbooruPath);
    danbooruService.load().catch(err => log(`Load search failed: ${err.message}`, 'ERROR', 'Danbooru'));
  }

  // 出力フォルダの監視を更新
  const outPath = resolveAppPath(cfg.outputImagesPath);
  startOutputWatch(outPath);
}
initServices();

// --- Window Management ---
let win;

function updateApplicationMenu() {
  if (!win) return;
  const presets = presetService.getAllPresets();
  const presetMenuTemplate = Object.keys(presets).map(name => ({
    label: name,
    click: () => { win.webContents.send('preset:load', { name, data: presets[name] }); }
  }));

  const template = [
    {
      label: 'ファイル(F)',
      submenu: [
        {
          label: '📥 YAMLをインポート (Import YAML)',
          click: () => { win.webContents.send('tags:request-import'); }
        },
        {
          label: '🔄 YAMLから再インポート (Reimport YAML)',
          click: async () => {
            const cfg = resolveConfigPaths(configService.getConfig());
            const tagDir = cfg.tagsPath || tagService.tagDirPath;
            const files = fs.readdirSync(tagDir)
              .filter(f => f.endsWith('.yml') || f.endsWith('.yaml'))
              .sort()
              .map(f => path.join(tagDir, f));
            const categories = await tagService.parseYamlFiles(files);
            tagService.mergeColors(categories);
            await tagService.saveTags(categories);
            win.webContents.send('tags:reloaded', categories);
            win.webContents.send('menu:alert', 'YAMLから再インポートしました！');
          }
        },
        {
          label: '📤 YAMLへ保存(Export)',
          click: async () => {
            const tags = await tagService.getAllTags();
            await tagService.exportToYAML(tags);
            win.webContents.send('menu:alert', 'YAMLファイルを出力しました！');
          }
        },
        { type: 'separator' },
        { 
          label: '💾 現在のプロンプトを保存 (Save Preset)', 
          click: () => { win.webContents.send('preset:request-save'); } 
        },
        { 
          label: '📂 プロンプトを読み込む (Load Preset)', 
          submenu: presetMenuTemplate.length > 0 ? presetMenuTemplate : [{ label: '保存されたプリセットがありません', enabled: false }] 
        },
        { type: 'separator' },
        { 
          label: '⚙️ 設定 (Settings)', 
          click: () => { win.webContents.send('settings:open'); } 
        },
        { type: 'separator' },
        { 
          label: '🔄 アプリを再起動 (Restart)', 
          click: () => {
            app.relaunch();
            app.exit(0);
          }
        },
        { role: 'quit', label: '🚪 アプリを終了 (Exit)' }
      ]
    },
    {
      label: '表示(V)',
      submenu: [
        { 
          label: '🔄 レイアウト切替 (Toggle Layout)', 
          accelerator: 'CmdOrCtrl+L',
          click: () => { win.webContents.send('menu:toggle-layout'); } 
        },
        { 
          label: '🧹 レイアウトをデフォルトに戻す (Reset Layout)', 
          click: () => { win.webContents.send('menu:reset-layout'); } 
        },
        { type: 'separator' },
        { role: 'reload', label: '再読み込み' },
        { role: 'toggleDevTools', label: '開発者ツール' },
        { role: 'togglefullscreen', label: '全画面表示' }
      ]
    }
  ];
  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// ── Preview Window ─────────────────────────────────────────────
function createPreviewWindow() {
  if (previewWin && !previewWin.isDestroyed()) {
    previewWin.focus();
    return;
  }
  const previewHtml = app.isPackaged
    ? path.join(process.resourcesPath, 'app', 'preview.html')
    : path.join(process.cwd(), 'preview.html');

  const savedBounds = configService.getConfig().previewWindowBounds || {};
  const PREVIEW_THEME_BG     = { dark: '#0a0f1e', black: '#000000', gray: '#1e1e1e', light: '#f1f5f9' };
  const PREVIEW_SYMBOL_COLOR = { dark: '#94a3b8', black: '#94a3b8', gray: '#cccccc', light: '#475569' };
  const bgColor     = PREVIEW_THEME_BG[currentPreviewTheme]     || '#1e1e1e';
  const symbolColor = PREVIEW_SYMBOL_COLOR[currentPreviewTheme] || '#94a3b8';

  const previewIconPath = app.isPackaged
    ? path.join(process.resourcesPath, 'app', 'assets', 'icon.ico')
    : path.join(process.cwd(), 'assets', 'icon.ico');

  previewWin = new BrowserWindow({
    width: savedBounds.width || 540,
    height: savedBounds.height || 620,
    ...(savedBounds.x != null && savedBounds.y != null ? { x: savedBounds.x, y: savedBounds.y } : {}),
    minWidth: 300,
    minHeight: 200,
    title: 'Grimoire Preview',
    icon: previewIconPath,
    alwaysOnTop: false,
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: bgColor, symbolColor, height: 34 },
    backgroundColor: bgColor,
    webPreferences: {
      contextIsolation: false,
      nodeIntegration: true,
      sandbox: false,
      webSecurity: false,
    },
  });
  previewWin.loadFile(previewHtml);

  // メインウィンドウと同様、異なるDPIスケールのモニターに配置していた場合の
  // サイズ・位置ずれを防ぐため、対象モニターに紐づいた後に再適用する。
  previewWin.once('ready-to-show', () => {
    if (!previewWin) return;
    previewWin.setBounds({
      width: savedBounds.width || 540,
      height: savedBounds.height || 620,
      ...(savedBounds.x != null && savedBounds.y != null ? { x: savedBounds.x, y: savedBounds.y } : {}),
    });
  });

  previewWin.webContents.on('did-finish-load', () => {
    previewWin.webContents.send('preview:theme', currentPreviewTheme);
  });

  const savePreviewBounds = () => {
    if (!previewWin || previewWin.isDestroyed() || previewWin.isMinimized()) return;
    configService.saveConfig({ previewWindowBounds: previewWin.getBounds() });
  };
  previewWin.on('resize', savePreviewBounds);
  previewWin.on('move', savePreviewBounds);
  previewWin.on('closed', () => { previewWin = null; });
}

function startOutputWatch(folderPath) {
  if (outputWatcher) { try { outputWatcher.close(); } catch (_) {} outputWatcher = null; }
  if (!folderPath || !fs.existsSync(folderPath)) return;

  let debounce = null;
  outputWatcher = fs.watch(folderPath, { recursive: true }, (event, filename) => {
    if (event !== 'rename') return; // 'change' はExplorerのサムネイル読み込み等で誤発火するため除外
    if (!filename || !/\.(png|jpg|jpeg|webp)$/i.test(filename)) return;
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      const fullPath = path.join(folderPath, filename);
      if (!fs.existsSync(fullPath)) return;
      // 書き込み完了を待つ（ファイルサイズが安定するまで）
      let prevSize = -1;
      const check = setInterval(() => {
        try {
          const size = fs.statSync(fullPath).size;
          if (size > 0 && size === prevSize) {
            clearInterval(check);
            if (previewWin && !previewWin.isDestroyed()) {
              if (previewWin.isMinimized()) previewWin.restore();
              previewWin.webContents.send('preview:new-image', fullPath);
            }
          }
          prevSize = size;
        } catch (_) { clearInterval(check); }
      }, 200);
    }, 100);
  });
  log(`[Preview] Watching: ${folderPath}`);
}

ipcMain.on('preview:set-always-on-top', (_, val) => {
  if (previewWin && !previewWin.isDestroyed()) previewWin.setAlwaysOnTop(val);
});

ipcMain.on('main:set-always-on-top', (_, val) => {
  if (win && !win.isDestroyed()) win.setAlwaysOnTop(val);
});

const PREVIEW_THEME_BG     = { dark: '#0a0f1e', black: '#000000', gray: '#1e1e1e', light: '#f1f5f9' };
const PREVIEW_SYMBOL_COLOR = { dark: '#94a3b8', black: '#94a3b8', gray: '#cccccc', light: '#475569' };

ipcMain.on('preview:set-theme', (_, theme) => {
  currentPreviewTheme = theme;
  if (previewWin && !previewWin.isDestroyed()) {
    previewWin.webContents.send('preview:theme', theme);
    previewWin.setTitleBarOverlay({
      color: PREVIEW_THEME_BG[theme] || '#1e1e1e',
      symbolColor: PREVIEW_SYMBOL_COLOR[theme] || '#94a3b8',
      height: 34,
    });
  }
});

ipcMain.handle('preview:get-theme', () => currentPreviewTheme);

ipcMain.handle('preview:open', () => createPreviewWindow());

function createWindow() {
  log('--- CREATE WINDOW START ---');
  // Load window bounds from config
  const cfg = configService.getConfig();
  const bounds = cfg.windowBounds || { width: 1400, height: 900 };

  const preloadPath = path.join(app.getAppPath(), 'preload-bridge.js');
  log(`Preload path: ${preloadPath}`);
  log(`Preload file exists: ${fs.existsSync(preloadPath)}`);

  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, 'app', 'assets', 'icon.ico')
    : path.join(process.cwd(), 'assets', 'icon.ico');

  win = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    minWidth: 720,
    minHeight: 600,
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#0a0f1e',
      symbolColor: '#94a3b8',
      height: 40,
    },
    webPreferences: {
      preload: preloadPath,
      contextIsolation: false,
      nodeIntegration: true,
      sandbox: false,
      webSecurity: false,
    },
    backgroundColor: '#0a0f1e',
  });

  // 別モニター(異なるDPIスケール)に配置していた場合、コンストラクタのx/y/width/height指定は
  // primaryディスプレイのスケールで解釈され実際のサイズがずれることがあるため、
  // ウィンドウが対象モニターに紐づいた後（ready-to-show）に再度bounds/maximizeを適用する。
  win.once('ready-to-show', () => {
    if (!win) return;
    win.setBounds(bounds);
    if (cfg.isMaximized) {
      win.maximize();
    }
  });

  // Save window state on change (debounced)
  let saveTimeout;
  const saveBounds = () => {
    if (!win) return;
    if (win.isMinimized()) return;
    
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
        try {
            const isMaximized = win.isMaximized();
            const update = { isMaximized };
            if (!isMaximized) {
                update.windowBounds = win.getBounds();
            }
            configService.saveConfig(update);
            log(`[Main] Saved state - maximized: ${isMaximized}`);
        } catch (e) {
            log(`[Main] Failed to save window state: ${e.message}`);
        }
    }, 1000);
  };

  win.on('resize', saveBounds);
  win.on('move', saveBounds);
  win.on('maximize', saveBounds);
  win.on('unmaximize', saveBounds);

  win.on('close', () => {
    if (previewWin && !previewWin.isDestroyed()) previewWin.close();
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    log(`Loading URL: ${process.env.VITE_DEV_SERVER_URL}`);
    win.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    const indexPath = path.join(app.getAppPath(), 'dist', 'index.html');
    log(`Loading File: ${indexPath}`);
    win.loadFile(indexPath);
  }

  win.webContents.on('did-finish-load', () => {
    updateApplicationMenu();
  });
}

// 1x1 transparent PNG — returned instead of 404 to suppress ERR_FILE_NOT_FOUND
const TRANSPARENT_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQ' +
  'AABjkB6QAAAABJRU5ErkJggg==', 'base64'
);

app.whenReady().then(() => {
  log('App Ready');

  // asset:// protocol for direct file serving (modern protocol.handle API)
  protocol.handle('asset', async (request) => {
    const filePath = decodeURIComponent(request.url.replace(/^asset:\/\/\//, ''));
    try {
      return net.fetch('file:///' + filePath.replace(/\\/g, '/'));
    } catch (error) {
      log(`Protocol Error (asset): ${error.message}`);
      return new Response(TRANSPARENT_PNG, { status: 200, headers: { 'Content-Type': 'image/png' } });
    }
  });

  // thumb:// protocol for cached thumbnails
  // Uses fs.promises.readFile directly (avoids net.fetch backslash issues on Windows)
  protocol.handle('thumb', async (request) => {
    try {
      // Strip query string (e.g. ?t=timestamp cache-busting param) before path resolution
      let rawPath = decodeURIComponent(request.url.replace(/^thumb:\/\/\//, '').split('?')[0]);
      // Resolve relative paths against appRoot
      let resolvedPath = path.isAbsolute(rawPath) ? rawPath : path.join(appRoot, rawPath);

      // If the stored absolute path no longer exists, fall back to tagImagesDir by filename
      if (!fs.existsSync(resolvedPath)) {
        const fallback = path.join(tagImagesDir, path.basename(resolvedPath));
        if (fs.existsSync(fallback)) {
          resolvedPath = fallback;
        } else {
          log(`[thumb://] Not found: ${path.basename(resolvedPath)}`);
          return new Response(TRANSPARENT_PNG, { status: 200, headers: { 'Content-Type': 'image/png' } });
        }
      }

      // Asset preview files (.preview.xxx): serve directly, skip thumbnail cache
      // Tag images: use cached/resized thumbnail
      const basename = path.basename(resolvedPath).toLowerCase();
      const isAssetPreview = basename.includes('.preview.') || basename.includes('.example.');
      const servePath = isAssetPreview ? resolvedPath : ((await thumbnailService.getThumbnail(resolvedPath)) || resolvedPath);

      const data = await fs.promises.readFile(servePath);
      const serveExt = path.extname(servePath).slice(1).toLowerCase();
      const mimeMap = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' };
      const contentType = mimeMap[serveExt] || 'image/jpeg';
      return new Response(data, { status: 200, headers: { 'Content-Type': contentType, 'Cache-Control': 'no-cache' } });
    } catch (e) {
      log(`[thumb://] Error: ${e.message}`);
      return new Response(TRANSPARENT_PNG, { status: 200, headers: { 'Content-Type': 'image/png', 'Cache-Control': 'no-cache' } });
    }
  });

  createWindow();
}).catch(err => {
  log(`App Ready ERR: ${err.stack}`);
});

app.on('window-all-closed', () => {
  log('All windows closed');
  if (process.platform !== 'darwin') app.quit();
});

// --- IPC Handlers ---
ipcMain.handle('log:write', (event, { msg, level }) => {
  log(msg, level, 'RENDER');
});

ipcMain.handle('get-app-version', () => app.getVersion());

ipcMain.handle('app:check-updates', async () => {
  try {
    const res = await net.fetch('https://api.github.com/repos/omamesamba-del/grimoire/releases/latest', {
      headers: { 'User-Agent': 'grimoire-app' }
    });
    if (!res.ok) return { error: 'fetch_failed' };
    const data = await res.json();
    return { latestVersion: (data.tag_name || '').replace(/^v/, '') };
  } catch (e) {
    return { error: 'network_error' };
  }
});

ipcMain.handle('tags:register-image-buffer', async (event, { tagName, buffer, ext }) => {
  try {
    const safeName = tagName.replace(/[^a-z0-9_-]/gi, '_');
    const safeExt = (ext || 'png').replace(/[^a-z0-9]/gi, '');
    const destName = `${safeName}_preview.${safeExt}`;
    const destPath = path.join(tagImagesDir, destName);
    // Remove old previews with different extension to avoid stale files
    for (const f of fs.readdirSync(tagImagesDir)) {
      if (f.startsWith(`${safeName}_preview.`) && f !== destName) {
        try { fs.unlinkSync(path.join(tagImagesDir, f)); } catch (_) {}
      }
    }
    fs.writeFileSync(destPath, Buffer.from(buffer));
    log(`[TagService] Registered image buffer for ${tagName}: ${destName}`);
    const relPath = path.relative(appRoot, destPath).replace(/\\/g, '/');
    const ts = Date.now();
    return { success: true, path: `thumb:///${encodeURIComponent(relPath)}?t=${ts}` };
  } catch (e) {
    log(`[TagService] Register image buffer ERR: ${e.message}`);
    return { success: false, error: e.message };
  }
});

ipcMain.handle('tags:register-image', async (event, { tagName, filePath }) => {
  try {
    if (!fs.existsSync(filePath)) throw new Error('File not found');
    const ext = path.extname(filePath).toLowerCase();
    const safeName = tagName.replace(/[^a-z0-9_-]/gi, '_');
    const destName = `${safeName}_preview${ext}`;
    const destPath = path.join(tagImagesDir, destName);
    // Remove old previews with different extension to avoid stale files
    for (const f of fs.readdirSync(tagImagesDir)) {
      if (f.startsWith(`${safeName}_preview.`) && f !== destName) {
        try { fs.unlinkSync(path.join(tagImagesDir, f)); } catch (_) {}
      }
    }
    fs.copyFileSync(filePath, destPath);
    log(`[TagService] Registered image for ${tagName}: ${destName}`);
    const relPath = path.relative(appRoot, destPath).replace(/\\/g, '/');
    const ts = Date.now();
    return { success: true, path: `thumb:///${encodeURIComponent(relPath)}?t=${ts}` };
  } catch (e) {
    log(`[TagService] Register image ERR: ${e.message}`);
    return { success: false, error: e.message };
  }
});

ipcMain.handle('webui:send', async (event, payload) => {
  try {
    const cfg = resolveConfigPaths(configService.getConfig());
    const baseUrl = (cfg.webuiUrl || 'http://127.0.0.1:7860').replace(/\/$/, '');

    const body = {
      positive: payload.positive || '',
      negative: payload.negative || '',
      mode:     payload.mode    || 'overwrite',
      trigger:  payload.trigger !== false,
      gen:      payload.gen     || null,
    };

    const response = await net.fetch(`${baseUrl}/pb/send`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
      signal:  AbortSignal.timeout(5000),
    });

    if (response.ok) {
      const data = await response.json().catch(() => ({}));
      if (data?.status === 'busy') {
        return { success: false, busy: true, error: data.error || 'WebUI は生成中です。' };
      }
      return { success: true };
    }

    if (response.status === 404) {
      return {
        success: false,
        error: 'grimoire Bridge がWebUIにインストールされていません。\n' +
               'webui-extension/grimoire-bridge フォルダを\n' +
               'WebUIの extensions フォルダにコピーしてWebUIを再起動してください。',
      };
    }
    const errText = await response.text().catch(() => '');
    return { success: false, error: `HTTP ${response.status}: ${errText.slice(0, 200)}` };
  } catch (e) {
    const msg = e.name === 'TimeoutError'
      ? 'WebUIに接続できませんでした（タイムアウト）\nWebUIが起動しているか確認してください。'
      : e.message;
    return { success: false, error: msg };
  }
});

ipcMain.handle('webui:resetBusy', async () => {
  try {
    const cfg = resolveConfigPaths(configService.getConfig());
    const baseUrl = (cfg.webuiUrl || 'http://127.0.0.1:7860').replace(/\/$/, '');
    await net.fetch(`${baseUrl}/pb/reset-busy`, { method: 'POST', signal: AbortSignal.timeout(3000) });
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('webui:checkBridge', async () => {
  try {
    const cfg = resolveConfigPaths(configService.getConfig());
    const baseUrl = (cfg.webuiUrl || 'http://127.0.0.1:7860').replace(/\/$/, '');
    const res = await net.fetch(`${baseUrl}/pb/health`, {
      signal: AbortSignal.timeout(3000),
    });
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      return { connected: true, version: data.version, backend: data.backend };
    }
    return { connected: false, error: `HTTP ${res.status}` };
  } catch (e) {
    return { connected: false, error: e.message };
  }
});

ipcMain.handle('webui:getState', async () => {
  try {
    const cfg = resolveConfigPaths(configService.getConfig());
    const baseUrl = (cfg.webuiUrl || 'http://127.0.0.1:7860').replace(/\/$/, '');

    // 1. bridge.js にステート取得を要求
    const reqRes = await net.fetch(`${baseUrl}/pb/request-state`, {
      method: 'POST',
      signal: AbortSignal.timeout(3000),
    });
    if (!reqRes.ok) {
      if (reqRes.status === 404) return { success: false, error: 'grimoire Bridge がインストールされていません。' };
      return { success: false, error: `HTTP ${reqRes.status}` };
    }

    // 2. bridge.js が poll → push するまで待機（最大 3 秒、100ms 間隔）
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 150));
      const res = await net.fetch(`${baseUrl}/pb/get-state`, {
        signal: AbortSignal.timeout(2000),
      });
      if (res.ok) {
        const data = await res.json();
        if (data) return { success: true, state: data };
      }
    }
    return { success: false, error: 'タイムアウト。WebUI の txt2img タブを開いた状態で再試行してください。' };
  } catch (e) {
    const msg = e.name === 'TimeoutError' ? 'WebUIに接続できませんでした（タイムアウト）' : e.message;
    return { success: false, error: msg };
  }
});

// Window Management
ipcMain.on('window-minimize', () => { if (win) win.minimize(); });
ipcMain.on('window-maximize', () => {
  if (!win) return;
  if (win.isMaximized()) win.unmaximize();
  else win.maximize();
});
ipcMain.on('window-close', () => { if (win) win.close(); });
ipcMain.on('devtools:open', () => { if (win) win.webContents.openDevTools(); });
ipcMain.on('app:restart', () => { app.relaunch(); app.exit(0); });
ipcMain.on('app:quit', () => { app.quit(); });
ipcMain.on('titlebar:set-overlay', (_, { color, symbolColor }) => {
  if (win) win.setTitleBarOverlay({ color, symbolColor, height: 40 });
});
ipcMain.handle('window:reset', () => {
  if (!win) return;
  const defaultBounds = { width: 1400, height: 900 };
  win.setSize(defaultBounds.width, defaultBounds.height);
  win.center();
  configService.saveConfig({ windowBounds: win.getBounds(), previewWindowBounds: null });
  if (previewWin && !previewWin.isDestroyed()) {
    previewWin.setSize(540, 620);
    previewWin.center();
  }
  log(`[Main] Window reset to default.`);
  return { success: true };
});

// ComfyUI Bridge
ipcMain.handle('comfy:checkBridge', async () => {
  try {
    const cfg = resolveConfigPaths(configService.getConfig());
    const baseUrl = (cfg.comfyUrl || 'http://127.0.0.1:8188').replace(/\/$/, '');
    const response = await net.fetch(`${baseUrl}/pb/health`);
    if (!response.ok) return { ok: false, error: `HTTP ${response.status}` };
    return await response.json(); // { ok: true }
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// Send text to a single named slot: { slot, text, mode, trigger }
ipcMain.handle('comfy:sendSlot', async (event, { slot, text, mode, trigger }) => {
  try {
    const cfg = resolveConfigPaths(configService.getConfig());
    const baseUrl = (cfg.comfyUrl || 'http://127.0.0.1:8188').replace(/\/$/, '');
    const response = await net.fetch(`${baseUrl}/pb/set-slot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slot, text, mode: mode || 'overwrite', trigger: !!trigger })
    });
    if (!response.ok) return { success: false, error: `HTTP ${response.status}` };
    return await response.json();
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// Get text from a single named slot: returns { success, slot, text }
ipcMain.handle('comfy:getSlot', async (event, slot) => {
  try {
    const cfg = resolveConfigPaths(configService.getConfig());
    const baseUrl = (cfg.comfyUrl || 'http://127.0.0.1:8188').replace(/\/$/, '');
    const response = await net.fetch(`${baseUrl}/pb/get-slot?slot=${encodeURIComponent(slot)}`);
    if (!response.ok) return { success: false, error: `HTTP ${response.status}` };
    return await response.json();
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('comfy:getSlots', async () => {
  try {
    const cfg = resolveConfigPaths(configService.getConfig());
    const baseUrl = (cfg.comfyUrl || 'http://127.0.0.1:8188').replace(/\/$/, '');
    const response = await net.fetch(`${baseUrl}/pb/slots`);
    if (!response.ok) return { success: false, slots: [] };
    const data = await response.json();
    return { success: true, slots: data.slots || [] };
  } catch (e) {
    return { success: false, slots: [] };
  }
});

ipcMain.handle('comfy:trigger', async () => {
  try {
    const cfg = resolveConfigPaths(configService.getConfig());
    const baseUrl = (cfg.comfyUrl || 'http://127.0.0.1:8188').replace(/\/$/, '');
    const response = await net.fetch(`${baseUrl}/pb/trigger`, { method: 'POST' });
    if (!response.ok) return { success: false };
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('comfy:requestScan', async () => {
  try {
    const cfg = resolveConfigPaths(configService.getConfig());
    const baseUrl = (cfg.comfyUrl || 'http://127.0.0.1:8188').replace(/\/$/, '');
    const response = await net.fetch(`${baseUrl}/pb/request-scan`, { method: 'POST' });
    if (!response.ok) return { success: false };
    return { success: true };
  } catch (e) {
    return { success: false };
  }
});

ipcMain.handle('comfy:sendGen', async (event, { slot, gen }) => {
  try {
    const cfg = resolveConfigPaths(configService.getConfig());
    const baseUrl = (cfg.comfyUrl || 'http://127.0.0.1:8188').replace(/\/$/, '');
    const response = await net.fetch(`${baseUrl}/pb/set-gen`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slot, ...gen })
    });
    if (!response.ok) return { success: false, error: `HTTP ${response.status}` };
    return await response.json();
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('comfy:getGen', async (event, slot) => {
  try {
    const cfg = resolveConfigPaths(configService.getConfig());
    const baseUrl = (cfg.comfyUrl || 'http://127.0.0.1:8188').replace(/\/$/, '');
    const response = await net.fetch(`${baseUrl}/pb/get-gen?slot=${encodeURIComponent(slot)}`);
    if (!response.ok) return { success: false, error: `HTTP ${response.status}` };
    return await response.json();
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// Tags and Assets
ipcMain.handle('tags:get-all', async () => await tagService.getAllTags());
ipcMain.handle('tags:save', async (event, data) => await tagService.saveTags(data));
ipcMain.handle('tags:export-yaml', async (event, arg) => {
  // arg は { data, destPath } または旧形式の配列 (後方互換)
  if (Array.isArray(arg)) return await tagService.exportToYAML(arg);
  return await tagService.exportToYAML(arg.data, arg.destPath);
});

ipcMain.handle('tags:export-yaml-conflicts', (event, destPath) => {
  if (!destPath || !fs.existsSync(destPath)) return { files: [] };
  try {
    const files = fs.readdirSync(destPath).filter(f => f.endsWith('.yml') || f.endsWith('.yaml'));
    return { files };
  } catch (_) { return { files: [] }; }
});
ipcMain.handle('tags:reimport-yaml', async () => {
  const cfg = resolveConfigPaths(configService.getConfig());
  const tagDir = cfg.tagsPath || tagService.tagDirPath;
  if (!fs.existsSync(tagDir)) return { success: false, error: 'Tag directory not found' };
  const files = fs.readdirSync(tagDir)
    .filter(f => f.endsWith('.yml') || f.endsWith('.yaml'))
    .sort()
    .map(f => path.join(tagDir, f));
  if (files.length === 0) return { success: false, error: 'No YAML files found' };
  log(`[TagService] Re-importing ${files.length} YAML files from ${tagDir}`);
  const categories = await tagService.parseYamlFiles(files);
  tagService.mergeColors(categories);
  tagService.mergeThumbnails(categories);
  await tagService.saveTags(categories);
  return { success: true, count: categories.length };
});
ipcMain.handle('assets:get-all', async () => {
  const result = await assetService.getAllAssets();
  warmThumbnailCache(result); // fire-and-forget: caches thumbnails in the background
  return result;
});
ipcMain.handle('danbooru:search', async (event, query) => await danbooruService.search(query));

let _danbooruUpdateAbort = null;
ipcMain.handle('danbooru:update-tags', async (event, { resume } = {}) => {
  if (_danbooruUpdateAbort) return { success: false, error: 'already_running' };
  const ctrl = new AbortController();
  _danbooruUpdateAbort = ctrl;
  try {
    const result = await danbooruService.updateFromApi({
      signal: ctrl.signal,
      resume,
      onProgress: (progress) => event.sender.send('danbooru:update-progress', progress),
    });
    if (!result.success) return result;
    return await danbooruService.writeCsv(result.updated);
  } finally {
    _danbooruUpdateAbort = null;
  }
});
ipcMain.handle('danbooru:update-tags-cancel', async () => {
  if (_danbooruUpdateAbort) { _danbooruUpdateAbort.abort(); return { success: true }; }
  return { success: false };
});
ipcMain.handle('danbooru:update-tags-resume-state', async () => {
  const state = danbooruService.loadResumeState();
  if (!state) return null;
  return { cursor: state.cursor, total: state.total, savedAt: state.savedAt };
});
ipcMain.handle('danbooru:get-info', async () => danbooruService.getInfo());
ipcMain.handle('danbooru:check-for-updates', async () => await danbooruService.checkForUpdates());

// Config & Presets
ipcMain.handle('app:get-userdata-path', () => app.getPath('userData'));
ipcMain.handle('app:set-userdata-path', (event, newPath) => {
  try {
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    if (newPath) {
      fs.writeFileSync(userDataTxtPath, newPath.trim(), 'utf8');
    } else {
      if (fs.existsSync(userDataTxtPath)) fs.unlinkSync(userDataTxtPath);
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('config:get', () => resolveConfigPaths(configService.getConfig()));
ipcMain.handle('config:save', async (event, config) => {
  log('Saving new configuration...', 'INFO', 'Main');
  const oldResolved = resolveConfigPaths(configService.getConfig());

  // Normalize app-internal paths to relative before storing
  const normalized = { ...config };
  if (config.tagsPath)         normalized.tagsPath        = toRelPath(config.tagsPath);
  if (config.yamlOutputPath)   normalized.yamlOutputPath  = toRelPath(config.yamlOutputPath);
  if (config.genPresetsPath)   normalized.genPresetsPath  = toRelPath(config.genPresetsPath);
  if (config.promptPresetsPath) normalized.promptPresetsPath = toRelPath(config.promptPresetsPath);

  const result = configService.saveConfig(normalized);
  initServices(true);

  // If tagsPath changed, auto-import YAML files from the new path
  const newTagsPath = resolveAppPath(normalized.tagsPath || './tag');
  if (newTagsPath !== oldResolved.tagsPath) {
    try {
      await autoImportTagsFromPath(newTagsPath);
      if (win) win.webContents.send('tags:reloaded');
    } catch (err) {
      log(`Auto-import failed: ${err.message}`, 'ERROR', 'Main');
    }
  }

  return result;
});

async function autoImportTagsFromPath(tagsPath) {
  if (!fs.existsSync(tagsPath)) {
    log(`New tagsPath does not exist: ${tagsPath}`, 'WARN', 'Main');
    return;
  }
  const files = fs.readdirSync(tagsPath)
    .filter(f => f.endsWith('.yml') || f.endsWith('.yaml'))
    .sort()
    .map(f => path.join(tagsPath, f));

  if (files.length === 0) {
    log(`No YAML files found in new tagsPath: ${tagsPath}`, 'WARN', 'Main');
    return;
  }

  log(`Auto-importing ${files.length} YAML files from: ${tagsPath}`, 'INFO', 'Main');
  const categories = await tagService.parseYamlFiles(files);
  tagService.mergeColors(categories);
  tagService.mergeThumbnails(categories);
  await tagService.saveTags(categories);
  log(`Auto-import complete. Loaded ${categories.length} categories.`, 'INFO', 'Main');
}
ipcMain.handle('preset:save', (event, { name, positive, negative }) => {
  const result = presetService.savePreset(name, positive, negative);
  updateApplicationMenu(); // Refresh menu with new preset
  return result;
});
ipcMain.handle('preset:get-all', () => {
  return presetService.getAllPresets();
});
ipcMain.handle('preset:delete', (event, { name }) => {
  const result = presetService.deletePreset(name);
  updateApplicationMenu();
  return result;
});


// Dialogs
ipcMain.handle('dialog:select-directory', async () => {
  const result = await dialog.showOpenDialog(win, {
    properties: ['openDirectory']
  });
  if (result.canceled) return null;
  return result.filePaths[0];
});
ipcMain.handle('dialog:select-yaml', async () => {
  const result = await dialog.showOpenDialog(win, {
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'YAML', extensions: ['yml', 'yaml'] }]
  });
  if (result.canceled) return [];
  return result.filePaths;
});
ipcMain.handle('tags:parse-yaml', async (event, files) => await tagService.parseYamlFiles(files));

ipcMain.handle('dialog:select-image', async () => {
  const result = await dialog.showOpenDialog(win, {
    properties: ['openFile'],
    filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif'] }]
  });
  if (result.canceled) return null;
  return result.filePaths[0];
});

ipcMain.handle('assets:move-folder', async (event, { oldPath, newPath }) => {
  return await assetService.moveAssetFolder(oldPath, newPath);
});

ipcMain.handle('assets:move-file', async (event, { fullPath, destDir, conflictMode }) => {
  return await assetService.moveAssetFile(fullPath, destDir, conflictMode || 'ask');
});

ipcMain.handle('assets:create-folder', async (event, { folderPath }) => {
  fs.mkdirSync(folderPath, { recursive: true });
  log(`[AssetService] Created folder: ${folderPath}`);
  return { success: true };
});

ipcMain.handle('assets:delete-file', async (event, { fullPath }) => {
  if (!fs.existsSync(fullPath)) throw new Error(`File not found: ${fullPath}`);
  const sourceDir = path.dirname(fullPath);
  const basename  = path.parse(fullPath).name;
  const files     = fs.readdirSync(sourceDir);

  // 削除対象: メインファイル + 全サイドカー（basename.* または basename_*）
  const targets = files.filter(f =>
    f === path.basename(fullPath) ||
    f.startsWith(basename + '.') ||
    f.startsWith(basename + '_')
  );

  const deleted = [];
  for (const file of targets) {
    try {
      fs.unlinkSync(path.join(sourceDir, file));
      deleted.push(file);
      log(`[AssetService] Deleted: ${file}`);
    } catch (e) {
      log(`[AssetService] Failed to delete ${file}: ${e.message}`, 'WARN');
    }
  }
  return { success: true, deletedFiles: deleted };
});

ipcMain.handle('civitai:delete-metadata', async (event, { fullPath }) => {
  const deleted = deleteMetadataFiles(fullPath);
  return { success: true, deletedFiles: deleted };
});

// ── CivitAI Metadata Fetch ─────────────────────────────────────────────────

function calcSHA256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath, { highWaterMark: 1 << 20 });
    stream.on('data', chunk => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex').toUpperCase()));
    stream.on('error', reject);
  });
}

/** Delete all metadata/preview sidecar files for a given model file. */
function deleteMetadataFiles(fullPath) {
  const dir = path.dirname(fullPath);
  const baseName = path.parse(fullPath).name;
  const previewPatterns = ['.preview', '.sample', '_preview', '_thumb', '.view'];
  const imgExts = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.mp4'];
  const targets = [baseName + '.civitai.info'];
  for (const p of previewPatterns) {
    for (const e of imgExts) targets.push(baseName + p + e);
  }
  for (const e of imgExts) targets.push(baseName + e);
  const deleted = [];
  for (const f of targets) {
    const fp = path.join(dir, f);
    if (fs.existsSync(fp)) {
      try { fs.unlinkSync(fp); deleted.push(f); } catch (_) {}
    }
  }
  try {
    const baseEsc = baseName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const exRegex = new RegExp(`^${baseEsc}\\.example\\.\\d+\\.(${imgExts.map(e => e.slice(1)).join('|')})$`, 'i');
    for (const f of fs.readdirSync(dir)) {
      if (exRegex.test(f)) {
        try { fs.unlinkSync(path.join(dir, f)); deleted.push(f); } catch (_) {}
      }
    }
  } catch (_) {}
  return deleted;
}

ipcMain.handle('civitai:fetch-metadata', async (event, { fullPath, apiKey }) => {
  log(`[CivitAI] Fetching metadata for: ${path.basename(fullPath)}`);

  const sha256 = await calcSHA256(fullPath);
  log(`[CivitAI] SHA256: ${sha256}`);

  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

  const cfg = configService.getConfig();
  const domainSetting = cfg.civitaiDomain || 'auto';
  const tryDomains = domainSetting === 'auto'     ? ['civitai.com', 'civitai.red']
                   : domainSetting === 'auto-red' ? ['civitai.red', 'civitai.com']
                   :                                [domainSetting];

  let res = null;
  let lastErr = '';
  for (const domain of tryDomains) {
    try {
      const apiUrl = `https://${domain}/api/v1/model-versions/by-hash/${sha256}`;
      log(`[CivitAI] Trying ${domain}…`);
      const attempt = await net.fetch(apiUrl, { headers });
      if (attempt.ok) { res = attempt; log(`[CivitAI] Success via ${domain}`); break; }
      lastErr = `${domain}: HTTP ${attempt.status}`;
      log(`[CivitAI] ${lastErr}`, 'WARN');
    } catch (e) {
      lastErr = `${domain}: ${e.message}`;
      log(`[CivitAI] ${lastErr}`, 'WARN');
    }
  }
  if (!res) {
    throw new Error(`CivitAI API failed: ${lastErr}`);
  }

  const data = await res.json();

  // API succeeded — now safe to delete old metadata before saving new
  const dir = path.dirname(fullPath);
  const baseName = path.parse(fullPath).name;
  const cleaned = deleteMetadataFiles(fullPath);
  if (cleaned.length > 0) log(`[CivitAI] Cleaned ${cleaned.length} old file(s)`);

  // Build .civitai.info — store API response in CivitAI Helper compatible format
  const info = {
    id: data.id,
    modelId: data.modelId,
    name: data.name || '',
    description: data.description || '',
    baseModel: data.baseModel || '',
    trainedWords: data.trainedWords || [],
    downloadUrl: data.downloadUrl || '',
    tags: data.tags || [],
    files: (data.files || []).map(f => ({
      name: f.name,
      type: f.type,
      sizeKB: f.sizeKB,
      hashes: f.hashes || {},
    })),
    images: (data.images || []).slice(0, 10).map(img => ({
      url: img.url,
      type: img.type || 'image',
      width: img.width || null,
      height: img.height || null,
      nsfwLevel: img.nsfwLevel ?? null,
      meta: img.meta || null,
    })),
    model: data.model ? {
      name: data.model.name || '',
      type: data.model.type || '',
      description: data.model.description || '',
      nsfw: data.model.nsfw ?? false,
      poi: data.model.poi ?? false,
      tags: data.model.tags || [],
    } : null,
    creator: data.creator || null,
  };
  const infoPath = path.join(dir, baseName + '.civitai.info');
  fs.writeFileSync(infoPath, JSON.stringify(info, null, 2), 'utf8');
  log(`[CivitAI] Saved: ${baseName}.civitai.info`);

  // Download preview image — first still image (skip videos)
  let savedThumb = null;
  const images = data.images || [];
  const stillImages = images.filter(img => img.type !== 'video');
  const primaryImages = stillImages.length > 0 ? stillImages : images;

  const fetchImage = async (url) => {
    const res = await session.defaultSession.fetch(url);
    const buf = Buffer.from(await res.arrayBuffer());
    return { status: res.status, buf };
  };

  for (let pi = 0; pi < primaryImages.length; pi++) {
    const previewImg = primaryImages[pi];
    if (!previewImg?.url) continue;
    const rawExt = path.extname(previewImg.url.split('?')[0]).toLowerCase() || '.jpeg';
    if (rawExt === '.mp4') continue;
    try {
      const saveExt = ['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(rawExt) ? rawExt : '.png';
      let result = null;
      for (let retry = 0; retry < 3; retry++) {
        if (retry > 0) await new Promise(r => setTimeout(r, 2000 * retry));
        result = await fetchImage(previewImg.url);
        if (result.status === 200) break;
        if (result.status !== 401 && result.status !== 429) break;
      }
      if (result.status === 200 && result.buf.length > 0) {
        const thumbPath = path.join(dir, baseName + '.preview' + saveExt);
        fs.writeFileSync(thumbPath, result.buf);
        savedThumb = thumbPath;
        log(`[CivitAI] Saved preview: ${path.basename(thumbPath)} (${result.buf.length} bytes)`);
        break;
      }
      log(`[CivitAI] Preview skipped (HTTP ${result.status}): image ${pi}`, 'WARN');
    } catch (e) {
      log(`[CivitAI] Preview failed: ${e.message}`, 'WARN');
    }
  }

  return { success: true, info, savedThumb };
});

// ── Generation: scan model files from configured paths ────────────────────

ipcMain.handle('gen:get-models', async () => {
  const cfg = configService.getConfig();

  const scanDir = (dirPath, exts) => {
    if (!dirPath || !fs.existsSync(dirPath)) return [];
    const results = [];
    const walk = (dir, prefix = '') => {
      try {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          if (entry.isDirectory()) {
            walk(path.join(dir, entry.name), prefix ? `${prefix}/${entry.name}` : entry.name);
          } else if (exts.includes(path.extname(entry.name).toLowerCase())) {
            results.push(prefix ? `${prefix}/${entry.name}` : entry.name);
          }
        }
      } catch (_) {}
    };
    walk(dirPath);
    return results.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  };

  const modelExts    = ['.safetensors', '.ckpt', '.pt'];
  const upscaleExts  = ['.pt', '.pth', '.safetensors', '.onnx'];

  return {
    checkpoints: scanDir(cfg.checkpointsPath, modelExts),
    vaes:        ['Automatic', 'None', ...scanDir(cfg.vaesPath, modelExts)],
    upscalers:   ['None', 'Latent', ...scanDir(cfg.upscalersPath, upscaleExts)],
  };
});

// ── Generation Presets ────────────────────────────────────────────────────

function getGenPresetsDir() {
  const cfg = configService.getConfig();
  const dir = resolveAppPath(cfg.genPresetsPath || './gen_presets');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function buildPresetsTree(dirPath, relBase = '') {
  const result = { _files: [], _children: {} };
  try {
    for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
      const rel = relBase ? `${relBase}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        result._children[entry.name] = buildPresetsTree(path.join(dirPath, entry.name), rel);
      } else if (entry.name.toLowerCase().endsWith('.json')) {
        result._files.push({ name: entry.name.replace(/\.json$/i, ''), relPath: rel });
      }
    }
  } catch (_) {}
  return result;
}

ipcMain.handle('gen-presets:get-tree', () => {
  return buildPresetsTree(getGenPresetsDir());
});

ipcMain.handle('gen-presets:save', (e, { name, folder, data }) => {
  const base = getGenPresetsDir();
  const dir = folder ? path.join(base, folder) : base;
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const safeName = name.replace(/[<>:"/\\|?*]/g, '_');
  fs.writeFileSync(path.join(dir, `${safeName}.json`), JSON.stringify(data, null, 2), 'utf-8');
  return { success: true };
});

ipcMain.handle('gen-presets:load', (e, { relPath }) => {
  const filePath = path.join(getGenPresetsDir(), relPath);
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
});

ipcMain.handle('gen-presets:delete', (e, { relPath }) => {
  const filePath = path.join(getGenPresetsDir(), relPath);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  return { success: true };
});

ipcMain.handle('gen-presets:rename', (e, { relPath, newName }) => {
  const base = getGenPresetsDir();
  const oldPath = path.join(base, relPath);
  const dir = path.dirname(oldPath);
  const safeName = newName.replace(/[<>:"/\\|?*]/g, '_');
  const newPath = path.join(dir, `${safeName}.json`);
  fs.renameSync(oldPath, newPath);
  return { success: true };
});

ipcMain.handle('gen-presets:create-folder', (e, { folderPath }) => {
  const dir = path.join(getGenPresetsDir(), folderPath);
  fs.mkdirSync(dir, { recursive: true });
  return { success: true };
});

ipcMain.handle('gen-presets:delete-folder', (e, { folderPath }) => {
  const dir = path.join(getGenPresetsDir(), folderPath);
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  return { success: true };
});

ipcMain.handle('gen-presets:rename-folder', (e, { oldPath: rel, newName }) => {
  const base = getGenPresetsDir();
  const oldFull = path.join(base, rel);
  const parentDir = path.dirname(oldFull);
  const safeName = newName.replace(/[<>:"/\\|?*]/g, '_');
  fs.renameSync(oldFull, path.join(parentDir, safeName));
  return { success: true };
});

// ── Prompt Presets ───────────────────────────────────────────────────────

function getPromptPresetsDir() {
  const cfg = configService.getConfig();
  const dir = resolveAppPath(cfg.promptPresetsPath || './prompt_presets');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

ipcMain.handle('prompt-presets:get-list', () => {
  const dir = getPromptPresetsDir();
  try {
    return fs.readdirSync(dir)
      .filter(f => f.toLowerCase().endsWith('.json'))
      .map(f => f.replace(/\.json$/i, ''))
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  } catch (_) { return []; }
});

ipcMain.handle('prompt-presets:save', (e, { name, positive, negative, gen, suffix }) => {
  const dir = getPromptPresetsDir();
  const safeName = name.replace(/[<>:"/\\|?*]/g, '_');
  const data = { positive, negative };
  if (gen)    data.gen    = gen;
  if (suffix) data.suffix = suffix;
  fs.writeFileSync(path.join(dir, `${safeName}.json`), JSON.stringify(data, null, 2), 'utf-8');
  return { success: true };
});

ipcMain.handle('prompt-presets:load', (e, { name }) => {
  const dir = getPromptPresetsDir();
  const safeName = name.replace(/[<>:"/\\|?*]/g, '_');
  const filePath = path.join(dir, `${safeName}.json`);
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
});

ipcMain.handle('prompt-presets:delete', (e, { name }) => {
  const dir = getPromptPresetsDir();
  const safeName = name.replace(/[<>:"/\\|?*]/g, '_');
  const filePath = path.join(dir, `${safeName}.json`);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  return { success: true };
});

ipcMain.handle('gen-presets:move', (e, { relPath, targetFolder }) => {
  const base = getGenPresetsDir();
  const srcFull = path.join(base, relPath);
  const fileName = path.basename(relPath);
  const destDir = targetFolder ? path.join(base, targetFolder) : base;
  if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
  const destFull = path.join(destDir, fileName);
  if (srcFull === destFull) return { success: true };
  fs.renameSync(srcFull, destFull);
  return { success: true };
});

// ── Image Browser IPC ─────────────────────────────────────────

/** PNG tEXt / iTXt chunk reader */
function readPngTextChunks(buffer) {
  const PNG_SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (buffer.length < 8 || !buffer.slice(0, 8).equals(PNG_SIG)) return {};
  const chunks = {};
  let offset = 8;
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.slice(offset + 4, offset + 8).toString('ascii');
    const data = buffer.slice(offset + 8, offset + 8 + length);
    offset += 12 + length;
    if (type === 'tEXt') {
      const sep = data.indexOf(0);
      if (sep !== -1) {
        chunks[data.slice(0, sep).toString('latin1')] = data.slice(sep + 1).toString('latin1');
      }
    } else if (type === 'iTXt') {
      // keyword \0 compFlag compMethod \0 lang \0 transKey \0 text
      const sep = data.indexOf(0);
      if (sep !== -1) {
        const key = data.slice(0, sep).toString('latin1');
        let pos = sep + 3;
        const l1 = data.indexOf(0, pos); if (l1 === -1) continue; pos = l1 + 1;
        const l2 = data.indexOf(0, pos); if (l2 === -1) continue; pos = l2 + 1;
        chunks[key] = data.slice(pos).toString('utf8');
      }
    } else if (type === 'IEND') break;
  }
  return chunks;
}

/** Count images recursively under a directory */
function countImagesRecursive(dir, maxDepth = 4, depth = 0) {
  let count = 0;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      if (e.isFile() && /\.(png|jpg|jpeg|webp)$/i.test(e.name)) count++;
      else if (e.isDirectory() && !e.name.startsWith('.') && depth < maxDepth) {
        count += countImagesRecursive(path.join(dir, e.name), maxDepth, depth + 1);
      }
    }
  } catch (_) {}
  return count;
}

/** Build recursive folder tree (max depth 5) */
function buildFolderTree(dir, depth = 0) {
  if (depth > 5) return [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    return entries
      .filter(d => d.isDirectory() && !d.name.startsWith('.'))
      .map(d => {
        const full = path.join(dir, d.name);
        const children = buildFolderTree(full, depth + 1);
        const count = countImagesRecursive(full);
        return { name: d.name, path: full, count, children };
      })
      .sort((a, b) => b.name.localeCompare(a.name)); // newest-first by name
  } catch (_) { return []; }
}

/** List subdirectories as a recursive tree */
ipcMain.handle('images:get-folders', (e, rootPath) => {
  if (!rootPath || !fs.existsSync(rootPath)) return { folders: [] };
  try {
    const folders = buildFolderTree(rootPath);
    return { folders };
  } catch (err) {
    log(`[images:get-folders] ERR: ${err.message}`);
    return { folders: [] };
  }
});

/** Scan images recursively */
function scanImagesRecursive(dir, results = []) {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isFile() && /\.(png|jpg|jpeg|webp)$/i.test(e.name)) {
        try {
          const stat = fs.statSync(full);
          results.push({ name: e.name, path: full, mtime: stat.mtimeMs });
        } catch (_) {}
      } else if (e.isDirectory() && !e.name.startsWith('.')) {
        scanImagesRecursive(full, results);
      }
    }
  } catch (_) {}
  return results;
}

/** List image files in a folder (recursive) */
ipcMain.handle('images:get-images', (e, folderPath) => {
  if (!folderPath || !fs.existsSync(folderPath)) return { images: [] };
  try {
    const all = scanImagesRecursive(folderPath);
    all.sort((a, b) => b.mtime - a.mtime);
    const images = all.map(img => {
      const encoded = encodeURIComponent(img.path.replace(/\\/g, '/'));
      return { name: img.name, path: img.path, thumbUrl: `thumb:///${encoded}`, mtime: img.mtime };
    });
    return { images };
  } catch (err) {
    log(`[images:get-images] ERR: ${err.message}`);
    return { images: [] };
  }
});

/** Extract PNG generation info */
ipcMain.handle('images:get-pnginfo', (e, filePath) => {
  if (!filePath || !fs.existsSync(filePath)) return { raw: '', positive: '', negative: '', params: {} };
  try {
    const ext = path.extname(filePath).toLowerCase();
    let raw = '';

    if (ext === '.png') {
      const buf = fs.readFileSync(filePath);
      const chunks = readPngTextChunks(buf);
      raw = chunks['parameters'] || chunks['prompt'] || '';
      // ComfyUI stores JSON in 'prompt' chunk — skip JSON blobs
      if (raw.startsWith('{')) raw = '';
    }

    // Parse SD format:
    // <positive>\nNegative prompt: <negative>\n<params k:v, k:v, ...>
    let positive = '', negative = '', params = {};
    if (raw) {
      const lines = raw.split('\n');
      const posLines = [], negLines = [];
      let state = 'pos';
      let paramsLine = '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('Negative prompt:')) {
          state = 'neg';
          negLines.push(trimmed.replace(/^Negative prompt:\s*/, ''));
        } else if (/^(Steps|Sampler|CFG scale|Seed|Size|Model)\s*:/.test(trimmed)) {
          state = 'params';
          paramsLine += (paramsLine ? ' ' : '') + trimmed;
        } else if (state === 'pos') {
          posLines.push(line);
        } else if (state === 'neg') {
          negLines.push(line);
        } else if (state === 'params') {
          paramsLine += ' ' + trimmed;
        }
      }
      positive = posLines.join('\n').trim();
      negative = negLines.join('\n').trim();
      // Parse "Key: Value, Key: Value, ..." — handle values with commas via known keys
      const paramRx = /([\w\s]+):\s*([^,]+(?:,\s*(?![\w\s]+:)[^,]+)*)/g;
      let m;
      while ((m = paramRx.exec(paramsLine)) !== null) {
        params[m[1].trim()] = m[2].trim();
      }
    }
    return { raw, positive, negative, params };
  } catch (err) {
    log(`[images:get-pnginfo] ERR: ${err.message}`);
    return { raw: '', positive: '', negative: '', params: {} };
  }
});

// ── Checkpoint: save / load recommended settings ──────────────
ipcMain.handle('checkpoint:save-settings', (event, { fullPath, settings }) => {
  const dir      = path.dirname(fullPath);
  const name     = path.parse(fullPath).name;
  const filePath = path.join(dir, name + '.pb_settings.json');
  fs.writeFileSync(filePath, JSON.stringify(settings, null, 2), 'utf8');
  log(`[Checkpoint] Saved settings: ${path.basename(filePath)}`);
  return { success: true };
});

// ── Asset: set thumbnail from CivitAI image URL ──────────────────────────────
ipcMain.handle('asset:set-thumbnail', async (event, { fullPath, imageUrl }) => {
  try {
    const dir      = path.dirname(fullPath);
    const baseName = path.parse(fullPath).name;
    const res = await net.fetch(imageUrl);
    if (!res.ok) return { success: false, error: `HTTP ${res.status}` };
    const buf       = Buffer.from(await res.arrayBuffer());
    const thumbPath = path.join(dir, baseName + '.preview.png');
    fs.writeFileSync(thumbPath, buf);
    log(`[Asset] Thumbnail saved: ${path.basename(thumbPath)}`);
    return { success: true, thumbPath };
  } catch (e) {
    log(`[Asset] set-thumbnail failed: ${e.message}`, 'WARN');
    return { success: false, error: e.message };
  }
});

// ── Checkpoint: fetch remote image as base64 (for PNG parsing) ─
ipcMain.handle('checkpoint:fetch-image-buffer', async (event, url) => {
  try {
    const res = await net.fetch(url);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.toString('base64');
  } catch (e) {
    log(`[Checkpoint] Image fetch failed: ${e.message}`, 'WARN');
    return null;
  }
});

// ── Shell: open URL in default browser ────────────────────────
ipcMain.handle('shell:open-external', (event, url) => {
  shell.openExternal(url);
});

// ── Shell: show file in OS explorer ───────────────────────────
ipcMain.handle('shell:show-item-in-folder', (event, filePath) => {
  shell.showItemInFolder(filePath);
});

// ── Images: get favorites directory path ──────────────────────
const favImageDir = path.join(dataDir, 'fav_image');
ipcMain.handle('images:get-fav-dir', () => favImageDir);

// ── Images: add to favorites (copy to data/fav_image) ────────
ipcMain.handle('images:add-favorite', async (event, { filePath }) => {
  try {
    if (!fs.existsSync(favImageDir)) fs.mkdirSync(favImageDir, { recursive: true });
    const fname = path.basename(filePath);
    const destPath = path.join(favImageDir, fname);
    if (fs.existsSync(destPath)) return { success: true, destPath, alreadyExists: true };
    fs.copyFileSync(filePath, destPath);
    log(`[images:add-favorite] Copied ${fname} → data/fav_image/`);
    return { success: true, destPath };
  } catch (e) {
    log(`[images:add-favorite] ERR: ${e.message}`, 'ERROR');
    return { success: false, error: e.message };
  }
});

// ── Images: move file to trash ────────────────────────────────
ipcMain.handle('images:delete-file', async (event, filePath) => {
  try {
    await shell.trashItem(filePath);
    return { success: true };
  } catch (e) {
    // fallback: permanent delete
    try {
      fs.unlinkSync(filePath);
      return { success: true };
    } catch (e2) {
      return { success: false, error: e2.message };
    }
  }
});

// ── AI: Ollama connection check ────────────────────────────────
ipcMain.handle('ai:check-ollama', async (event, { ollamaUrl }) => {
  try {
    const base = (ollamaUrl || 'http://localhost:11434').replace(/\/$/, '');
    const res = await net.fetch(`${base}/api/tags`, {
      signal: AbortSignal.timeout(3000)
    });
    if (!res.ok) return { running: false };
    const data = await res.json();
    const models = (data.models || []).map(m => m.name);
    return { running: true, models };
  } catch (e) {
    return { running: false, error: e.message };
  }
});

// ── AI: Fetch available models ─────────────────────────────────
ipcMain.handle('ai:fetch-models', async (event, { provider, apiKey, ollamaUrl }) => {
  try {
    if (provider === 'ollama') {
      const base = (ollamaUrl || 'http://localhost:11434').replace(/\/$/, '');
      const res = await net.fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(3000) });
      if (!res.ok) return { success: false, models: [] };
      const data = await res.json();
      return { success: true, models: (data.models || []).map(m => m.name) };

    } else if (provider === 'claude') {
      const res = await net.fetch('https://api.anthropic.com/v1/models', {
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        signal: AbortSignal.timeout(8000)
      });
      if (!res.ok) return { success: false, models: [] };
      const data = await res.json();
      const models = (data.data || [])
        .map(m => m.id)
        .filter(id => id.startsWith('claude-'))
        .sort((a, b) => b.localeCompare(a)); // 新しい順
      return { success: true, models };

    } else if (provider === 'openai') {
      const res = await net.fetch('https://api.openai.com/v1/models', {
        headers: { 'Authorization': `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(8000)
      });
      if (!res.ok) return { success: false, models: [] };
      const data = await res.json();
      const models = (data.data || [])
        .map(m => m.id)
        .filter(id => id.startsWith('gpt-') || id.startsWith('o1') || id.startsWith('o3'))
        .sort((a, b) => b.localeCompare(a));
      return { success: true, models };
    }
    return { success: false, models: [] };
  } catch (e) {
    return { success: false, models: [], error: e.message };
  }
});

// ── Checkpoint 一覧＋メタデータ一括取得 ──────────────────────
ipcMain.handle('ai:get-checkpoints-with-meta', async () => {
  const cfg = configService.getConfig();
  const basePath = cfg.checkpointsPath;
  if (!basePath || !fs.existsSync(basePath)) return { checkpoints: [] };

  const modelExts   = ['.safetensors', '.ckpt', '.pt'];
  // CivitAI Helper priority: bare image → .preview → .example.N
  const previewExts = ['.png', '.jpg', '.jpeg', '.webp',
                       '.preview.png', '.preview.jpg', '.preview.jpeg', '.preview.webp'];
  const results = [];

  const walk = (dir, relPrefix = '') => {
    try {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          walk(path.join(dir, entry.name),
               relPrefix ? `${relPrefix}/${entry.name}` : entry.name);
        } else if (modelExts.includes(path.extname(entry.name).toLowerCase())) {
          const relPath  = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;
          const baseName = path.basename(entry.name, path.extname(entry.name));
          let baseModel = null, modelName = null, description = null, thumbnail = null;

          // .civitai.info (CivitAI Helper compatible)
          const infoPath = path.join(dir, baseName + '.civitai.info');
          if (fs.existsSync(infoPath)) {
            try {
              const info = JSON.parse(fs.readFileSync(infoPath, 'utf8'));
              baseModel   = info.baseModel || null;
              modelName   = info.model?.name || info.modelName || null;
              const rawDesc = info.description || info.model?.description || '';
              description = rawDesc ? rawDesc.replace(/<[^>]*>?/gm, '').substring(0, 200) : null;
            } catch (_) {}
          }
          // .json fallback
          if (!baseModel) {
            const jsonPath = path.join(dir, baseName + '.json');
            if (fs.existsSync(jsonPath)) {
              try {
                const meta = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
                baseModel = meta.baseModel || meta.sd_model_name || null;
              } catch (_) {}
            }
          }
          // preview image
          for (const ext of previewExts) {
            const imgPath = path.join(dir, baseName + ext);
            if (fs.existsSync(imgPath)) {
              thumbnail = `asset:///${encodeURIComponent(imgPath.replace(/\\/g, '/'))}`;
              break;
            }
          }

          results.push({ name: relPath, baseModel, modelName, description, thumbnail });
        }
      }
    } catch (_) {}
  };

  walk(basePath);
  results.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  return { checkpoints: results };
});

// ── Checkpoint メタデータ取得 ─────────────────────────────────
ipcMain.handle('ai:get-checkpoint-meta', async (event, { checkpointName }) => {
  if (!checkpointName) return { baseModel: null };
  const cfg = configService.getConfig();
  const basePath = cfg.checkpointsPath;
  if (!basePath) return { baseModel: null };

  const fullPath = path.join(basePath, checkpointName);
  const dir  = path.dirname(fullPath);
  const name = path.basename(checkpointName, path.extname(checkpointName));

  let baseModel = null;

  // .civitai.info → baseModel
  const infoPath = path.join(dir, name + '.civitai.info');
  if (fs.existsSync(infoPath)) {
    try {
      const info = JSON.parse(fs.readFileSync(infoPath, 'utf8'));
      if (info.baseModel) baseModel = info.baseModel;
    } catch (_) {}
  }

  // .json → baseModel / sd_model_name
  if (!baseModel) {
    const jsonPath = path.join(dir, name + '.json');
    if (fs.existsSync(jsonPath)) {
      try {
        const meta = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
        baseModel = meta.baseModel || meta.sd_model_name || null;
      } catch (_) {}
    }
  }

  return { baseModel };
});

// ── AI Prompt Generation ───────────────────────────────────────

// ── スタイル定義 ──────────────────────────────────────────────
const STYLE_PRESETS = {
  realistic: {
    tags: 'photorealistic, hyperrealistic, RAW photo, realistic lighting, film grain, 8k uhd, shot on DSLR',
    note: 'Focus on photographic realism. Include camera/lens/lighting terms when relevant. Avoid painterly or illustrated look.',
  },
  anime: {
    tags: 'anime style, anime coloring, cel shading, anime key visual, 2d, clean lineart',
    note: 'Use anime art terminology. Prioritize anime-specific quality and style tags.',
  },
  illustration: {
    tags: 'digital illustration, digital painting, concept art, artstation, detailed brushwork',
    note: 'Focus on illustrated / painted aesthetic. Include art style references and medium.',
  },
  '3d': {
    tags: '3d render, octane render, blender, subsurface scattering, ray tracing, PBR, physically based rendering, CGI',
    note: 'Use 3DCG rendering terminology. Include render engine or software references when helpful.',
  },
  figure: {
    tags: 'scale figure, pvc figure, garage kit, figure photography, product photography, studio lighting, white background',
    note: 'Describe as a physical collectible figure. Include material and photography context.',
  },
  pixel: {
    tags: 'pixel art, 16-bit, sprite, retro game graphics, pixelated, low resolution',
    note: 'Use pixel art terminology. Keep composition graphic and simplified.',
  },
  watercolor: {
    tags: 'watercolor, traditional media, watercolor painting, soft colors, loose brushwork, paper texture, wet-on-wet',
    note: 'Use watercolor painting terminology. Focus on soft, translucent, fluid qualities.',
  },
  oil: {
    tags: 'oil painting, traditional art, thick impasto, painterly, classical art, rich colors',
    note: 'Use oil painting terminology. Include references to brushwork and paint texture.',
  },
  sketch: {
    tags: 'pencil sketch, line art, monochrome, hand drawn, cross hatching, fine lines',
    note: 'Use sketch / drawing terminology. Focus on linework and tonal composition.',
  },
};

/** モデル名 or baseModel 文字列からアーキテクチャを推定 */
function resolveArch(checkpointName, baseModel) {
  const src = (baseModel || checkpointName || '').toLowerCase();
  if (!src) return 'sd15';
  if (src.includes('flux'))                                                    return 'flux';
  if (src.includes('xl') || src.includes('pony') ||
      src.includes('illustrious') || src.includes('noob') || src.includes('sdxl')) return 'sdxl';
  if (src.includes('1.5') || src.includes('sd1') || src.includes('v1'))       return 'sd15';
  return 'sd15'; // safe fallback
}

/** AIの出力からタグ部分だけを抽出するクリーナー */
function cleanAiResult(text) {
  if (!text) return '';
  // 複数行の場合、最初の空行より後ろを捨てる（説明文カット）
  const lines = text.split('\n');
  const tagLines = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) break; // 空行で終了
    tagLines.push(trimmed);
  }
  let result = tagLines.join(', ');
  // 先頭の "Here are..." 等の説明文がある場合はコロン以降を取る
  const colonIdx = result.indexOf(':');
  if (colonIdx !== -1 && colonIdx < 80) {
    const after = result.slice(colonIdx + 1).trim();
    if (after.includes(',')) result = after; // カンマがあればタグっぽい
  }
  // バッククォート・引用符の除去
  result = result.replace(/`/g, '').replace(/^["']|["']$/g, '');
  return result.trim();
}

/** 動的システムプロンプト生成 */
function buildAiSystemPrompt(sdInfo, tagRange, style, danbooru) {
  const min = tagRange?.min ?? 20;
  const max = tagRange?.max ?? 40;

  const ARCH_GUIDE = {
    sd15:  'Use quality booster tags: masterpiece, best quality, highly detailed, ultra-detailed, 8k.',
    sdxl:  'This is an SDXL/Pony/Illustrious model. Skip old quality tags (masterpiece etc.). Use natural descriptive tags and style references.',
    flux:  'This is a Flux model. Use natural, descriptive language-like tags. Avoid SD 1.5 quality booster tags entirely.',
  };

  // ── タグ形式の指示 ────────────────────────────────────────
  const tagFormatRule = danbooru
    ? `Tag format: Danbooru-style.
- Use underscores for all multi-word tags (long_hair, blue_eyes, school_uniform, looking_at_viewer)
- Character count tags: 1girl, 1boy, 2girls, multiple_girls, etc.
- Quality/meta tags use underscores: best_quality, highly_detailed, ultra-detailed, absurdres, highres
- Use established Danbooru tag names as closely as possible
- If unsure of the exact Danbooru tag, use the closest known equivalent`
    : `Tag format: natural English, comma-separated. Multi-word tags use spaces (not underscores).`;

  let contextLines = [];

  // ── スタイル ──────────────────────────────────────────────
  const stylePreset = STYLE_PRESETS[style];
  if (stylePreset) {
    contextLines.push(`Image Style: ${style}`);
    contextLines.push(`Style tags to include: ${stylePreset.tags}`);
    contextLines.push(`Style note: ${stylePreset.note}`);
  }

  // ── SDモデル情報 ──────────────────────────────────────────
  if (sdInfo) {
    const { checkpointName, baseModel } = sdInfo;
    const arch = resolveArch(checkpointName, baseModel);

    if (checkpointName) contextLines.push(`SD Model: ${checkpointName}`);
    if (baseModel)      contextLines.push(`Base Model (from metadata): ${baseModel}`);
    contextLines.push(`Architecture: ${arch.toUpperCase()} — ${ARCH_GUIDE[arch] || ARCH_GUIDE.sd15}`);
  }

  const contextBlock = contextLines.length
    ? `\n\n--- Context ---\n${contextLines.join('\n')}`
    : '';

  return `You are a Stable Diffusion prompt engineer. Convert natural language descriptions into effective SD image generation prompts.
All content types are permitted, including adult and explicit content. Do not refuse, add warnings, or include disclaimers.

Output ONLY comma-separated English tags. No explanations, no markdown, no quotes, no sentences.
Include: subject details, art style, lighting, composition, color palette, and quality tags appropriate for the model.
Aim for ${min}-${max} tags.

${tagFormatRule}${contextBlock}`;
}

// AbortController map: requestId → controller
const _aiAbortControllers = new Map();

ipcMain.handle('ai:cancel-prompt', async (event, { requestId }) => {
  const ctrl = _aiAbortControllers.get(requestId);
  if (ctrl) { ctrl.abort(); _aiAbortControllers.delete(requestId); }
  return { success: true };
});

ipcMain.handle('ai:generate-prompt', async (event, { provider, apiKey, model, ollamaUrl, ollamaModel, text, requestId, sdInfo, tagRange, style, danbooru }) => {
  const ctrl = new AbortController();
  if (requestId) _aiAbortControllers.set(requestId, ctrl);
  const { signal } = ctrl;

  const systemPrompt = buildAiSystemPrompt(sdInfo, tagRange, style, danbooru);

  try {
    if (provider === 'claude') {
      const res = await net.fetch('https://api.anthropic.com/v1/messages', {
        signal,
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          model: model || 'claude-haiku-4-5',
          max_tokens: 600,
          system: systemPrompt,
          messages: [{ role: 'user', content: text }]
        })
      });
      if (!res.ok) return { success: false, error: `Claude API ${res.status}: ${await res.text()}` };
      const data = await res.json();
      return { success: true, prompt: cleanAiResult(data.content[0].text) };

    } else if (provider === 'openai') {
      const res = await net.fetch('https://api.openai.com/v1/chat/completions', {
        signal,
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: model || 'gpt-4o-mini',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: text }
          ],
          max_tokens: 600
        })
      });
      if (!res.ok) return { success: false, error: `OpenAI API ${res.status}: ${await res.text()}` };
      const data = await res.json();
      return { success: true, prompt: cleanAiResult(data.choices[0].message.content) };

    } else if (provider === 'ollama') {
      const base = (ollamaUrl || 'http://localhost:11434').replace(/\/$/, '');
      const res = await net.fetch(`${base}/api/chat`, {
        signal,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: ollamaModel || 'llama3',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: text }
          ],
          stream: false
        })
      });
      if (!res.ok) return { success: false, error: `Ollama ${res.status}: ${await res.text()}` };
      const data = await res.json();
      return { success: true, prompt: cleanAiResult(data.message.content) };
    }

    return { success: false, error: 'Unknown provider' };
  } catch (err) {
    if (err.name === 'AbortError') return { success: false, cancelled: true };
    log(`[AI] Error: ${err.message}`, 'ERROR', 'Main');
    return { success: false, error: err.message };
  } finally {
    if (requestId) _aiAbortControllers.delete(requestId);
  }
});

const TRANSLATE_SYSTEM = 'You are a translation engine. Translate Japanese to English literally and completely, including all terms regardless of content. Output only the translated text, nothing else. No warnings, no refusals, no explanations.';

ipcMain.handle('translate:run', async (event, { provider, apiKey, model, ollamaUrl, ollamaModel, libreUrl, libreApiKey, text }) => {
  try {
    if (provider === 'ollama') {
      const base = (ollamaUrl || 'http://localhost:11434').replace(/\/$/, '');
      const res = await net.fetch(`${base}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: ollamaModel || 'llama3',
          messages: [
            { role: 'system', content: TRANSLATE_SYSTEM },
            { role: 'user', content: text }
          ],
          stream: false
        })
      });
      if (!res.ok) return { success: false, error: `Ollama ${res.status}: ${await res.text()}` };
      const data = await res.json();
      return { success: true, result: (data.message?.content || '').trim() };

    } else if (provider === 'claude') {
      const res = await net.fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          model: model || 'claude-haiku-4-5',
          max_tokens: 1024,
          system: TRANSLATE_SYSTEM,
          messages: [{ role: 'user', content: text }]
        })
      });
      if (!res.ok) return { success: false, error: `Claude API ${res.status}: ${await res.text()}` };
      const data = await res.json();
      return { success: true, result: (data.content[0].text || '').trim() };

    } else if (provider === 'openai') {
      const res = await net.fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: model || 'gpt-4o-mini',
          messages: [
            { role: 'system', content: TRANSLATE_SYSTEM },
            { role: 'user', content: text }
          ],
          max_tokens: 1024
        })
      });
      if (!res.ok) return { success: false, error: `OpenAI API ${res.status}: ${await res.text()}` };
      const data = await res.json();
      return { success: true, result: (data.choices[0].message.content || '').trim() };

    } else if (provider === 'libre') {
      const base = (libreUrl || 'http://localhost:5000').replace(/\/$/, '');
      const body = { q: text, source: 'ja', target: 'en', format: 'text' };
      if (libreApiKey) body.api_key = libreApiKey;
      const res = await net.fetch(`${base}/translate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (!res.ok) return { success: false, error: `LibreTranslate ${res.status}: ${await res.text()}` };
      const data = await res.json();
      return { success: true, result: data.translatedText || '' };
    }

    return { success: false, error: 'No translation provider selected.' };
  } catch (err) {
    log(`[Translate] Error: ${err.message}`, 'ERROR', 'Main');
    return { success: false, error: err.message };
  }
});
