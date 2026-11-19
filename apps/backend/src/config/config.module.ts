import { Global, Module } from '@nestjs/common';
import { APP_CONFIG, loadConfig } from './app-config';

/** Single source of validated configuration; tests override APP_CONFIG. */
@Global()
@Module({
  providers: [{ provide: APP_CONFIG, useFactory: () => loadConfig() }],
  exports: [APP_CONFIG],
})
export class ConfigModule {}
