export interface WsClientOptions {
  url: string;
  onMessage: (data: unknown) => void;
  onOpen?: () => void;
  onClose?: () => void;
  initialReconnectDelayMs?: number;
  maxReconnectDelayMs?: number;
}

export interface WsClient {
  disconnect: () => void;
}

export function createWsClient(options: WsClientOptions): WsClient {
  const {
    url,
    onMessage,
    onOpen,
    onClose,
    initialReconnectDelayMs = 1000,
    maxReconnectDelayMs = 30000,
  } = options;

  let socket: WebSocket | null = null;
  let shouldReconnect = true;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let attempt = 0;

  function connect(): void {
    socket = new WebSocket(url);

    socket.addEventListener('open', () => {
      attempt = 0;
      onOpen?.();
    });

    socket.addEventListener('message', (event: MessageEvent) => {
      try {
        const data: unknown = JSON.parse(event.data as string);
        onMessage(data);
      } catch {
        // ignore malformed messages
      }
    });

    socket.addEventListener('close', () => {
      onClose?.();
      if (shouldReconnect) {
        const delay = Math.min(maxReconnectDelayMs, initialReconnectDelayMs * 2 ** attempt);
        attempt++;
        reconnectTimer = setTimeout(connect, delay);
      }
    });

    socket.addEventListener('error', () => {
      socket?.close();
    });
  }

  connect();

  return {
    disconnect(): void {
      shouldReconnect = false;
      if (reconnectTimer !== null) {
        clearTimeout(reconnectTimer);
      }
      socket?.close();
    },
  };
}
