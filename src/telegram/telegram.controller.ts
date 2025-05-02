import { Controller, Post, Body } from '@nestjs/common';

@Controller('webhook')
export class TelegramController {
  @Post()
  async handleWebhook(@Body() update: any, @Headers() headers: any) {
    console.log('Function invoked at:', new Date().toISOString());
    console.log('Headers:', JSON.stringify(headers, null, 2));
    console.log('Body:', JSON.stringify(update, null, 2));
    return { ok: true };
  }
}