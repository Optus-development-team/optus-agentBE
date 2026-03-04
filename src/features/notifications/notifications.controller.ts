import {
  Controller,
  Sse,
  UseGuards,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { MessageEvent } from '@nestjs/common';
import type { Observable } from 'rxjs';
import { CookieJwtAuthGuard } from '../auth/cookie-jwt-auth.guard';
import type { AuthenticatedRequest } from '../auth/cookie-jwt-auth.guard';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Sse('stream')
  @UseGuards(CookieJwtAuthGuard)
  stream(@Req() req: AuthenticatedRequest): Observable<MessageEvent> {
    const companyId = req.auth?.companyId;
    if (!companyId) {
      throw new UnauthorizedException('Empresa no autenticada');
    }

    return this.notificationsService.streamCompanyEvents(companyId);
  }
}
