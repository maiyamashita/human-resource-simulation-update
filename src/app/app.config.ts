//このファイル名はsrc/app/app.config.tsです。

import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withHashLocation } from '@angular/router'; // ★ withHashLocation を追加

import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withHashLocation()) // ★ withHashLocation() を適用
  ]
};
