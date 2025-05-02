import { Schema, model, Document } from 'mongoose';

export interface Media extends Document {
  _id: string;
  tmdbId: number;
  type: 'movie' | 'series' | 'show';
  title: string;
  releaseDate?: string;
  watched: boolean;
  watchedEpisodes?: { season: number; episode: number }[];
  watchingNow: boolean;
}

const MediaSchema = new Schema<Media>({
  tmdbId: { type: Number, required: true },
  type: { type: String, enum: ['movie', 'series', 'show'], required: true },
  title: { type: String, required: true },
  releaseDate: { type: String },
  watched: { type: Boolean, default: false },
  watchedEpisodes: [{ season: Number, episode: Number }],
  watchingNow: { type: Boolean, default: false },
});

export const MediaModel = model<Media>('Media', MediaSchema);