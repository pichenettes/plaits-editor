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
// DX7-compatible six op FM synth.



// Conversion from DX7 patch values to usable units.

const DXUnits = { };

DXUnits.lutCoarse = [
 -12.000000,  0.000000, 12.000000, 19.019550,
  24.000000, 27.863137, 31.019550, 33.688259,
  36.000000, 38.039100, 39.863137, 41.513180,
  43.019550, 44.405276, 45.688259, 46.882687,
  48.000000, 49.049554, 50.039100, 50.975130,
  51.863137, 52.707809, 53.513180, 54.282743,
  55.019550, 55.726274, 56.405276, 57.058650,
  57.688259, 58.295772, 58.882687, 59.450356 ];

DXUnits.lutAmpModSensitivity = [ 0.0, 0.2588, 0.4274, 1.0 ];

DXUnits.lutPitchModSensitivity = [
  0.0000000, 0.0781250, 0.1562500, 0.2578125,
  0.4296875, 0.7187500, 1.1953125, 2.0000000 ];

DXUnits.operatorLevel = function(level) {
  let tlc = level;
  if (level < 20) {
    tlc = tlc < 15 ? (tlc * (36 - tlc)) >> 3 : 27 + tlc;
  } else {
    tlc += 28;
  }
  return tlc;
}

DXUnits.pitchEnvelopeLevel = function(level) {
  const l = (level - 50.0) / 32.0;
  const tail = Math.max(Math.abs(l + 0.02) - 1.0, 0.0);
  return l * (1.0 + tail * tail * 5.3056);
}

DXUnits.operatorEnvelopeIncrement = function(rate) {
  const rateScaled = (rate * 41) >> 6;
  const mantissa = 4 + (rateScaled & 3);
  const exponent = 2 + (rateScaled >> 2);
  return (mantissa << exponent) / (1 << 24);
}

DXUnits.pitchEnvelopeIncrement = function(rate) {
  const r = rate * 0.01;
  return (1.0 + 192.0 * r * (r * r * r * r + 0.3333)) / (21.3 * 44100.0);
}

DXUnits.minLFOFrequency = 0.005865;

DXUnits.LFOFrequency = function(rate) {
  let rateScaled = rate == 0 ? 1 : (rate * 165) >> 6;
  rateScaled *= rateScaled < 160 ? 11 : (11 + ((rateScaled - 160) >> 4));
  return rateScaled * DXUnits.minLFOFrequency;
}

DXUnits.LFODelay = function(delay) {
  const increments = [0.0, 0.0];
  if (delay == 0) {
    increments[0] = increments[1] = 100000.0;
  } else {
    let d = 99 - delay;
    d = (16 + (d & 15)) << (1 + (d >> 4));
    increments[0] = d * DXUnits.minLFOFrequency;
    increments[1] = Math.max(0x80, d & 0xff80) * DXUnits.minLFOFrequency;
  }
  return increments;
}

DXUnits.normalizeVelocity = function(velocity) {
  return 16.0 * (Math.pow(velocity, 1 / 3.0) - 0.918);
}

DXUnits.rateScaling = function(note, rateScaling) {
  return Math.pow(2.0, rateScaling * (note * 0.333 - 7.0) * 0.03125);
}

DXUnits.ampModSensitivity = function(ampMS) {
  return DXUnits.lutAmpModSensitivity[ampMS];
}

DXUnits.pitchModSensitivity = function(pitchMS) {
  return DXUnits.lutPitchModSensitivity[pitchMS];
}

DXUnits.keyboardScaling = function(note, ks) {
  const x = note - ks.breakpoint - 15.0;
  const curve = x > 0.0 ? ks.rightCurve : ks.leftCurve;

  let t = Math.abs(x);
  if (curve == 1 || curve == 2) {
    t = Math.min(t * 0.010467, 1.0);
    t = t * t * t;
    t *= 96.0;
  }
  if (curve < 2) {
    t = -t;
  }

  const depth = x > 0.0 ? ks.rightDepth : ks.leftDepth;
  return t * depth * 0.02677;
}

DXUnits.frequencyRatio = function(op) {
  const detune = op.mode == 0 && op.fine ? 1.0 + 0.01 * op.fine : 1.0;

  let base = op.mode == 0
      ? DXUnits.lutCoarse[op.coarse]
      : ((op.coarse & 3) * 100 + op.fine) * 0.39864;
  base += (op.detune - 7.0) * 0.015;
  return Math.pow(2, base / 12.0) * detune;
}

// DX7 patch

class DXPatch {
  constructor(data) {
    this.op = Array(6);
    for (let i = 0; i < 6; i++) {
      const op = { };
      const opData = data.slice(i * 17);

      op.envelope = { rate: Array(4), level: Array(4) };
      for (let j = 0; j < 4; j++) {
        op.envelope.rate[j] = Math.min(opData[j] & 0x7f, 99);
        op.envelope.level[j] = Math.min(opData[4 + j] & 0x7f, 99);
      }

      op.keyboardScaling = { };
      op.keyboardScaling.breakpoint = Math.min(opData[8] & 0x7f, 99);
      op.keyboardScaling.leftDepth = Math.min(opData[9] & 0x7f, 99);
      op.keyboardScaling.rightDepth = Math.min(opData[10] & 0x7f, 99);
      op.keyboardScaling.leftCurve = opData[11] & 0x3;
      op.keyboardScaling.rightCurve = (opData[11] >>> 2) & 0x3;
      op.rateScaling = opData[12] & 0x7;
      op.ampModSensitivity = opData[13] & 0x3;
      op.velocitySensitivity = (opData[13] >>> 2) & 0x7;
      op.level = Math.min(opData[14] & 0x7f, 99);
      op.mode = opData[15] & 0x1;
      op.coarse = (opData[15] >>> 1) & 0x1f;
      op.fine = Math.min(opData[16] & 0x7f, 99);
      op.detune = Math.min((opData[12] >>> 3) & 0xf, 14);
      this.op[i] = op;
    }
    this.pitchEnvelope = { rate: Array(4), level: Array(4) };
    for (let j = 0; j < 4; j++) {
      this.pitchEnvelope.rate[j] = Math.min(data[102 + j] & 0x7f, 99);
      this.pitchEnvelope.level[j] = Math.min(data[106 + j] & 0x7f, 99);
    }
    this.algorithm = data[110] & 0x1f;
    this.feedback = data[111] & 0x7;
    this.resetPhase = (data[111] >>> 3) & 0x1;
    const modulations = { }
    modulations.rate = Math.min(data[112] & 0x7f, 99);
    modulations.delay = Math.min(data[113] & 0x7f, 99);
    modulations.pitchModDepth = Math.min(data[114] & 0x7f, 99);
    modulations.ampModDepth = Math.min(data[115] & 0x7f, 99);
    modulations.resetPhase = data[116] & 0x1;
    modulations.waveform = Math.min((data[116] >>> 1) & 0x7, 5);
    modulations.pitchModSensitivity = data[116] >>> 4;
    this.modulations = modulations;
    this.transpose = Math.min(data[117] & 0x7f, 48);
    this.name = String.fromCharCode.apply(String, data.slice(118, 128));
  }
}

