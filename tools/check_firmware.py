#!/usr/bin/env python3
from pathlib import Path
import subprocess,tempfile,json
root=Path(__file__).resolve().parents[1]
source=(root/'firmware/braidbench/braidbench.ino').read_text()
results=[]
with tempfile.TemporaryDirectory(prefix='braidbench-firmware-') as temp:
 t=Path(temp)
 for name in ['Arduino.h','check.cpp']:(t/name).write_text((root/'tools/firmware_test'/name).read_text())
 for qualified in [False,True]:
  (t/'sketch.ino').write_text(source.replace('MECHANICS_QUALIFIED = false','MECHANICS_QUALIFIED = true') if qualified else source)
  subprocess.run(['g++','-std=c++17','-Wall','-Wextra','-Werror',*(['-DQUALIFIED'] if qualified else []),'-I'+str(t),str(t/'check.cpp'),'-o',str(t/'check')],check=True)
  result=subprocess.check_output([str(t/'check')],text=True).strip();results.append(result);print(result)
(root/'docs/firmware-validation.json').write_text(json.dumps({'toolchain':'g++ C++17 with Arduino GPIO/time/serial stubs; NOT the ESP32 core','results':results,'hardware_run':False,'ESP32_compilation':False,'qualification_flag_as_shipped':False},indent=2)+'\n')
