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
// Wave terrain editor.

const W = 64;

let WaveTerrainApp = { 
  terrain: null,
  
  encoder: Encoder.create(),
  audioSamples: null,

  sampleRate: 48000.0,
  transferSource: null,
  waveTerrainSource: null,
  gain: null
};

// Waveterrain synth.

WaveTerrainApp.playWaveTerrain = async function() {
  if (!this.terrain) {
    return;
  }
  let context = new (window.AudioContext || window.webkitAudioContext)(
    { sampleRate: this.sampleRate });
  await context.audioWorklet.addModule('waveterrain_processor.js');
  this.waveTerrainSource = new AudioWorkletNode(context, 'waveterrain_processor');
  this.updateParams();
  this.waveTerrainSource.port.postMessage(['setTerrain', this.terrain]);
  gain = context.createGain();
  this.waveTerrainSource.connect(gain);
  gain.gain.value = 0.5;
  gain.connect(context.destination);
}

WaveTerrainApp.updateParams = function() {
  this.plot();
  if (!this.waveTerrainSource) {
    return;
  }
  let note = parseFloat(document.getElementById('note').value);
  let p = this.waveTerrainSource.parameters;
  let f = 440.0 * Math.pow(2.0, (note - 69) / 12.0) / this.sampleRate;
  p.get('frequency').value = f;
  p.get('radius').value = parseFloat(document.getElementById('radius').value);
  p.get('offset').value = parseFloat(document.getElementById('offset').value);
  p.get('aux').value = document.getElementById('aux').checked ? 1.0 : 0.0;
}

WaveTerrainApp.playStopWaveTerrain = function() {
  if (this.transferSource) {
    this.playStop();
  }
  
  if (this.waveTerrainSource) {
    this.waveTerrainSource.port.postMessage(['stop']);
    this.waveTerrainSource = null;
    document.getElementById('playStopWaveTerrainButton').innerHTML = 'Play';
  } else {
    if (!this.terrain) {
      return;
    }
    this.playWaveTerrain();
    document.getElementById('playStopWaveTerrainButton').innerHTML = 'Stop';
  }
}

WaveTerrainApp.normalize = function(terrain) {
  let min = Number.MAX_VALUE;
  let max = -Number.MAX_VALUE;
  for (let i = 0; i < terrain.length; ++i) {
    let z = terrain[i];
    if (z > max) {
      max = z;
    } else if (z < min) {
      min = z;
    }
  }
  let scale = 2.0 / (max == min ? 1.0 : max - min);
  for (let i = 0; i < W * W; i++) {
    terrain[i] = Math.round(((terrain[i] - min) * scale - 1.0) * 127.0);
  }
}

WaveTerrainApp.generate = function() {
  // Parse the function.
  let expression = document.getElementById('expression').value;
  let error = document.getElementById('expressionError');
  let f = null;
  try {
    exported = ['PI', 'sin', 'cos', 'tan', 'atan', 'atan2', 'floor', 'ceil',
      'round', 'random', 'sqrt', 'exp', 'log', 'pow', 'abs', 'sign'];
    
    let lib = (exported.map(
        (x) => 'let ' + x.toLowerCase() + ' = Math.' + x +';')).join(' ');
    lib += 'let r = Math.sqrt(x * x + y * y); ';
    lib += 'let theta = Math.atan2(y, x); ';
    lib += 'let mu = (Math.abs(theta) - Math.PI) / -Math.PI;';
    lib += 'let ball = function(xm, ym, std) { return Math.exp(-((x - xm) * (x- xm) + (y - ym) * (y - ym)) / (std * std)); };';
    
    f = new Function('x', 'y', lib + 'return ' + expression + ';');
    f(0, 0);
  } catch (e) {
    if (e instanceof SyntaxError || e instanceof TypeError ||
        e instanceof ReferenceError) {
      error.innerHTML = e.message;
      return;
    } else {
      throw(e);
    }
  }
  document.getElementById('imageFile').value = null;
  error.innerHTML = 'OK';

  // Evaluate it on a 2D grid.
  let terrain = new Float32Array(W * W);
  for (let i = 0; i < W; i++) {
    for (let j = 0; j < W; j++) {
      let x = 2.0 * j / (W - 1) - 1.0;
      let y = 2.0 * i / (W - 1) - 1.0;
      let z = f(x, y);
      terrain[i * W + j] = z;
    }
  }
  
  this.normalize(terrain);
  this.terrain = terrain;
  this.terrainChanged(false);
}

WaveTerrainApp.terrainChanged = function(grayscalePalette) {
  // Convert this to an image.
  const IW = 256;
  const ratio = IW / W;
  
  let canvas = document.getElementById('terrainCanvas');
  canvas.width = IW;
  canvas.height = IW;
  let context = canvas.getContext('2d');
  let imageData = context.createImageData(IW, IW);
  for (let i = 0; i < W * W; i++) {
    let y = Math.floor(i / W);
    let x = i - y * W;
    for (let j = x * ratio; j < (x + 1) * ratio; j++) {
      for (let k = y * ratio; k < (y + 1) * ratio; k++) {
        let pixel = (j + (IW - 1 - k) * IW) * 4;
        let r = this.terrain[i] + 127;
        let g = r;
        let b = r;
        if (!grayscalePalette) {
          if (this.terrain[i] < 0) {
            r = -this.terrain[i] * 2;
            g = 0;
            b = -this.terrain[i];
          } else {
            r = 0;
            g = this.terrain[i] * 1.5;
            b = this.terrain[i] * 1.2;
          }
        }
        imageData.data[pixel + 0] = r;
        imageData.data[pixel + 1] = g;
        imageData.data[pixel + 2] = b;
        imageData.data[pixel + 3] = 255;
      }
    }
  }
  context.putImageData(imageData, 0, 0);
  
  if (this.waveTerrainSource) {
    this.waveTerrainSource.port.postMessage(['setTerrain', this.terrain]);
  }
  this.audioSamples = null;
  this.plot();
}

