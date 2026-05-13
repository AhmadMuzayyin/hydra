#include <ESP8266WiFi.h>
#include <WiFiClientSecureBearSSL.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <LittleFS.h>
#include <time.h>
#include <vector>

// ===== WIFI & MQTT =====
String WIFI_SSID = "USTDEV";
String WIFI_PASSWORD = "coba12345";

const char *MQTT_HOST = "d8e662e1.ala.asia-southeast1.emqxsl.com";
const uint16_t MQTT_PORT = 8883;
const char *MQTT_USERNAME = "ustad.dev";
const char *MQTT_PASSWORD = "Mocachino18@";

const char *DEVICE_PREFIX = "tandon";
const char *DEVICE_UUID = "esp-hydra-001";

// ===== RUNTIME CONFIG (persisted) =====
// primary tank (tangki) defaults
int tank_height_cm = 200;
int level_min_cm = 30;
int pump_on_threshold = 50;
int pump_off_threshold = 180;
int valve_open_threshold = 190;
int level_full_primary_cm = 20; // threshold for 100% primary tank (pump auto-off)
bool buzzer_enabled = true;

// secondary tank (bak mandi) defaults
int tank_height_secondary_cm = 100;
int level_full_secondary_cm = 90; // threshold for 100% secondary tank (valve auto-off)

// ===== PIN ESP8266 =====
// Relay (active LOW)
const uint8_t RELAY_PUMP_PIN = D1;  // GPIO5 - Relay 1 / Pompa 1
const uint8_t RELAY_VALVE_PIN = D2; // GPIO4 - Relay 2 / Pompa 2

// Ultrasonic Sensor
const uint8_t TRIG_PRIMARY_PIN = D5; // GPIO14 - US Sensor 1 TRIG
const uint8_t ECHO_PRIMARY_PIN = D6; // GPIO12 - US Sensor 1 ECHO
const uint8_t TRIG_MIN_PIN = D7;     // GPIO13 - US Sensor 2 TRIG
const uint8_t ECHO_MIN_PIN = D0;     // GPIO16 - US Sensor 2 ECHO

// LED Indicator (active LOW)
const uint8_t LED_GREEN1_PIN = D3; // GPIO0 - LED Hijau 1
const uint8_t LED_RED1_PIN = D4;   // GPIO2 - LED Merah 1
// GPIO1/GPIO3 are UART TX/RX
const bool ENABLE_UART_LED_PINS = true;
const int LED_GREEN2_PIN = 1; // GPIO3 - RX pin
const int LED_RED2_PIN = 3;   // GPIO1 - TX pin

// Buzzer untuk notifikasi
const uint8_t BUZZER_PIN = D8;

const bool RELAY_ACTIVE_LOW = true;
const bool LED_GREEN_ACTIVE_LOW = true;
const bool LED_RED_ACTIVE_LOW = false;
const bool BUZZER_ACTIVE_HIGH = true;

using SecureClientType = BearSSL::WiFiClientSecure;
SecureClientType secureClient;
PubSubClient mqttClient(secureClient);

// State variables
struct
{
    bool pumpOn = false;
    bool valveOn = false;
    uint16_t levelPrimaryCm = 0;     // distance from primary sensor (tangki)
    uint16_t levelSecondaryCm = 0;   // distance from secondary sensor (bak mandi)
    bool levelPrimaryFull = false;   // primary tank at 100%
    bool levelSecondaryFull = false; // secondary tank at 100%
    bool levelMinTriggered = false;  // alert for low level (obsolete, kept for compat)
    uint16_t pumpRuntimeSec = 0;
    uint16_t valveRuntimeSec = 0;
    uint32_t uptimeSec = 0;
} state;

unsigned long lastPollSensorMs = 0;
unsigned long lastTelemetryMs = 0;
unsigned long lastReconnectAttemptMs = 0;
unsigned long pumpStartMs = 0;
unsigned long valveStartMs = 0;
unsigned long buzzerOffAtMs = 0; // Buzzer auto-off timer
unsigned long lastScheduleCheckMs = 0;
const unsigned long SCHEDULE_CHECK_INTERVAL_MS = 60000; // check schedules every 60s

const unsigned long POLL_SENSOR_INTERVAL_MS = 3000; // Poll sensor setiap 3s
const unsigned long TELEMETRY_INTERVAL_MS = 5000;   // Publish telemetry setiap 5s
const unsigned long RECONNECT_INTERVAL_MS = 5000;   // Reconnect attempt setiap 5s
const char *NTP_SERVER = "pool.ntp.org";
bool startupWifiPending = true;

// ===== TIMEZONE =====
// WIB = UTC+7 (Waktu Indonesia Barat)
const int GMT_OFFSET_SEC = 7 * 3600; // 7 hours in seconds
const int DAYLIGHT_OFFSET_SEC = 0;   // No daylight saving in Indonesia

String buildClientId()
{
    return String(DEVICE_PREFIX) + "-" + String(ESP.getChipId(), HEX);
}

