import { User, UserModel } from './user.model';
import { Media, MediaModel } from './media.model';
import { Types } from 'mongoose';

export class UserService {
  async findOrCreate(chatId: number): Promise<User> {
    let user = await UserModel.findOne({ chatId }).exec();
    if (!user) {
      user = new UserModel({ chatId, movies: [], series: [], shows: [] });
      await user.save();
    }
    return user;
  }

  async addToList(chatId: number, media: Media): Promise<User> {
    const user = await this.findOrCreate(chatId);
    if (media.type === 'movie') {
      user.movies.push(new Types.ObjectId(media._id));
    } else if (media.type === 'series') {
      user.series.push(new Types.ObjectId(media._id));
    } else if (media.type === 'show') {
      user.shows.push(new Types.ObjectId(media._id));
    }
    return user.save();
  }

  async removeFromList(chatId: number, mediaId: string, type: 'movie' | 'series' | 'show'): Promise<User> {
    const user = await this.findOrCreate(chatId);
    if (type === 'movie') {
      user.movies = user.movies.filter(id => id.toString() !== mediaId);
    } else if (type === 'series') {
      user.series = user.series.filter(id => id.toString() !== mediaId);
    } else if (type === 'show') {
      user.shows = user.shows.filter(id => id.toString() !== mediaId);
    }
    return user.save();
  }

  async markWatched(chatId: number, mediaId: string): Promise<Media | null> {
    const media = await MediaModel.findById(mediaId).exec();
    if (media) {
      media.watched = true;
      await media.save();
    }
    return media;
  }

  async markEpisode(chatId: number, mediaId: string, season: number, episode: number): Promise<Media | null> {
    const media = await MediaModel.findById(mediaId).exec();
    if (!media) {
      return null;
    }
    if (media.type === 'movie') {
      throw new Error('Эпизоды нельзя отмечать для фильмов');
    }
    if (media.type === 'series' || media.type === 'show') {
      media.watchedEpisodes = media.watchedEpisodes || [];
      if (!media.watchedEpisodes.some((e: { season: number; episode: number }) => e.season === season && e.episode === episode)) {
        media.watchedEpisodes.push({ season, episode });
        await media.save();
      }
    }
    return media;
  }

  async markWatchingNow(chatId: number, mediaId: string): Promise<Media | null> {
    const media = await MediaModel.findById(mediaId).exec();
    if (media) {
      media.watchingNow = true;
      await media.save();
    }
    return media;
  }
}