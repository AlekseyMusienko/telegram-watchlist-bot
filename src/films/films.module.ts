import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { FilmsService } from './films.service';
import { Film, FilmSchema } from './films.schema';

@Module({
  imports: [MongooseModule.forFeature([{ name: Film.name, schema: FilmSchema }])],
  providers: [FilmsService],
  exports: [FilmsService], // Экспортируем сервис для TelegramService
})
export class FilmsModule {}