// ===== RELAY CONTROL =====
void writeRelay(uint8_t pin, bool on)
{
    digitalWrite(pin, RELAY_ACTIVE_LOW ? (on ? LOW : HIGH) : (on ? HIGH : LOW));
}

void beepBuzzer(unsigned int durationMs = 150)
{
    digitalWrite(BUZZER_PIN, BUZZER_ACTIVE_HIGH ? HIGH : LOW);
    buzzerOffAtMs = millis() + durationMs;
}

void updateBuzzer()
{
    if (buzzerOffAtMs > 0 && millis() >= buzzerOffAtMs)
    {
        digitalWrite(BUZZER_PIN, BUZZER_ACTIVE_HIGH ? LOW : HIGH);
        buzzerOffAtMs = 0;
    }
}

void writeAllLeds(bool on)
{
    writeGreenLed(LED_GREEN1_PIN, on);
    writeRedLed(LED_RED1_PIN, on);
    if (ENABLE_UART_LED_PINS)
    {
        writeGreenLed(LED_GREEN2_PIN, on);
        writeRedLed(LED_RED2_PIN, on);
    }
}

void beepBlocking(unsigned int durationMs)
{
    digitalWrite(BUZZER_PIN, BUZZER_ACTIVE_HIGH ? HIGH : LOW);
    delay(durationMs);
    digitalWrite(BUZZER_PIN, BUZZER_ACTIVE_HIGH ? LOW : HIGH);
}

void beepLongTripleBlocking()
{
    for (int i = 0; i < 3; i++)
    {
        beepBlocking(600);
        delay(250);
    }
}

void runFullLevelAlarm(bool isPump)
{
    for (int i = 0; i < 3; i++)
    {
        if (isPump)
        {
            writeGreenLed(LED_GREEN1_PIN, true);
            writeRedLed(LED_RED1_PIN, false);
        }
        else
        {
            writeGreenLed(LED_GREEN2_PIN, true);
            writeRedLed(LED_RED2_PIN, false);
        }

        beepBlocking(600);

        if (isPump)
        {
            writeGreenLed(LED_GREEN1_PIN, false);
        }
        else
        {
            writeGreenLed(LED_GREEN2_PIN, false);
        }

        delay(250);
    }
}

void setPump(bool on, bool withBeep = true)
{
    if (state.pumpOn == on)
        return;
    // Don't turn on pump if primary tank is already full
    if (on && state.levelPrimaryFull)
        return;
    state.pumpOn = on;
    writeRelay(RELAY_PUMP_PIN, on);
    if (on)
        pumpStartMs = millis();
    if (withBeep)
        beepBuzzer(150);
    updateLeds();
}

void setValve(bool on, bool withBeep = true)
{
    if (state.valveOn == on)
        return;
    // Don't turn on valve if secondary tank is already full
    if (on && state.levelSecondaryFull)
        return;
    state.valveOn = on;
    writeRelay(RELAY_VALVE_PIN, on);
    if (on)
        valveStartMs = millis();
    if (withBeep)
        beepBuzzer(150);
    updateLeds();
}

// ===== LED CONTROL =====
void writeLedRaw(uint8_t pin, bool on, bool activeLow)
{
    digitalWrite(pin, activeLow ? (on ? LOW : HIGH) : (on ? HIGH : LOW));
}

void writeGreenLed(uint8_t pin, bool on)
{
    writeLedRaw(pin, on, LED_GREEN_ACTIVE_LOW);
}

void writeRedLed(uint8_t pin, bool on)
{
    writeLedRaw(pin, on, LED_RED_ACTIVE_LOW);
}

void updateLeds()
{
    unsigned long now = millis();
    bool blink = (now / 1000) % 2 == 0;

    bool relay1On = state.pumpOn;
    writeGreenLed(LED_GREEN1_PIN, relay1On && blink);
    writeRedLed(LED_RED1_PIN, !relay1On);

    if (ENABLE_UART_LED_PINS)
    {
        bool relay2On = state.valveOn;
        writeGreenLed(LED_GREEN2_PIN, relay2On && blink);
        writeRedLed(LED_RED2_PIN, !relay2On);
    }
}

// ===== ULTRASONIC SENSOR =====
uint16_t readUltrasonicCm(uint8_t trigPin, uint8_t echoPin)
{
    digitalWrite(trigPin, LOW);
    delayMicroseconds(2);
    digitalWrite(trigPin, HIGH);
    delayMicroseconds(10);
    digitalWrite(trigPin, LOW);

    unsigned long duration = pulseIn(echoPin, HIGH, 30000); // 30ms timeout
    if (duration == 0)
        return 0; // Timeout

    // Distance = (duration / 2) / 29.1
    return duration / 58;
}

