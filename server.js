// server.js — окончательная версия
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

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /jpe?g|png|webp|gif/;
    const ok = allowed.test(file.mimetype);
    cb(ok ? null : new Error('Только изображения'), ok);
  }
});

app.post('/upload/:type(avatar|cover)/:uid', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'no file' });

  const { type, uid } = req.params;
  const ext = (path.extname(req.file.originalname) || '.jpg').toLowerCase();
  const filename = `${type}_${uid}${ext}`;
  const url = `${req.protocol}://${req.get('host')}/files/${filename}`;

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