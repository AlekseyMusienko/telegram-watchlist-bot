import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FilmsService } from '../films/films.service';
import axios from 'axios';
import * as TelegramBot from 'node-telegram-bot-api';
import { CreateFilmDto } from '../films/dto/create-film.dto';

@Injectable()
export class TelegramService implements OnModuleInit {
  private bot: TelegramBot;

  constructor(
    private configService: ConfigService,
    private filmsService: FilmsService,
  ) {
    this.bot = new TelegramBot(this.configService.get('TELEGRAM_BOT_TOKEN')!, {});
  }

  async onModuleInit() {
    const token = this.configService.get('TELEGRAM_BOT_TOKEN');
    const webhookUrl = `${process.env.VERCEL_URL}/bot${token}`;
    await this.bot.setWebHook(webhookUrl);
    console.log(`Webhook установлен: ${webhookUrl}`);
    this.filmsService.startReleaseCheck(this.bot);
  }

  // Изменяем тип update на any и обращаемся к update.message
  async handleUpdate(update: any) {
    console.log('Handling update:', JSON.stringify(update, null, 2));
    const message = update.message;
    if (!message) {
      console.log('No message in update');
      return;
    }

    const chatId = message.chat.id;
    const userId = message.from?.id.toString();
    if (!userId) {
      this.bot.sendMessage(chatId, 'Не удалось определить ваш ID');
      return;
    }

    const text = message.text || '';
    if (!text) {
      this.bot.sendMessage(chatId, 'Отправьте команду, например, /help');
      return;
    }

    try {
      switch (text.toLowerCase()) {
        case '/start':
        case '/help':
          this.bot.sendMessage(chatId, 'Команды:\n/addfilm <название> — добавить фильм\n/listfilms — список фильмов\n/randomfilm — случайный фильм\n/deletefilm <id> — удалить фильм\n/exportfilms — экспорт списка');
          break;

        case text.match(/^\/addfilm (.+)/)?.input:
          const title = text.split(' ')[1];
          await this.addFilm(chatId, userId, title);
          break;

        case '/listfilms':
          const films = await this.filmsService.findAll(userId);
          const filmList = films.map(f => `${f.title} (ID: ${f._id})`).join('\n');
          this.bot.sendMessage(chatId, filmList || 'Ваш список пуст');
          break;

        case '/randomfilm':
          const film = await this.filmsService.getRandomFilm(userId);
          this.bot.sendMessage(chatId, `Случайный фильм: ${film.title}`);
          break;

        case text.match(/^\/deletefilm (.+)/)?.input:
          const filmId = text.split(' ')[1];
          await this.filmsService.remove(filmId, userId);
          this.bot.sendMessage(chatId, `Фильм с ID ${filmId} удалён`);
          break;

        case '/exportfilms':
          const exportText = await this.filmsService.exportToText(userId);
          this.bot.sendMessage(chatId, exportText);
          break;

        default:
          this.bot.sendMessage(chatId, 'Неизвестная команда. Используйте /help');
      }
    } catch (error) {
      console.error('Error in handleUpdate:', error);
      this.bot.sendMessage(chatId, 'Произошла ошибка. Попробуйте позже.');
    }
  }

  async addFilm(chatId: number, userId: string, title: string) {
    const tmdbKey = this.configService.get('TMDB_API_KEY');
    try {
      const response = await axios.get(`https://api.themoviedb.org/3/search/multi?api_key=${tmdbKey}&query=${encodeURIComponent(title)}&language=ru`);
      const result = response.data.results[0];
      if (!result) {
        this.bot.sendMessage(chatId, `Фильм/сериал "${title}" не найден`);
        return;
      }

      const type = result.media_type === 'movie' ? 'movie' : 'series';
      const details = await axios.get(`https://api.themoviedb.org/3/${type === 'movie' ? 'movie' : 'tv'}/${result.id}?api_key=${tmdbKey}&language=ru&append_to_response=credits`);

      const filmDto: CreateFilmDto = {
        title: result.title || result.name,
        releaseYear: new Date(result.release_date || result.first_air_date).getFullYear(),
        durationOrEpisodes: type === 'movie' ? details.data.runtime || 0 : details.data.number_of_episodes || 0,
        genres: details.data.genres.map((g: { name: string }) => g.name),
        directors: type === 'movie' ? (details.data.credits?.crew || []).filter((c: { job: string }) => c.job === 'Director').map((c: { name: string }) => c.name) : [],
        type,
        userId,
        tmdbId: result.id,
      };

      const film = await this.filmsService.create(filmDto);
      this.bot.sendMessage(chatId, `Добавлен: ${film.title} (ID: ${film._id})`);
    } catch (e) {
      console.error('Error in addFilm:', e);
      this.bot.sendMessage(chatId, 'Ошибка при добавлении фильма');
    }
  }
}