import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { MessageEvent } from '@nestjs/common';
import { Observable } from 'rxjs';
import {
  SYSTEM_EVENT_CHANNEL,
  type SystemNotificationEvent,
} from '../../common/events/system-events.types';

@Injectable()
export class NotificationsService {
  constructor(private readonly eventEmitter: EventEmitter2) {}

  streamCompanyEvents(companyId: string): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      const listener = (event: SystemNotificationEvent): void => {
        if (event.companyId !== companyId) {
          return;
        }

        subscriber.next({
          type: event.type,
          data: event,
        });
      };

      this.eventEmitter.on(SYSTEM_EVENT_CHANNEL, listener);

      return () => {
        this.eventEmitter.off(SYSTEM_EVENT_CHANNEL, listener);
      };
    });
  }
}