// Operator state.

class Operator {
  constructor() {
    this.reset();
  }
  
  reset() {
    this.phase = 0;
    this.amplitude = 0;
  }
}

// Algorithms.

const Algorithms = { };
Algorithms.renderers = new Map();

// n: number of operators to render (height of the stack)
// modulationSource: -2 for external, -1 for none, n for feedback
Algorithms.renderer = function(n, modulationSource, additive) {
  const key = [n, modulationSource, additive].join('|');
  const r = Algorithms.renderers.get(key);
  if (r) {
    return r;
  }
  
  const f = function(ops, f, a, fbState, fbAmount, modulation, out) {
    const size = out.length;
    const scale = 1.0 / size;
    const amplitudeIncrement = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      amplitudeIncrement[i] = (Math.min(a[i], 4.0) - ops[i].amplitude) * scale;
    }
    const fbScale = fbAmount ? (1 << fbAmount) / 512.0 : 0.0;

    for (let i = 0; i < size; i++) {
      let pm = 0.0;
      if (modulationSource >= 0) {
        pm = (fbState[0] + fbState[1]) * fbScale;
      } else if (modulationSource == -2) {
        pm = modulation[i];
      }
      for (let j = 0; j < n; j++) {
        ops[j].phase += f[j];
        if (ops[j].phase >= 1.0) {
          ops[j].phase - 1.0;
        }
        pm = Math.sin(2 * Math.PI * (ops[j].phase + pm)) * ops[j].amplitude;
        ops[j].amplitude += amplitudeIncrement[j];
        if (j == modulationSource) {
          fbState[1] = fbState[0];
          fbState[0] = pm;
        }
      }
      if (additive) {
        out[i] += pm;
      } else {
        out[i] = pm;
      }
    }
  };
  
  Algorithms.renderers.set(key, f);
  return f;
}

