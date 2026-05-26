import type { Server } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { globalEventBus, type BusMessage } from './event-bus.js';

export function attachWebSocketServer(server: Server, path = '/ws'): WebSocketServer {
  const wss = new WebSocketServer({ server, path });

  wss.on('connection', (socket) => {
    socket.send(JSON.stringify({ type: 'connected', event: 'ws.connected', payload: {} }));

    const unsubscribe = globalEventBus.subscribe((message: BusMessage) => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(message));
      }
    });

    socket.on('close', () => unsubscribe());
    socket.on('error', () => unsubscribe());
  });

  console.log(`[server] WebSocket listening on ${path}`);
  return wss;
}
