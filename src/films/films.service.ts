import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Film, FilmDocument } from './films.schema';
import { CreateFilmDto } from './dto/create-film.dto';
import axios from 'axios';
import * as TelegramBot from 'node-telegram-bot-api';

@Injectable()
export class FilmsService {
  constructor(@InjectModel(Film.name) private filmModel: Model<FilmDocument>) {}

  async create(createFilmDto: CreateFilmDto): Promise<Film> {
    const createdFilm = new this.filmModel(createFilmDto);
    return createdFilm.save();
  }

  async findAll(userId: string): Promise<Film[]> {
    return this.filmModel.find({ userId }).exec();
  }

  async findOne(id: string, userId: string): Promise<Film> {
    const film = await this.filmModel.findOne({ _id: id, userId }).exec();
    if (!film) {
      throw new NotFoundException(`Film with ID ${id} not found for user ${userId}`);
    }
    return film;
  }

  async remove(id: string, userId: string): Promise<void> {
    const result = await this.filmModel.findOneAndDelete({ _id: id, userId }).exec();
    if (!result) {
      throw new NotFoundException(`Film with ID ${id} not found for user ${userId}`);
    }
  }

  async getRandomFilm(userId: string): Promise<Film> {
    const films = await this.findAll(userId);
    if (films.length === 0) {
      throw new NotFoundException('No films found for this user');
    }
    const randomIndex = Math.floor(Math.random() * films.length);
    return films[randomIndex];
  }

  async exportToText(userId: string): Promise<string> {
    const films = await this.findAll(userId);
    if (!films.length) {
      return 'No films or series found in your list.';
    }
    const formattedFilms = films.map(film => {
      return [
        `Title: ${film.title}`,
        `Release Year: ${film.releaseYear}`,
        `${film.type === 'movie' ? 'Duration' : 'Episodes'}: ${film.durationOrEpisodes}`,
        `Genres: ${film.genres.join(', ')}`,
        `Directors: ${film.directors.join(', ')}`,
        `Type: ${film.type}`,
      ].join('\n');
    });
    return formattedFilms.join('\n\n');
  }

  async startReleaseCheck(bot: TelegramBot) {
    setInterval(async () => {
      const films = await this.filmModel.find({ tmdbId: { $exists: true } }).exec();
      const tmdbKey = process.env.TMDB_API_KEY;

      for (const film of films) {
        const type = film.type === 'movie' ? 'movie' : 'tv';
        const response = await axios.get(`https://api.themoviedb.org/3/${type}/${film.tmdbId}?api_key=${tmdbKey}&language=ru`);
        const data = response.data;

        const releaseDate = type === 'movie' ? new Date(data.release_date) : new Date(data.next_episode_to_air?.air_date);
        const today = new Date();

        if (releaseDate && releaseDate <= today && releaseDate > new Date(today.getTime() - 24 * 60 * 60 * 1000)) {
          bot.sendMessage(film.userId, `Вышел ${film.type === 'movie' ? 'фильм' : 'новый эпизод'}: ${film.title} (${releaseDate.toLocaleDateString('ru-RU')})`);
        }
      }
    }, 24 * 60 * 60 * 1000); // Проверка раз в сутки
  }
}