import { Film, FilmModel } from './film.model';
import axios from 'axios';

export class FilmService {
  async findAll(): Promise<Film[]> {
    return FilmModel.find().exec();
  }

  async addFilm(title: string, tmdbId?: number): Promise<Film> {
    const film = new FilmModel({ title, tmdbId });
    return film.save();
  }

  async searchTmdb(query: string, apiKey: string): Promise<any> {
    const response = await axios.get('https://api.themoviedb.org/3/search/movie', {
      params: { api_key: apiKey, query },
    });
    return response.data.results;
  }

  async startReleaseCheck(bot: any, apiKey: string) {
    // Пример периодической проверки (можно настроить позже)
    setInterval(async () => {
      const films = await this.findAll();
      for (const film of films) {
        if (film.tmdbId) {
          // Проверка новых релизов (упрощённо)
          console.log(`Checking releases for ${film.title}`);
        }
      }
    }, 24 * 60 * 60 * 1000); // Раз в день
  }
}