import {
  Body,
  Controller,
  Get,
  Headers,
  Post,
  Query,
  UnauthorizedException,
  Res,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { OAuthService } from './oauth.service';
import { AuthService } from './auth.service';
import { ProvingService } from './proving.service';
import { TokenService } from '../../common/security/token.service';
import { VerificationService } from '../login/verification.service';
import { ZkProofRequestDto } from './dto/proving.dto';
import {
  LoginRequestDto,
  PhoneOtpRequestDto,
  PhoneStatusQueryDto,
} from './dto/auth.dto';
import type {
  ProvingPingResponse,
  ProvingProofResponse,
} from './types/proving.types';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly tokens: TokenService,
    private readonly verification: VerificationService,
    private readonly proving: ProvingService,
    private readonly oauthService: OAuthService,
  ) {}

  @Get('salt')
  @ApiOperation({ summary: 'Obtiene salt de un usuario existente' })
  @ApiHeader({ name: 'x-oauth-token', required: true })
  @ApiHeader({ name: 'x-auth-provider', required: false })
  async getSalt(
    @Headers('x-oauth-token') jwt: string,
    @Headers('x-auth-provider') provider?: string,
  ): Promise<{ exists: boolean; salt: string | null }> {
    return this.auth.getSalt({ jwt, provider });
  }

  @Post('login')
  @ApiOperation({ summary: 'Inicia sesion y devuelve access token' })
  @ApiHeader({ name: 'x-auth-provider', required: false })
  @ApiOkResponse({ description: 'Sesion iniciada' })
  async login(
    @Body() body: LoginRequestDto,
    @Headers('x-auth-provider') provider?: string,
  ): Promise<{
    accessToken: string;
    user: {
      id: string;
      suiAddress: string;
      phoneVerified: boolean;
      status: string;
    };
  }> {
    return this.auth.login(body, provider);
  }

  @Post('zkp')
  @ApiOperation({ summary: 'Solicita una prueba zk al Proving Service' })
  @ApiOkResponse({
    description: 'Respuesta del Proving Service con la prueba zk',
  })
  async requestZkProof(
    @Body() body: ZkProofRequestDto,
  ): Promise<ProvingProofResponse> {
    return this.proving.requestProof(body);
  }

  @Get('zkp/ping')
  @ApiOperation({ summary: 'Ping al Proving Service' })
  @ApiOkResponse({ description: 'Estado del Proving Service' })
  async pingProver(): Promise<ProvingPingResponse> {
    return this.proving.ping();
  }

  @Post('phone/otp')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Solicita OTP para vincular telefono' })
  async requestOtp(
    @Headers('authorization') authorization: string,
    @Body() body: PhoneOtpRequestDto,
  ): Promise<{ code: string; instruction: string }> {
    const token = this.extractBearer(authorization);
    const payload = this.tokens.verifyToken(token);

    await this.auth.setUserPhonePending(payload.userId, body.phone);
    const { code } = await this.verification.issueCode(body.phone);

    return {
      code,
      instruction: 'Envía este código a nuestro bot de WhatsApp',
    };
  }

  @Get('phone/status')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Consulta estado de verificacion de telefono' })
  async status(
    @Headers('authorization') authorization: string,
    @Query() query: PhoneStatusQueryDto,
  ): Promise<{ verified: boolean; linkedAt: string | null }> {
    const token = this.extractBearer(authorization);
    this.tokens.verifyToken(token);

    const status = await this.verification.getStatus(query.phone);
    return {
      verified: status.verified,
      linkedAt: status.linkedAt ? status.linkedAt.toISOString() : null,
    };
  }

  @Get('google/callback')
  async googleCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response,
  ) {
    if (!code || !state) {
      return res.status(HttpStatus.BAD_REQUEST).send('Missing code or state');
    }

    try {
      const companyId = state;
      // Exchange code for tokens and save them
      await this.oauthService.handleCallback(code, companyId);

      // Redirect to a success page or close the window
      // Ideally redirect to a frontend page or a "success" static page
      return res.send(`
        <html>
          <body>
            <h1>Conexión Exitosa</h1>
            <p>Google Calendar se ha conectado correctamente a tu empresa.</p>
            <script>window.close()</script>
          </body>
        </html>
      `);
    } catch (error) {
      console.error('Error in Google Callback:', error);
      return res
        .status(HttpStatus.INTERNAL_SERVER_ERROR)
        .send('Error connecting to Google Calendar');
    }
  }

  private extractBearer(header?: string): string {
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Authorization header inválido');
    }
    return header.slice('Bearer '.length).trim();
  }
}
