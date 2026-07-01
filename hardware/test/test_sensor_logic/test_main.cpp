#include <unity.h>
#include "domain/sensor.h"

void setUp()    {}
void tearDown() {}

void test_sensor_initial_state_not_triggered() {
  SensorState s = sensorInit(SensorType::TILT);
  TEST_ASSERT_EQUAL(false, s.lastDebounced);
}

void test_sensor_triggered_on_active_signal() {
  SensorState s = sensorInit(SensorType::TILT);
  SensorEvent ev = sensorUpdate(s, true, 10);
  TEST_ASSERT_EQUAL(SensorEvent::TRIGGERED, ev);
}

void test_sensor_cleared_on_inactive_signal() {
  SensorState s = sensorInit(SensorType::TILT);
  sensorUpdate(s, true,  10); // TRIGGERED
  SensorEvent ev = sensorUpdate(s, false, 20);
  TEST_ASSERT_EQUAL(SensorEvent::CLEARED, ev);
}

void test_sensor_no_duplicate_event() {
  SensorState s = sensorInit(SensorType::DRAIN);
  sensorUpdate(s, true, 0);
  SensorEvent ev = sensorUpdate(s, true, 50);
  TEST_ASSERT_EQUAL(SensorEvent::NONE, ev);
}

int main(int argc, char** argv) {
  UNITY_BEGIN();
  RUN_TEST(test_sensor_initial_state_not_triggered);
  RUN_TEST(test_sensor_triggered_on_active_signal);
  RUN_TEST(test_sensor_cleared_on_inactive_signal);
  RUN_TEST(test_sensor_no_duplicate_event);
  return UNITY_END();
}