Algorithms.dx7 = [
  // Algorithm 1
  [
    { n: 4, renderFn: Algorithms.renderer(4, 0, true), input: 0, output: 0 },
    { },
    { },
    { },
    { n: 2, renderFn: Algorithms.renderer(2, -1, true), input: 0, output: 0 },
    { },
  ],

  // Algorithm 2
  [
    { n: 4, renderFn: Algorithms.renderer(4, -1, true), input: 0, output: 0 },
    { },
    { },
    { },
    { n: 2, renderFn: Algorithms.renderer(2, 0, true), input: 0, output: 0 },
    { },
  ],

  // Algorithm 3
  [
    { n: 3, renderFn: Algorithms.renderer(3, 0, true), input: 0, output: 0 },
    { },
    { },
    { n: 3, renderFn: Algorithms.renderer(3, -1, true), input: 0, output: 0 },
    { },
    { },
  ],

  // Algorithm 4
  [
    { n: 3, renderFn: Algorithms.renderer(3, 2, true), input: 0, output: 0 },
    { },
    { },
    { n: 3, renderFn: Algorithms.renderer(3, -1, true), input: 0, output: 0 },
    { },
    { },
  ],

  // Algorithm 5
  [
    { n: 2, renderFn: Algorithms.renderer(2, 0, true), input: 0, output: 0 },
    { },
    { n: 2, renderFn: Algorithms.renderer(2, -1, true), input: 0, output: 0 },
    { },
    { n: 2, renderFn: Algorithms.renderer(2, -1, true), input: 0, output: 0 },
    { },
  ],

  // Algorithm 6
  [
    { n: 2, renderFn: Algorithms.renderer(2, 1, true), input: 0, output: 0 },
    { },
    { n: 2, renderFn: Algorithms.renderer(2, -1, true), input: 0, output: 0 },
    { },
    { n: 2, renderFn: Algorithms.renderer(2, -1, true), input: 0, output: 0 },
    { },
  ],

  // Algorithm 7
  [
    { n: 2, renderFn: Algorithms.renderer(2, 0, false), input: 0, output: 1 },
    { },
    { n: 1, renderFn: Algorithms.renderer(1, -1, true), input: 0, output: 1 },
    { n: 1, renderFn: Algorithms.renderer(1, -2, true), input: 1, output: 0 },
    { n: 2, renderFn: Algorithms.renderer(2, -1, true), input: 0, output: 0 },
    { },
  ],

  // Algorithm 8
  [
    { n: 2, renderFn: Algorithms.renderer(2, -1, false), input: 0, output: 1 },
    { },
    { n: 1, renderFn: Algorithms.renderer(1, 0, true), input: 0, output: 1 },
    { n: 1, renderFn: Algorithms.renderer(1, -2, true), input: 1, output: 0 },
    { n: 2, renderFn: Algorithms.renderer(2, -1, true), input: 0, output: 0 },
    { },
  ],

  // Algorithm 9
  [
    { n: 2, renderFn: Algorithms.renderer(2, -1, false), input: 0, output: 1 },
    { },
    { n: 1, renderFn: Algorithms.renderer(1, -1, true), input: 0, output: 1 },
    { n: 1, renderFn: Algorithms.renderer(1, -2, true), input: 1, output: 0 },
    { n: 2, renderFn: Algorithms.renderer(2, 0, true), input: 0, output: 0 },
    { },
  ],

  // Algorithm 10
  [
    { n: 1, renderFn: Algorithms.renderer(1, -1, false), input: 0, output: 1 },
    { n: 1, renderFn: Algorithms.renderer(1, -1, true), input: 0, output: 1 },
    { n: 1, renderFn: Algorithms.renderer(1, -2, true), input: 1, output: 0 },
    { n: 3, renderFn: Algorithms.renderer(3, 0, true), input: 0, output: 0 },
    { },
    { },
  ],

  // Algorithm 11
  [
    { n: 1, renderFn: Algorithms.renderer(1, 0, false), input: 0, output: 1 },
    { n: 1, renderFn: Algorithms.renderer(1, -1, true), input: 0, output: 1 },
    { n: 1, renderFn: Algorithms.renderer(1, -2, true), input: 1, output: 0 },
    { n: 3, renderFn: Algorithms.renderer(3, -1, true), input: 0, output: 0 },
    { },
    { },
  ],

  // Algorithm 12
  [
    { n: 1, renderFn: Algorithms.renderer(1, -1, false), input: 0, output: 1 },
    { n: 1, renderFn: Algorithms.renderer(1, -1, true), input: 0, output: 1 },
    { n: 1, renderFn: Algorithms.renderer(1, -1, true), input: 0, output: 1 },
    { n: 1, renderFn: Algorithms.renderer(1, -2, true), input: 1, output: 0 },
    { n: 2, renderFn: Algorithms.renderer(2, 0, true), input: 0, output: 0 },
    { },
  ],

  // Algorithm 13
  [
    { n: 1, renderFn: Algorithms.renderer(1, 0, false), input: 0, output: 1 },
    { n: 1, renderFn: Algorithms.renderer(1, -1, true), input: 0, output: 1 },
    { n: 1, renderFn: Algorithms.renderer(1, -1, true), input: 0, output: 1 },
    { n: 1, renderFn: Algorithms.renderer(1, -2, true), input: 1, output: 0 },
    { n: 2, renderFn: Algorithms.renderer(2, -1, true), input: 0, output: 0 },
    { },
  ],

  // Algorithm 14
  [
    { n: 1, renderFn: Algorithms.renderer(1, 0, false), input: 0, output: 1 },
    { n: 1, renderFn: Algorithms.renderer(1, -1, true), input: 0, output: 1 },
    { n: 2, renderFn: Algorithms.renderer(2, -2, true), input: 1, output: 0 },
    { },
    { n: 2, renderFn: Algorithms.renderer(2, -1, true), input: 0, output: 0 },
    { },
  ],

  // Algorithm 15
  [
    { n: 1, renderFn: Algorithms.renderer(1, -1, false), input: 0, output: 1 },
    { n: 1, renderFn: Algorithms.renderer(1, -1, true), input: 0, output: 1 },
    { n: 2, renderFn: Algorithms.renderer(2, -2, true), input: 1, output: 0 },
    { },
    { n: 2, renderFn: Algorithms.renderer(2, 0, true), input: 0, output: 0 },
    { },
  ],

  // Algorithm 16
  [
    { n: 2, renderFn: Algorithms.renderer(2, 0, false), input: 0, output: 1 },
    { },
    { n: 2, renderFn: Algorithms.renderer(2, -1, true), input: 0, output: 1 },
    { },
    { n: 1, renderFn: Algorithms.renderer(1, -1, true), input: 0, output: 1 },
    { n: 1, renderFn: Algorithms.renderer(1, -2, true), input: 1, output: 0 }
  ],

  // Algorithm 17
  [
    { n: 2, renderFn: Algorithms.renderer(2, -1, false), input: 0, output: 1 },
    { },
    { n: 2, renderFn: Algorithms.renderer(2, -1, true), input: 0, output: 1 },
    { },
    { n: 1, renderFn: Algorithms.renderer(1, 0, true), input: 0, output: 1 },
    { n: 1, renderFn: Algorithms.renderer(1, -2, true), input: 1, output: 0 }
  ],

  // Algorithm 18
  [
    { n: 3, renderFn: Algorithms.renderer(3, -1, false), input: 0, output: 1 },
    { },
    { },
    { n: 1, renderFn: Algorithms.renderer(1, 0, true), input: 0, output: 1 },
    { n: 1, renderFn: Algorithms.renderer(1, -1, true), input: 0, output: 1 },
    { n: 1, renderFn: Algorithms.renderer(1, -2, true), input: 1, output: 0 }
  ],

  // Algorithm 19
  [
    { n: 1, renderFn: Algorithms.renderer(1, 0, false), input: 0, output: 1 },
    { n: 1, renderFn: Algorithms.renderer(1, -2, true), input: 1, output: 0 },
    { n: 1, renderFn: Algorithms.renderer(1, -2, true), input: 1, output: 0 },
    { n: 3, renderFn: Algorithms.renderer(3, -1, true), input: 0, output: 0 },
    { },
    { },
  ],

  // Algorithm 20
  [
    { n: 1, renderFn: Algorithms.renderer(1, -1, false), input: 0, output: 1 },
    { n: 1, renderFn: Algorithms.renderer(1, -1, true), input: 0, output: 1 },
    { n: 1, renderFn: Algorithms.renderer(1, -2, true), input: 1, output: 0 },
    { n: 1, renderFn: Algorithms.renderer(1, 0, false), input: 0, output: 1 },
    { n: 1, renderFn: Algorithms.renderer(1, -2, true), input: 1, output: 0 },
    { n: 1, renderFn: Algorithms.renderer(1, -2, true), input: 1, output: 0 }
  ],

  // Algorithm 21
  [
    { n: 1, renderFn: Algorithms.renderer(1, -1, false), input: 0, output: 1 },
    { n: 1, renderFn: Algorithms.renderer(1, -2, true), input: 1, output: 0 },
    { n: 1, renderFn: Algorithms.renderer(1, -2, true), input: 1, output: 0 },
    { n: 1, renderFn: Algorithms.renderer(1, 0, false), input: 0, output: 1 },
    { n: 1, renderFn: Algorithms.renderer(1, -2, true), input: 1, output: 0 },
    { n: 1, renderFn: Algorithms.renderer(1, -2, true), input: 1, output: 0 }
  ],

  // Algorithm 22
  [
    { n: 1, renderFn: Algorithms.renderer(1, 0, false), input: 0, output: 1 },
    { n: 1, renderFn: Algorithms.renderer(1, -2, true), input: 1, output: 0 },
    { n: 1, renderFn: Algorithms.renderer(1, -2, true), input: 1, output: 0 },
    { n: 1, renderFn: Algorithms.renderer(1, -2, true), input: 1, output: 0 },
    { n: 2, renderFn: Algorithms.renderer(2, -1, true), input: 0, output: 0 },
    { },
  ],

  // Algorithm 23
  [
    { n: 1, renderFn: Algorithms.renderer(1, 0, false), input: 0, output: 1 },
    { n: 1, renderFn: Algorithms.renderer(1, -2, true), input: 1, output: 0 },
    { n: 1, renderFn: Algorithms.renderer(1, -2, true), input: 1, output: 0 },
    { n: 2, renderFn: Algorithms.renderer(2, -1, true), input: 0, output: 0 },
    { },
    { n: 1, renderFn: Algorithms.renderer(1, -1, true), input: 0, output: 0 }
  ],

  // Algorithm 24
  [
    { n: 1, renderFn: Algorithms.renderer(1, 0, false), input: 0, output: 1 },
    { n: 1, renderFn: Algorithms.renderer(1, -2, true), input: 1, output: 0 },
    { n: 1, renderFn: Algorithms.renderer(1, -2, true), input: 1, output: 0 },
    { n: 1, renderFn: Algorithms.renderer(1, -2, true), input: 1, output: 0 },
    { n: 1, renderFn: Algorithms.renderer(1, -1, true), input: 0, output: 0 },
    { n: 1, renderFn: Algorithms.renderer(1, -1, true), input: 0, output: 0 }
  ],

  // Algorithm 25
  [
    { n: 1, renderFn: Algorithms.renderer(1, 0, false), input: 0, output: 1 },
    { n: 1, renderFn: Algorithms.renderer(1, -2, true), input: 1, output: 0 },
    { n: 1, renderFn: Algorithms.renderer(1, -2, true), input: 1, output: 0 },
    { n: 1, renderFn: Algorithms.renderer(1, -1, true), input: 0, output: 0 },
    { n: 1, renderFn: Algorithms.renderer(1, -1, true), input: 0, output: 0 },
    { n: 1, renderFn: Algorithms.renderer(1, -1, true), input: 0, output: 0 }
  ],

  // Algorithm 26
  [
    { n: 1, renderFn: Algorithms.renderer(1, 0, false), input: 0, output: 1 },
    { n: 1, renderFn: Algorithms.renderer(1, -1, true), input: 0, output: 1 },
    { n: 1, renderFn: Algorithms.renderer(1, -2, true), input: 1, output: 0 },
    { n: 2, renderFn: Algorithms.renderer(2, -1, true), input: 0, output: 0 },
    { },
    { n: 1, renderFn: Algorithms.renderer(1, -1, true), input: 0, output: 0 }
  ],

  // Algorithm 27
  [
    { n: 1, renderFn: Algorithms.renderer(1, -1, false), input: 0, output: 1 },
    { n: 1, renderFn: Algorithms.renderer(1, -1, true), input: 0, output: 1 },
    { n: 1, renderFn: Algorithms.renderer(1, -2, true), input: 1, output: 0 },
    { n: 2, renderFn: Algorithms.renderer(2, 0, true), input: 0, output: 0 },
    { },
    { n: 1, renderFn: Algorithms.renderer(1, -1, true), input: 0, output: 0 }
  ],

  // Algorithm 28
  [
    { n: 1, renderFn: Algorithms.renderer(1, -1, true), input: 0, output: 0 },
    { n: 3, renderFn: Algorithms.renderer(3, 0, true), input: 0, output: 0 },
    { },
    { },
    { n: 2, renderFn: Algorithms.renderer(2, -1, true), input: 0, output: 0 },
    { },
  ],

  // Algorithm 29
  [
    { n: 2, renderFn: Algorithms.renderer(2, 0, true), input: 0, output: 0 },
    { },
    { n: 2, renderFn: Algorithms.renderer(2, -1, true), input: 0, output: 0 },
    { },
    { n: 1, renderFn: Algorithms.renderer(1, -1, true), input: 0, output: 0 },
    { n: 1, renderFn: Algorithms.renderer(1, -1, true), input: 0, output: 0 }
  ],

  // Algorithm 30
  [
    { n: 1, renderFn: Algorithms.renderer(1, -1, true), input: 0, output: 0 },
    { n: 3, renderFn: Algorithms.renderer(3, 0, true), input: 0, output: 0 },
    { },
    { },
    { n: 1, renderFn: Algorithms.renderer(1, -1, true), input: 0, output: 0 },
    { n: 1, renderFn: Algorithms.renderer(1, -1, true), input: 0, output: 0 }
  ],

  // Algorithm 31
  [
    { n: 2, renderFn: Algorithms.renderer(2, 0, true), input: 0, output: 0 },
    { },
    { n: 1, renderFn: Algorithms.renderer(1, -1, true), input: 0, output: 0 },
    { n: 1, renderFn: Algorithms.renderer(1, -1, true), input: 0, output: 0 },
    { n: 1, renderFn: Algorithms.renderer(1, -1, true), input: 0, output: 0 },
    { n: 1, renderFn: Algorithms.renderer(1, -1, true), input: 0, output: 0 }
  ],

  // Algorithm 32
  [
    { n: 1, renderFn: Algorithms.renderer(1, 0, true), input: 0, output: 0 },
    { n: 1, renderFn: Algorithms.renderer(1, -1, true), input: 0, output: 0 },
    { n: 1, renderFn: Algorithms.renderer(1, -1, true), input: 0, output: 0 },
    { n: 1, renderFn: Algorithms.renderer(1, -1, true), input: 0, output: 0 },
    { n: 1, renderFn: Algorithms.renderer(1, -1, true), input: 0, output: 0 },
    { n: 1, renderFn: Algorithms.renderer(1, -1, true), input: 0, output: 0 }
  ]
];

