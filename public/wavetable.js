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
// Creation of a custom wavetable and wave map for Plaits.

const numCustomWaves = 15;
const numWaves = 192;
const customMapSize = 4;
const wavetableSize = 128;
const mapSize = 8;

let WavetableApp = { 
  wavetable: null,
  userData: null,
  map: null,
  
  encoder: Encoder.create(),
  audioSamples: null,

  sampleRate: 48000.0,
  transferSource: null,
  wavetableSource: null,
  gain: null,
};

// Wavetable synth.

WavetableApp.playWavetable = async function() {
  let context = new (window.AudioContext || window.webkitAudioContext)(
    { sampleRate: this.sampleRate });
  await context.audioWorklet.addModule('wavetable_processor.js');
  this.wavetableSource = new AudioWorkletNode(context, 'wavetable_processor');
  this.wavetableSource.port.postMessage(['setWavetable', this.wavetable]);
  this.wavetableSource.port.postMessage(['setMap', this.map]);
  this.updateParams();

  gain = context.createGain();
  this.wavetableSource.connect(gain);
  gain.gain.value = 0.5;
  gain.connect(context.destination);
}

WavetableApp.updateParams = function() {
  if (!this.wavetableSource) {
    return;
  }
  let note = parseFloat(document.getElementById('note').value);
  let p = this.wavetableSource.parameters;
  let f = 440.0 * Math.pow(2.0, (note - 69) / 12.0) / this.sampleRate;
  p.get('frequency').value = f;
  p.get('x').value = parseFloat(document.getElementById('x').value);
  p.get('y').value = parseFloat(document.getElementById('y').value);
}

WavetableApp.playStopWavetable = function() {
  if (this.transferSource) {
    this.playStop();
  }
  
  if (this.wavetableSource) {
    this.wavetableSource.port.postMessage(['stop']);
    this.wavetableSource = null;
    document.getElementById('playStopWavetableButton').innerHTML = 'Play';
  } else {
    if (!this.wavetable) {
      return;
    }
    this.playWavetable();
    document.getElementById('playStopWavetableButton').innerHTML = 'Stop';
  }
}

// Wavetable editor.

WavetableApp.drawWaveGrid = function(canvas, map, size, scale) {
  const padding = 0.2;
  
  canvas.width = size * wavetableSize * scale;
  canvas.height = size * wavetableSize / 2 * scale;

  let context = canvas.getContext('2d');
  context.font = (40 * scale).toFixed(1) + 'px sans-serif';
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.lineWidth = 2 * scale;
  
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      let w = map[(c + r * size)];
      
      let height = wavetableSize / 2;
      let offset = w * (wavetableSize + 4);
      let xOrigin = c * wavetableSize;
      let yOrigin = (size - 1 - r) * height + height / 2;
      
      context.fillStyle = '#eee';
      context.fillText(w, xOrigin * scale, (yOrigin + height / 2) * scale);
      
      context.strokeStyle = w < 192 ? '#00928f' : '#cc3868';
      context.beginPath();
      let previous = 0;
      for (let t = 0; t < wavetableSize + 2; t++) {
        let s = this.wavetable[offset + t] / (4 * 32767) * wavetableSize;
        let d = s - previous;
        previous = s;
        
        let x = xOrigin + (t - 1) * (1 - padding);
        let y = yOrigin - (1 - padding) * d * height / 2;
        if (t == 1) {
          context.moveTo(x * scale, y * scale);
        } else if (t > 1) {
          context.lineTo(x * scale, y * scale);
        }
      }
      context.stroke();
    }
  }
}

