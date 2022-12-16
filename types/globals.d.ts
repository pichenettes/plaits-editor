import type { MidiDevices } from '../src/midi_devices';
import type { MidiNote } from '../src/midi_message';

declare global {
  const PatchBankApp: {
    turnOnNote(message: MidiNote): void;
    turnOffNote(message: MidiNote): void;
  };

  interface Window {
    Midi: { Devices: MidiDevices };
  }
}