Algorithms.dx100 = [
  // Algorithm 1
  [
    { n: 4, renderFn: Algorithms.renderer(4, 0, true), input: 0, output: 0 },
    { },
    { },
    { }
  ],

  // Algorithm 2
  [
    { n: 1, renderFn: Algorithms.renderer(1, 0, false), input: 0, output: 1 },
    { n: 1, renderFn: Algorithms.renderer(1, -1, true), input: 0, output: 1 },
    { n: 1, renderFn: Algorithms.renderer(1, -2, false), input: 1, output: 1 },
    { n: 1, renderFn: Algorithms.renderer(1, -2, true), input: 1, output: 0 }
  ],

  // Algorithm 3
  [
    { n: 1, renderFn: Algorithms.renderer(1, 0, false), input: 0, output: 1 },
    { n: 2, renderFn: Algorithms.renderer(2, -1, true), input: 0, output: 1 },
    { },
    { n: 1, renderFn: Algorithms.renderer(1, -2, true), input: 1, output: 0 }
  ],

  // Algorithm 4
  [
    { n: 2, renderFn: Algorithms.renderer(2, 0, false), input: 0, output: 1 },
    { },
    { n: 1, renderFn: Algorithms.renderer(1, -1, true), input: 0, output: 1 },
    { n: 1, renderFn: Algorithms.renderer(1, -2, true), input: 1, output: 0 }
  ],

  // Algorithm 5
  [
    { n: 2, renderFn: Algorithms.renderer(2, 0, true), input: 0, output: 0 },
    { },
    { n: 2, renderFn: Algorithms.renderer(2, -1, true), input: 0, output: 0 },
    { },
  ],

  // Algorithm 6
  [
    { n: 1, renderFn: Algorithms.renderer(1, 0, false), input: 0, output: 1 },
    { n: 1, renderFn: Algorithms.renderer(1, -2, true), input: 1, output: 0 },
    { n: 1, renderFn: Algorithms.renderer(1, -2, true), input: 1, output: 0 },
    { n: 1, renderFn: Algorithms.renderer(1, -2, true), input: 1, output: 0 }
  ],

  // Algorithm 7
  [
    { n: 2, renderFn: Algorithms.renderer(2, 0, true), input: 0, output: 0 },
    { },
    { n: 1, renderFn: Algorithms.renderer(1, -1, true), input: 0, output: 0 },
    { n: 1, renderFn: Algorithms.renderer(1, -1, true), input: 0, output: 0 }
  ],

  // Algorithm 8
  [
    { n: 1, renderFn: Algorithms.renderer(1, 0, true), input: 0, output: 0 },
    { n: 1, renderFn: Algorithms.renderer(1, -1, true), input: 0, output: 0 },
    { n: 1, renderFn: Algorithms.renderer(1, -1, true), input: 0, output: 0 },
    { n: 1, renderFn: Algorithms.renderer(1, -1, true), input: 0, output: 0 }
  ]
];

