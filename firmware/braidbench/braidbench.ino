// Braidbench: low-speed bench prototype. Original ESP32-WROOM pin map.
// No claim of hardware qualification. Physical stop MUST interrupt motor power.
#include <Arduino.h>
#include <math.h>
#include <stdlib.h>
#include <string.h>

constexpr bool MECHANICS_QUALIFIED = false;
constexpr uint8_t DRIVE_STEP=25, DRIVE_DIR=26, FEED_STEP=27, FEED_DIR=14, ENABLE_N=13;
constexpr uint8_t START_BUTTON=32, STOP_NC=33, GUARD_NC=34, ESTOP_NC=35;
constexpr double MOTOR_STEPS=200.0, MICROSTEPS=8.0, REDUCTION=2.0;
constexpr double CAPSTAN_DIAMETER_MM=40.0; // Measure effective sleeved diameter under load.
constexpr double ACCEL_ROTOR_RPM_PER_S=.5;
constexpr uint32_t MIN_PULSE_US=4, LOOP_STALL_US=50000;
struct Axis { uint8_t pin; double phase=0; bool high=false; uint32_t rise=0, fall=0; };
Axis drive{DRIVE_STEP}, feed{FEED_STEP};
bool armed=false, running=false, fault=true, previousStart=false;
double requestedRPM=1, feedPerRev=25, actualRPM=0;
uint32_t lastLoop=0;
char line[80]; size_t lineLength=0; bool lineOverflow=false;

bool contactsClosed() { return digitalRead(STOP_NC)==LOW && digitalRead(GUARD_NC)==LOW && digitalRead(ESTOP_NC)==LOW; }
void stopMotion(const char* reason, bool latch) {
  running=armed=false; actualRPM=0; drive.phase=feed.phase=0;
  digitalWrite(ENABLE_N,HIGH); digitalWrite(DRIVE_STEP,LOW); digitalWrite(FEED_STEP,LOW);
  drive.high=feed.high=false; if(latch)fault=true;
  Serial.print("DISABLED: "); Serial.println(reason);
}
void armMotion() {
  if(!MECHANICS_QUALIFIED) { Serial.println("ARM refused: mechanism qualification flag is false"); return; }
  if(fault || !contactsClosed()) { Serial.println("ARM refused: close contacts and RESET fault"); return; }
  if(running) { Serial.println("Already running"); return; }
  drive.phase=feed.phase=0; digitalWrite(DRIVE_DIR,HIGH); digitalWrite(FEED_DIR,HIGH);
  digitalWrite(ENABLE_N,LOW); armed=true; Serial.println("ARMED; no motion until RUN or START");
}
void startMotion() {
  if(!armed || fault || !contactsClosed()) { Serial.println("RUN refused: not armed or input open"); return; }
  running=true; Serial.println("RUNNING");
}
void command(char* text) {
  if(!strcmp(text,"STOP")) { stopMotion("operator STOP",false); return; }
  if(!strcmp(text,"STATUS")) { Serial.printf("armed=%d running=%d fault=%d rpm=%.2f feed_mm_rev=%.2f\n",armed,running,fault,requestedRPM,feedPerRev); return; }
  if(!strcmp(text,"RESET")) { stopMotion("RESET",false); if(contactsClosed()){fault=false;Serial.println("Fault cleared; ARM required");}else{fault=true;Serial.println("RESET refused: an NC input is open");} return; }
  if(!strcmp(text,"ARM")) { armMotion(); return; }
  if(!strncmp(text,"RUN ",4)) {
    if(running) { Serial.println("STOP before changing feed ratio"); return; }
    char* end; const double rpm=strtod(text+4,&end); if(end==text+4) {Serial.println("Use RUN rpm mm_per_rev");return;}
    char* second=end; const double mm=strtod(second,&end);
    while(*end==' ' || *end=='\t')++end;
    if(end==second || *end || !isfinite(rpm) || !isfinite(mm) || rpm<.2 || rpm>5 || mm<1 || mm>100) { Serial.println("Invalid RUN: rpm 0.2..5; mm/rev 1..100"); return; }
    requestedRPM=rpm;feedPerRev=mm;startMotion();return;
  }
  Serial.println("Commands: RESET, ARM, RUN rpm mm_per_rev, STOP, STATUS");
}
void tickAxis(Axis& a,double rate,double dt,uint32_t now) {
  if(a.high && uint32_t(now-a.rise)>=MIN_PULSE_US) {digitalWrite(a.pin,LOW);a.high=false;a.fall=now;}
  a.phase+=rate*dt;
  if(a.phase>=2) {stopMotion("pulse scheduler fell behind",true);return;}
  if(a.phase>=1 && !a.high && uint32_t(now-a.fall)>=MIN_PULSE_US) {digitalWrite(a.pin,HIGH);a.high=true;a.rise=now;a.phase-=1;}
}
void setup() {
  digitalWrite(ENABLE_N,HIGH);pinMode(ENABLE_N,OUTPUT);
  for(uint8_t pin:{DRIVE_STEP,DRIVE_DIR,FEED_STEP,FEED_DIR}) {digitalWrite(pin,LOW);pinMode(pin,OUTPUT);}
  pinMode(START_BUTTON,INPUT_PULLUP);pinMode(STOP_NC,INPUT_PULLUP);
  pinMode(GUARD_NC,INPUT);pinMode(ESTOP_NC,INPUT); // External 10k pull-ups required.
  Serial.begin(115200);previousStart=digitalRead(START_BUTTON)==LOW;lastLoop=micros();
  Serial.println("Braidbench disabled at boot. Check mechanism / inputs, RESET, ARM.");
}
void loop() {
  const uint32_t now=micros(), elapsed=now-lastLoop;lastLoop=now;
  if(!contactsClosed()) {if(!fault || armed || running)stopMotion("NC input open",true);}
  if(elapsed>LOOP_STALL_US && running)stopMotion("control-loop stall",true);
  const bool startPressed=digitalRead(START_BUTTON)==LOW;
  if(startPressed && !previousStart)startMotion();
  previousStart=startPressed;
  // Bounded input work prevents a continuous serial stream starving STEP timing.
  for(int budget=0;budget<8 && Serial.available();++budget) {
    const char c=char(Serial.read());
    if(c=='\r')continue;
    if(c=='\n') {if(!lineOverflow){line[lineLength]='\0';command(line);}else{Serial.println("Command too long; discarded");}lineLength=0;lineOverflow=false;}
    else if(lineLength<sizeof(line)-1 && !lineOverflow)line[lineLength++]=c;
    else lineOverflow=true;
  }
  if(!running)return;
  const double dt=elapsed*1e-6;
  actualRPM=fmin(requestedRPM,actualRPM+ACCEL_ROTOR_RPM_PER_S*dt);
  const double motorPulses=MOTOR_STEPS*MICROSTEPS;
  tickAxis(drive,actualRPM*REDUCTION*motorPulses/60.0,dt,now);
  if(running)tickAxis(feed,actualRPM*feedPerRev*motorPulses/(60.0*PI*CAPSTAN_DIAMETER_MM),dt,now);
}
