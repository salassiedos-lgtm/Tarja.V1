import { Injectable } from '@nestjs/common';
import { RealtimeGateway } from './realtime.gateway';

@Injectable()
export class RealtimeService {
  constructor(private readonly gateway: RealtimeGateway) {}

  emit(event: string, payload: unknown): void {
    // server puede no estar listo en tests/arranque; es tolerante.
    this.gateway.server?.emit(event, payload);
  }
}
