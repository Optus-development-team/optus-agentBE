import {
  Controller,
  Sse,
  UseGuards,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { MessageEvent } from '@nestjs/common';
import type { Observable } from 'rxjs';
import { FullCookieJwtAuthGuard } from '../auth/full-cookie-jwt-auth.guard';
import type { FullAuthenticatedRequest } from '../auth/full-cookie-jwt-auth.guard';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Sse('stream')
  @UseGuards(FullCookieJwtAuthGuard)
  stream(@Req() req: FullAuthenticatedRequest): Observable<MessageEvent> {
    const companyId = req.auth?.companyId;
    if (!companyId) {
      throw new UnauthorizedException('Empresa no autenticada');
    }

    return this.notificationsService.streamCompanyEvents(companyId);
  }
}
