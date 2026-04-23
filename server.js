// server.js — окончательная версия
try { require('dotenv').config(); } catch (e) { /* dotenv не установлен — используем process.env */ }
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const sharp = require('sharp');

const app = express();
// За reverse-proxy (nginx): корректный req.ip. Отключить: TRUST_PROXY=0
{
  const tp = process.env.TRUST_PROXY;
  if (tp === undefined || tp === '1' || String(tp).toLowerCase() === 'true') {
    app.set('trust proxy', 1);
  }
}
app.use(cors());

function clampInt(v, min, max) {
  const n = Number.parseInt(String(v || ''), 10);
  if (!Number.isFinite(n)) return null;
  return Math.max(min, Math.min(max, n));
}

function safeFilename(name) {
  const base = path.basename(String(name || ''));
  // Prevent path traversal and weird names.
  if (!base || base.includes('..') || base.includes('/') || base.includes('\\')) return null;
  return base;
}

function computeEtag(stat, paramsKey) {
  // Weak ETag is enough; changes when file changes or params differ.
  return `W/"${stat.size}-${Number(stat.mtimeMs)}-${paramsKey}"`;
}

app.get('/files/:filename', async (req, res) => {
  const filename = safeFilename(req.params.filename);
  if (!filename) return res.status(400).end();

  const filePath = path.join(__dirname, 'files', filename);
  let stat;
  try {
    stat = await fs.promises.stat(filePath);
    if (!stat.isFile()) return res.status(404).end();
  } catch (e) {
    return res.status(404).end();
  }

  const w = clampInt(req.query.w, 1, 4096);
  const h = clampInt(req.query.h, 1, 4096);
  const q = clampInt(req.query.q, 40, 95) ?? 86;
  const fmtRaw = String(req.query.fmt || '').toLowerCase();
  const wantsTransform = Boolean(w || h || fmtRaw);

  // Default behavior: if no params, serve original file as-is (compat).
  if (!wantsTransform) {
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('ETag', computeEtag(stat, 'orig'));
    if (req.headers['if-none-match'] === res.getHeader('ETag')) return res.status(304).end();
    return res.sendFile(filePath);
  }

  const ext = path.extname(filename).toLowerCase();
  const isImage = /\.(jpe?g|png|webp)$/i.test(ext);
  if (!isImage) {
    return res.status(415).json({ error: 'unsupported' });
  }

  const fmt = (fmtRaw === 'jpg' || fmtRaw === 'jpeg' || fmtRaw === 'png' || fmtRaw === 'webp' || fmtRaw === 'avif')
    ? fmtRaw
    : 'webp';

  const paramsKey = `w=${w || ''}&h=${h || ''}&q=${q}&fmt=${fmt}`;
  res.setHeader('Cache-Control', 'public, max-age=604800, stale-while-revalidate=86400');
  res.setHeader('ETag', computeEtag(stat, paramsKey));
  if (req.headers['if-none-match'] === res.getHeader('ETag')) return res.status(304).end();

  // Output content-type.
  if (fmt === 'jpg') res.type('jpeg');
  else res.type(fmt);

  try {
    let pipeline = sharp(filePath, { failOn: 'none' });
    if (w || h) {
      pipeline = pipeline.resize({
        width: w || undefined,
        height: h || undefined,
        fit: 'inside',
        withoutEnlargement: true,
      });
    }
    if (fmt === 'webp') pipeline = pipeline.webp({ quality: q });
    else if (fmt === 'avif') pipeline = pipeline.avif({ quality: q });
    else if (fmt === 'png') pipeline = pipeline.png({ compressionLevel: 9 });
    else pipeline = pipeline.jpeg({ quality: q, mozjpeg: true });

    pipeline.on('error', (e) => {
      console.error('sharp pipeline error', e);
      if (!res.headersSent) res.status(500).end();
    });

    pipeline.pipe(res);
  } catch (e) {
    console.error('transform error', e);
    res.status(500).end();
  }
});

app.get('/health', (req, res) => {
  const m = process.memoryUsage();
  res.json({
    status: 'ok',
    uptimeSec: Math.floor(process.uptime()),
    rssBytes: m.rss,
    heapUsedBytes: m.heapUsed,
    heapTotalBytes: m.heapTotal,
  });
});

const storage = multer.diskStorage({
  destination: 'files/',
  filename: (req, file, cb) => {
    const { uid } = req.params;
    const type = req.path.includes('avatar') ? 'avatar' : 'cover';
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `${type}_${uid}${ext.toLowerCase()}`);
  }
});

const IMAGE_EXT = /\.(jpe?g|png|webp|gif)$/i;
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const mimetypeOk = file.mimetype && (file.mimetype.startsWith('image/') || /jpe?g|png|webp|gif/.test(file.mimetype));
    const extOk = file.originalname && IMAGE_EXT.test(file.originalname);
    const ok = mimetypeOk || extOk;
    cb(ok ? null : new Error('Только изображения'), ok);
  }
});

// Публичный URL для картинок (обязательно с портом 3003, иначе фото не откроются в приложении)
const PUBLIC_URL = process.env.PUBLIC_URL || 'http://45.114.61.148:3003';

app.post('/upload/:type(avatar|cover)/:uid', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'no file' });

  const { type, uid } = req.params;
  const ext = (path.extname(req.file.originalname) || '.jpg').toLowerCase();
  const filename = `${type}_${uid}${ext}`;
  const base = PUBLIC_URL.replace(/\/$/, '');
  const url = `${base}/files/${filename}`;

  res.json({ url, photoUrl: url });
});

// обработка ошибок
app.use((err, req, res, next) => {
  console.error(err);
  res.status(400).json({ error: err.message || 'upload error' });
});

// ←←← САМОЕ ВАЖНОЕ: порт берём из переменной или 3003
const PORT = process.env.PORT || 3003;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Сервер работает → http://45.114.61.148:${PORT}`);
  console.log(`Фото: http://45.114.61.148:${PORT}/files/avatar_123.jpg`);
});