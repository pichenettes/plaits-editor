// Copyright 2022 Emilie Gillet.
//
// Author: Emilie Gillet (emilie.o.gillet@gmail.com)
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
// 
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
// 
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.
// 
// See http://creativecommons.org/licenses/MIT/ for more information.
//
// -----------------------------------------------------------------------------
//
// Wavetable oscillator.

class WavetableProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.running = true;
    this.wavetable = null;
    this.map = null;
    
    this.xLP = null;
    this.yLP = null;

    this.phase = 0.0;
    this.port.onmessage = (event) => {
      // AudioWorkletProcessor can't have custom methods. Oh well...
      if (event.data[0] == 'stop') {
        this.running = false;
      } else if (event.data[0] == 'setWavetable') {
        this.wavetable = event.data[1];
      } else if (event.data[0] == 'setMap') {
        this.map = event.data[1];
      }
    }
    this.previous = 0.0;
    this.outLP = 0.0;
  }
  
  readWave(x, y, phase) {
    if (!this.wavetable || !this.map) {
      return 0.0;
    }
    const size = 128;
    const phaseI = Math.floor(phase * size);
    const phaseF = phase * size - phaseI;
    const table = this.wavetable;
    const i = phaseI + this.map[x + y * 8] * (size + 4);
    
    const xm1 = table[i];
    const x0 = table[i + 1];
    const x1 = table[i + 2];
    const x2 = table[i + 3];
    const c = (x1 - xm1) * 0.5;
    const v = x0 - x1;
    const w = c + v;
    const a = w + v + (x2 - x0) * 0.5;
    const b_neg = w + a;
    const f = phaseF;
    return (((a * f) - b_neg) * f + c) * f + x0;
  }
  
  
  process(inputs, outputs, parameters) {
    const output = outputs[0];
    const numChannels = output.length;
    const size = output[0].length;
    
    const frequency = parameters['frequency'][0];
    const x = parameters['x'][0] * 6.999;
    const y = parameters['y'][0] * 6.999;
    
    if (this.xLP === null) this.xLP = x;
    if (this.yLP === null) this.yLP = y;
    
    for (let i = 0; i < size; ++i) {
      this.phase += frequency;
      if (this.phase >= 1.0) {
        this.phase -= 1.0;
      }
      
      const gain = 1.0 / (frequency * 131072.0) * (0.95 - frequency);
      const cutoff = Math.min(128 * frequency, 1.0);
      
      this.xLP += (x - this.xLP) * 0.001;
      this.yLP += (y - this.yLP) * 0.001;
      
      const x0 = Math.floor(this.xLP);
      const xF = this.xLP - x0;
      const x1 = x0 + 1;

      const y0 = Math.floor(this.yLP);
      const yF = this.yLP - y0;
      const y1 = y0 + 1;
      
      const x0y0 = this.readWave(x0, y0, this.phase);
      const x1y0 = this.readWave(x1, y0, this.phase);
      const xy0 = x0y0 + (x1y0 - x0y0) * xF;
      
      const x0y1 = this.readWave(x0, y1, this.phase);
      const x1y1 = this.readWave(x1, y1, this.phase);
      const xy1 = x0y1 + (x1y1 - x0y1) * xF;
      
      const xy = xy0 + (xy1 - xy0) * yF;
      this.outLP += ((xy - this.previous) - this.outLP) * cutoff;
      this.previous = xy;
      for (let j = 0; j < numChannels; ++j) {
        output[j][i] = this.outLP * gain;
      }
    }
    return this.running;
  }
  
  static get parameterDescriptors() {
    return [
      {
        name: 'frequency',
        defaultValue: 0.01,
        minValue: 0.0,
        maxValue: 0.5,
        automationRate: 'k-rate'
      },
      {
        name: 'x',
        defaultValue: 0.0,
        minValue: 0.0,
        maxValue: 1.0,
        automationRate: 'k-rate'
      },
      {
        name: 'y',
        defaultValue: 0.0,
        minValue: 0.0,
        maxValue: 1.0,
        automationRate: 'k-rate'
      }];
    }
  
}

registerProcessor('wavetable_processor', WavetableProcessor)
