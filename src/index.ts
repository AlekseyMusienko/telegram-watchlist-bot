import express, { Request, Response } from 'express';
import mongoose from 'mongoose';
import request from 'request-promise';
import TelegramBot from 'node-telegram-bot-api';

const app = express();
app.use(express.json());

// Конфигурация
const TOKEN: string = '7583335421:AAEOHXw9RSntZWC1ER867nijCKynAOiNrDU';
const WEBHOOK_URL: string = `https://telegram-watchlist-bot.onrender.com/bot${TOKEN}`;
const PORT: number = process.env.PORT ? parseInt(process.env.PORT) : 10000;
const MONGODB_URI: string = process.env.MONGODB_URI || 'mongodb://localhost:27017/watchlist';

// Подключение к MongoDB
mongoose.connect(MONGODB_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch((err: Error) => console.error('MongoDB connection error:', err));

// Функция для отправки сообщений
async function sendMessage(chatId: number, text: string, replyMarkup: any = null): Promise<any> {
  try {
    const response = await request({
      method: 'POST',
      url: `https://api.telegram.org/bot${TOKEN}/sendMessage`,
      form: { chat_id: chatId, text, reply_markup: replyMarkup },
      resolveWithFullResponse: true,
    });
    console.log('SendMessage response:', response.body);
    return response;
  } catch (error: any) {
    console.error('SendMessage error:', error.message);
    throw error;
  }
}

// Настройка вебхука
app.post(`/bot${TOKEN}`, async (req: Request, res: Response) => {
  console.log('Received update:', req.body);

  // Пример обработки входящего сообщения
  if (req.body.message) {
    const chatId: number = req.body.message.chat.id;
    const text: string = req.body.message.text;

    // Пример ответа
    await sendMessage(chatId, `Получено: ${text}`);
  }

  res.status(200).send('OK');
});

// Настройка polling (включите, если вебхук не работает)
const USE_POLLING: boolean = false; // Измените на true для использования polling
if (USE_POLLING) {
  const bot = new TelegramBot(TOKEN, { polling: true });

  bot.on('message', async (msg: TelegramBot.Message) => {
    console.log('Received message:', msg);
    const chatId: number = msg.chat.id;
    await bot.sendMessage(chatId, 'Бот работает!');
  });

  // Отключение вебхука при использовании polling
  request({
    method: 'POST',
    url: `https://api.telegram.org/bot${TOKEN}/deleteWebhook`,
  }).then(() => console.log('Webhook disabled for polling'));
} else {
  // Установка вебхука
  request({
    method: 'POST',
    url: `https://api.telegram.org/bot${TOKEN}/setWebhook?url=${WEBHOOK_URL}`,
  }).then(() => console.log(`Webhook set to: ${WEBHOOK_URL}`));
}

// Запуск сервера
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});