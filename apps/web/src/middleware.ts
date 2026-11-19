import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

export default createMiddleware(routing);

export const config = {
  // Everything except the API proxy, media, Next internals and files with an extension.
  matcher: ['/((?!api|media|_next|_vercel|.*\\..*).*)'],
};