Algorithms.modulators = function(algorithm) {
  const modulators = new Set();
  for (let from = 0; from < algorithm.length;) {
    const to = from + algorithm[from].n - 1;
    for (let op = from; op <= to; ++op) {
      if (algorithm[from].output == 1 || op < to) {
        modulators.add(op);
      }
    }
    from += algorithm[from].n;
  }
  return modulators;
}

// Envelope.

class Envelope {
  constructor(scale, numStages) {
    this.numStages = numStages;
    this.scale = scale;
    this.stage = this.numStages - 1;
    this.phase = 1.0;
    this.start = 0.0;
    
    this.increment = new Float32Array(numStages);
    this.level = new Float32Array(numStages);
    
    for (let i = 0; i < this.numStages; i++) {
      this.increment[i] = 0.001;
      this.level[i] = 1.0 / (1 << i);
    }
    this.level[this.numStages - 1] = 0.0;
    this.reshapeAscendingSegments = false;
  }

  render(gate, rate, adScale, rScale) {
    if (gate) {
      if (this.stage == this.numStages - 1) {
        this.start = this.value();
        this.stage = 0;
        this.phase = 0.0;
      }
    } else {
      if (this.stage != this.numStages - 1) {
        this.start = this.value();
        this.stage = this.numStages - 1;
        this.phase = 0.0;
      }
    }
    const scale = this.stage == this.numStages - 1 ? rScale : adScale;
    this.phase += this.increment[this.stage] * rate * scale;
    if (this.phase >= 1.0) {
      if (this.stage >= this.numStages - 2) {
        this.phase = 1.0;
      } else {
        this.phase = 0.0;
        ++this.stage;
      }
      this.start = -100.0;
    }
    
    return this.value();
  }
  
  value() {
   let from = this.start == -100.0
       ? this.level[(this.stage - 1 + this.numStages) % this.numStages]
       : this.start;
   let to = this.level[this.stage];
   
   let phase = this.phase;
   if (this.reshapeAscendingSegments && from < to) {
     from = Math.max(6.7, from);
     to = Math.max(6.7, to);
     phase *= (2.5 - phase) * 0.666667;
   }
   
   return phase * (to - from) + from;
  }
}

class OperatorEnvelope extends Envelope {
  constructor(scale) {
    super(scale, 4);
  }
  
  set(params, globalLevel) {
    for (let i = 0; i < this.numStages; i++) {
      let levelScaled = DXUnits.operatorLevel(params.level[i]);
      levelScaled = (levelScaled & ~1) + globalLevel - 133;
      this.level[i] = 0.125 * (levelScaled < 1 ? 0.5 : levelScaled);
    }
  
    for (let i = 0; i < this.numStages; i++) {
      let increment = DXUnits.operatorEnvelopeIncrement(params.rate[i]);
      let from = this.level[(i - 1 + this.numStages) % this.numStages];
      let to = this.level[i];
      
      if (from == to) {
        // Quirk: for plateaux, the increment is scaled.
        increment *= 0.6;
        if (i == 0 && !params.level[i]) {
          // Quirk: the attack plateau is faster.
          increment *= 20.0;
        }
      } else if (from < to) {
        from = Math.max(6.7, from);
        to = Math.max(6.7, to);
        if (from == to) {
          // Quirk: because of the jump, the attack might disappear.
          increment = 1.0;
        } else {
          // Quirk: because of the weird shape, the rate is adjusted.
          increment *= 7.2 / (to - from);
        }
      } else {
        increment *= 1.0 / (from - to);
      }
      this.increment[i] = increment * this.scale;
    }
    this.reshapeAscendingSegments = true;
  }
}

class PitchEnvelope extends Envelope {
  constructor(scale) {
    super(scale, 4);
  }
  
  set(params, globalLevel) {
    for (let i = 0; i < this.numStages; i++) {
      this.level[i] = DXUnits.pitchEnvelopeLevel(params.level[i]);
    }
  
    // Configure increments.
    for (let i = 0; i < this.numStages; i++) {
      const from = this.level[(i - 1 + this.numStages) % this.numStages];
      const to = this.level[i];
      let increment = DXUnits.pitchEnvelopeIncrement(params.rate[i]);
      if (from != to) {
        increment *= 1.0 / Math.abs(from - to);
      } else if (i != this.numStages - 1) {
        increment = 0.2;
      }
      this.increment[i] = increment * this.scale;
    }
  }
}

// LFO.

