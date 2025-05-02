import express from 'express';
import TelegramBot from 'node-telegram-bot-api';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { FilmService } from './film.service';

dotenv.config();

const app = express();
app.use(express.json());

const token = process.env.TELEGRAM_BOT_TOKEN!;
const bot = new TelegramBot(token, { polling: false });
const filmService = new FilmService();
const tmdbApiKey = process.env.TMDB_API_KEY!;

// Подключение к MongoDB
mongoose.connect(process.env.MONGO_URI!).then(() => {
  console.log('Connected to MongoDB');
}).catch(err => {
  console.error('MongoDB connection error:', err);
});

// Webhook
app.post(`/bot${token}`, async (req, res) => {
  const update = req.body;
  if (update.message?.text) {
    const chatId = update.message.chat.id;
    const text = update.message.text;

    if (text === '/help') {
      await bot.sendMessage(chatId, 'Commands: /help, /listfilms, /addfilm <title>, /search <query>');
    } else if (text === '/listfilms') {
      const films = await filmService.findAll();
      const filmList = films.length ? films.map(f => f.title).join(', ') : 'No films found';
      await bot.sendMessage(chatId, `Films: ${filmList}`);
    } else if (text.startsWith('/addfilm ')) {
      const title = text.replace('/addfilm ', '').trim();
      if (title) {
        const film = await filmService.addFilm(title);
        await bot.sendMessage(chatId, `Added film: ${film.title}`);
      } else {
        await bot.sendMessage(chatId, 'Please provide a film title');
      }
    } else if (text.startsWith('/search ')) {
      const query = text.replace('/search ', '').trim();
      if (query) {
        const results = await filmService.searchTmdb(query, tmdbApiKey);
        const resultText = results.length
          ? results.slice(0, 3).map((r: any) => `${r.title} (${r.release_date})`).join('\n')
          : 'No results found';
        await bot.sendMessage(chatId, `Search results:\n${resultText}`);
      } else {
        await bot.sendMessage(chatId, 'Please provide a search query');
      }
    }
  }
  res.send({ ok: true });
});

// Старт сервера и установка Webhook
const port = process.env.PORT || 10000;
app.listen(port, async () => {
  const webhookUrl = `${process.env.RENDER_EXTERNAL_HOSTNAME}/bot${token}`;
  try {
    await bot.setWebHook(webhookUrl);
    console.log(`Server running on port ${port}, Webhook set to: ${webhookUrl}`);
    filmService.startReleaseCheck(bot, tmdbApiKey);
  } catch (error) {
    console.error('Failed to set webhook:', error);
  }
});