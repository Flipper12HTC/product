import mqtt from 'mqtt';
import type { InputSource } from '../../application/ports/input-source.js';
import type { FlipperSide } from '../../domain/flipper.js';

/**
 * Reads the ESP32 button board over MQTT and turns it into game input.
 *
 * Firmware contract (see the flipper-deploy reference firmware):
 *   topic  pinball/<device_id>/input/button   payload { "id": "L1", "state": 1 }
 *   topic  pinball/<device_id>/input/plunger  payload { "state": 1 }
 * where state is 1 on press and 0 on release. Button ids map to game roles here
 * (the firmware stays game-agnostic):
 *   R2 (white right)      → left flipper
 *   L1 (white left)       → right flipper
 *   L2 (black left)       → start
 *   R1 (black right)      → restart
 *   under_plunger (front white) → launch the ball (hold longer = stronger)
 */
export class MqttInputSource implements InputSource {
  private client: mqtt.MqttClient | null = null;
  private pressHandlers: ((side: FlipperSide) => void)[] = [];
  private releaseHandlers: ((side: FlipperSide) => void)[] = [];
  private tiltHandlers: (() => void)[] = [];
  private drainHandlers: (() => void)[] = [];
  private startHandlers: (() => void)[] = [];
  private restartHandlers: (() => void)[] = [];
  private plungerHandlers: ((pressed: boolean) => void)[] = [];

  connect(): void {
    const url = process.env['MQTT_BROKER_URL'] ?? 'mqtt://localhost:1883';
    const clientId = process.env['MQTT_CLIENT_ID'] ?? 'flipper12-backend';

    this.client = mqtt.connect(url, { clientId });

    this.client.on('connect', () => {
      console.log(`[mqtt] connected to ${url}`);
      // `+` = any device id, `#` = both .../input/button and .../input/plunger.
      this.client!.subscribe('pinball/+/input/#', (err) => {
        if (err) {
          console.error('[mqtt] subscribe error:', err);
          return;
        }
        console.log('[mqtt] subscribed to pinball/+/input/#');
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
    let msg: { id?: unknown; state?: unknown };
    try {
      msg = JSON.parse(payload) as { id?: unknown; state?: unknown };
    } catch {
      console.warn(`[mqtt] ignoring non-JSON payload on ${topic}: ${payload}`);
      return;
    }

    const pressed = msg.state === 1 || msg.state === '1' || msg.state === true;

    if (topic.endsWith('/input/plunger')) {
      for (const cb of this.plungerHandlers) cb(pressed);
      return;
    }

    if (!topic.endsWith('/input/button')) return;

    // Map the firmware's button id to a game role (physical button in comments).
    switch (msg.id) {
      case 'R2': // white right → left flipper
        this.dispatchFlipper('left', pressed);
        break;
      case 'L1': // white left → right flipper
        this.dispatchFlipper('right', pressed);
        break;
      case 'L2': // black left → start a game
        if (pressed) for (const cb of this.startHandlers) cb();
        break;
      case 'R1': // black right → restart (same as the "R" key)
        if (pressed) for (const cb of this.restartHandlers) cb();
        break;
      case 'under_plunger': // front white → launch the ball (hold longer = stronger)
        for (const cb of this.plungerHandlers) cb(pressed);
        break;
      default:
        // top / middle / bottom — no game role yet.
        break;
    }
  }

  private dispatchFlipper(side: FlipperSide, pressed: boolean): void {
    const handlers = pressed ? this.pressHandlers : this.releaseHandlers;
    for (const cb of handlers) cb(side);
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

  /** Fired when the physical start button (black left) is pressed. */
  onStart(cb: () => void): void {
    this.startHandlers.push(cb);
  }

  /** Fired when the physical restart button (black right) is pressed. */
  onRestart(cb: () => void): void {
    this.restartHandlers.push(cb);
  }

  /** Fired on launch press (true) and release (false); hold time = force. */
  onPlunger(cb: (pressed: boolean) => void): void {
    this.plungerHandlers.push(cb);
  }
}
