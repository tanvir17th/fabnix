import { Controller, HttpCode, Inject, Post, Req, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { CookieOptions, Request, Response } from 'express';
import { ErrorCode, schemas } from '@fabnix/shared';
import { z } from 'zod';
import { APP_CONFIG, AppConfig } from '../../config/app-config';
import { AuthThrottle, CurrentUser, Public, AuthUser } from '../../common/auth/auth.decorators';
import { AppError } from '../../common/errors/app-error';
import { ZBody } from '../../common/validation/zod';
import { AuthService, SessionTokens } from './auth.service';

export const REFRESH_COOKIE = 'fabnix_rt';

/**
 * Web clients receive the refresh token ONLY as an httpOnly cookie. Native
 * apps (header `X-Fabnix-Client: native`) receive it in the body instead and
 * keep it in the OS secure store.
 */
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Public()
  @AuthThrottle()
  @Post('register')
  async register(@ZBody(schemas.registerSchema) dto: z.infer<typeof schemas.registerSchema>) {
    return this.auth.register(dto);
  }

  @Public()
  @AuthThrottle()
  @Post('verification/request')
  @HttpCode(202)
  async requestVerification(@ZBody(schemas.requestCodeSchema) dto: z.infer<typeof schemas.requestCodeSchema>) {
    await this.auth.requestVerification(dto.type, dto.identifier);
    return { accepted: true };
  }

  @Public()
  @AuthThrottle()
  @Post('verification/confirm')
  @HttpCode(200)
  async verify(@ZBody(schemas.verifyContactSchema) dto: z.infer<typeof schemas.verifyContactSchema>) {
    await this.auth.verifyContact(dto.type, dto.identifier, dto.code);
    return { verified: true };
  }

  @Public()
  @AuthThrottle()
  @Post('login')
  @HttpCode(200)
  async login(@ZBody(schemas.loginSchema) dto: z.infer<typeof schemas.loginSchema>, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { user, tokens } = await this.auth.login(dto.type, dto.identifier, dto.password, this.meta(req));
    return { user, ...this.deliver(req, res, tokens) };
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  async refresh(@ZBody(schemas.refreshSchema) dto: z.infer<typeof schemas.refreshSchema>, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const raw = (req.cookies?.[REFRESH_COOKIE] as string | undefined) ?? dto.refreshToken;
    if (!raw) throw new AppError(ErrorCode.REFRESH_TOKEN_INVALID);
    try {
      const { user, tokens } = await this.auth.refresh(raw, this.meta(req));
      return { user, ...this.deliver(req, res, tokens) };
    } catch (e) {
      res.clearCookie(REFRESH_COOKIE, this.cookieOptions());
      throw e;
    }
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(@ZBody(schemas.refreshSchema) dto: z.infer<typeof schemas.refreshSchema>, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout((req.cookies?.[REFRESH_COOKIE] as string | undefined) ?? dto.refreshToken);
    res.clearCookie(REFRESH_COOKIE, this.cookieOptions());
  }

  @Post('logout-all')
  @HttpCode(204)
  async logoutAll(@CurrentUser() user: AuthUser, @Res({ passthrough: true }) res: Response) {
    await this.auth.logoutAll(user.id);
    res.clearCookie(REFRESH_COOKIE, this.cookieOptions());
  }

  @Public()
  @AuthThrottle()
  @Post('password/forgot')
  @HttpCode(202)
  async forgot(@ZBody(schemas.requestCodeSchema) dto: z.infer<typeof schemas.requestCodeSchema>) {
    await this.auth.requestPasswordReset(dto.type, dto.identifier);
    return { accepted: true };
  }

  @Public()
  @AuthThrottle()
  @Post('password/reset')
  @HttpCode(200)
  async reset(@ZBody(schemas.resetPasswordSchema) dto: z.infer<typeof schemas.resetPasswordSchema>) {
    await this.auth.resetPassword(dto.type, dto.identifier, dto.code, dto.newPassword);
    return { reset: true };
  }

  private meta(req: Request) {
    return { userAgent: req.header('user-agent'), ip: req.ip };
  }

  private cookieOptions(): CookieOptions {
    return { httpOnly: true, secure: this.config.cookieSecure, sameSite: 'lax', path: '/api/v1/auth' };
  }

  private deliver(req: Request, res: Response, tokens: SessionTokens) {
    const native = req.header('x-fabnix-client') === 'native';
    if (!native) {
      res.cookie(REFRESH_COOKIE, tokens.refreshToken, { ...this.cookieOptions(), expires: tokens.refreshTokenExpiresAt });
    }
    return {
      accessToken: tokens.accessToken,
      tokenType: 'Bearer',
      expiresIn: tokens.accessTokenExpiresIn,
      ...(native ? { refreshToken: tokens.refreshToken, refreshTokenExpiresAt: tokens.refreshTokenExpiresAt } : {}),
    };
  }
}
