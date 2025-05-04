import express, { Request, Response } from 'express';
import mongoose, { Schema, Document } from 'mongoose';
import request from 'request-promise';
import TelegramBot from 'node-telegram-bot-api';
import cron from 'node-cron';

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
  nextEpisodeDate?: string;
}

const MediaSchema: Schema = new Schema({
  userId: { type: Number, required: true },
  title: { type: String, required: true },
  type: { type: String, enum: ['movie', 'tv'], required: true },
  tmdbId: { type: Number, required: true },
  nextEpisodeDate: { type: String, required: false },
});

const Media = mongoose.model<IMedia>('Media', MediaSchema);

// Модель для настроек уведомлений
interface INotificationSettings extends Document {
  userId: number;
  enabled: boolean;
}

const NotificationSettingsSchema: Schema = new Schema({
  userId: { type: Number, required: true, unique: true },
  enabled: { type: Boolean, default: true },
});

const NotificationSettings = mongoose.model<INotificationSettings>('NotificationSettings', NotificationSettingsSchema);

// Функция для отправки сообщений
async function sendMessage(chatId: number, text: string, replyMarkup: any = null): Promise<any> {
  try {
    const body: any = { chat_id: chatId, text, parse_mode: 'Markdown' };
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

// Функция получения трейлера
async function getTMDBTrailer(id: string, type: 'movie' | 'tv'): Promise<string | null> {
  try {
    const response = await request({
      method: 'GET',
      url: `https://api.themoviedb.org/3/${type}/${id}/videos`,
      qs: { api_key: TMDB_API_KEY, language: 'ru-RU' },
      json: true,
    });
    const trailer = response.results.find((video: any) => video.type === 'Trailer' && video.site === 'YouTube');
    return trailer ? `https://www.youtube.com/watch?v=${trailer.key}` : null;
  } catch (error: any) {
    console.error('TMDB trailer error:', error.message);
    return null;
  }
}

// Функция проверки новых серий
async function checkNewEpisodes(): Promise<void> {
  const today = new Date().toISOString().split('T')[0];
  const series: IMedia[] = await Media.find({ type: 'tv', nextEpisodeDate: today });

  for (const serie of series) {
    const settings = await NotificationSettings.findOne({ userId: serie.userId });
    if (settings && settings.enabled) {
      await sendMessage(serie.userId, `Новая серия для *${serie.title}* доступна сегодня!`);
    }
  }
}

// Планировщик для ежедневной проверки новых серий (в 8:00 утра)
cron.schedule('0 8 * * *', () => {
  console.log('Checking for new episodes...');
  checkNewEpisodes();
});

// Определение ReplyKeyboardMarkup
const replyKeyboard = {
  keyboard: [
    [{ text: 'Поиск' }, { text: 'Список фильмов' }],
    [{ text: 'Список сериалов' }, { text: 'Случайный' }],
    [{ text: 'Удалить' }, { text: 'Уведомления' }],
  ],
  resize_keyboard: true,
  persistent: true,
};

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
            { text: 'Уведомления', callback_data: 'notifications' },
          ],
        ],
        keyboard: replyKeyboard.keyboard,
        resize_keyboard: true,
        persistent: true,
      };
      await sendMessage(chatId, 'Добро пожаловать в Сериальщик! Выберите действие:', replyMarkup);
    } else if (text === '/notifications' || text === 'уведомления') {
      const settings = await NotificationSettings.findOne({ userId: chatId });
      const enabled = settings ? settings.enabled : true;
      const replyMarkup = {
        inline_keyboard: [
          [
            { text: enabled ? 'Отключить уведомления' : 'Включить уведомления', callback_data: `toggle_notifications_${enabled ? 'off' : 'on'}` },
          ],
        ],
        keyboard: replyKeyboard.keyboard,
        resize_keyboard: true,
        persistent: true,
      };
      await sendMessage(chatId, `Уведомления о новых сериях: *${enabled ? 'включены' : 'отключены'}*`, replyMarkup);
    } else if (text === 'поиск') {
      await sendMessage(chatId, 'Введите название фильма или сериала для поиска:', replyKeyboard);
    } else if (text === 'список фильмов') {
      const movies = await Media.find({ userId: chatId, type: 'movie' });
      const text = movies.length > 0 ? movies.map((m) => m.title).join('\n') : 'Список фильмов пуст';
      await sendMessage(chatId, `Ваши фильмы:\n*${text}*`, replyKeyboard);
    } else if (text === 'список сериалов') {
      const series = await Media.find({ userId: chatId, type: 'tv' });
      const text = series.length > 0 ? series.map((s) => s.title).join('\n') : 'Список сериалов пуст';
      await sendMessage(chatId, `Ваши сериалы:\n*${text}*`, replyKeyboard);
    } else if (text === 'случайный') {
      const media = await Media.find({ userId: chatId });
      if (media.length > 0) {
        const randomMedia = media[Math.floor(Math.random() * media.length)];
        await sendMessage(chatId, `Случайный: *${randomMedia.title}* (${randomMedia.type === 'movie' ? 'фильм' : 'сериал'})`, replyKeyboard);
      } else {
        await sendMessage(chatId, 'Ваш список пуст', replyKeyboard);
      }
    } else if (text === 'удалить') {
      const media = await Media.find({ userId: chatId });
      if (media.length === 0) {
        await sendMessage(chatId, 'Ваш список пуст', replyKeyboard);
      } else {
        const replyMarkup = {
          inline_keyboard: media.map((item) => [
            {
              text: `${item.title} (${item.type === 'movie' ? 'фильм' : 'сериал'})`,
              callback_data: `delete_${item._id}`,
            },
          ]),
          keyboard: replyKeyboard.keyboard,
          resize_keyboard: true,
          persistent: true,
        };
        await sendMessage(chatId, 'Выберите фильм/сериал для удаления:', replyMarkup);
      }
    } else {
      // Поиск фильма/сериала
      const movies = await searchTMDB(text, 'movie');
      const series = await searchTMDB(text, 'tv');
      const results = [...movies, ...series];

      if (results.length === 0) {
        await sendMessage(chatId, 'Ничего не найдено', replyKeyboard);
      } else {
        const replyMarkup = {
          inline_keyboard: results.slice(0, 5).map((item) => [
            {
              text: `Добавить: ${item.title || item.name}`,
              callback_data: `add_${item.media_type || (item.first_air_date ? 'tv' : 'movie')}_${item.id}`,
            },
            {
              text: 'Подробнее',
              callback_data: `info_${item.media_type || (item.first_air_date ? 'tv' : 'movie')}_${item.id}`,
            },
          ]),
          keyboard: replyKeyboard.keyboard,
          resize_keyboard: true,
          persistent: true,
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
      await sendMessage(chatId, 'Введите название фильма или сериала для поиска:', replyKeyboard);
    } else if (data === 'list_movies') {
      const movies = await Media.find({ userId: chatId, type: 'movie' });
      const text = movies.length > 0 ? movies.map((m) => m.title).join('\n') : 'Список фильмов пуст';
      await sendMessage(chatId, `Ваши фильмы:\n*${text}*`, replyKeyboard);
    } else if (data === 'list_series') {
      const series = await Media.find({ userId: chatId, type: 'tv' });
      const text = series.length > 0 ? series.map((s) => s.title).join('\n') : 'Список сериалов пуст';
      await sendMessage(chatId, `Ваши сериалы:\n*${text}*`, replyKeyboard);
    } else if (data === 'random') {
      const media = await Media.find({ userId: chatId });
      if (media.length > 0) {
        const randomMedia = media[Math.floor(Math.random() * media.length)];
        await sendMessage(chatId, `Случайный: *${randomMedia.title}* (${randomMedia.type === 'movie' ? 'фильм' : 'сериал'})`, replyKeyboard);
      } else {
        await sendMessage(chatId, 'Ваш список пуст', replyKeyboard);
      }
    } else if (data === 'delete') {
      const media = await Media.find({ userId: chatId });
      if (media.length === 0) {
        await sendMessage(chatId, 'Ваш список пуст', replyKeyboard);
      } else {
        const replyMarkup = {
          inline_keyboard: media.map((item) => [
            {
              text: `${item.title} (${item.type === 'movie' ? 'фильм' : 'сериал'})`,
              callback_data: `delete_${item._id}`,
            },
          ]),
          keyboard: replyKeyboard.keyboard,
          resize_keyboard: true,
          persistent: true,
        };
        await sendMessage(chatId, 'Выберите фильм/сериал для удаления:', replyMarkup);
      }
    } else if (data.startsWith('add_')) {
      const [, type, tmdbId] = data.split('_');
      const media = await getTMDBById(tmdbId, type as 'movie' | 'tv');
      if (media) {
        const title = media.title || media.name;
        const updateData: any = { userId: chatId, title, type, tmdbId: parseInt(tmdbId) };
        if (type === 'tv' && media.next_episode_to_air) {
          updateData.nextEpisodeDate = media.next_episode_to_air.air_date;
        }
        await Media.create(updateData);
        await sendMessage(chatId, `Добавлено: *${title}* (${type === 'movie' ? 'фильм' : 'сериал'})`, replyKeyboard);
      } else {
        await sendMessage(chatId, 'Не удалось добавить фильм/сериал. Попробуйте снова.', replyKeyboard);
      }
    } else if (data.startsWith('delete_')) {
      const [, id] = data.split('_');
      const media = await Media.findByIdAndDelete(id);
      if (media) {
        await sendMessage(chatId, `Удалено: *${media.title}* (${media.type === 'movie' ? 'фильм' : 'сериал'})`, replyKeyboard);
      }
    } else if (data.startsWith('toggle_notifications_')) {
      const [, state] = data.split('_');
      const enabled = state === 'on';
      await NotificationSettings.findOneAndUpdate(
        { userId: chatId },
        { userId: chatId, enabled },
        { upsert: true }
      );
      await sendMessage(chatId, `Уведомления о новых сериях: *${enabled ? 'включены' : 'отключены'}*`, replyKeyboard);
    } else if (data.startsWith('info_')) {
      const [, type, tmdbId] = data.split('_');
      const media = await getTMDBById(tmdbId, type as 'movie' | 'tv');
      if (media) {
        const title = media.title || media.name;
        const overview = media.overview || 'Описание отсутствует';
        const rating = media.vote_average ? `${media.vote_average}/10` : 'Нет рейтинга';
        const year = (media.release_date || media.first_air_date || '').split('-')[0] || 'Неизвестно';
        const trailer = await getTMDBTrailer(tmdbId, type as 'movie' | 'tv');
        let text = `*${title}* (${type === 'movie' ? 'фильм' : 'сериал'})\n` +
                  `*Год*: ${year}\n` +
                  `*Рейтинг*: ${rating}\n` +
                  `*Описание*: ${overview}`;
        if (trailer) {
          text += `\n*Трейлер*: [Смотреть](${trailer})`;
        }
        await sendMessage(chatId, text, replyKeyboard);
      } else {
        await sendMessage(chatId, 'Не удалось получить информацию. Попробуйте снова.', replyKeyboard);
      }
    }
  }

  res.status(200).send('OK');
});

// Настройка polling (включите, если вебхук не работает)
const USE_POLLING: boolean = false;
if (USE_POLLING) {
  const bot = new TelegramBot(TOKEN, { polling: true });

  bot.on('message', async (msg: TelegramBot.Message) => {
    console.log('Received message:', msg);
    const chatId: number = msg.chat.id;
    await bot.sendMessage(chatId, 'Бот работает!', { reply_markup: replyKeyboard });
  });

  request({
    method: 'POST',
    url: `https://api.telegram.org/bot${TOKEN}/deleteWebhook`,
  }).then(() => console.log('Webhook disabled for polling'));
} else {
  request({
    method: 'POST',
    url: `https://api.telegram.org/bot${TOKEN}/setWebhook?url=${WEBHOOK_URL}`,
  }).then(() => console.log(`Webhook set to: ${WEBHOOK_URL}`));
}

// Запуск сервера
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});