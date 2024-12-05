const TelegramBot = require('node-telegram-bot-api');
const mongoose = require('mongoose');
require('dotenv').config();

// Подключение к MongoDB
mongoose.connect('mongodb+srv://your_mongodb_uri', { useNewUrlParser: true, useUnifiedTopology: true });

// Модель для фильмов
const MovieSchema = new mongoose.Schema({
  title: String,
  notified: { type: Boolean, default: false },
});
const Movie = mongoose.model('Movie', MovieSchema);

// Инициализация бота
const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

// Обработка команды /start
bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, 'Привет! Используй /add <название фильма>, чтобы добавить в список ожидания.');
});

// Обработка команды /add
bot.onText(/\/add (.+)/, async (msg, match) => {
  const title = match[1];
  const newMovie = new Movie({ title });
  await newMovie.save();
  bot.sendMessage(msg.chat.id, `Фильм "${title}" добавлен в список ожидания.`);
});

// Проверка релизов (упрощённая логика)
const checkReleases = async () => {
  // Здесь должна быть интеграция с TMDB или другим API
  console.log('Проверка релизов...');
};
