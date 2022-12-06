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
// Wave terrain oscillator.

class WaveTerrainProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.running = true;
    this.terrain = null;

    this.phase = 0.0;
    this.radiusLP = null;
    this.offsetLP = null;
    
    this.port.onmessage = (event) => {
      // AudioWorkletProcessor can't have custom methods. Oh well...
      if (event.data[0] == 'stop') {
        this.running = false;
      } else if (event.data[0] == 'setTerrain') {
        this.terrain = event.data[1];
      }
    }
  }
  
  lookup(x, y) {
    if (!this.terrain) {
      return 0.0;
    }
    const W = 64;
    const valueScale = 1.0 / 128.0;
    const coordScale = (W - 2) * 0.5;

    x = (x + 1.0) * coordScale;
    y = (y + 1.0) * coordScale;
    
    const xI = Math.floor(x);
    const xF = x - xI;
    const yI = Math.floor(y);
    const yF = y - yI;
    
    const z = this.terrain;
    let i = yI * W + xI;

    const z0 = z[i] + (z[i + 1] - z[i]) * xF;
    i += W;
    const z1 = z[i] + (z[i + 1] - z[i]) * xF;
    return (z0 + (z1 - z0) * yF) * valueScale;
  }
  
  process(inputs, outputs, parameters) {
    const output = outputs[0];
    const numChannels = output.length;
    const size = output[0].length;
    
    const frequency = parameters['frequency'][0];
    const radius = parameters['radius'][0];
    const offset = parameters['offset'][0];
    const aux = parameters['aux'][0];
    
    if (this.radiusLP === null) this.radiusLP = radius;
    if (this.offsetLP === null) this.offsetLP = offset;
    
    for (let i = 0; i < size; ++i) {
      this.radiusLP += (radius - this.radiusLP) * 0.001;
      this.offsetLP += (offset - this.offsetLP) * 0.001;
      
      this.phase += frequency;
      if (this.phase >= 1.0) {
        this.phase -= 1.0;
      }
      
      const phi = 2 * this.phase * Math.PI;
      let x = Math.sin(phi) * this.radiusLP;
      let y = Math.cos(phi) * this.radiusLP;
      x = x * (1.0 - Math.abs(this.offsetLP)) + this.offsetLP;
      
      const z = this.lookup(x, y);
      const s = Math.sin(Math.PI * (y + z));
      
      for (let j = 0; j < numChannels; ++j) {
        output[j][i] = z + (s - z) * aux;
      }
    }
    return this.running;
  }
  
  static get parameterDescriptors() {
    return [
      {
        name: 'aux',
        defaultValue: 0.0,
        minValue: 0.0,
        maxValue: 1.0,
        automationRate: 'k-rate'
      },
      {
        name: 'frequency',
        defaultValue: 0.01,
        minValue: 0.0,
        maxValue: 0.5,
        automationRate: 'k-rate'
      },
      {
        name: 'offset',
        defaultValue: 0.0,
        minValue: -1.0,
        maxValue: 1.0,
        automationRate: 'k-rate'
      },
      {
        name: 'radius',
        defaultValue: 0.5,
        minValue: 0.0,
        maxValue: 1.0,
        automationRate: 'k-rate'
      }];
    }
  
}

registerProcessor('waveterrain_processor', WaveTerrainProcessor)
