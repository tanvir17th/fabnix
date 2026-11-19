import './load-env'; // must run before any config is read
import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configureApp } from './bootstrap';
import { APP_CONFIG, AppConfig } from './config/app-config';

async function main() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: false });
  configureApp(app);
  const config = app.get<AppConfig>(APP_CONFIG);
  await app.listen(config.port, '0.0.0.0');
  Logger.log(`FABNIX API listening on :${config.port}/api/v1 (docs: /api/docs)`, 'Bootstrap');
}

void main();