WavetableApp.integrate = function(x) {
  const n = x.length;

  let integratedWave = new Int16Array(n + 4);

  // Center.
  let mean = 0.0;
  for (let i = 0; i < x.length; i++) {
    mean += x[i];
  }
  
  mean /= n;
  
  // Normalize.
  let maxAmplitude = 1.0;
  for (let i = 0; i < n; i++) {
    x[i] -= mean;
    maxAmplitude = Math.max(maxAmplitude, Math.abs(x[i]));
  }
  for (let i = 0; i < n; i++) {
    x[i] /= maxAmplitude;
  }
  
  // Evaluate integral.
  let integral = 0.0;
  let integralMean = 0.0;
  for (let i = 0; i < 2 * n; i++) {
    integral += x[i % n];
    if (i >= n) {
      integralMean += integral;
    }
  }
  integralMean /= n;
  
  // Store integrated wave.
  integral = 0.0;
  for (let i = 0; i < 2 * n; i++) {
    integral += x[i % n];
    if (i >= n) {
      integratedWave[i - n] = (integral - integralMean) * (4 * 32767 / n);
    }
  }
  
  // Add interpolation guard.
  for (let i = 0; i < 4; i++) {
    integratedWave[n + i] = integratedWave[i];
  }
  
  return integratedWave;
}

WavetableApp.initializeWavetable = function() {
  let size = (numCustomWaves + numWaves) * (wavetableSize + 4);
  let wavetable = new Int16Array(size);
  
  let chars = atob(plaitsWaves);
  let bytes = new Uint8Array(chars.length);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = chars.charCodeAt(i);
  }
  let view = new DataView(bytes.buffer);
  for (let i = 0; i < bytes.length / 2; i++) {
    wavetable[i] = view.getInt16(i * 2, true);
  }
  this.wavetable = wavetable;
}

WavetableApp.initializeWavetable();

WavetableApp.generateWavetable = function() {
  // Parse the function.
  let expression = document.getElementById('expression').value;
  let error = document.getElementById('expressionError');
  let f = null;
  try {
    exported = ['PI', 'sin', 'cos', 'tan', 'atan', 'atan2', 'floor', 'ceil',
      'round', 'random', 'sqrt', 'exp', 'log', 'pow', 'abs', 'sign'];
    
    let lib = (exported.map(
        (x) => 'let ' + x.toLowerCase() + ' = Math.' + x +';')).join(' ');
    lib += 'let t = i / n; ';
    lib += 'let y = j / (m - 1); ';
    lib += 'let x = k / (m - 1); ';
    lib += 'let row = j; ';
    lib += 'let col = k; ';
    lib += 'let phi = Math.PI * 2 * t; ';
    f = new Function('i', 'j', 'k', 'm', 'n', lib + 'return ' + expression + ';');
    f(0, 0, 0, 4, 128);
  } catch (e) {
    if (e instanceof SyntaxError || e instanceof TypeError ||
        e instanceof ReferenceError) {
      error.innerHTML = e.message;
      return;
    } else {
      throw(e);
    }
  }
  error.innerHTML = 'OK';
  
  for (let wave = 0; wave < numCustomWaves; wave++) {
    let c = wave % customMapSize;
    let r = Math.floor(wave / customMapSize);
    let x = new Float32Array(wavetableSize);
    for (let i = 0; i < wavetableSize; i++) {
      x[i] = f(i, r, c, customMapSize, wavetableSize);
    }
    this.wavetable.set(
        this.integrate(x),
        (numWaves + wave) * (wavetableSize + 4));
  }
  this.customWavetableChanged();
}

WavetableApp.customWavetableChanged = function(customWavetable) {
  let customMap = new Uint8Array(customMapSize * customMapSize);
  customMap.fill(192 + numCustomWaves - 1);
  for (let wave = 0; wave < numCustomWaves; wave++) {
    customMap[wave] = 192 + wave;
  };

  let canvas = document.getElementById('wavetableCanvas');
  this.drawWaveGrid(canvas, customMap, customMapSize, 1);
  
  // Update player and discard generated data.
  if (this.wavetableSource) {
    this.wavetableSource.port.postMessage(['setWavetable', this.wavetable]);
  }
  document.getElementById('wavFile').value = null;
  this.audioSamples = null;
  this.wavetableData = null;
  this.updateMap();
}