void pollSensors()
{
    // Read primary level sensor (tangki)
    uint16_t levelPrimary = readUltrasonicCm(TRIG_PRIMARY_PIN, ECHO_PRIMARY_PIN);
    if (levelPrimary > 0 && levelPrimary < 300)
    { // Valid range 0-300cm
        state.levelPrimaryCm = levelPrimary;
        // Calculate height: H = tank_height_cm - distance
        uint16_t heightPrimary = 0;
        if (levelPrimary <= (uint16_t)tank_height_cm)
            heightPrimary = tank_height_cm - levelPrimary;
        // Detect if primary tank is at/above full level
        state.levelPrimaryFull = (heightPrimary >= (uint16_t)level_full_primary_cm);
    }

    // Read secondary level sensor (bak mandi)
    uint16_t levelSecondary = readUltrasonicCm(TRIG_MIN_PIN, ECHO_MIN_PIN);
    if (levelSecondary > 0 && levelSecondary < 300)
    { // Valid range 0-300cm
        state.levelSecondaryCm = levelSecondary;
        // Calculate height: H = tank_height_secondary_cm - distance
        uint16_t heightSecondary = 0;
        if (levelSecondary <= (uint16_t)tank_height_secondary_cm)
            heightSecondary = tank_height_secondary_cm - levelSecondary;
        // Detect if secondary tank is at/above full level
        state.levelSecondaryFull = (heightSecondary >= (uint16_t)level_full_secondary_cm);
        // Keep levelMinTriggered for backward compat: trigger on low level in secondary
        state.levelMinTriggered = (heightSecondary > 0 && heightSecondary < (uint16_t)level_min_cm);
    }
}

void publishLevelSensor()
{
    if (!mqttClient.connected())
        return;

    StaticJsonDocument<128> doc;
    // Calculate water height H from measured distance S
    uint16_t heightCm = 0;
    if (state.levelPrimaryCm > 0 && state.levelPrimaryCm <= (uint16_t)tank_height_cm)
    {
        heightCm = tank_height_cm - state.levelPrimaryCm; // H in cm
    }
    // Publish both distance (S) and height (H) for compatibility
    doc["distance_cm"] = state.levelPrimaryCm; // S
    doc["level_cm"] = heightCm;                // H
    doc["level_pct"] = (heightCm * 100) / tank_height_cm;
    doc["timestamp"] = String(millis() / 1000);

    char payload[256];
    size_t len = serializeJson(doc, payload, sizeof(payload));
    String topic = String(DEVICE_PREFIX) + "/level/sensor";
    mqttClient.publish(topic.c_str(), (const uint8_t *)payload, len, false);
}

void publishLevelSensor2()
{
    if (!mqttClient.connected())
        return;

    StaticJsonDocument<128> doc;
    // Calculate water height H from measured distance S for secondary tank
    uint16_t heightCm = 0;
    if (state.levelSecondaryCm > 0 && state.levelSecondaryCm <= (uint16_t)tank_height_secondary_cm)
    {
        heightCm = tank_height_secondary_cm - state.levelSecondaryCm; // H in cm
    }
    // Publish both distance (S) and height (H) for compatibility
    doc["distance_cm"] = state.levelSecondaryCm; // S
    doc["level_cm"] = heightCm;                  // H
    doc["level_pct"] = (heightCm * 100) / tank_height_secondary_cm;
    doc["timestamp"] = String(millis() / 1000);

    char payload[256];
    size_t len = serializeJson(doc, payload, sizeof(payload));
    String topic = String(DEVICE_PREFIX) + "/level/sensor2";
    mqttClient.publish(topic.c_str(), (const uint8_t *)payload, len, false);
}

void publishMinimumAlert()
{
    if (!mqttClient.connected())
        return;

    StaticJsonDocument<128> doc;
    // report triggered status and actual height (H)
    doc["triggered"] = state.levelMinTriggered;
    uint16_t heightCm = 0;
    if (state.levelPrimaryCm > 0 && state.levelPrimaryCm <= (uint16_t)tank_height_cm)
        heightCm = tank_height_cm - state.levelPrimaryCm;
    doc["level_cm"] = heightCm;
    doc["timestamp"] = String(millis() / 1000);

    char payload[256];
    size_t len = serializeJson(doc, payload, sizeof(payload));
    String topic = String(DEVICE_PREFIX) + "/level/min";
    mqttClient.publish(topic.c_str(), (const uint8_t *)payload, len, false);
}

void publishStatusAck(const char *device, bool state, const char *requestId)
{
    if (!mqttClient.connected())
        return;

    StaticJsonDocument<128> doc;
    doc["ack"] = true;
    doc["request_id"] = requestId;
    doc["device"] = device;
    doc["state"] = state;
    doc["timestamp"] = String(millis() / 1000);

    char payload[256];
    size_t len = serializeJson(doc, payload, sizeof(payload));
    String topic = String(DEVICE_PREFIX) + "/" + device + "/status";
    mqttClient.publish(topic.c_str(), (const uint8_t *)payload, len, false);
}

