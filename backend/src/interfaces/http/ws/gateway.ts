import type { FastifyInstance } from 'fastify';
import type { WebSocket } from '@fastify/websocket';

export function registerGateway(
  app: FastifyInstance,
  onConnect: (socket: WebSocket) => void,
): void {
  app.get('/ws', { websocket: true }, (socket) => {
    onConnect(socket);
    app.log.info('WS client connected');
    socket.on('close', () => app.log.info('WS client disconnected'));
  });
}