class Lfo {
  constructor(sampleRate) {
    this.oneHz = 1.0 / sampleRate;

    this.phase = 0.0;
    this.frequency = 0.1;

    this.delayPhase = 0.0;
    this.delayIncrement = this.delayIncrement = [0.1, 0.1];

    this.randomValue = 0.0;
    
    this.ampModDepth = 0.0;
    this.pitchModDepth = 0.0;
    
    this.waveform = 0;
    this.resetPhase = false;
  }
  
  set(modulations) {
    this.frequency = DXUnits.LFOFrequency(modulations.rate) * this.oneHz;

    this.delayIncrement = DXUnits.LFODelay(modulations.delay);
    this.delayIncrement[0] *= this.oneHz;
    this.delayIncrement[1] *= this.oneHz;
    
    this.waveform = modulations.waveform;
    this.resetPhase = modulations.resetPhase;
    
    this.ampModDepth = modulations.ampModDepth * 0.01;
    let pitchMS = DXUnits.pitchModSensitivity(modulations.pitchModSensitivity);
    this.pitchModDepth = modulations.pitchModDepth * 0.01 * pitchMS;
  }
  
  reset() {
    if (this.resetPhase) {
      this.phase = 0.0;
    }
    this.delayPhase = 0.0;
  }
  
  step(scale) {
    this.phase += scale * this.frequency;
    this.delayPhase += scale * this.delayIncrement[
        (this.delayPhase < 0.5) ? 0 : 1];

    if (this.phase >= 1.0) {
      this.phase -= 1.0;
      this.randomValue = Math.random();
    }

    if (this.delayPhase >= 1.0) {
      this.delayPhase = 1.0;
    }
    
    const value = this.rawValue();
    const ramp = this.delayPhase < 0.5 ? 0.0 : (this.delayPhase - 0.5) * 2.0;

    return {
      pitchMod: (value - 0.5) * ramp * this.pitchModDepth,
      ampMod: (1.0 - value) * ramp * this.ampModDepth
    };
  }
  
  rawValue() {
    switch (this.waveform) {
      case 0:
        return 2.0 * (this.phase < 0.5 ? 0.5 - this.phase : this.phase - 0.5);

      case 1:
        return 1.0 - this.phase;

      case 2:
        return this.phase;

      case 3:
        return this.phase < 0.5 ? 0.0 : 1.0;

      case 4:
        return 0.5 + 0.5 * Math.sin(Math.PI * (2.0 * this.phase + 1.0));

      case 5:
        return this.randomValue;
    }
    return 0.0;
  }
}

class Voice {
  constructor(algorithms, sampleRate) {
    this.numOperators = algorithms[0].length;
    this.algorithms = algorithms;

    this.sampleRate = sampleRate;
    this.oneHz = 1.0 / sampleRate;
    this.a0 = 55.0 / sampleRate;

    const nativeSR = 44100.0;  // Legacy sample rate.
    const envelopeScale = nativeSR * this.oneHz;

    this.operator = Array(this.numOperators);
    this.operatorEnvelope = Array(this.numOperators);
    this.levelHeadroom = new Float32Array(this.numOperators);
    this.ratios = new Float32Array(this.numOperators);
    
    for (let i = 0; i < this.numOperators; i++) {
      this.operator[i] = new Operator();
      this.operatorEnvelope[i] = new OperatorEnvelope(envelopeScale);
    }
    this.pitchEnvelope = new PitchEnvelope(envelopeScale);
    
    this.feedbackState = [0.0, 0.0];
    this.patch = null;
    this.gate = false;
    this.note = 48.0;

    this.normalizedVelocity = 10.0;

    this.dirty = true;
  }
  
  setPatch(patch) {
    this.patch = patch;
    this.dirty = true;
  }
  
  setup() {
    if (!this.dirty) {
      return false;
    }
    
    this.pitchEnvelope.set(this.patch.pitchEnvelope);
    for (let i = 0; i < this.numOperators; i++) {
      const op = this.patch.op[i];
      const level = DXUnits.operatorLevel(op.level);
      this.operatorEnvelope[i].set(op.envelope, level);
      this.levelHeadroom[i] = 127 - level;
      const sign = this.patch.op[i].mode == 0 ? 1.0 : -1.0;
      this.ratios[i] = sign * DXUnits.frequencyRatio(this.patch.op[i]);
    }
    this.algorithm = this.algorithms[this.patch.algorithm];
    this.modulators = Algorithms.modulators(this.algorithm);
    this.dirty = false;
    return true;
  }
  
  render(parameters, out) {
    if (!this.patch) {
      return;
    }
    
    const size = out.length;
    const buffers = [
        out,
        new Float32Array(size),
        new Float32Array(size),
        null];
    this.setup();
    
    const adScale = Math.pow(2.0, (0.5 - parameters.envelopeControl) * 8.0);
    const rScale = Math.pow(
        2.0,  -Math.abs(parameters.envelopeControl - 0.3) * 8.0);
    
    // Apply LFO and pitch envelope modulations.
    const pitchEnvelope = this.pitchEnvelope.render(
        parameters.gate, size, adScale, rScale);
    const pitchMod = pitchEnvelope + parameters.pitchMod;
    const f0 = this.a0 * 0.25 * Math.pow(2.0,
        (parameters.note - 9.0) / 12.0 + pitchMod);
    
    const noteOn = parameters.gate && !this.gate;
    this.gate = parameters.gate;
    if (noteOn) {
      this.normalizedVelocity = DXUnits.normalizeVelocity(parameters.velocity);
      this.note = parameters.note;
    }
    
    // Reset operator phase if a note on is detected & if the patch requires it.
    if (noteOn && this.patch.resetPhase) {
      for (let i = 0; i < this.numOperators; i++) {
        this.operator[i].phase = 0;
      }
    }

    // Compute operator frequencies and amplitudes.
    const f = new Float32Array(this.numOperators);
    const a = new Float32Array(this.numOperators);
    
    for (let i = 0; i < this.numOperators; i++) {
      f[i] = this.ratios[i] * (this.ratios[i] < 0.0 ? -this.oneHz : f0);

      const op = this.patch.op[i];
      const rateScaling = DXUnits.rateScaling(this.note, op.rateScaling);
      const kbScaling = DXUnits.keyboardScaling(this.note, op.keyboardScaling);
      const velocityScaling = this.normalizedVelocity * op.velocitySensitivity;
      const brightness = this.modulators.has(i)
          ? (parameters.brightness - 0.5) * 32.0 : 0.0;
      
      let level = this.operatorEnvelope[i].render(
              parameters.gate, size * rateScaling, adScale, rScale);
      level += 0.125 * Math.min(
          kbScaling + velocityScaling + brightness, this.levelHeadroom[i]);
      
      const sensitivity = DXUnits.ampModSensitivity(op.ampModSensitivity);
      const logLevelMod = sensitivity * parameters.ampMod - 1.0;
      const levelMod = 1.0 - Math.pow(2.0, 6.4 * logLevelMod);
      a[i] = Math.pow(2.0, -14.0 + level * levelMod);
    }
    
    for (let i = 0; i < this.numOperators; ) {
      const step = this.algorithm[i];
      step.renderFn(
        this.operator.slice(i),
          f.slice(i),
          a.slice(i),
          this.feedbackState,
          this.patch.feedback,
          buffers[step.input],
          buffers[step.output],
          size);
      i += step.n;
    }
  }
}

