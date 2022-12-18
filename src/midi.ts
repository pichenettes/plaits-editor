type AccessStatus = "denied" | "granted" | "uninitialized" | "unsupported" | "error";

type MidiMessage = {
	command: number;
	channel: number;
	note: number;
	velocity: number;
};

export interface MidiConstructor {
	new (): Midi;
}

export class Midi {
	#midiAccess?: WebMidi.MIDIAccess;
	#accessStatus: AccessStatus = "uninitialized";

	/**
	 * Initialize on a user permission request
	 */
	async requestAccess(): Promise<AccessStatus> {
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
	 * @returns A list of MIDI input devices.
	 */
	getInputs(): WebMidi.MIDIInput[] {
		if (!this.#midiAccess) return [];
		return [...this.#midiAccess.inputs.values()];
	}

	/**
	 * Get a list of MIDI output devices.
	 *
	 * @returns A list of MIDI output devices.
	 */
	getOutputs(): WebMidi.MIDIOutput[] {
		if (!this.#midiAccess) return [];
		return [...this.#midiAccess.outputs.values()];
	}

	get accessStatus() {
		return this.#accessStatus;
	}

	/**
	 * @param midiAccess - Successful MIDI access response object.
	 */
	#onSuccess = (midiAccess: WebMidi.MIDIAccess) => {
		this.#accessStatus = "granted";
		this.#midiAccess = midiAccess;
		console.log(`Midi: access granted`);
	};

	/**
	 *
	 * @param reason - The reason for the MIDI access failure.
	 */
	#onFailure = (reason: any) => {
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
