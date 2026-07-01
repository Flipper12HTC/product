#include <Arduino.h>
#include "secrets.h"
#include "hal/pins.h"
#include "hal/gpio.h"
#include "domain/button.h"
#include "net/wifi.h"
#include "net/mqtt.h"

static ButtonState btnLeft;
static ButtonState btnRight;

void setup() {
  Serial.begin(115200);
  delay(100);
  Serial.println();
  Serial.println("flipper12-hardware — starting up...");

  hal::configureInput(PIN_BTN_LEFT,  true);
  hal::configureInput(PIN_BTN_RIGHT, true);

  btnLeft  = buttonInit(ButtonSide::LEFT);
  btnRight = buttonInit(ButtonSide::RIGHT);

  wifiConnect(WIFI_SSID, WIFI_PASSWORD);
  setupMqtt();

  Serial.println("Setup complete.");
}

void loop() {
  const uint32_t now = millis();

  wifiEnsureConnected();
  ensureMqttConnected();
  publishHeartbeat();

  ButtonEvent evL = buttonUpdate(btnLeft,  hal::readPin(PIN_BTN_LEFT),  now);
  ButtonEvent evR = buttonUpdate(btnRight, hal::readPin(PIN_BTN_RIGHT), now);

  if (evL == ButtonEvent::PRESS)   { Serial.println("LEFT  — PRESS");    publishButtonPress(ButtonSide::LEFT,  now); }
  if (evL == ButtonEvent::RELEASE)   Serial.println("LEFT  — RELEASE");
  if (evR == ButtonEvent::PRESS)   { Serial.println("RIGHT — PRESS");    publishButtonPress(ButtonSide::RIGHT, now); }
  if (evR == ButtonEvent::RELEASE)   Serial.println("RIGHT — RELEASE");

  mqttLoop();
}
