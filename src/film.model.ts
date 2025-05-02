import { Schema, model } from 'mongoose';

export interface Film {
  title: string;
  tmdbId?: number;
  releaseDate?: string;
}

const FilmSchema = new Schema<Film>({
  title: { type: String, required: true },
  tmdbId: { type: Number },
  releaseDate: { type: String },
});

export const FilmModel = model<Film>('Film', FilmSchema);