#pragma once
#include <cstdint>
#include <cstdio>
#include <initializer_list>
#include <vector>
#include <string>
#include <deque>
constexpr int HIGH=1,LOW=0,INPUT=0,OUTPUT=1,INPUT_PULLUP=2;
constexpr double PI=3.14159265358979323846;
extern uint32_t simNow; extern int pins[40];
struct Edge{int pin;int value;uint32_t time;};extern std::vector<Edge> edges;
inline uint32_t micros(){return simNow;}
inline void pinMode(int,int){}
inline int digitalRead(int pin){return pins[pin];}
inline void digitalWrite(int pin,int value){if(pins[pin]!=value)edges.push_back({pin,value,simNow});pins[pin]=value;}
struct FakeSerial {std::deque<char> q; void begin(int){};void print(const char*){};void println(const char*){};template<class...T>void printf(const char*,T...){};int available(){return q.size();}int read(){char c=q.front();q.pop_front();return c;}};extern FakeSerial Serial;
