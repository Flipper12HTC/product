import type { WebSocket } from '@fastify/websocket';
import type { GamePublisher, GameEvent } from '../../application/ports/game-publisher.js';

export class FastifyWsPublisher implements GamePublisher {
  private clients = new Set<WebSocket>();

  addClient(socket: WebSocket): void {
    this.clients.add(socket);
    socket.on('close', () => this.clients.delete(socket));
  }

  broadcast(event: GameEvent): void {
    const msg = JSON.stringify(event);
    for (const client of this.clients) {
      if (client.readyState === 1) {
        client.send(msg);
      }
    }
  }
}
