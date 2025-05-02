import { Schema, model, Document, Types } from 'mongoose';

export interface User extends Document {
  chatId: number;
  movies: Types.ObjectId[];
  series: Types.ObjectId[];
  shows: Types.ObjectId[];
  state: string | null; // Изменено с `state?: string` на `state: string | null`
}

export const UserSchema = new Schema<User>({
  chatId: { type: Number, required: true, unique: true },
  movies: [{ type: Schema.Types.ObjectId, ref: 'Media' }],
  series: [{ type: Schema.Types.ObjectId, ref: 'Media' }],
  shows: [{ type: Schema.Types.ObjectId, ref: 'Media' }],
  state: { type: String, default: null },
});

export const UserModel = model<User>('User', UserSchema);