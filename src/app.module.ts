import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { FilmsModule } from './films/films.module';
import { TelegramController } from './telegram/telegram.controller';
import { TelegramService } from './telegram/telegram.service';

@Module({
  imports: [
    ConfigModule.forRoot(),
    MongooseModule.forRoot(process.env.MONGO_URI || 'mongodb://localhost/telegram-bot'),
    FilmsModule,
  ],
  controllers: [TelegramController],
  providers: [TelegramService],
})
export class AppModule {}