void publishTelemetry()
{
    if (!mqttClient.connected())
        return;

    // Calculate runtime in seconds
    state.pumpRuntimeSec = state.pumpOn ? (millis() - pumpStartMs) / 1000 : 0;
    state.valveRuntimeSec = state.valveOn ? (millis() - valveStartMs) / 1000 : 0;
    state.uptimeSec = millis() / 1000;

    StaticJsonDocument<512> doc;
    doc["device_uuid"] = DEVICE_UUID;

    JsonObject level = doc.createNestedObject("level");

    // Primary sensor (tangki)
    JsonObject levelPrimary = level.createNestedObject("primary");
    uint16_t heightPrimary = 0;
    if (state.levelPrimaryCm > 0 && state.levelPrimaryCm <= (uint16_t)tank_height_cm)
        heightPrimary = tank_height_cm - state.levelPrimaryCm;
    levelPrimary["distance_cm"] = state.levelPrimaryCm;
    levelPrimary["height_cm"] = heightPrimary;
    levelPrimary["height_pct"] = (heightPrimary * 100) / tank_height_cm;
    levelPrimary["is_full"] = state.levelPrimaryFull;

    // Secondary sensor (bak mandi)
    JsonObject levelSecondary = level.createNestedObject("secondary");
    uint16_t heightSecondary = 0;
    if (state.levelSecondaryCm > 0 && state.levelSecondaryCm <= (uint16_t)tank_height_secondary_cm)
        heightSecondary = tank_height_secondary_cm - state.levelSecondaryCm;
    levelSecondary["distance_cm"] = state.levelSecondaryCm;
    levelSecondary["height_cm"] = heightSecondary;
    levelSecondary["height_pct"] = (heightSecondary * 100) / tank_height_secondary_cm;
    levelSecondary["is_full"] = state.levelSecondaryFull;

    JsonObject pump = doc.createNestedObject("pump");
    pump["state"] = state.pumpOn;
    pump["runtime_sec"] = state.pumpRuntimeSec;

    JsonObject valve = doc.createNestedObject("valve");
    valve["state"] = state.valveOn;
    valve["runtime_sec"] = state.valveRuntimeSec;

    JsonObject system = doc.createNestedObject("system");
    system["wifi_rssi"] = WiFi.RSSI();
    system["free_heap"] = ESP.getFreeHeap();
    system["temperature_c"] = 25; // Placeholder, ESP8266 tidak punya temp sensor
    system["uptime_sec"] = state.uptimeSec;

    doc["timestamp"] = String(millis() / 1000);

    char payload[512];
    size_t len = serializeJson(doc, payload, sizeof(payload));
    String topic = String(DEVICE_PREFIX) + "/device/telemetry";
    mqttClient.publish(topic.c_str(), (const uint8_t *)payload, len, false);
}

void handleCommand(const char *topic, JsonDocument &doc)
{
    String cmd = doc["cmd"] | "";
    String device = doc["device"] | "";
    String action = doc["action"] | "";
    const char *requestId = doc["request_id"] | "unknown";

    if (cmd != "SET")
        return;

    if (device == "pump")
    {
        bool on = (action == "ON");
        setPump(on);
        publishStatusAck("pump", on, requestId);
    }
    else if (device == "valve")
    {
        bool on = (action == "ON");
        setValve(on);
        publishStatusAck("valve", on, requestId);
    }
}

