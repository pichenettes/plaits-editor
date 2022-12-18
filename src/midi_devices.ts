import { Midi } from "./midi";
import { parseNote, StatusByte } from "./midi_message";

export class MidiDevices {
	#el: HTMLElement | null;
	#midi = new Midi();
	#device: WebMidi.MIDIInput | null = null;

	constructor() {
		this.#el = document.querySelector("#midi");
	}

	requestAccess() {
		this.#midi
			.requestAccess()
			.then(() => this.showList())
			.catch((error) => this.showError(error));
	}

	use(inputId: string) {
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

	disconnect() {
		this.#device = null;
		this.showList();
	}

	connected(): boolean {
		return this.getDevice() !== null;
	}

	getDevice(): WebMidi.MIDIInput | null {
		if (!this.#device) return null;
		if (this.#device.connection !== "open") return null;
		return this.#device;
	}

	showRequestAccess() {
		if (this.#midi.accessStatus === "granted") this.showList();
	}

	showList() {
		if (!this.#el || !(this.#midi.accessStatus === "granted")) return;

		const devices = this.#midi.getInputs().map((input) => {
			return /* html */ `
        <li>
          <button onclick="Midi.Devices.use('${input.id}');">
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

	showDevice() {
		if (!this.#el || !this.#device) return;

		const device = this.#device;

		this.#el.innerHTML = /* html */ `
      <div>
        <div>
          Midi Device: ${device.name || device.id}
          <button onclick="Midi.Devices.disconnect();">Disconnect</button>
        </div>
      </div>
    `;
	}

	showError(message: string) {
		if (!this.#el) return;

		this.#el.innerHTML = /* html */ `
      <p>${message}</p>
    `;
	}
}

export const Devices = new MidiDevices();
