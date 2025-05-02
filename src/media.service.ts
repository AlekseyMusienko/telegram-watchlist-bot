import axios from 'axios';
import { Media, MediaModel } from './media.model';

export class MediaService {
  async findById(id: string): Promise<Media | null> {
    return MediaModel.findById(id).exec();
  }

  async addMedia(tmdbId: number, type: 'movie' | 'series' | 'show', title: string, releaseDate?: string): Promise<Media> {
    const media = new MediaModel({ tmdbId, type, title, releaseDate });
    return media.save();
  }

  async searchTmdb(query: string, apiKey: string): Promise<any[]> {
    const response = await axios.get('https://api.themoviedb.org/3/search/multi', {
      params: { api_key: apiKey, query },
    });
    return response.data.results;
  }

  async recommend(chatId: number, apiKey: string, user: any): Promise<any[]> {
    const mediaIds = [...user.movies, ...user.series, ...user.shows];
    if (!mediaIds.length) return [];
    const media = await this.findById(mediaIds[0]);
    if (!media) return [];
    const endpoint = media.type === 'movie' ? 'movie' : 'tv';
    const response = await axios.get(`https://api.themoviedb.org/3/${endpoint}/${media.tmdbId}/recommendations`, {
      params: { api_key: apiKey },
    });
    return response.data.results.slice(0, 3);
  }

  async checkReleases(bot: any, apiKey: string, users: any[]) {
    for (const user of users) {
      for (const mediaId of [...user.movies, ...user.series, ...user.shows]) {
        const media = await this.findById(mediaId);
        if (!media || media.watched) continue;

        if (media.type === 'movie') {
          const tmdbData = await axios.get(`https://api.themoviedb.org/3/movie/${media.tmdbId}`, {
            params: { api_key: apiKey },
          });
          const releaseDate = tmdbData.data.release_date;
          if (releaseDate && new Date(releaseDate) <= new Date()) {
            await bot.sendMessage(user.chatId, `🎬 ${media.title} is now released!`);
            media.watched = true;
            await media.save();
          }
        } else if (media.type === 'series' || media.type === 'show') {
          const tmdbData = await axios.get(`https://api.themoviedb.org/3/tv/${media.tmdbId}`, {
            params: { api_key: apiKey },
          });
          const seasons = tmdbData.data.seasons;
          for (const season of seasons) {
            const seasonData = await axios.get(`https://api.themoviedb.org/3/tv/${media.tmdbId}/season/${season.season_number}`, {
              params: { api_key: apiKey },
            });
            for (const episode of seasonData.data.episodes) {
              if (new Date(episode.air_date) <= new Date() && !media.watchedEpisodes?.some(e => e.season === season.season_number && e.episode === episode.episode_number)) {
                await bot.sendMessage(user.chatId, `📺 New episode of ${media.title}: S${season.season_number}E${episode.episode_number}`);
                media.watchedEpisodes = media.watchedEpisodes || [];
                media.watchedEpisodes.push({ season: season.season_number, episode: episode.episode_number });
                await media.save();
              }
            }
          }
        }
      }
    }
  }
}