void mqttCallback(char *topic, byte *payload, unsigned int length)
{
    String incomingTopic(topic);

    StaticJsonDocument<256> doc;
    DeserializationError error = deserializeJson(doc, payload, length);
    if (error)
    {
        return;
    }

    String pumpCmdTopic = String(DEVICE_PREFIX) + "/pump/cmd";
    String valveCmdTopic = String(DEVICE_PREFIX) + "/valve/cmd";
    String otaCmdTopic = String(DEVICE_PREFIX) + "/device/ota";

    if (incomingTopic == pumpCmdTopic || incomingTopic == valveCmdTopic)
    {
        handleCommand(incomingTopic.c_str(), doc);
        return;
    }

    // schedule set/delete handling
    if (incomingTopic.endsWith("/schedule/set") || incomingTopic.endsWith("/schedule/delete") || incomingTopic.endsWith("/schedule/sync"))
    {
        String base = incomingTopic;
        int idx = base.lastIndexOf("/");
        if (idx > 0)
        {
            base = base.substring(0, idx);
        }

        StaticJsonDocument<512> msg;
        DeserializationError err = deserializeJson(msg, payload, length);
        if (err)
        {
            Serial.print("[SCHEDULE] parse error: ");
            Serial.println(err.c_str());
            return;
        }

        const char *op = msg["op"] | "add";
        const char *id = msg["id"] | "";
        String deviceIdFromMsg = msg["device"] | "";

        if (strcmp(op, "add") == 0)
        {
            DynamicJsonDocument docRoot(2048);
            File f = LittleFS.open("/schedules.json", "r");
            if (f)
            {
                deserializeJson(docRoot, f);
                f.close();
            }
            JsonArray arr = docRoot.as<JsonArray>();
            if (arr.isNull())
            {
                arr = docRoot.to<JsonArray>();
            }

            bool replaced = false;
            for (JsonObject item : arr)
            {
                if (String(item["id"] | "") == String(id))
                {
                    item["time_on"] = msg["time_on"] | "";
                    item["time_off"] = msg["time_off"] | "";
                    item["days"] = msg["days"];
                    item["enabled"] = msg["enabled"] | true;
                    replaced = true;
                    break;
                }
            }

            String deviceId = msg["device"] | "";
            if (deviceId == "")
            {
                int p1 = base.indexOf('/');
                int p2 = base.indexOf('/', p1 + 1);
                if (p1 >= 0 && p2 > p1)
                {
                    deviceId = base.substring(p1 + 1, p2);
                }
            }

            if (!replaced)
            {
                JsonObject newItem = arr.createNestedObject();
                newItem["id"] = id;
                newItem["time_on"] = msg["time_on"] | "";
                newItem["time_off"] = msg["time_off"] | "";
                newItem["days"] = msg["days"];
                newItem["enabled"] = msg["enabled"] | true;
                newItem["device"] = deviceId;
            }
            else
            {
                for (JsonObject item : arr)
                {
                    if (String(item["id"] | "") == String(id))
                    {
                        if (msg["device"] && String(msg["device"].as<const char *>()) != "")
                            item["device"] = msg["device"];
                        else
                            item["device"] = deviceId;
                    }
                }
            }

            File fw = LittleFS.open("/schedules.json", "w");
            if (fw)
            {
                serializeJson(docRoot, fw);
                fw.close();
            }

            StaticJsonDocument<256> ack;
            ack["op"] = "add";
            ack["id"] = id;
            ack["status"] = "ok";
            String out;
            serializeJson(ack, out);
            String ackTopic = base + "/ack";
            mqttClient.publish(ackTopic.c_str(), out.c_str());
            return;
        }
        else if (strcmp(op, "delete") == 0)
        {
            DynamicJsonDocument docRoot(2048);
            File f = LittleFS.open("/schedules.json", "r");
            if (f)
            {
                deserializeJson(docRoot, f);
                f.close();
            }
            JsonArray arr = docRoot.as<JsonArray>();
            if (arr.isNull())
            {
                arr = docRoot.to<JsonArray>();
            }

            bool removed = false;
            for (size_t i = 0; i < arr.size(); ++i)
            {
                if (String(arr[i]["id"].as<const char *>()) == String(id))
                {
                    arr.remove(i);
                    removed = true;
                    break;
                }
            }

            File fw = LittleFS.open("/schedules.json", "w");
            if (fw)
            {
                serializeJson(docRoot, fw);
                fw.close();
            }

            StaticJsonDocument<256> ack;
            ack["op"] = "delete";
            ack["id"] = id;
            ack["status"] = "deleted";
            String out;
            serializeJson(ack, out);
            String ackTopic = base + "/ack";
            mqttClient.publish(ackTopic.c_str(), out.c_str());
            return;
        }
    }

    // config set handling
    if (incomingTopic.endsWith("/config/set") || incomingTopic.endsWith("/config/delete"))
    {
        String base = incomingTopic;
        int idx = base.lastIndexOf("/");
        if (idx > 0)
        {
            base = base.substring(0, idx);
        }

        StaticJsonDocument<512> msg;
        DeserializationError err2 = deserializeJson(msg, payload, length);
        if (err2)
        {
            return;
        }

        // handle tank_config (primary/tangki)
        if (msg.containsKey("tank_config"))
        {
            JsonObject t = msg["tank_config"].as<JsonObject>();
            if (t.containsKey("tank_height_cm"))
                tank_height_cm = t["tank_height_cm"].as<int>();
            if (t.containsKey("level_min_cm"))
                level_min_cm = t["level_min_cm"].as<int>();
            if (t.containsKey("pump_on_threshold"))
                pump_on_threshold = t["pump_on_threshold"].as<int>();
            if (t.containsKey("pump_off_threshold"))
                pump_off_threshold = t["pump_off_threshold"].as<int>();
            if (t.containsKey("valve_open_threshold"))
                valve_open_threshold = t["valve_open_threshold"].as<int>();
            // Accept both field names for compatibility
            if (t.containsKey("level_full_primary_cm"))
                level_full_primary_cm = t["level_full_primary_cm"].as<int>();
            else if (t.containsKey("level_full_cm"))
                level_full_primary_cm = t["level_full_cm"].as<int>();
            if (t.containsKey("buzzer_enabled"))
                buzzer_enabled = t["buzzer_enabled"].as<bool>();
        }

        // handle secondary_tank_config (bak mandi)
        if (msg.containsKey("secondary_tank_config"))
        {
            JsonObject s = msg["secondary_tank_config"].as<JsonObject>();
            if (s.containsKey("tank_height_cm"))
                tank_height_secondary_cm = s["tank_height_cm"].as<int>();
            if (s.containsKey("level_full_cm"))
                level_full_secondary_cm = s["level_full_cm"].as<int>();
        }

        // handle wifi_config
        bool wifiChanged = false;
        if (msg.containsKey("wifi_config"))
        {
            JsonObject w = msg["wifi_config"].as<JsonObject>();
            if (w.containsKey("ssid"))
            {
                String s = String((const char *)w["ssid"]);
                if (s != WIFI_SSID)
                {
                    WIFI_SSID = s;
                    wifiChanged = true;
                }
            }
            if (w.containsKey("password"))
            {
                String p = String((const char *)w["password"]);
                if (p != WIFI_PASSWORD)
                {
                    WIFI_PASSWORD = p;
                    wifiChanged = true;
                }
            }
        }

        // persist config
        DynamicJsonDocument confDoc(1024);
        JsonObject root = confDoc.to<JsonObject>();
        JsonObject tankObj = root.createNestedObject("tank_config");
        tankObj["tank_height_cm"] = tank_height_cm;
        tankObj["level_min_cm"] = level_min_cm;
        tankObj["pump_on_threshold"] = pump_on_threshold;
        tankObj["pump_off_threshold"] = pump_off_threshold;
        tankObj["valve_open_threshold"] = valve_open_threshold;
        tankObj["level_full_primary_cm"] = level_full_primary_cm;
        tankObj["buzzer_enabled"] = buzzer_enabled;

        JsonObject secondaryObj = root.createNestedObject("secondary_tank_config");
        secondaryObj["tank_height_cm"] = tank_height_secondary_cm;
        secondaryObj["level_full_cm"] = level_full_secondary_cm;

        JsonObject wifiObj = root.createNestedObject("wifi_config");
        wifiObj["ssid"] = WIFI_SSID;
        wifiObj["password"] = WIFI_PASSWORD;

        File fc = LittleFS.open("/config.json", "w");
        if (fc)
        {
            serializeJson(confDoc, fc);
            fc.close();
        }

        StaticJsonDocument<256> ack2;
        ack2["op"] = "config";
        ack2["status"] = "ok";
        String out2;
        serializeJson(ack2, out2);
        String ackTopic2 = base + "/ack";
        mqttClient.publish(ackTopic2.c_str(), out2.c_str());

        // if wifi changed, reconnect
        if (wifiChanged)
        {
            // briefly disconnect MQTT and reconnect WiFi
            mqttClient.disconnect();
            WiFi.disconnect();
            delay(500);
            connectWiFi();
            mqttClient.setServer(MQTT_HOST, MQTT_PORT);
        }

        return;
    }
}

