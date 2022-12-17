const STATUS_BYTE = 0xf0;
const CHANNEL_BYTE = 0x0f;
const DATA_BYTE = 0x7f;

// Status byte values that indicate the different midi notes
const StatusByte = {
  NOTE_OFF: 0x80,
  NOTE_ON: 0x90,
  KEY_PRESSURE: 0xa0,
  CC: 0xb0,
  PROGRAM_CHANGE: 0xc0,
  CHANNEL_PRESSURE: 0xd0,
  PITCH_BEND: 0xe0,
};

// CC values that indicate special CC Modes.
const CCModeValues = {
  ALL_SOUNDS_OFF: 120,
  RESET_ALL: 121,
  LOCAL_CONTROLLER: 122,
  ALL_NOTES_OFF: 123,
  OMNI_OFF: 124,
  OMNI_ON: 125,
  MONO_ON: 126,
  POLY_ON: 127,
};

/**
 * @typedef {'denied'|'granted'|'uninitialized'|'unsupported'|'error'} AccessStatus
 */

/**
 * @typedef MidiNote
 * @property {number} status
 * @property {number} channel
 * @property {number} note
 * @property {number} velocity
 */

/**
 * Parse MIDI note on or off message.
 *
 * @param {Uint8Array} data
 * @returns {MidiNote}
 */
function parseNote(data) {
  return {
    status: data[0] & CHANNEL_BYTE,
    channel: data[0] & STATUS_BYTE,
    note: data[1],
    velocity: data[2] / 127,
  };
}

class Midi {
  /** @type {WebMidi.MIDIAccess|undefined} */
  #midiAccess;

  /** @type {AccessStatus} */
  #accessStatus = "uninitialized";

  /**
   * Initialize on a user permission request
   *
   * @returns {Promise<AccessStatus>}
   */
  async requestAccess() {
    if (this.#accessStatus !== "granted") {
      await navigator
        .requestMIDIAccess()
        .then((midiAccess) => this.#onSuccess(midiAccess))
        .catch((reason) => this.#onFailure(reason));
    }
    return this.#accessStatus;
  }

  /**
   * Get a list of MIDI input devices.
   *
   * @returns {WebMidi.MIDIInput[]} A list of MIDI input devices.
   */
  getInputs() {
    if (!this.#midiAccess) return [];
    return [...this.#midiAccess.inputs.values()];
  }

  /**
   * Get a list of MIDI output devices.
   *
   * @returns {WebMidi.MIDIOutput[]} A list of MIDI output devices.
   */
  getOutputs() {
    if (!this.#midiAccess) return [];
    return [...this.#midiAccess.outputs.values()];
  }

  get accessStatus() {
    return this.#accessStatus;
  }

  /**
   * @param {WebMidi.MIDIAccess} midiAccess - Successful MIDI access response object.
   */
  #onSuccess = (midiAccess) => {
    this.#accessStatus = "granted";
    this.#midiAccess = midiAccess;
    console.log(`Midi: access granted`);
  };

  /**
   *
   * @param {any} reason - The reason for the MIDI access failure.
   */
  #onFailure = (reason) => {
    if (reason instanceof DOMException) {
      switch (reason.name) {
        case "NotSupportedError":
          this.#accessStatus = "unsupported";
          break;
        case "SecurityError":
          this.#accessStatus = "denied";
          break;
        default:
          this.#accessStatus = "error";
      }
    }
    console.log(`Midi: access failed, reason: ${reason}`);
  };
}

class MidiDevices {
  /** @type {HTMLElement | null} */
  #el;

  /** @type {WebMidi.MIDIInput | null} */
  #device = null;

  #midi = new Midi();

  constructor() {
    this.#el = document.querySelector("#midi");
  }

  /**
   * Request MIDI access from the user.
   *
   * Should be called on a user interaction, like a click event.
   * @returns {void}
   */
  requestAccess() {
    this.#midi
      .requestAccess()
      .then(() => this.showList())
      .catch((error) => this.showError(error));
  }

  /**
   * Use a MIDI device based on its id.
   *
   * @param {string} inputId
   * @returns {void}
   */
  use(inputId) {
    const input = this.#midi.getInputs().find(({ id }) => id === inputId);

    if (!input) {
      this.showError("Could not connect to MIDI device.");
      return;
    }

    this.#device = input;

    this.#device.onmidimessage = (e) => {
      if (!this.connected()) return;
      const data = e.data;
      const status = data[0] & 0xf0;
      // might want to parse other message types, so using a switch here.
      switch (status) {
        case StatusByte.NOTE_ON: {
          PatchBankApp.turnOnNote(parseNote(data));
          break;
        }
        case StatusByte.NOTE_OFF: {
          PatchBankApp.turnOffNote(parseNote(data));
          break;
        }
      }
    };

    this.showDevice();
  }

  /**
   * Disconnect a MIDI device.
   *
   * @returns {void}
   */
  disconnect() {
    this.#device = null;
    this.showList();
  }

  /**
   * Check if a MIDI device is connected.
   *
   * @returns {boolean}
   */
  connected() {
    return this.getDevice() !== null;
  }

  /**
   * Get the connected MIDI input device if connected.
   *
   * @returns {WebMidi.MIDIInput | null}
   */
  getDevice() {
    if (!this.#device) return null;
    if (this.#device.connection !== "open") return null;
    return this.#device;
  }

  /**
   * Show a button to request MIDI access.
   *
   * @returns {void}
   */
  showRequestAccess() {
    if (!this.#el) return;
    if (this.#midi.accessStatus === "granted") {
      this.#el.innerHTML = /* html */ `
        <button type="button" onclick="{MidiDevicesApp.showList();">
          Use MIDI
        </button>
      `;
    } else {
      this.#el.innerHTML = /* html */ `
        <button type="button" onclick="MidiDevicesApp.requestAccess();">
          Use MIDI
        </button>
      `;
    }
  }

  /**
   * Show the list of possible MIDI input devices to connect.
   *
   * @returns {void}
   */
  showList() {
    if (!this.#el || !(this.#midi.accessStatus === "granted")) return;

    const devices = this.#midi.getInputs().map((input) => {
      return /* html */ `
        <li>
          <button onclick="MidiDevicesApp.use('${input.id}');">
            ${input.name || input.id}
          </button>
        </li>
      `;
    });

    this.#el.innerHTML = /* html */ `
      <ul>
        ${devices.join(" ")}
      </ul>
    `;
  }

  /**
   * Show the currently connected device
   *
   * @returns {void}
   */
  showDevice() {
    if (!this.#el || !this.#device) return;

    const device = this.#device;

    this.#el.innerHTML = /* html */ `
      <div>
        <div>
          Midi Device: ${device.name || device.id}
          <button onclick="MidiDevicesApp.disconnect();">Disconnect</button>
        </div>
      </div>
    `;
  }

  /**
   * Shows an error message.
   *
   * @param {string} message
   * @returns {void}
   */
  showError(message) {
    if (!this.#el) return;

    this.#el.innerHTML = /* html */ `
      <p>${message}</p>
    `;
  }
}

const MidiDevicesApp = new MidiDevices();
