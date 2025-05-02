export class CreateFilmDto {
  title: string;
  releaseYear: number;
  durationOrEpisodes: number;
  genres: string[];
  directors: string[];
  type: 'movie' | 'series';
  userId: string; // Добавляем
  tmdbId?: number;
}