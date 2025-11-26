// server.js
const express = require('express');
const multer = require('multer');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3003;

// Разрешаем запросы с мобильного приложения
app.use(cors());

// Публичная папка с фото
app.use('/files', express.static('files'));

// Настройка хранения файлов
const storage = multer.diskStorage({
  destination: 'files/', // Все фото идут в /files

  filename: (req, file, cb) => {
    const { uid } = req.params;           // UID из URL
    const type = req.path.includes('avatar') ? 'avatar' : 'cover';
    const ext = path.extname(file.originalname) || '.jpg'; // защита от пустого расширения
    const filename = `${type}_${uid}${ext.toLowerCase()}`;
    cb(null, filename);
  }
});

// Ограничения: 10 МБ, только изображения
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|webp|gif/;
    const isValid = allowed.test(file.mimetype) && allowed.test(path.extname(file.originalname).toLowerCase());
    cb(isValid ? null : new Error('Только изображения!'), isValid);
  }
});

// Универсальный маршрут для аватара и обложки
app.post('/upload/:type(avatar|cover)/:uid', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Файл не загружен' });
  }

  const { type, uid } = req.params;
  const ext = path.extname(req.file.originalname);
  const publicUrl = `http://45.114.61.148:3003/files/${type}_${uid}${ext}`;

  res.json({ url: publicUrl });
});

// Обработка ошибок multer
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'Файл слишком большой (макс. 10 МБ)' });
    }
  }
  if (error.message === 'Только изображения!') {
    return res.status(400).json({ error: error.message });
  }
  res.status(500).json({ error: 'Внутренняя ошибка сервера' });
});

// Запуск
app.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
  console.log(`Фото доступны по: http://45.114.61.148:3003/files/avatar_123.jpg`);
});