void connectWiFi()
{
    WiFi.mode(WIFI_STA);
    WiFi.begin(WIFI_SSID.c_str(), WIFI_PASSWORD.c_str());

    bool startupMode = startupWifiPending;
    if (!startupMode)
        Serial.print("Menghubungkan WiFi");
    if (startupMode)
    {
        beepBlocking(1000);
    }
    bool ledState = false;
    unsigned long lastBlinkMs = 0;
    while (WiFi.status() != WL_CONNECTED)
    {
        delay(50);
        if (startupMode)
        {
            unsigned long now = millis();
            if (now - lastBlinkMs >= 250)
            {
                lastBlinkMs = now;
                ledState = !ledState;
                writeAllLeds(ledState);
            }
        }
        else
        {
            delay(450);
            Serial.print('.');
        }
    }
    if (startupMode)
    {
        startupWifiPending = false;
        writeAllLeds(false);
        updateLeds();
        Serial.print("Menghubungkan WiFi");
    }
    Serial.println();
    Serial.print("WiFi tersambung. IP: ");
    Serial.println(WiFi.localIP());
}

void connectMqtt()
{
    if (mqttClient.connected())
        return;

    if (millis() - lastReconnectAttemptMs < RECONNECT_INTERVAL_MS)
        return;
    lastReconnectAttemptMs = millis();

    String clientId = buildClientId();
    Serial.print("[MQTT] Menghubungkan sebagai ");
    Serial.println(clientId);

    if (mqttClient.connect(clientId.c_str(), MQTT_USERNAME, MQTT_PASSWORD))
    {
        Serial.println("[MQTT] Terhubung!");
        String pumpCmdTopic = String(DEVICE_PREFIX) + "/pump/cmd";
        String valveCmdTopic = String(DEVICE_PREFIX) + "/valve/cmd";
        String otaCmdTopic = String(DEVICE_PREFIX) + "/device/ota";

        mqttClient.subscribe(pumpCmdTopic.c_str());
        mqttClient.subscribe(valveCmdTopic.c_str());
        mqttClient.subscribe(otaCmdTopic.c_str());
        String scheduleTopic1 = String(DEVICE_PREFIX) + "/+/schedule/set";
        String scheduleTopic2 = String("device/") + "+/schedule/set";
        mqttClient.subscribe(scheduleTopic1.c_str());
        mqttClient.subscribe(scheduleTopic2.c_str());
        String scheduleDel1 = String(DEVICE_PREFIX) + "/+/schedule/delete";
        String scheduleDel2 = String("device/") + "+/schedule/delete";
        mqttClient.subscribe(scheduleDel1.c_str());
        mqttClient.subscribe(scheduleDel2.c_str());
        // subscribe to config updates
        String configSet1 = String(DEVICE_PREFIX) + "/+/config/set";
        String configSet2 = String("device/") + "+/config/set";
        String configDel1 = String(DEVICE_PREFIX) + "/+/config/delete";
        String configDel2 = String("device/") + "+/config/delete";
        mqttClient.subscribe(configSet1.c_str());
        mqttClient.subscribe(configSet2.c_str());
        mqttClient.subscribe(configDel1.c_str());
        mqttClient.subscribe(configDel2.c_str());

        publishTelemetry();
        updateLeds();
    }
    else
    {
        Serial.print("[MQTT] Gagal, rc=");
        Serial.println(mqttClient.state());
    }
}