WaveTerrainApp.loadImage = function(element) {
  if (!element.files[0]) {
    return;
  }
  let reader = new FileReader();
  reader.onload = function(e) {
    let img = new window.Image();
    img.crossOrigin = '*';
    img.onload = function() {
      const sW = Math.min(img.width, img.height);

      let canvas = document.createElement('canvas');
      let context = canvas.getContext('2d');

      canvas.width = W;
      canvas.height = W;
      context.drawImage(img, 0, 0, sW, sW, 0, 0, W, W);
      let imageData = context.getImageData(0, 0, W, W);
      let terrain = new Float32Array(W * W);
      for (var x = 0; x < W; x++) {
        for (var y = 0; y < W; y++) {
          let pixel = (x + y * W) * 4;
          let r = imageData.data[pixel];
          let g = imageData.data[pixel + 1];
          let b = imageData.data[pixel + 2];
          let luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
          terrain[x + (W - 1 - y) * W] = luminance;
        }
      }
      WaveTerrainApp.normalize(terrain);
      WaveTerrainApp.terrain = terrain;
      WaveTerrainApp.terrainChanged(true);
    }
    img.src = e.target.result;
  };
  reader.readAsDataURL(element.files[0]);
}

WaveTerrainApp.plot = function() {
  if (!this.terrain) {
    return;
  }
  const radius = parseFloat(document.getElementById('radius').value);
  const offset = parseFloat(document.getElementById('offset').value);
  const aux = document.getElementById('aux').checked ? 1.0 : 0.0;
  
  const width = 512;
  const height = 256;

  let canvas = document.getElementById('waveformCanvas');
  canvas.width = width;
  canvas.height = height;
  let context = canvas.getContext('2d');
  context.fillStyle = '#000';
  context.fillRect(0, 0, width - 1, height - 1);
  
  context.lineWidth = 2;
  context.strokeStyle = '#00928f';
  context.beginPath();
  for (let t = -1; t <= width; t++) {
    let phi = 2 * Math.PI * t / width;
    let x = Math.sin(phi) * radius;
    let y = Math.cos(phi) * radius;
    x = x * (1.0 - Math.abs(offset)) + offset;
    
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
    let sample = (z0 + (z1 - z0) * yF) * valueScale;
    let mod = Math.sin(Math.PI * (Math.cos(phi) * radius + sample));
    sample += (mod - sample) * aux;
    if (t == -1) {
      context.moveTo(t, (0.5 - sample * 0.48) * height);
    } else {
      context.lineTo(t, (0.5 - sample * 0.48) * height);
    }
  }
  context.stroke();
}

// Transfer to Plaits.

WaveTerrainApp.setVolume = function(element) {
  if (!this.gain) {
    return;
  }
  let gain = parseFloat(element.value);
  this.gain.gain.value = Math.pow(gain, 1.5);
};

WaveTerrainApp.playEncodedData = function() {
  if (!this.terrain) {
    return;
  }
  this.encode();
  
  let context = new (window.AudioContext || window.webkitAudioContext)(
    { sampleRate: this.sampleRate });
  
  let audioBuffer = context.createBuffer(
      1, this.audioSamples.length, this.sampleRate);
  audioBuffer.getChannelData(0).set(this.audioSamples);
  this.gain = context.createGain();
  this.transferSource = context.createBufferSource();
  this.transferSource.buffer = audioBuffer;
  this.transferSource.connect(this.gain);
  this.gain.connect(context.destination);
  this.transferSource.start();
}

WaveTerrainApp.encode = function() {
  if (this.audioSamples) {
    return;
  }
  data = new Uint8Array(4096);
  const z = this.terrain;
  for (let i = 0; i < 4096; i++) {
    data[i] = z[i] < 0 ? 255 + z[i] : z[i];
  }
  this.audioSamples = this.encoder.code(data, [5, 5]);
}

WaveTerrainApp.playStop = function() {
  if (this.waveTerrainSource) {
    this.playStopWaveTerrain();
  }
  
  if (this.transferSource) {
    this.transferSource.stop();
    this.transferSource = null;
    document.getElementById('playStopButton').innerHTML = 'Play';
  } else {
    this.playEncodedData();
    document.getElementById('playStopButton').innerHTML = 'Stop';
  }
}

WaveTerrainApp.download = function() {
  if (!this.terrain) {
    return;
  }
  this.encode();
  let buffer = this.encoder.toWAV(this.audioSamples);
  let blob = new Blob([buffer], {type: 'audio/wav'});
  let a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'terrain.wav';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

WaveTerrainApp.displayProgress = function() {
  let transferSource = WaveTerrainApp.transferSource;
  let progressBar = document.getElementById('progressBar');
  let visible = false;
  if (transferSource) {
    let progress = transferSource.context.currentTime / transferSource.buffer.duration * 100;
    if (progress <= 100) {
      progressBar.value = progress;
      progressBar.innerHTML = progress.toFixed(1) + '%';
      visible = true;
    } else {
      WaveTerrainApp.playStop();
    }
  }
  progressBar.style.visibility = visible ? 'visible' : 'hidden';
}

setInterval(WaveTerrainApp.displayProgress, 500);

WaveTerrainApp.generate();