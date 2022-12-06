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
// DX7 Patch bank management and transfer to Plaits.

// Patch.

class Patch {
  constructor(bankName, index, data) {
    this.bankName = bankName;
    this.index = index;
    this.data = data;
    this.name = String.fromCharCode.apply(String, data.slice(118, 128));
    this.algorithm = data[110] & 0x1f;
    this.feedback = data[111] & 0x7;
  }
  
  getDOM() {
    let d = document.createElement('div');
    let html = [
      `<p><span class="patchBankName">${this.bankName}</span></p>`,
      `<p><span class="patchIndex">${this.index + 1}</span> `,
      `<span class="patchName">${this.name}</span>`,
      // `<p class="patchDetails">Algo ${this.algorithm + 1} `,
      // `FB ${this.feedback}</p>`,
      '</p'
    ].join(' ');
    d.innerHTML = html;
    return d;
  }
}

// Patch bank.

class PatchBank {
  constructor(name, data) {
    this.name = name;
    this.data = data;
    
    if (data === undefined) {
      this.patches = []
    } else {
      data = new Uint8Array(data);
      if (data.length == 4104 || data.length == 4103) {
        data = data.slice(6, 4102);
      }
      console.assert(data.length == 4096);
      this.patches = [];
      for (let i = 0; i < 32; i++) {
        this.patches.push(
            new Patch(name, i, data.slice(i * 128, (i + 1) * 128)));
      }
    }
  }
  
  static validate(data) {
    // TODO: more stringent sanity checks.
    let l = data.byteLength;
    return l == 4104 || l == 4103 || l == 4096;
  }
  
  get cleanName() {
    // TODO: cleanup
    return this.name;
  }
  
  collate(patches) {
    let data = new Uint8Array(4096);
    let names = new Set();
    for (let i = 0; i < 32; i++) {
      let index = Math.min(i, patches.length - 1);
      data.set(patches[index].data, i * 128);
      names.add(patches[index].bankName);
    }
    this.name = Array.from(names.keys()).join('_');
    this.data = data;
    this.patches = patches;
  }
  
  get syx() {
    let data = new Uint8Array(4104);
    data.set(this.data, 6);
    data[0] = 0xf0;
    data[1] = 0x43;
    data[2] = 0x00;
    data[3] = 0x09;
    data[4] = 0x20;
    data[5] = 0x00;
    let sum = 0;
    for (let i = 0; i < 4096; i++) {
      sum = sum + this.data[i];
    }
    data[4102] = 128 - sum % 128;
    data[4103] = 0xf7;
    return data;
  }
  
  getDOM() {
    let d = document.createElement("div");
    d.dataset.bank = this.cleanName;
    d.className = 'bankContainer';
    for (let patch of this.patches) {
      let element = patch.getDOM();
      element.dataset.bank = this.cleanName;
      element.dataset.index = patch.index;
      element.dataset.id = this.cleanName + '|' + patch.index;
      element.className = 'patchContainer';
      element.addEventListener("mouseenter", function(e) {
        const synth = PatchBankApp.synthSource;
        if (synth) {
          synth.port.postMessage(['setPatch', patch.data]);
          synth.parameters.get('gate').value = 1.0;
        }
      });
      element.addEventListener("mouseleave", function(e) {
        const synth = PatchBankApp.synthSource;
        if (synth) {
          synth.parameters.get('gate').value = 0.0;
        }
      });
      d.appendChild(element);
    }
    return d;
  }
}

// Patch management app.

let PatchBankApp = {
  banks: new Map(),
  bank: null,
  selection: null,
  deselect: false,

  encoder: Encoder.create(),
  audioSamples: null,

  sampleRate: 48000.0,
  transferSource: null,
  synthSource: null,
  gain: null,
};

// Patch preview.

PatchBankApp.playSynth = async function() {
  let context = new (window.AudioContext || window.webkitAudioContext)(
    { sampleRate: this.sampleRate });
  await context.audioWorklet.addModule('six_op_processor.js');
  this.synthSource = new AudioWorkletNode(context, 'six_op_processor');
  
  const BRASS1 = [ 49, 99, 28, 68, 98, 98, 91, 0, 39, 54, 50, 5, 60, 8, 82, 2, 0, 77, 36, 41, 71, 99, 98, 98, 0, 39, 0, 0, 15, 64, 8, 98, 2, 0, 77, 36, 41, 71, 99, 98, 98, 0, 39, 0, 0, 15, 56, 8, 99, 2, 0, 77, 76, 82, 71, 99, 98, 98, 0, 39, 0, 0, 15, 40, 8, 99, 2, 0, 62, 51, 29, 71, 82, 95, 96, 0, 27, 0, 7, 7, 112, 0, 86, 0, 0, 72, 76, 99, 71, 99, 88, 96, 0, 39, 0, 14, 15, 112, 0, 98, 0, 0, 84, 95, 95, 60, 50, 50, 50, 50, 21, 15, 37, 0, 5, 0, 56, 24, 66, 82, 65, 83, 83, 32, 32, 32, 49, 32 ];
  this.synthSource.parameters.get('gate').value = 0.0;  
  this.synthSource.port.postMessage(['setPatch', BRASS1]);
  this.updateParams();
  this.synthSource.connect(context.destination);
}

PatchBankApp.updateParams = function() {
  if (!this.synthSource) {
    return;
  }
  const note = parseFloat(document.getElementById('note').value);
  const velocity = parseFloat(document.getElementById('velocity').value);
  const brightness = parseFloat(document.getElementById('brightness').value);
  const envelope = parseFloat(document.getElementById('envelope').value);
  let p = this.synthSource.parameters;
  p.get('note').value = note;
  p.get('velocity').value = velocity;
  p.get('brightness').value = brightness;
  p.get('envelopeControl').value = envelope;
}