void setupPins()
{
    pinMode(RELAY_PUMP_PIN, OUTPUT);
    pinMode(RELAY_VALVE_PIN, OUTPUT);
    pinMode(TRIG_PRIMARY_PIN, OUTPUT);
    pinMode(ECHO_PRIMARY_PIN, INPUT);
    pinMode(TRIG_MIN_PIN, OUTPUT);
    pinMode(ECHO_MIN_PIN, INPUT);
    pinMode(LED_GREEN1_PIN, OUTPUT);
    pinMode(LED_RED1_PIN, OUTPUT);
    if (ENABLE_UART_LED_PINS)
    {
        pinMode(LED_GREEN2_PIN, OUTPUT);
        pinMode(LED_RED2_PIN, OUTPUT);
    }
    pinMode(BUZZER_PIN, OUTPUT);

    digitalWrite(BUZZER_PIN, BUZZER_ACTIVE_HIGH ? LOW : HIGH);
    writeRelay(RELAY_PUMP_PIN, false);
    writeRelay(RELAY_VALVE_PIN, false);
    updateLeds();
}

void setup()
{
    Serial.begin(115200);
    delay(300);

    Serial.println(DEVICE_UUID);
    Serial.print("[SETUP] Chip ID: ");
    Serial.println(String(ESP.getChipId(), HEX));

    setupPins();
    if (!LittleFS.begin())
    {
        Serial.println("LittleFS mount failed");
    }
    // load persisted config if available
    if (LittleFS.exists("/config.json"))
    {
        File f = LittleFS.open("/config.json", "r");
        if (f)
        {
            DynamicJsonDocument conf(1024);
            DeserializationError err = deserializeJson(conf, f);
            if (!err)
            {
                JsonObject root = conf.as<JsonObject>();
                if (root.containsKey("tank_config"))
                {
                    JsonObject t = root["tank_config"].as<JsonObject>();
                    tank_height_cm = t["tank_height_cm"] | tank_height_cm;
                    level_min_cm = t["level_min_cm"] | level_min_cm;
                    pump_on_threshold = t["pump_on_threshold"] | pump_on_threshold;
                    pump_off_threshold = t["pump_off_threshold"] | pump_off_threshold;
                    valve_open_threshold = t["valve_open_threshold"] | valve_open_threshold;
                    // Accept both field names for compatibility
                    if (t.containsKey("level_full_primary_cm"))
                        level_full_primary_cm = t["level_full_primary_cm"];
                    else if (t.containsKey("level_full_cm"))
                        level_full_primary_cm = t["level_full_cm"];
                    buzzer_enabled = t["buzzer_enabled"] | buzzer_enabled;
                }
                if (root.containsKey("secondary_tank_config"))
                {
                    JsonObject s = root["secondary_tank_config"].as<JsonObject>();
                    tank_height_secondary_cm = s["tank_height_cm"] | tank_height_secondary_cm;
                    level_full_secondary_cm = s["level_full_cm"] | level_full_secondary_cm;
                }
                if (root.containsKey("wifi_config"))
                {
                    JsonObject w = root["wifi_config"].as<JsonObject>();
                    WIFI_SSID = String((const char *)(w["ssid"] | WIFI_SSID.c_str()));
                    WIFI_PASSWORD = String((const char *)(w["password"] | WIFI_PASSWORD.c_str()));
                }
            }
            f.close();
        }
    }
    configTime(GMT_OFFSET_SEC, DAYLIGHT_OFFSET_SEC, NTP_SERVER);
    connectWiFi();

    secureClient.setInsecure();
    mqttClient.setServer(MQTT_HOST, MQTT_PORT);
    mqttClient.setBufferSize(512);
    mqttClient.setCallback(mqttCallback);

    Serial.println("[SETUP] Selesai!");
}

// Simple schedule executor: run actions when current time matches schedule time_on
struct LastRun
{
    String id;
    int day;
};
std::vector<LastRun> lastRuns;

int weekdayIndex(const String &dayKey)
{
    // map mon..sun to 1..0 (tm_wday: 0=Sun)
    if (dayKey == "sun")
        return 0;
    if (dayKey == "mon")
        return 1;
    if (dayKey == "tue")
        return 2;
    if (dayKey == "wed")
        return 3;
    if (dayKey == "thu")
        return 4;
    if (dayKey == "fri")
        return 5;
    if (dayKey == "sat")
        return 6;
    return -1;
}

