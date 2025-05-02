import { Controller, Post, Body, Headers } from '@nestjs/common';

@Controller('bot7583335421:AAEOHXw9RSntZWC1ER867nijCKynAOiNrDU')
export class TelegramController {
  @Post()
  async handleWebhook(@Body() update: any, @Headers() headers: Record<string, string>) {
    console.log('Function invoked at:', new Date().toISOString());
    console.log('Headers:', JSON.stringify(headers, null, 2));
    console.log('Body:', JSON.stringify(update, null, 2));
    return { ok: true };
  }
}