WavetableApp.initializeMap = function() {
  let map = new Uint8Array(mapSize * mapSize);
  for (let x = 0; x < mapSize; x++) {
    for (let y = 0; y < mapSize; y++) {
      let j = Math.floor(x * customMapSize / mapSize);
      let k = Math.floor(y * customMapSize / mapSize);
      map[x + y * mapSize] = 192 + Math.min(
          j + k * customMapSize, numCustomWaves - 1);
    }
  }
  this.map = map;
}

WavetableApp.updateMap = function() {
  let canvas = document.getElementById('mapCanvas');
  this.drawWaveGrid(canvas, this.map, mapSize, 0.75);

  // Update player and discard generated data.
  if (this.wavetableSource) {
    this.wavetableSource.port.postMessage(['setMap', this.map]);
  }
  this.audioSamples = null;
  this.wavetableData = null;
}

WavetableApp.initializeMap();

mapCanvas = document.getElementById('mapCanvas');

WavetableApp.getCell = function(e) {
  const padding = 0.2;
  
  let canvas = document.getElementById('mapCanvas');
  let scale = canvas.width / (mapSize * wavetableSize);

  // Width of a waveform cell.
  let cellWidth = canvas.width / mapSize;
  let cellHeight = canvas.height / mapSize;
  
  // (X, Y) coordinate of the clicked cell.
  let cellX = Math.floor(e.offsetX / cellWidth);
  let cellY = mapSize - 1 - Math.floor(e.offsetY / cellHeight);
  
  // Relative X position within the cell.
  let cellXpos = e.offsetX / cellWidth - cellX;
  
  let direction = 0;
  if (cellXpos > (1 - padding)) {
    return null;
  } else if (cellXpos < 0.33 * (1 - padding)) {
    direction = -1;
  } else if (cellXpos > 0.66 * (1 - padding)) {
    direction = +1;
  }
  
  if (cellX < 0 || cellX >= mapSize || cellY < 0 || cellY >= mapSize) {
    return null;
  }
  
  return {
      x: cellX,
      y: cellY,
      direction: direction,
      index: cellX + cellY * mapSize};
}

mapCanvas.addEventListener('mousedown', function(e) {
  let cell = WavetableApp.getCell(e);

  if (!cell) {
    return;
  }
  
  let interval = 0;

  if (cell.direction != 0) {
    interval = setInterval(function() {
      if (WavetableApp.mapEdit) {
        let edit = WavetableApp.mapEdit;
        let index = edit.cell.index;
        
        let increment = 1 + Math.floor(Math.pow(edit.t * 0.1, 3));
        let newValue = Math.floor(edit.value + edit.cell.direction * increment);
        let max = numWaves + numCustomWaves - 1;
        WavetableApp.map[index] = Math.max(Math.min(newValue, max), 0);
        WavetableApp.updateMap();
        edit.t += 1;
        if (edit.t == 20) {
          let xRange = document.getElementById('x');
          let yRange = document.getElementById('y');
          xRange.value = (index % mapSize) / (mapSize - 1);
          yRange.value = Math.floor(index / mapSize) / (mapSize - 1);
          WavetableApp.updateParams();
        }
      }
    }, 50);
  }
  WavetableApp.mapEdit = {
    cell: cell,
    value: WavetableApp.map[cell.index],
    interval: interval,
    t: 0,
    oldX: document.getElementById('x').value,
    oldY: document.getElementById('y').value,
  };
});

