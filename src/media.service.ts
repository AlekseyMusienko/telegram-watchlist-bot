import axios from 'axios';
import { Media, MediaModel } from './media.model';
import TelegramBot from 'node-telegram-bot-api';
import { User } from './user.model';

export class MediaService {
  async searchTmdb(query: string, apiKey: string): Promise<any[]> {
    const response = await axios.get(`https://api.themoviedb.org/3/search/multi?api_key=${apiKey}&query=${encodeURIComponent(query)}&language=ru-RU`);
    return response.data.results.filter((item: any) => item.media_type === 'movie' || item.media_type === 'tv');
  }

  async addMedia(tmdbId: number, type: 'movie' | 'series' | 'show', title: string): Promise<Media> {
    let media = await MediaModel.findOne({ tmdbId }).exec();
    if (!media) {
      media = new MediaModel({ tmdbId, title, type, watched: false, watchingNow: false });
      await media.save();
    }
    return media;
  }

  async findById(mediaId: string): Promise<Media | null> {
    return MediaModel.findById(mediaId).exec();
  }

  async getMediaDetails(tmdbId: number, mediaType: string, apiKey: string): Promise<any> {
    const endpoint = mediaType === 'movie' ? 'movie' : 'tv';
    const response = await axios.get(`https://api.themoviedb.org/3/${endpoint}/${tmdbId}?api_key=${apiKey}&language=ru-RU`);
    return response.data;
  }

  async determineMediaType(tmdbId: number, mediaType: string, apiKey: string): Promise<'movie' | 'series' | 'show'> {
    if (mediaType === 'movie') {
      return 'movie';
    }
    const details = await this.getMediaDetails(tmdbId, mediaType, apiKey);
    // Проверяем, является ли это шоу (например, ток-шоу, реалити) или сериалом
    const genres = details.genres.map((g: any) => g.name.toLowerCase());
    const type = details.type?.toLowerCase();
    if (genres.includes('реалити') || genres.includes('ток-шоу') || type === 'talk show' || type === 'reality') {
      return 'show';
    }
    return 'series';
  }

  async recommend(chatId: number, apiKey: string, user: User): Promise<any[]> {
    const movies = await MediaModel.find({ _id: { $in: user.movies } }).exec();
    if (!movies.length) return [];
    const tmdbId = movies[0].tmdbId;
    const response = await axios.get(`https://api.themoviedb.org/3/movie/${tmdbId}/recommendations?api_key=${apiKey}&language=ru-RU`);
    return response.data.results.slice(0, 3);
  }

  async checkReleases(bot: TelegramBot, apiKey: string, users: User[]): Promise<void> {
    for (const user of users) {
      const series = await MediaModel.find({ _id: { $in: user.series } }).exec();
      for (const s of series) {
        const response = await axios.get(`https://api.themoviedb.org/3/tv/${s.tmdbId}?api_key=${apiKey}&language=ru-RU`);
        const lastEpisode = response.data.last_episode_to_air;
        if (lastEpisode && !s.watchedEpisodes?.some((e: any) => e.season === lastEpisode.season_number && e.episode === lastEpisode.episode_number)) {
          await bot.sendMessage(user.chatId, `Новый эпизод ${s.title}: S${lastEpisode.season_number}E${lastEpisode.episode_number} (${lastEpisode.air_date})`);
        }
      }
    }
  }
}