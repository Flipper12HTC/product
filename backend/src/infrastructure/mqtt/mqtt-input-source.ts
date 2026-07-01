import mqtt from 'mqtt';
import type { InputSource } from '../../application/ports/input-source.js';
import type { FlipperSide } from '../../domain/flipper.js';

export class MqttInputSource implements InputSource {
  private client: mqtt.MqttClient | null = null;
  private pressHandlers: ((side: FlipperSide) => void)[] = [];
  private releaseHandlers: ((side: FlipperSide) => void)[] = [];
  private tiltHandlers: (() => void)[] = [];
  private drainHandlers: (() => void)[] = [];

  connect(): void {
    const url = process.env['MQTT_BROKER_URL'] ?? 'mqtt://localhost:1883';
    const clientId = process.env['MQTT_CLIENT_ID'] ?? 'flipper12-backend';

    this.client = mqtt.connect(url, { clientId });

    this.client.on('connect', () => {
      console.log(`[mqtt] connected to ${url}`);
      // The ESP32 publishes on pinball/<device_id>/input/button (see
      // hardware/contracts/README.md). Subscribe across every device id.
      this.client!.subscribe('pinball/+/input/button', (err) => {
        if (err) {
          console.error('[mqtt] subscribe error:', err);
          return;
        }
        console.log('[mqtt] subscribed to pinball/+/input/button');
      });
    });

    this.client.on('reconnect', () => console.log('[mqtt] reconnecting...'));
    this.client.on('close', () => console.log('[mqtt] disconnected'));
    this.client.on('error', (err) => console.error('[mqtt] error:', err));
    this.client.on('message', (topic, payload) => {
      this.handleMessage(topic, payload.toString());
    });
  }

  private handleMessage(topic: string, payload: string): void {
    // Payload contract (hardware/messages/payloads.cpp):
    //   { "device_id": "...", "side": "L" | "R",
    //     "event": "press" | "release", "timestamp_ms": <n> }
    let msg: { side?: unknown; event?: unknown };
    try {
      msg = JSON.parse(payload) as { side?: unknown; event?: unknown };
    } catch {
      console.warn(`[mqtt] ignoring non-JSON payload on ${topic}: ${payload}`);
      return;
    }

    const side = this.parseSide(msg.side);
    if (side === null) {
      console.warn(`[mqtt] ignoring message with bad side on ${topic}:`, msg.side);
      return;
    }

    if (msg.event === 'press') {
      for (const cb of this.pressHandlers) cb(side);
    } else if (msg.event === 'release') {
      for (const cb of this.releaseHandlers) cb(side);
    } else {
      console.warn(`[mqtt] ignoring unknown event on ${topic}:`, msg.event);
    }
  }

  private parseSide(raw: unknown): FlipperSide | null {
    if (raw === 'L' || raw === 'left') return 'left';
    if (raw === 'R' || raw === 'right') return 'right';
    return null;
  }

  onButtonPress(cb: (side: FlipperSide) => void): void {
    this.pressHandlers.push(cb);
  }

  onButtonRelease(cb: (side: FlipperSide) => void): void {
    this.releaseHandlers.push(cb);
  }

  onTilt(cb: () => void): void {
    this.tiltHandlers.push(cb);
  }

  onDrain(cb: () => void): void {
    this.drainHandlers.push(cb);
  }
}