mapCanvas.addEventListener('mousemove', function(e) {
  let cell = WavetableApp.getCell(e);
  
  let canvas = document.getElementById("mapCanvas");
  if (!cell) {
    canvas.style.cursor = 'default';
  } else if (cell.direction == 0) {
    canvas.style.cursor = 'move';
  } else if (cell.direction == -1) {
    canvas.style.cursor = 'w-resize';
  } else {
    canvas.style.cursor = 'e-resize';
  }
  
  let edit = WavetableApp.mapEdit;

  // Only when the central part of the waveform has been clicked!
  if (!edit || edit.cell.direction != 0) {
    return;
  }
  canvas.style.cursor = 'move';
  if (!cell) {
    return;
  }
  
  let newValue = edit.value;
  if (e.shiftKey) {
    let dX = cell.x - edit.cell.x;
    let dY = cell.y - edit.cell.y;
    newValue += dX + dY;
    
    let max = numWaves + numCustomWaves - 1;
    newValue = Math.max(Math.min(newValue, max), 0);
  }
  
  if (WavetableApp.map[cell.index] != newValue) {
    WavetableApp.map[cell.index] = newValue;
    WavetableApp.updateMap();
  }
});

mapCanvas.addEventListener('mouseup', function(e) {
  let edit = WavetableApp.mapEdit;
  WavetableApp.mapEdit = null;

  if (!edit || !edit.interval) {
    return;
  }
  
  clearInterval(edit.interval);
  document.getElementById('x').value = edit.oldX;
  document.getElementById('y').value = edit.oldY;
  WavetableApp.updateParams();
});

// WAV file import.

WavetableApp.parseRIFF = function(data) {
  const size = data.byteLength;
  if (size < 12) {
    return null;
  }
  
  // Parse RIFF container header.
  let view = new DataView(data);
  let readTag = function(offset) {
    return String.fromCharCode(
        view.getUint8(offset + 0),
        view.getUint8(offset + 1),
        view.getUint8(offset + 2),
        view.getUint8(offset + 3));
  }
  if (readTag(0) != 'RIFF') {
    return null;
  }
  
  if (view.getUint32(4, true) != size - 8) {
    return null;
  }
  const result = { };
  result.tag = readTag(8);

  // Remaining chunks.
  let offset = 12;
  result.chunks = [];
  while (offset < size) {
    let tag = readTag(offset);
    let chunkSize = view.getUint32(offset + 4, true);
    result.chunks.push(
        { tag: tag, data: data.slice(offset + 8, offset + 8 + chunkSize) });
    offset += chunkSize + 8;
  }
  return result;
}

WavetableApp.parseFmt = function(data) {
  let view = new DataView(data);
  fmt = { };
  fmt.formatCode = view.getUint16(0, true);
  fmt.numChannels = view.getUint16(2, true);
  fmt.sampleRate = view.getUint32(4, true);
  fmt.byteRate = view.getUint32(8, true);
  fmt.blockAlign = view.getUint16(12, true);
  fmt.bitsPerSamples = view.getUint16(14, true);
  return fmt;
}

WavetableApp.parseWAVHeader = function(data) {
  const riffData = WavetableApp.parseRIFF(data);
  if (!riffData || riffData.tag != 'WAVE') {
    console.log('Invalid RIFF file');
    return null;
  }
  
  let fmtChunk = null;
  let dataChunk = null;
  for (let chunk of riffData.chunks) {
    if (chunk.tag == 'fmt ') fmtChunk = chunk.data;
    if (chunk.tag == 'data') dataChunk = chunk.data;
  }
  
  if (!fmtChunk || !dataChunk) {
    console.log('No fmt or data chunk found');
    return null;
  }
  
  const fmt = WavetableApp.parseFmt(fmtChunk);
  return fmt;
}

WavetableApp.resample = function(x, maxLength, m, phaseAlign) {
  const n = Math.min(x.length, maxLength);
  const nyquist = Math.min(n, m) / 2;
  
  const y = new Float32Array(m);
  
  for (let i = 1; i < nyquist; ++i) {
    const norm = 2.0 / n; // Math.min(2 * (1 - i / nyquist), 1.0);

    let xr = 0.0;
    let xi = 0.0;
    for (let j = 0; j < n; ++j) {
      const e = j * i / n * 2.0 * Math.PI;
      xr += Math.cos(e) * x[j];
      xi += Math.sin(e) * x[j];
    }

    xr *= norm;
    xi *= norm;
    
    if (phaseAlign) {
      xi = Math.sqrt(xr * xr + xi * xi);
      xr = 0;
    }
    for (let j = 0; j < m; ++j) {
      const e = j * i / m * 2.0 * Math.PI;
      y[j] += Math.cos(e) * xr;
      y[j] += Math.sin(e) * xi;
    }
  }
  return y;
}

