// server.js — окончательная версия
try { require('dotenv').config(); } catch (e) { /* dotenv не установлен — используем process.env */ }
const express = require('express');
const multer = require('multer');
const path = require('path');
const cors = require('cors');

const app = express();
app.use(cors());
app.use('/files', express.static('files'));

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