bool wasRunToday(const String &id, int today)
{
    for (auto &r : lastRuns)
    {
        if (r.id == id)
            return r.day == today;
    }
    return false;
}

void markRunToday(const String &id, int today)
{
    for (auto &r : lastRuns)
    {
        if (r.id == id)
        {
            r.day = today;
            return;
        }
    }
    LastRun nr;
    nr.id = id;
    nr.day = today;
    lastRuns.push_back(nr);
}

uint16_t getSecondaryHeightCm()
{
    if (state.levelSecondaryCm > 0 && state.levelSecondaryCm <= (uint16_t)tank_height_secondary_cm)
        return tank_height_secondary_cm - state.levelSecondaryCm;
    return 0;
}

void runSchedules()
{
    time_t now = time(nullptr);
    if (now <= 0)
        return;
    struct tm *tm = localtime(&now);
    int hour = tm->tm_hour;
    int minute = tm->tm_min;
    int today = tm->tm_wday;

    File f = LittleFS.open("/schedules.json", "r");
    if (!f)
        return;
    DynamicJsonDocument docRoot(2048);
    DeserializationError err = deserializeJson(docRoot, f);
    f.close();
    if (err)
        return;
    JsonArray arr = docRoot.as<JsonArray>();
    for (JsonObject item : arr)
    {
        bool enabled = item["enabled"] | true;
        if (!enabled)
            continue;
        const char *id = item["id"] | "";
        const char *timeOnStr = item["time_on"] | "";   // expect HH:MM
        const char *timeOffStr = item["time_off"] | ""; // expect HH:MM
        JsonArray days = item["days"];
        const char *deviceField = item["device"] | "";
        if (!timeOnStr || !timeOffStr)
            continue;
        int thOn = 0, tmnOn = 0;
        int thOff = 0, tmnOff = 0;
        if (sscanf(timeOnStr, "%d:%d", &thOn, &tmnOn) != 2)
            continue;
        if (sscanf(timeOffStr, "%d:%d", &thOff, &tmnOff) != 2)
            continue;

        bool okDay = false;
        for (JsonVariant dv : days)
        {
            String dk = String((const char *)dv.as<const char *>());
            int di = weekdayIndex(dk);
            if (di == today)
            {
                okDay = true;
                break;
            }
        }
        if (!okDay)
            continue;

        if (thOn == hour && tmnOn == minute)
        {
            String trackIdOn = String(id) + "_on";
            if (!wasRunToday(trackIdOn, today))
            {
                String dev(deviceField);
                if (dev == "pump")
                    setPump(true);
                else if (dev == "valve")
                {
                    uint16_t secondaryHeight = getSecondaryHeightCm();
                    bool secondaryReadingValid = state.levelSecondaryCm > 0 && state.levelSecondaryCm <= (uint16_t)tank_height_secondary_cm;
                    if (secondaryReadingValid && secondaryHeight <= (uint16_t)valve_open_threshold)
                        setValve(true);
                }
                else
                    setPump(true);
                markRunToday(trackIdOn, today);
            }
        }

        if (thOff == hour && tmnOff == minute)
        {
            String trackIdOff = String(id) + "_off";
            if (!wasRunToday(trackIdOff, today))
            {
                String dev(deviceField);
                if (dev == "pump")
                    setPump(false);
                else if (dev == "valve")
                    setValve(false);
                else
                    setPump(false);
                markRunToday(trackIdOff, today);
            }
        }
    }
}

void loop()
{
    // Maintain WiFi connection
    if (WiFi.status() != WL_CONNECTED)
    {
        connectWiFi();
    }

    // Maintain MQTT connection
    if (!mqttClient.connected())
    {
        connectMqtt();
    }
    else
    {
        mqttClient.loop();
    }

    unsigned long now = millis();

    // Poll sensors setiap 5 detik
    if (now - lastPollSensorMs >= POLL_SENSOR_INTERVAL_MS)
    {
        lastPollSensorMs = now;
        pollSensors();
        publishLevelSensor();
        publishLevelSensor2();
        publishMinimumAlert();

        // Auto-OFF relays if tanks are full (safety check every poll cycle)
        if (state.pumpOn && state.levelPrimaryFull)
        {
            runFullLevelAlarm(true);
            setPump(false, false);
        }
        if (state.valveOn && state.levelSecondaryFull)
        {
            runFullLevelAlarm(false);
            setValve(false, false);
        }
    }

    // Publish telemetry lengkap setiap 10 detik
    if (now - lastTelemetryMs >= TELEMETRY_INTERVAL_MS)
    {
        lastTelemetryMs = now;
        publishTelemetry();
    }

    // Update LED status setiap loop
    updateLeds();

    // check schedules periodically
    if (now - lastScheduleCheckMs >= SCHEDULE_CHECK_INTERVAL_MS)
    {
        lastScheduleCheckMs = now;
        runSchedules();
    }

    // Update buzzer auto-off
    updateBuzzer();
}