WavetableApp.setWave = function(wave, samples) {
  const phaseAlign = document.getElementById('phaseAlign').checked;
  const x = this.resample(samples, 8192, wavetableSize, phaseAlign);
  this.wavetable.set(
      this.integrate(x), (numWaves + wave) * (wavetableSize + 4));
  this.customWavetableChanged();
}

WavetableApp.loadWAV = function(element) {
  if (!element.files[0]) {
    return;
  }
  for (let i = 0; i < Math.min(element.files.length, numCustomWaves); i++) {
    let reader = new FileReader();
    reader.onload = function(i) {
        return function(e) {
          const data = e.target.result;
          
          // Parse WAV header to retrieve the sample rate and create
          // a context at this rate. This prevents decodeAudioData's resampling.
          let fmt = WavetableApp.parseWAVHeader(data);
          if (fmt) {
            let context = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(
                fmt.numChannels, fmt.sampleRate, fmt.sampleRate);
            context.decodeAudioData(data, function(audioBuffer) {
              WavetableApp.setWave(i, audioBuffer.getChannelData(0));
            });
          }
        }
    }(i);
    reader.readAsArrayBuffer(element.files[i]);
  }
}

// Transfer to Plaits.

WavetableApp.setVolume = function(element) {
  if (!this.gain) {
    return;
  }
  let gain = parseFloat(element.value);
  this.gain.gain.value = Math.pow(gain, 1.5);
};

WavetableApp.playEncodedData = function() {
  if (!this.wavetable) {
    return;
  }
  this.makeWavetableData();
  this.makeAudioSamples();
  
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

WavetableApp.makeWavetableData = function() {
  if (this.wavetableData) {
    return;
  }

  let data = new ArrayBuffer(4096);

  // Copy map.
  let view8 = new Uint8Array(data);
  for (let i = 0; i < mapSize * mapSize; i++) {
    view8[i] = this.map[i];
  }
  
  // Copy wavetable with the right endianness.
  let view = new DataView(data);
  let offset = numWaves * (wavetableSize + 4);
  for (let i = 0; i < numCustomWaves * (wavetableSize + 4); i++) {
    view.setInt16(64 + i * 2, this.wavetable[offset + i], true);
  }

  this.wavetableData = new Uint8Array(data);
}

WavetableApp.makeAudioSamples = function() {
  if (this.audioSamples) {
    return;
  }
  this.makeWavetableData();
  this.audioSamples = this.encoder.code(this.wavetableData, [13, 13]);
}

WavetableApp.playStop = function() {
  if (this.wavetableSource) {
    this.playStopWavetable();
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

WavetableApp.download = function(raw) {
  this.makeWavetableData();
  if (!raw) {
    this.makeAudioSamples();
  }
  
  let buffer = raw ? this.wavetableData : this.encoder.toWAV(this.audioSamples);
  let blob = new Blob([buffer],
      {type: raw ? 'application/octet-stream' : 'audio/wav'});
  let a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'wavetable' + (raw ? '.bin' : '.wav');
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

WavetableApp.displayProgress = function() {
  let transferSource = WavetableApp.transferSource;
  let progressBar = document.getElementById('progressBar');
  let visible = false;
  if (transferSource) {
    let progress = transferSource.context.currentTime / transferSource.buffer.duration * 100;
    if (progress <= 100) {
      progressBar.value = progress;
      progressBar.innerHTML = progress.toFixed(1) + '%';
      visible = true;
    } else {
      WavetableApp.playStop();
    }
  }
  progressBar.style.visibility = visible ? 'visible' : 'hidden';
}

setInterval(WavetableApp.displayProgress, 500);
WavetableApp.generateWavetable();
