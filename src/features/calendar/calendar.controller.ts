import { Controller, Get, Query, Res, HttpStatus } from '@nestjs/common';
import { OAuthService } from '../auth/oauth.service';
import type { Response } from 'express';

@Controller('v1/auth/google')
export class CalendarController {
  constructor(private readonly oauthService: OAuthService) {}

  @Get('callback')
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
}
