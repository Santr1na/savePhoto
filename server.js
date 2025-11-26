// server.js
const express = require('express');
const multer = require('multer');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3003;

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
    const allowed = /jpeg|jpg|png|webp|gif/;
    const valid = allowed.test(file.mimetype) && allowed.test(path.extname(file.originalname).toLowerCase());
    cb(valid ? null : new Error('Только изображения!'), valid);
  }
});

// Главное исправление — генерируем URL динамически!
app.post('/upload/:type(avatar|cover)/:uid', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Файл не загружен' });
  }

  const { type, uid } = req.params;
  const ext = path.extname(req.file.originalname) || '.jpg';
  
  // ←←← ЭТО САМОЕ ГЛАВНОЕ ИСПРАВЛЕНИЕ
  const protocol = req.protocol; // http или https
  const host = req.get('host');  // 45.114.61.148:3003 или твой домен
  const publicUrl = `${protocol}://${host}/files/${type}_${uid}${ext}`;

  res.json({ url: publicUrl });
});

// Обработка ошибок
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'Файл больше 10 МБ' });
    }
  }
  if (err.message === 'Только изображения!') {
    return res.status(400).json({ error: err.message });
  }
  console.error(err);
  res.status(500).json({ error: 'Ошибка сервера' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Сервер запущен: http://45.114.61.148:${PORT}`);
  console.log(`Загрузка: POST http://45.114.61.148:${PORT}/upload/avatar/123`);
});