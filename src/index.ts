import express from 'express';
import TelegramBot from 'node-telegram-bot-api';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import cron from 'node-cron';
import { MediaService } from './media.service';
import { UserService } from './user.service';
import { UserModel } from './user.model';

dotenv.config();

const app = express();
app.use(express.json());

const token = process.env.TELEGRAM_BOT_TOKEN!;
const bot = new TelegramBot(token, { polling: false });
const mediaService = new MediaService();
const userService = new UserService();
const tmdbApiKey = process.env.TMDB_API_KEY!;

mongoose.connect(process.env.MONGO_URI!).then(() => {
  console.log('Connected to MongoDB');
}).catch(err => {
  console.error('MongoDB connection error:', err);
});

app.post(`/bot${token}`, async (req, res) => {
  console.log('Received update:', JSON.stringify(req.body, null, 2));
  const update = req.body;

  if (update.message?.text) {
    const chatId = update.message.chat.id;
    const text = update.message.text;

    if (text === '/help') {
      await bot.sendMessage(chatId, 'Commands: /help, /listmovies, /listseries, /listshows, /search <query>, /recommend, /remind <id> <days>, /markwatched <id>, /markepisode <id> <season> <episode>, /watchingnow <id>');
    } else if (text === '/listmovies') {
      const user = await userService.findOrCreate(chatId);
      const movies = await UserModel.findOne({ chatId }).populate('movies').exec();
      const movieList = movies?.movies.length ? movies.movies.map((m: any) => m.title).join(', ') : 'No movies found';
      await bot.sendMessage(chatId, `Movies: ${movieList}`);
    } else if (text === '/listseries') {
      const user = await userService.findOrCreate(chatId);
      const series = await UserModel.findOne({ chatId }).populate('series').exec();
      const seriesList = series?.series.length ? series.series.map((s: any) => s.title).join(', ') : 'No series found';
      await bot.sendMessage(chatId, `Series: ${seriesList}`);
    } else if (text === '/listshows') {
      const user = await userService.findOrCreate(chatId);
      const shows = await UserModel.findOne({ chatId }).populate('shows').exec();
      const showList = shows?.shows.length ? shows.shows.map((s: any) => s.title).join(', ') : 'No shows found';
      await bot.sendMessage(chatId, `Shows: ${showList}`);
    } else if (text.startsWith('/search ')) {
      const query = text.replace('/search ', '').trim();
      if (query) {
        const results = await mediaService.searchTmdb(query, tmdbApiKey);
        const buttons = results.slice(0, 3).map((r: any) => [
          { text: `🎬 ${r.title} (Movie)`, callback_data: `add_movie_${r.id}_${r.title}` },
          { text: `📺 ${r.title} (Series)`, callback_data: `add_series_${r.id}_${r.title}` },
          { text: `🎥 ${r.title} (Show)`, callback_data: `add_show_${r.id}_${r.title}` },
        ]);
        const resultText = results.length
          ? results.slice(0, 3).map((r: any) => `${r.title} (${r.release_date || r.first_air_date})`).join('\n')
          : 'No results found';
        await bot.sendMessage(chatId, `Search results:\n${resultText}`, {
          reply_markup: { inline_keyboard: buttons },
        });
      } else {
        await bot.sendMessage(chatId, 'Please provide a search query');
      }
    } else if (text === '/recommend') {
      const user = await userService.findOrCreate(chatId);
      const recommendations = await mediaService.recommend(chatId, tmdbApiKey, user);
      const resultText = recommendations.length
        ? recommendations.map((r: any) => `${r.title} (${r.release_date || r.first_air_date})`).join('\n')
        : 'No recommendations available';
      await bot.sendMessage(chatId, `Recommendations:\n${resultText}`);
    } else if (text.startsWith('/remind ')) {
      const parts = text.replace('/remind ', '').split(' ');
      if (parts.length === 2) {
        const mediaId = parts[0];
        const days = parseInt(parts[1]);
        const media = await mediaService.findById(mediaId);
        if (media) {
          setTimeout(async () => {
            await bot.sendMessage(chatId, `Reminder: Continue watching ${media.title}!`);
          }, days * 24 * 60 * 60 * 1000);
          await bot.sendMessage(chatId, `Reminder set for ${media.title} in ${days} days`);
        } else {
          await bot.sendMessage(chatId, 'Media not found');
        }
      } else {
        await bot.sendMessage(chatId, 'Usage: /remind <id> <days>');
      }
    } else if (text.startsWith('/markwatched ')) {
      const mediaId = text.replace('/markwatched ', '').trim();
      const media = await userService.markWatched(chatId, mediaId);
      await bot.sendMessage(chatId, media ? `Marked as watched: ${media.title}` : 'Media not found');
    } else if (text.startsWith('/markepisode ')) {
      const parts = text.replace('/markepisode ', '').split(' ');
      if (parts.length === 3) {
        const mediaId = parts[0];
        const season = parseInt(parts[1]);
        const episode = parseInt(parts[2]);
        const media = await userService.markEpisode(chatId, mediaId, season, episode);
        await bot.sendMessage(chatId, media ? `Marked episode: ${media.title} S${season}E${episode}` : 'Media not found');
      } else {
        await bot.sendMessage(chatId, 'Usage: /markepisode <id> <season> <episode>');
      }
    } else if (text.startsWith('/watchingnow ')) {
      const mediaId = text.replace('/watchingnow ', '').trim();
      const media = await userService.markWatchingNow(chatId, mediaId);
      await bot.sendMessage(chatId, media ? `Now watching: ${media.title}` : 'Media not found');
    }
  } else if (update.callback_query) {
    const chatId = update.callback_query.message.chat.id;
    const data = update.callback_query.data;
    const [action, type, tmdbId, ...titleParts] = data.split('_');
    const title = titleParts.join('_');
    if (action === 'add') {
      const media = await mediaService.addMedia(parseInt(tmdbId), type as 'movie' | 'series' | 'show', title);
      await userService.addToList(chatId, media);
      await bot.sendMessage(chatId, `Added ${type}: ${title}`, {
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Mark as watched', callback_data: `mark_watched_${media._id}` }],
            [{ text: type !== 'movie' ? 'Mark episode' : 'N/A', callback_data: `mark_episode_${media._id}_1_1` }],
            [{ text: 'Watching now', callback_data: `watching_now_${media._id}` }],
          ],
        },
      });
    } else if (action === 'mark' && type === 'watched') {
      const media = await userService.markWatched(chatId, data.split('_')[2]);
      await bot.sendMessage(chatId, media ? `Marked as watched: ${media.title}` : 'Media not found');
    } else if (action === 'mark' && type === 'episode') {
      const [_, __, mediaId, season, episode] = data.split('_');
      const media = await userService.markEpisode(chatId, mediaId, parseInt(season), parseInt(episode));
      await bot.sendMessage(chatId, media ? `Marked episode: ${media.title} S${season}E${episode}` : 'Media not found');
    } else if (action === 'watching' && type === 'now') {
      const media = await userService.markWatchingNow(chatId, data.split('_')[2]);
      await bot.sendMessage(chatId, media ? `Now watching: ${media.title}` : 'Media not found');
    }
  }
  res.send({ ok: true });
});

const port = process.env.PORT || 10000;
app.listen(port, async () => {
  const webhookUrl = `${process.env.RENDER_EXTERNAL_HOSTNAME}/bot${token}`;
  try {
    await bot.setWebHook(webhookUrl);
    console.log(`Server running on port ${port}, Webhook set to: ${webhookUrl}`);
    cron.schedule('0 0 * * *', async () => {
      const users = await UserModel.find().exec();
      await mediaService.checkReleases(bot, tmdbApiKey, users);
    });
  } catch (error) {
    console.error('Failed to set webhook:', error);
  }
});