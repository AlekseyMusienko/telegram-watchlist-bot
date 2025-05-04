import express, { Request, Response } from 'express';
import mongoose, { Schema, Document } from 'mongoose';
import request from 'request-promise';
import TelegramBot from 'node-telegram-bot-api';

const app = express();
app.use(express.json());

// Конфигурация
const TOKEN: string = process.env.TELEGRAM_BOT_TOKEN || '7583335421:AAEOHXw9RSntZWC1ER867nijCKynAOiNrDU';
const WEBHOOK_URL: string = `${process.env.RENDER_EXTERNAL_HOSTNAME || 'https://telegram-watchlist-bot.onrender.com'}/bot${TOKEN}`;
const PORT: number = process.env.PORT ? parseInt(process.env.PORT) : 10000;
const MONGO_URI: string = process.env.MONGO_URI || 'mongodb://localhost:27017/watchlist';
const TMDB_API_KEY: string = process.env.TMDB_API_KEY || 'dbcb8e081cd5251282612d9e22ab1852';

// Подключение к MongoDB
mongoose.connect(MONGO_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch((err: Error) => console.error('MongoDB connection error:', err));

// Модель для фильмов/сериалов
interface IMedia extends Document {
  userId: number;
  title: string;
  type: 'movie' | 'tv';
  tmdbId: number;
}

const MediaSchema: Schema = new Schema({
  userId: { type: Number, required: true },
  title: { type: String, required: true },
  type: { type: String, enum: ['movie', 'tv'], required: true },
  tmdbId: { type: Number, required: true },
});

const Media = mongoose.model<IMedia>('Media', MediaSchema);

// Функция для отправки сообщений
async function sendMessage(chatId: number, text: string, replyMarkup: any = null): Promise<any> {
  try {
    const body: any = { chat_id: chatId, text };
    if (replyMarkup) {
      body.reply_markup = JSON.parse(JSON.stringify(replyMarkup));
    }
    console.log('Sending message with body:', body);

    const response = await request({
      method: 'POST',
      url: `https://api.telegram.org/bot${TOKEN}/sendMessage`,
      body,
      json: true,
      resolveWithFullResponse: true,
    });
    console.log('SendMessage response:', response.body);
    return response;
  } catch (error: any) {
    console.error('SendMessage error:', error.message);
    throw error;
  }
}

// Функция поиска через TMDB API (по названию)
async function searchTMDB(query: string, type: 'movie' | 'tv'): Promise<any[]> {
  try {
    const response = await request({
      method: 'GET',
      url: `https://api.themoviedb.org/3/search/${type}`,
      qs: { api_key: TMDB_API_KEY, query, language: 'ru-RU' },
      json: true,
    });
    console.log(`TMDB search results for ${query} (${type}):`, response.results);
    return response.results || [];
  } catch (error: any) {
    console.error('TMDB search error:', error.message);
    return [];
  }
}

// Функция получения данных по TMDB ID
async function getTMDBById(id: string, type: 'movie' | 'tv'): Promise<any> {
  try {
    const response = await request({
      method: 'GET',
      url: `https://api.themoviedb.org/3/${type}/${id}`,
      qs: { api_key: TMDB_API_KEY, language: 'ru-RU' },
      json: true,
    });
    console.log(`TMDB data for ${type} ID ${id}:`, response);
    return response;
  } catch (error: any) {
    console.error('TMDB get by ID error:', error.message);
    return null;
  }
}

// Настройка вебхука
app.post(`/bot${TOKEN}`, async (req: Request, res: Response) => {
  console.log('Received update:', req.body);

  // Обработка сообщения
  if (req.body.message) {
    const chatId: number = req.body.message.chat.id;
    const text: string = req.body.message.text.toLowerCase();

    if (text === '/start' || text === '/help') {
      const replyMarkup = {
        inline_keyboard: [
          [
            { text: 'Поиск', callback_data: 'search' },
            { text: 'Список фильмов', callback_data: 'list_movies' },
            { text: 'Список сериалов', callback_data: 'list_series' },
          ],
          [
            { text: 'Случайный', callback_data: 'random' },
            { text: 'Удалить фильм/сериал', callback_data: 'delete' },
          ],
        ],
      };
      await sendMessage(chatId, 'Добро пожаловать в Сериальщик! Выберите действие:', replyMarkup);
    } else {
      // Поиск фильма/сериала
      const movies = await searchTMDB(text, 'movie');
      const series = await searchTMDB(text, 'tv');
      const results = [...movies, ...series];

      if (results.length === 0) {
        await sendMessage(chatId, 'Ничего не найдено');
      } else {
        const replyMarkup = {
          inline_keyboard: results.slice(0, 5).map((item) => [
            {
              text: `${item.title || item.name} (${item.media_type || item.first_air_date ? 'сериал' : 'фильм'})`,
              callback_data: `add_${item.media_type || (item.first_air_date ? 'tv' : 'movie')}_${item.id}`,
            },
          ]),
        };
        await sendMessage(chatId, 'Результаты поиска:', replyMarkup);
      }
    }
  }

  // Обработка callback-запросов
  if (req.body.callback_query) {
    const chatId: number = req.body.callback_query.message.chat.id;
    const data: string = req.body.callback_query.data;

    if (data === 'search') {
      await sendMessage(chatId, 'Введите название фильма или сериала для поиска:');
    } else if (data === 'list_movies') {
      const movies = await Media.find({ userId: chatId, type: 'movie' });
      const text = movies.length > 0 ? movies.map((m) => m.title).join('\n') : 'Список фильмов пуст';
      await sendMessage(chatId, `Ваши фильмы:\n${text}`);
    } else if (data === 'list_series') {
      const series = await Media.find({ userId: chatId, type: 'tv' });
      const text = series.length > 0 ? series.map((s) => s.title).join('\n') : 'Список сериалов пуст';
      await sendMessage(chatId, `Ваши сериалы:\n${text}`);
    } else if (data === 'random') {
      const media = await Media.find({ userId: chatId });
      if (media.length > 0) {
        const randomMedia = media[Math.floor(Math.random() * media.length)];
        await sendMessage(chatId, `Случайный: ${randomMedia.title} (${randomMedia.type === 'movie' ? 'фильм' : 'сериал'})`);
      } else {
        await sendMessage(chatId, 'Ваш список пуст');
      }
    } else if (data === 'delete') {
      const media = await Media.find({ userId: chatId });
      if (media.length === 0) {
        await sendMessage(chatId, 'Ваш список пуст');
      } else {
        const replyMarkup = {
          inline_keyboard: media.map((item) => [
            {
              text: `${item.title} (${item.type === 'movie' ? 'фильм' : 'сериал'})`,
              callback_data: `delete_${item._id}`,
            },
          ]),
        };
        await sendMessage(chatId, 'Выберите фильм/сериал для удаления:', replyMarkup);
      }
    } else if (data.startsWith('add_')) {
      const [, type, tmdbId] = data.split('_');
      const media = await getTMDBById(tmdbId, type as 'movie' | 'tv');
      if (media) {
        const title = media.title || media.name;
        await Media.create({ userId: chatId, title, type, tmdbId: parseInt(tmdbId) });
        await sendMessage(chatId, `Добавлено: ${title} (${type === 'movie' ? 'фильм' : 'сериал'})`);
      } else {
        await sendMessage(chatId, 'Не удалось добавить фильм/сериал. Попробуйте снова.');
      }
    } else if (data.startsWith('delete_')) {
      const [, id] = data.split('_');
      const media = await Media.findByIdAndDelete(id);
      if (media) {
        await sendMessage(chatId, `Удалено: ${media.title} (${media.type === 'movie' ? 'фильм' : 'сериал'})`);
      }
    }
  }

  res.status(200).send('OK');
});

// Настройка polling (включите, если вебхук не работает)
const USE_POLLING: boolean = false; // Измените на true для использования polling
if (USE_POLLING) {
  const bot = new TelegramBot(TOKEN, { polling: true });

  bot.on('message', async (msg: TelegramBot.Message) => {
    console.log('Received message:', msg);
    const chatId: number = msg.chat.id;
    await bot.sendMessage(chatId, 'Бот работает!');
  });

  // Отключение вебхука при использовании polling
  request({
    method: 'POST',
    url: `https://api.telegram.org/bot${TOKEN}/deleteWebhook`,
  }).then(() => console.log('Webhook disabled for polling'));
} else {
  // Установка вебхука
  request({
    method: 'POST',
    url: `https://api.telegram.org/bot${TOKEN}/setWebhook?url=${WEBHOOK_URL}`,
  }).then(() => console.log(`Webhook set to: ${WEBHOOK_URL}`));
}

// Запуск сервера
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});