PatchBankApp.playStopSynth = function() {
  if (this.transferSource) {
    this.playStop();
  }
  
  if (this.synthSource) {
    this.synthSource.port.postMessage(['stop']);
    this.synthSource = null;
    document.getElementById('playStopSynthButton').innerHTML = 'Play';
  } else {
    this.playSynth();
    document.getElementById('playStopSynthButton').innerHTML = 'Stop';
  }
}

// Bank import and management.

PatchBankApp.makeBank = function() {
  if (this.bank) {
    return;
  }
  
  let patches = [];
  for (let id of this.selection.toArray()) {
    let tokens = id.split('|');
    if (tokens.length == 2) {
      let bank = this.banks.get(tokens[0]);
      if (bank) {
        patches.push(bank.patches[parseInt(tokens[1])]);
      }
    }
  }
  this.bank = new PatchBank("EMPTY");
  this.bank.collate(patches);
}

PatchBankApp.addBank = function(bank) {
  this.banks.set(bank.name, bank);
  let element = bank.getDOM();

  let closeBox = document.createElement('div');
  closeBox.className = 'close';
  closeBox.onclick = function() {
    const wrap = element.parentNode;
    const container = wrap.parentNode;
    container.removeChild(wrap);
    // Check if some of the patches are in use.
    for (let id of PatchBankApp.selection.toArray()) {
      let tokens = id.split('|');
      if (tokens.length == 2 && tokens[0] == bank.name) {
        return;
      }
    }
    PatchBankApp.banks.delete(bank.name);
  }

  element.appendChild(closeBox);
  const wrap = document.createElement('div');
  wrap.className = 'bankContainerWrap';
  wrap.appendChild(element);
  
  document.getElementById('banks').appendChild(wrap);

  new Sortable(element, {
      draggable: '.patchContainer',
      group: { name: 'patches', pull:'clone', put: false },
      multiDrag: true,
      selectedClass: 'selected',
      animation: 150,
      sort: false
  });
  
  if (this.selection == null) {
    let bankCopy = bank.getDOM();
    document.getElementById('selection').appendChild(bankCopy);
    this.selection = new Sortable(bankCopy, {
        draggable: '.patchContainer',
        group: 'patches',
        animation: 150,
        multiDrag: true,
        selectedClass: 'selected',
        onSort: function() {
            PatchBankApp.bank = null;
            PatchBankApp.audioSamples = null;
            PatchBankApp.excludeOutOfRangePatches();
        }
    });
    document.getElementById('transfer').style.visibility = 'visible';
    PatchBankApp.makeBank();
  }
}

PatchBankApp.excludeOutOfRangePatches = function() {
  var children = document.getElementById('selection').children[0].children;
  for (var i = 0; i < children.length; i++) {
    children[i].classList.remove('included');
    children[i].classList.remove('excluded');
    children[i].classList.add(i < 32 ? 'included' : 'excluded');
  }
  this.deselect = true;
}

PatchBankApp.loadSYX = function(element) {
  if (!element.files[0]) {
    return;
  }
  for (let file of element.files) {
    let bankName = file.name.replace('.syx', '').replace('.SYX', '');
    let reader = new FileReader();
    reader.onload = function(e) {
      let data = e.target.result;
      if (PatchBank.validate(data)) {
        PatchBankApp.addBank(new PatchBank(bankName, data));
      }
    }
    reader.readAsArrayBuffer(file);
  }
}

// Transfer to Plaits.

PatchBankApp.setVolume = function(element) {
  if (!this.gain) {
    return;
  }
  let gain = parseFloat(element.value);
  this.gain.gain.value = Math.pow(gain, 1.5);
};

PatchBankApp.playEncodedData = function() {
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

PatchBankApp.playStop = function() {
  if (this.synthSource) {
    this.playStopSynth();
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

PatchBankApp.download = function(syx) {
  this.makeBank();
  if (!syx) {
    this.makeAudioSamples();
  }
  
  let buffer = syx ? this.bank.syx : this.encoder.toWAV(this.audioSamples);
  let blob = new Blob([buffer],
      {type: syx ? 'application/x-sysex' : 'audio/wav'});
  let a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = this.bank.name + (syx ? '.syx' : '.wav');
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

PatchBankApp.makeAudioSamples = function() {
  if (this.audioSamples) {
    return;
  }
  this.makeBank();
  this.audioSamples = this.encoder.code(this.bank.data, [2, 4]);
}

PatchBankApp.displayProgress = function() {
  let transferSource = PatchBankApp.transferSource;
  let progressBar = document.getElementById('progressBar');
  let visible = false;
  if (transferSource) {
    let progress = transferSource.context.currentTime / transferSource.buffer.duration * 100;
    if (progress <= 100) {
      progressBar.value = progress;
      progressBar.innerHTML = progress.toFixed(1) + '%';
      visible = true;
    } else {
      PatchBankApp.playStop();
    }
  }
  progressBar.style.visibility = visible ? 'visible' : 'hidden';
  
  if (PatchBankApp.deselect) {
    PatchBankApp.selection.multiDrag._deselectMultiDrag();
    PatchBankApp.deselect = false;
  }
}

setInterval(PatchBankApp.displayProgress, 500);

new Sortable(document.getElementById('trash'), {
    draggable: '.patchContainer',
    group: { name: 'patches', pull: false, put: true },
    multiDrag: true,
    selectedClass: 'selected',
    animation: 0,
    sort: false
});
