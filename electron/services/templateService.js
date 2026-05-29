import fs from 'node:fs';
import path from 'node:path';

export class TemplateService {
    constructor(dataDirPath) {
        this.filePath   = path.join(dataDirPath, 'templates.json');
        this.thumbDir   = path.join(dataDirPath, 'templates');
        fs.mkdirSync(this.thumbDir, { recursive: true });
        if (!fs.existsSync(this.filePath)) {
            const defaults = [
                {
                    id: 'default-character',
                    name: 'Character',
                    thumbnail: null,
                    positive: '{quality}, {character}, {outfit}, {pose}, {camera}, {background}',
                    negative: '{negative}, worst quality, low quality, bad anatomy, bad hands',
                    history: [],
                },
                {
                    id: 'default-quality',
                    name: 'Quality Only',
                    thumbnail: null,
                    positive: '{quality}, {character}',
                    negative: '{negative}, worst quality, low quality',
                    history: [],
                },
            ];
            fs.writeFileSync(this.filePath, JSON.stringify(defaults, null, 2), 'utf8');
        }
    }

    load() {
        try { return JSON.parse(fs.readFileSync(this.filePath, 'utf8')); }
        catch { return []; }
    }

    save(templates) {
        fs.writeFileSync(this.filePath, JSON.stringify(templates, null, 2), 'utf8');
    }

    upsert(template) {
        const list = this.load();
        const idx  = list.findIndex(t => t.id === template.id);
        if (idx >= 0) list[idx] = template;
        else list.push(template);
        this.save(list);
        return list;
    }

    remove(id) {
        const list = this.load().filter(t => t.id !== id);
        this.save(list);
        // Clean up thumbnail
        const thumb = path.join(this.thumbDir, `${id}.png`);
        if (fs.existsSync(thumb)) fs.unlinkSync(thumb);
        return list;
    }

    setThumbnail(id, buffer) {
        const dest = path.join(this.thumbDir, `${id}.png`);
        fs.writeFileSync(dest, Buffer.from(buffer));
        return dest;
    }

    getThumbnailPath(id) {
        const p = path.join(this.thumbDir, `${id}.png`);
        return fs.existsSync(p) ? p : null;
    }

    addHistory(id, values) {
        const list    = this.load();
        const tmpl    = list.find(t => t.id === id);
        if (!tmpl) return;
        if (!tmpl.history) tmpl.history = [];
        tmpl.history.unshift({ ts: Date.now(), values });
        tmpl.history = tmpl.history.slice(0, 20);
        this.save(list);
        return tmpl.history;
    }
}
