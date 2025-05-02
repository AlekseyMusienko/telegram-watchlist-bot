import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema()
export class Film extends Document {
  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  releaseYear: number;

  @Prop({ required: true })
  durationOrEpisodes: number;

  @Prop({ type: [String], default: [] })
  genres: string[];

  @Prop({ type: [String], default: [] })
  directors: string[];

  @Prop({ required: true, enum: ['movie', 'series'] })
  type: 'movie' | 'series';

  @Prop({ required: true })
  userId: string; // Telegram ID пользователя

  @Prop()
  tmdbId?: number; // ID из TMDB для уведомлений
}

export const FilmSchema = SchemaFactory.createForClass(Film);

export type FilmDocument = Film & Document;