const Debug = { };
Debug.downloadWAV = function(name, buffers) {
  let totalSize = 0;
  for (let buffer of buffers) {
    totalSize += buffer.length;
  }

  let output = new Float32Array(totalSize);
  let i = 0;
  for (let buffer of buffers) {
    output.set(buffer, i);
    i += buffer.length;
  }
  
  let buffer = Encoder.create().toWAV(output);
  let blob = new Blob([buffer], { type: 'audio/wav' });
  let a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name + '.wav';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// let ops = [{ phase: 0, amplitude: 0 }, { phase: 0, amplitude: 0 }];
// const r1 = Algorithms.renderer(1, -1, false);
// const r2 = Algorithms.renderer(1, -2, false);
//
// const buffers = [];
// const fbState = [0, 0];
// const f = [220 / 48000.0, 110 / 48000.0];
// const a = [0.5, 0.75];
// for (let i = 0; i < 1000; i++) {
//   let out = new Float32Array(48);
//   a[0] = 0.5 + 0.5 * Math.sin(i / 1000 * 2 * Math.PI);
//
//   r1(ops, f, a, fbState, 0, null, out, 48);
//   r2(ops.slice(1), f.slice(1), a.slice(1), fbState, 0, out, out, 48);
//
//   buffers.push(out);
// }
//
// Debug.downloadWAV('test', buffers);
//
// const BRASS1 = [ 49, 99, 28, 68, 98, 98, 91, 0, 39, 54, 50, 5, 60, 8, 82, 2, 0, 77, 36, 41, 71, 99, 98, 98, 0, 39, 0, 0, 15, 64, 8, 98, 2, 0, 77, 36, 41, 71, 99, 98, 98, 0, 39, 0, 0, 15, 56, 8, 99, 2, 0, 77, 76, 82, 71, 99, 98, 98, 0, 39, 0, 0, 15, 40, 8, 99, 2, 0, 62, 51, 29, 71, 82, 95, 96, 0, 27, 0, 7, 7, 112, 0, 86, 0, 0, 72, 76, 99, 71, 99, 88, 96, 0, 39, 0, 14, 15, 112, 0, 98, 0, 0, 84, 95, 95, 60, 50, 50, 50, 50, 21, 15, 37, 0, 5, 0, 56, 24, 66, 82, 65, 83, 83, 32, 32, 32, 49, 32 ];
//
// console.log(new DXPatch(BRASS1));

// const testCases = [
//     [ 30, 90, 20, 99, 1, 0, 7 ],
//     [ 40, 70, 40, 80, 1, 1, 7 ],
//     [ 50, 60, 60, 60, 1, 2, 7 ],
//     [ 60, 50, 80, 40, 1, 3, 7 ],
//     [ 70, 40, 99, 20, 1, 4, 7 ],
//     [ 80, 20, 20,  0, 1, 5, 5 ],
//     [ 90, 80, 40, 20, 0, 0, 3 ],
//     [ 90, 80, 60, 40, 0, 0, 1 ] ]
//
// const buffers = [];
// lfo = new Lfo(48000.0);
// for (let i = 0; i < testCases.length; i++) {
//   const testCase = testCases[i];
//
//   const modulations = { }
//   modulations.rate = testCase[0];
//   modulations.delay = testCase[1];
//   modulations.pitchModDepth = testCase[2];
//   modulations.ampModDepth = testCase[3];
//   modulations.resetPhase = testCase[4];
//   modulations.waveform = testCase[5];
//   modulations.pitchModSensitivity = testCase[6];
//   lfo.set(modulations);
//
//   let out = new Float32Array(48000 * 4);
//   for (let j = 0; j < out.length; j++) {
//     if (j % 96000 == 0) {
//       lfo.reset();
//     }
//     const mods = lfo.step(1);
//     out[j] = mods.ampMod;
//   }
//   buffers.push(out);
// }
// Debug.downloadWAV('lfo', buffers);
//
// const testCases = [
//     [ [ 30, 60, 50, 40 ], [ 82, 18, 50, 50 ] ],
//     [ [ 50, 50, 50, 40 ], [ 99, 0,  50, 50 ] ],
//     [ [ 60, 70, 45, 65 ], [ 66, 34, 60, 40 ] ],
//     [ [ 50, 60, 90, 40 ], [ 0,  99, 40, 60 ] ],
//     [ [ 70, 60, 90, 40 ], [ 99, 96, 40, 50 ] ],
//     [ [ 70, 60, 90, 40 ], [ 99, 99, 40, 50 ] ],
//     [ [ 50, 60, 90, 40 ], [ 82, 18, 60, 50 ] ],
//     [ [ 70, 80, 99, 60 ], [ 82, 18, 60, 50 ] ] ];
//
// const envelope = new PitchEnvelope(44100.0 / 48000.0);
// const buffers = [];
// for (let i = 0; i < testCases.length; i++) {
//   const params = { rate: testCases[i][0], level: testCases[i][1] };
//   envelope.set(params);
//
//   const n = 48000 * 4;
//   let out = new Float32Array(n);
//   for (let j = 0; j < out.length; j++) {
//     let gate = j > (n * 0.1) && j < (n * 0.6);
//     out[j] = envelope.render(gate, 1.0, 1.0, 1.0) / 4.0;
//   }
//   buffers.push(out);
// }
//
// Debug.downloadWAV('pitch_envelope', buffers);

// const testCases = [
//     [ [ 30, 60, 50, 40 ], [ 80, 50, 30, 15 ] ],
//     [ [ 30, 60, 50, 40 ], [ 99, 75, 60,  0 ] ],
//     [ [ 20, 70, 45, 65 ], [ 90, 75, 60,  0 ] ],
//     [ [ 30, 60, 77, 40 ], [ 99, 10, 75,  0 ] ],
//     [ [ 30, 60, 50, 40 ], [ 50, 40, 30,  0 ] ],
//     [ [ 30, 45, 50, 40 ], [ 99, 99, 50,  0 ] ],
//     [ [ 20, 60, 50, 40 ], [ 0,   0, 60, 99 ] ],
//     [ [ 23, 99, 37, 45 ], [  0, 98,  0,  0 ] ],
//     [ [ 25, 99, 60, 77 ], [  0, 99,  0,  0 ] ],
//     [ [  9, 99, 60, 81 ], [  0, 99,  0,  0 ] ],
//     [ [ 26, 99, 20, 33 ], [  0, 90, 80,  0 ] ],
//     [ [ 99, 99, 60, 65 ], [  0, 99,  0,  0 ] ],
//     [ [  5, 99, 99, 60 ], [  0,  0, 99,  0 ] ],
//     [ [ 22, 99, 99, 60 ], [  0,  0, 99,  0 ] ],
//     [ [ 99, 99, 99, 60 ], [  0,  0, 99,  0 ] ],
//     [ [ 28, 20, 99, 18 ], [  0,  0, 99, 90 ] ] ];
//
// const envelope = new OperatorEnvelope(44100.0 / 48000.0);
// const buffers = [];
// for (let i = 0; i < testCases.length; i++) {
//   const params = { rate: testCases[i][0], level: testCases[i][1] };
//   envelope.set(params, 99);
//
//   const n = 48000 * 4;
//   let out = new Float32Array(n);
//   for (let j = 0; j < out.length; j++) {
//     let gate = j > (n * 0.1) && j < (n * 0.6);
//     out[j] = envelope.render(gate, 1.0, 1.0, 1.0) / 16.0;
//   }
//   buffers.push(out);
// }
//
// Debug.downloadWAV('operator_envelope', buffers);
//

// const BRASS1 = [ 49, 99, 28, 68, 98, 98, 91, 0, 39, 54, 50, 5, 60, 8, 82, 2, 0, 77, 36, 41, 71, 99, 98, 98, 0, 39, 0, 0, 15, 64, 8, 98, 2, 0, 77, 36, 41, 71, 99, 98, 98, 0, 39, 0, 0, 15, 56, 8, 99, 2, 0, 77, 76, 82, 71, 99, 98, 98, 0, 39, 0, 0, 15, 40, 8, 99, 2, 0, 62, 51, 29, 71, 82, 95, 96, 0, 27, 0, 7, 7, 112, 0, 86, 0, 0, 72, 76, 99, 71, 99, 88, 96, 0, 39, 0, 14, 15, 112, 0, 98, 0, 0, 84, 95, 95, 60, 50, 50, 50, 50, 21, 15, 37, 0, 5, 0, 56, 24, 66, 82, 65, 83, 83, 32, 32, 32, 49, 32 ];
//
// const patch = new DXPatch(BRASS1);
// const voice = new Voice(Algorithms.dx7, 48000.0);
// voice.setPatch(patch);

// const parameters = { };
// parameters.note = 48.0;
// parameters.velocity = 0.8;
// parameters.envelopeControl = 0.5;
// parameters.brightness = 0.5;
// parameters.pitchMod = 0;
// parameters.ampMod = 0;
//
// const buffers = [];
// for (let i = 0; i < 1000; i++) {
//   parameters.gate = i % 200 < 100;
//   let out = new Float32Array(128);
//   voice.render(parameters, out);
//   for (let j = 0; j < out.length; ++j) { out[j] *= 0.125; }
//   buffers.push(out);
// }
//
// Debug.downloadWAV('voice', buffers);


class SixOpProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.running = true;
    

    this.voice = new Voice(Algorithms.dx7, 48000.0);
    this.lfo = new Lfo(48000.0);
    this.gate = false;
    this.retrigger = false;
    
    this.port.onmessage = (event) => {
      // AudioWorkletProcessor can't have custom methods. Oh well...
      if (event.data[0] == 'stop') {
        this.running = false;
      } else if (event.data[0] == 'setPatch') {
        const patch = new DXPatch(event.data[1]);
        this.voice.setPatch(patch);
        this.lfo.set(patch.modulations);
        this.retrigger = true;
      }
    }
  }
  
  process(inputs, outputs, parameters) {
    const output = outputs[0];

    const numChannels = output.length;
    const size = output[0].length;
    
    let modulations = this.lfo.step(size);
    
    let p = { };
    p.gate = parameters['gate'][0] > 0.5 && !this.retrigger;
    p.note = parameters['note'][0];
    p.velocity = parameters['velocity'][0];
    p.envelopeControl = parameters['envelopeControl'][0];
    p.brightness = parameters['brightness'][0];
    p.pitchMod = modulations.pitchMod;
    p.ampMod = modulations.ampMod;
    
    if (p.gate && ! this.gate) {
      this.lfo.reset();
    }
    this.gate = p.gate;
    this.retrigger = false;
    
    let out = new Float32Array(size);
    this.voice.render(p, out);
    for (let i = 0; i < size; ++i) {
      for (let j = 0; j < numChannels; ++j) {
        output[j][i] = out[i] * 0.125;
      }
    }
    return this.running;
  }
  
  static get parameterDescriptors() {
    return [
      {
        name: 'gate',
        defaultValue: 0.0,
        minValue: 0.0,
        maxValue: 1.0,
        automationRate: 'k-rate'
      },
      {
        name: 'note',
        defaultValue: 60.0,
        minValue: 0.0,
        maxValue: 127.0,
        automationRate: 'k-rate'
      },
      {
        name: 'velocity',
        defaultValue: 0.8,
        minValue: 0.0,
        maxValue: 1.0,
        automationRate: 'k-rate'
      },
      {
        name: 'envelopeControl',
        defaultValue: 0.5,
        minValue: 0.0,
        maxValue: 1.0,
        automationRate: 'k-rate'
      },
      {
        name: 'brightness',
        defaultValue: 0.5,
        minValue: 0.0,
        maxValue: 1.0,
        automationRate: 'k-rate'
      }];
    }
}

registerProcessor('six_op_processor', SixOpProcessor)
