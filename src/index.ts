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
  process.exit(1); // Завершаем процесс при ошибке MongoDB
});

// Проверка работоспособности сервера
app.get('/health', (req, res) => {
  res.status(200).send('Server is running');
});

app.post(`/bot${token}`, async (req, res) => {
  console.log('Received update:', JSON.stringify(req.body, null, 2));
  try {
    const update = req.body;

    if (update.message?.text) {
      const chatId = update.message.chat.id;
      const text = update.message.text;

      const user = await userService.findOrCreate(chatId);
      if (user.state === 'search_pending') {
        const query = text.trim();
        if (query) {
          const results = await mediaService.searchTmdb(query, tmdbApiKey);
          const buttons = await Promise.all(
            results.slice(0, 3).map(async (r: any) => {
              const mediaType = await mediaService.determineMediaType(r.id, r.media_type, tmdbApiKey);
              return [{ text: `Добавить: ${r.title}`, callback_data: `add_${mediaType}_${r.id}_${r.title}` }];
            })
          );
          const resultText = results.length
            ? results.slice(0, 3).map((r: any) => `${r.title} (${r.release_date || r.first_air_date || 'N/A'})`).join('\n')
            : 'Ничего не найдено';
          await bot.sendMessage(chatId, `Результаты поиска:\n${resultText}`, {
            reply_markup: { inline_keyboard: buttons },
          });
          await userService.setState(chatId, null);
        } else {
          await bot.sendMessage(chatId, 'Пожалуйста, укажите запрос для поиска');
        }
      } else if (text === '/help') {
        await bot.sendMessage(chatId, 'Добро пожаловать в Сериальщик! Выберите действие:', {
          reply_markup: {
            inline_keyboard: [
              [{ text: 'Поиск медиа', callback_data: 'search' }],
              [{ text: 'Мои фильмы', callback_data: 'list_movies' }, { text: 'Мои сериалы', callback_data: 'list_series' }],
              [{ text: 'Мои шоу', callback_data: 'list_shows' }, { text: 'Рекомендации', callback_data: 'recommend' }],
            ],
          },
        });
      } else if (text === '/listmovies') {
        const movies = await UserModel.findOne({ chatId }).populate('movies').exec();
        const movieList = movies?.movies.length ? movies.movies.map((m: any) => `${m.title} (ID: ${m._id})`).join('\n') : 'Фильмы не найдены';
        const buttons = movies?.movies.length
          ? movies.movies.map((m: any) => [
              { text: `Отметить просмотренным: ${m.title}`, callback_data: `mark_watched_${m._id}` },
              { text: `Смотрю сейчас: ${m.title}`, callback_data: `watching_now_${m._id}` },
              { text: `Удалить: ${m.title}`, callback_data: `remove_movie_${m._id}` },
            ])
          : [];
        await bot.sendMessage(chatId, `Фильмы:\n${movieList}`, {
          reply_markup: { inline_keyboard: buttons },
        });
      } else if (text === '/listseries') {
        const series = await UserModel.findOne({ chatId }).populate('series').exec();
        const seriesList = series?.series.length ? series.series.map((s: any) => `${s.title} (ID: ${s._id})`).join('\n') : 'Сериалы не найдены';
        const buttons = series?.series.length
          ? series.series.map((s: any) => [
              { text: `Отметить просмотренным: ${s.title}`, callback_data: `mark_watched_${s._id}` },
              { text: `Отметить эпизод: ${s.title}`, callback_data: `mark_episode_${s._id}_1_1` },
              { text: `Смотрю сейчас: ${s.title}`, callback_data: `watching_now_${s._id}` },
              { text: `Удалить: ${s.title}`, callback_data: `remove_series_${s._id}` },
            ])
          : [];
        await bot.sendMessage(chatId, `Сериалы:\n${seriesList}`, {
          reply_markup: { inline_keyboard: buttons },
        });
      } else if (text === '/listshows') {
        const shows = await UserModel.findOne({ chatId }).populate('shows').exec();
        const showList = shows?.shows.length ? shows.shows.map((s: any) => `${s.title} (ID: ${s._id})`).join('\n') : 'Шоу не найдены';
        const buttons = shows?.shows.length
          ? shows.shows.map((s: any) => [
              { text: `Отметить просмотренным: ${s.title}`, callback_data: `mark_watched_${s._id}` },
              { text: `Отметить эпизод: ${s.title}`, callback_data: `mark_episode_${s._id}_1_1` },
              { text: `Смотрю сейчас: ${s.title}`, callback_data: `watching_now_${s._id}` },
              { text: `Удалить: ${s.title}`, callback_data: `remove_show_${s._id}` },
            ])
          : [];
        await bot.sendMessage(chatId, `Шоу:\n${showList}`, {
          reply_markup: { inline_keyboard: buttons },
        });
      } else if (text === '/recommend') {
        const user = await userService.findOrCreate(chatId);
        const recommendations = await mediaService.recommend(chatId, tmdbApiKey, user);
        const buttons = await Promise.all(
          recommendations.slice(0, 3).map(async (r: any) => {
            const mediaType = await mediaService.determineMediaType(r.id, r.media_type || 'movie', tmdbApiKey);
            return [{ text: `Добавить: ${r.title}`, callback_data: `add_${mediaType}_${r.id}_${r.title}` }];
          })
        );
        const resultText = recommendations.length
          ? recommendations.map((r: any) => `${r.title} (${r.release_date || r.first_air_date || 'N/A'})`).join('\n')
          : 'Рекомендации недоступны. Добавьте медиа!';
        await bot.sendMessage(chatId, `Рекомендации:\n${resultText}`, {
          reply_markup: { inline_keyboard: buttons },
        });
      } else if (text.startsWith('/remind ')) {
        const parts = text.replace('/remind ', '').split(' ');
        if (parts.length === 2) {
          const mediaId = parts[0];
          const days = parseInt(parts[1]);
          const media = await mediaService.findById(mediaId);
          if (media) {
            setTimeout(async () => {
              await bot.sendMessage(chatId, `Напоминание: Продолжайте смотреть ${media.title}!`);
            }, days * 24 * 60 * 60 * 1000);
            await bot.sendMessage(chatId, `Напоминание установлено для ${media.title} через ${days} дней`, {
              reply_markup: {
                inline_keyboard: [
                  [{ text: `Отметить просмотренным: ${media.title}`, callback_data: `mark_watched_${media._id}` }],
                  [{ text: media.type !== 'movie' ? `Отметить эпизод: ${media.title}` : 'Н/Д', callback_data: `mark_episode_${media._id}_1_1` }],
                  [{ text: `Смотрю сейчас: ${media.title}`, callback_data: `watching_now_${media._id}` }],
                ],
              },
            });
          } else {
            await bot.sendMessage(chatId, 'Медиа не найдено');
          }
        } else {
          await bot.sendMessage(chatId, 'Использование: /remind <id> <дни>');
        }
      } else if (text.startsWith('/markwatched ')) {
        const mediaId = text.replace('/markwatched ', '').trim();
        const media = await userService.markWatched(chatId, mediaId);
        if (media) {
          await bot.sendMessage(chatId, `Отмечено просмотренным: ${media.title}`, {
            reply_markup: {
              inline_keyboard: [
                [{ text: `Смотрю сейчас: ${media.title}`, callback_data: `watching_now_${media._id}` }],
                [{ text: `Удалить: ${media.title}`, callback_data: `remove_${media.type}_${media._id}` }],
              ],
            },
          });
        } else {
          await bot.sendMessage(chatId, 'Медиа не найдено');
        }
      } else if (text.startsWith('/markepisode ')) {
        const parts = text.replace('/markepisode ', '').split(' ');
        if (parts.length === 3) {
          const mediaId = parts[0];
          const season = parseInt(parts[1]);
          const episode = parseInt(parts[2]);
          try {
            const media = await userService.markEpisode(chatId, mediaId, season, episode);
            if (media) {
              await bot.sendMessage(chatId, `Отмечен эпизод: ${media.title} S${season}E${episode}`, {
                reply_markup: {
                  inline_keyboard: [
                    [{ text: `Отметить просмотренным: ${media.title}`, callback_data: `mark_watched_${media._id}` }],
                    [{ text: `Смотрю сейчас: ${media.title}`, callback_data: `watching_now_${media._id}` }],
                    [{ text: `Удалить: ${media.title}`, callback_data: `remove_${media.type}_${media._id}` }],
                  ],
                },
              });
            } else {
              await bot.sendMessage(chatId, 'Медиа не найдено');
            }
          } catch (error: any) {
            await bot.sendMessage(chatId, error.message || 'Ошибка при отметке эпизода');
          }
        } else {
          await bot.sendMessage(chatId, 'Использование: /markepisode <id> <сезон> <эпизод>');
        }
      } else if (text.startsWith('/watchingnow ')) {
        const mediaId = text.replace('/watchingnow ', '').trim();
        if (mediaId) {
          const media = await userService.markWatchingNow(chatId, mediaId);
          if (media) {
            await bot.sendMessage(chatId, `Смотрю сейчас: ${media.title}`, {
              reply_markup: {
                inline_keyboard: [
                  [{ text: `Отметить просмотренным: ${media.title}`, callback_data: `mark_watched_${media._id}` }],
                  [{ text: media.type !== 'movie' ? `Отметить эпизод: ${media.title}` : 'Н/Д', callback_data: `mark_episode_${media._id}_1_1` }],
                  [{ text: `Удалить: ${media.title}`, callback_data: `remove_${media.type}_${media._id}` }],
                ],
              },
            });
          } else {
            await bot.sendMessage(chatId, 'Медиа не найдено');
          }
        } else {
          await bot.sendMessage(chatId, 'Использование: /watchingnow <id>');
        }
      } else if (text === '/watchingnow') {
        await bot.sendMessage(chatId, 'Укажите ID медиа (например, /watchingnow <id>)');
      }
    } else if (update.callback_query) {
      const chatId = update.callback_query.message.chat.id;
      const data = update.callback_query.data;
      const parts = data.split('_');
      const action = parts[0];
      const type = parts[1];

      if (action === 'search') {
        await userService.setState(chatId, 'search_pending');
        await bot.sendMessage(chatId, 'Введите название фильма, сериала или шоу:');
      } else if (action === 'list' && type === 'movies') {
        const movies = await UserModel.findOne({ chatId }).populate('movies').exec();
        const movieList = movies?.movies.length ? movies.movies.map((m: any) => `${m.title} (ID: ${m._id})`).join('\n') : 'Фильмы не найдены';
        const buttons = movies?.movies.length
          ? movies.movies.map((m: any) => [
              { text: `Отметить просмотренным: ${m.title}`, callback_data: `mark_watched_${m._id}` },
              { text: `Смотрю сейчас: ${m.title}`, callback_data: `watching_now_${m._id}` },
              { text: `Удалить: ${m.title}`, callback_data: `remove_movie_${m._id}` },
            ])
          : [];
        await bot.sendMessage(chatId, `Фильмы:\n${movieList}`, {
          reply_markup: { inline_keyboard: buttons },
        });
      } else if (action === 'list' && type === 'series') {
        const series = await UserModel.findOne({ chatId }).populate('series').exec();
        const seriesList = series?.series.length ? series.series.map((s: any) => `${s.title} (ID: ${s._id})`).join('\n') : 'Сериалы не найдены';
        const buttons = series?.series.length
          ? series.series.map((s: any) => [
              { text: `Отметить просмотренным: ${s.title}`, callback_data: `mark_watched_${s._id}` },
              { text: `Отметить эпизод: ${s.title}`, callback_data: `mark_episode_${s._id}_1_1` },
              { text: `Смотрю сейчас: ${s.title}`, callback_data: `watching_now_${s._id}` },
              { text: `Удалить: ${s.title}`, callback_data: `remove_series_${s._id}` },
            ])
          : [];
        await bot.sendMessage(chatId, `Сериалы:\n${seriesList}`, {
          reply_markup: { inline_keyboard: buttons },
        });
      } else if (action === 'list' && type === 'shows') {
        const shows = await UserModel.findOne({ chatId }).populate('shows').exec();
        const showList = shows?.shows.length ? shows.shows.map((s: any) => `${s.title} (ID: ${s._id})`).join('\n') : 'Шоу не найдены';
        const buttons = shows?.shows.length
          ? shows.shows.map((s: any) => [
              { text: `Отметить просмотренным: ${s.title}`, callback_data: `mark_watched_${s._id}` },
              { text: `Отметить эпизод: ${s.title}`, callback_data: `mark_episode_${s._id}_1_1` },
              { text: `Смотрю сейчас: ${s.title}`, callback_data: `watching_now_${s._id}` },
              { text: `Удалить: ${s.title}`, callback_data: `remove_show_${s._id}` },
            ])
          : [];
        await bot.sendMessage(chatId, `Шоу:\n${showList}`, {
          reply_markup: { inline_keyboard: buttons },
        });
      } else if (action === 'recommend') {
        const user = await userService.findOrCreate(chatId);
        const recommendations = await mediaService.recommend(chatId, tmdbApiKey, user);
        const buttons = await Promise.all(
          recommendations.slice(0, 3).map(async (r: any) => {
            const mediaType = await mediaService.determineMediaType(r.id, r.media_type || 'movie', tmdbApiKey);
            return [{ text: `Добавить: ${r.title}`, callback_data: `add_${mediaType}_${r.id}_${r.title}` }];
          })
        );
        const resultText = recommendations.length
          ? recommendations.map((r: any) => `${r.title} (${r.release_date || r.first_air_date || 'N/A'})`).join('\n')
          : 'Рекомендации недоступны. Добавьте медиа!';
        await bot.sendMessage(chatId, `Рекомендации:\n${resultText}`, {
          reply_markup: { inline_keyboard: buttons },
        });
      } else if (action === 'add') {
        const tmdbId = parts[2];
        const title = parts.slice(3).join('_');
        const media = await mediaService.addMedia(parseInt(tmdbId), type as 'movie' | 'series' | 'show', title);
        await userService.addToList(chatId, media);
        await bot.sendMessage(chatId, `Добавлено ${type === 'movie' ? 'фильм' : type === 'series' ? 'сериал' : 'шоу'}: ${title} (ID: ${media._id})`, {
          reply_markup: {
            inline_keyboard: [
              [{ text: `Отметить просмотренным: ${title}`, callback_data: `mark_watched_${media._id}` }],
              [{ text: type !== 'movie' ? `Отметить эпизод: ${title}` : 'Н/Д', callback_data: `mark_episode_${media._id}_1_1` }],
              [{ text: `Смотрю сейчас: ${title}`, callback_data: `watching_now_${media._id}` }],
              [{ text: `Удалить: ${title}`, callback_data: `remove_${type}_${media._id}` }],
            ],
          },
        });
      } else if (action === 'mark' && type === 'watched') {
        const media = await userService.markWatched(chatId, parts[2]);
        if (media) {
          await bot.sendMessage(chatId, `Отмечено просмотренным: ${media.title}`, {
            reply_markup: {
              inline_keyboard: [
                [{ text: `Смотрю сейчас: ${media.title}`, callback_data: `watching_now_${media._id}` }],
                [{ text: `Удалить: ${media.title}`, callback_data: `remove_${media.type}_${media._id}` }],
              ],
            },
          });
        } else {
          await bot.sendMessage(chatId, 'Медиа не найдено');
        }
      } else if (action === 'mark' && type === 'episode') {
        const mediaId = parts[2];
        const season = parseInt(parts[3]);
        const episode = parseInt(parts[4]);
        try {
          const media = await userService.markEpisode(chatId, mediaId, season, episode);
          if (media) {
            await bot.sendMessage(chatId, `Отмечен эпизод: ${media.title} S${season}E${episode}`, {
              reply_markup: {
                inline_keyboard: [
                  [{ text: `Отметить просмотренным: ${media.title}`, callback_data: `mark_watched_${media._id}` }],
                  [{ text: `Смотрю сейчас: ${media.title}`, callback_data: `watching_now_${media._id}` }],
                  [{ text: `Удалить: ${media.title}`, callback_data: `remove_${media.type}_${media._id}` }],
                ],
              },
            });
          } else {
            await bot.sendMessage(chatId, 'Медиа не найдено');
          }
        } catch (error: any) {
          await bot.sendMessage(chatId, error.message || 'Ошибка при отметке эпизода');
        }
      } else if (action === 'watching' && type === 'now') {
        const media = await userService.markWatchingNow(chatId, parts[2]);
        if (media) {
          await bot.sendMessage(chatId, `Смотрю сейчас: ${media.title}`, {
            reply_markup: {
              inline_keyboard: [
                [{ text: `Отметить просмотренным: ${media.title}`, callback_data: `mark_watched_${media._id}` }],
                [{ text: media.type !== 'movie' ? `Отметить эпизод: ${media.title}` : 'Н/Д', callback_data: `mark_episode_${media._id}_1_1` }],
                [{ text: `Удалить: ${media.title}`, callback_data: `remove_${media.type}_${media._id}` }],
              ],
            },
          });
        } else {
          await bot.sendMessage(chatId, 'Медиа не найдено');
        }
      } else if (action === 'remove') {
        const mediaId = parts[2];
        const media = await mediaService.findById(mediaId);
        if (media) {
          await userService.removeFromList(chatId, mediaId, type as 'movie' | 'series' | 'show');
          await bot.sendMessage(chatId, `Удалено: ${media.title}`);
        } else {
          await bot.sendMessage(chatId, 'Медиа не найдено');
        }
      }
    }
    res.send({ ok: true });
  } catch (error) {
    console.error('Error processing update:', error);
    res.status(500).send({ ok: false, error: 'Internal server error' });
  }
});

const port = process.env.PORT || 10000;
app.listen(port, async () => {
  console.log(`Server starting on port ${port}`);
  const webhookUrl = `${process.env.RENDER_EXTERNAL_HOSTNAME}/bot${token}`;
  try {
    const webhookResponse = await bot.setWebHook(webhookUrl);
    console.log(`Webhook set to: ${webhookUrl}`);
    console.log('Webhook response:', webhookResponse);
  } catch (error) {
    console.error('Failed to set webhook:', error);
    if (error instanceof Error) {
      console.error('Error details:', error.message, error.stack);
    }
  }
  cron.schedule('0 0 * * *', async () => {
    try {
      const users = await UserModel.find().exec();
      await mediaService.checkReleases(bot, tmdbApiKey, users);
    } catch (error) {
      console.error('Error in cron job:', error);
    }
  });
});