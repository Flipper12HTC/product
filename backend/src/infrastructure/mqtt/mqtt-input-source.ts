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
      this.client!.subscribe('flipper/inputs/#', (err) => {
        if (err) {
          console.error('[mqtt] subscribe error:', err);
          return;
        }
        console.log('[mqtt] subscribed to flipper/inputs/#');
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
    // TODO: parse topic → emit typed domain events
    // e.g. flipper/inputs/left/press → pressHandlers('left')
    console.log(`[mqtt] ${topic} ${payload}`);
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
