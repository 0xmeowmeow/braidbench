#include "Arduino.h"
#include <cassert>
#include <cmath>
#include <algorithm>
uint32_t simNow=0;int pins[40];std::vector<Edge> edges;FakeSerial Serial;
#include "sketch.ino"
void cmd(const char* s){char b[80];snprintf(b,80,"%s",s);command(b);}
int main(){std::fill(pins,pins+40,HIGH);pins[33]=pins[34]=pins[35]=LOW;setup();assert(pins[13]==HIGH);cmd("ARM");assert(!armed);cmd("RESET");cmd("ARM");
#ifndef QUALIFIED
assert(!armed);puts("Default qualification lock: PASS");return 0;
#else
assert(armed && !running);cmd("RUN nan 25");assert(!running);cmd("RUN 1 25 extra");assert(!running);cmd("RUN 1 25");assert(running);
for(int i=0;i<100000;++i){simNow+=100;loop();}assert(running && !fault);
int driveCount=0,feedCount=0;uint32_t lastEdge[40]={0};bool seen[40]={false};
for(auto e:edges){if(e.pin==25||e.pin==27){if(seen[e.pin])assert(e.time-lastEdge[e.pin]>=4);seen[e.pin]=true;lastEdge[e.pin]=e.time;if(e.value){if(e.pin==25)driveCount++;else feedCount++;}}}
assert(abs(driveCount-480)<=2);assert(abs(feedCount-47)<=2);
pins[35]=HIGH;simNow+=100;loop();assert(fault&&!running&&!armed&&pins[13]==HIGH);pins[35]=LOW;simNow+=100;loop();assert(fault&&!running);cmd("ARM");assert(!armed);cmd("RESET");cmd("ARM");cmd("RUN 1 25");assert(running);simNow+=60000;loop();assert(fault&&!running&&pins[13]==HIGH);
cmd("RESET");cmd("ARM");cmd("RUN 1 25");cmd("STOP");assert(!running&&!armed&&pins[13]==HIGH);printf("Qualified stub: PASS; pulses drive=%d feed=%d; NC latch, explicit rearm, stall and STOP verified\n",driveCount,feedCount);
#endif
}
