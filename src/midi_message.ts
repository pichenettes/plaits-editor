export const STATUS_BYTE = 0xf0;
export const CHANNEL_BYTE = 0x0f;
export const DATA_BYTE = 0x7f;

// Status byte values that indicate the different midi notes
export const StatusByte = {
  NOTE_OFF: 0x80,
  NOTE_ON: 0x90,
  KEY_PRESSURE: 0xa0,
  CC: 0xb0,
  PROGRAM_CHANGE: 0xc0,
  CHANNEL_PRESSURE: 0xd0,
  PITCH_BEND: 0xe0,
} as const;

// CC values that indicate special CC Modes.
export const CCModeValues = {
  ALL_SOUNDS_OFF: 120,
  RESET_ALL: 121,
  LOCAL_CONTROLLER: 122,
  ALL_NOTES_OFF: 123,
  OMNI_OFF: 124,
  OMNI_ON: 125,
  MONO_ON: 126,
  POLY_ON: 127,
} as const;

type ValueOf<T> = T[keyof T];
type MidiStatus = ValueOf<typeof StatusByte>;
type MidiNoteStatus = typeof StatusByte.NOTE_ON | typeof StatusByte.NOTE_OFF;

export type MidiNote = {
  status: MidiStatus;
  channel: number;
  note: number;
  velocity: number;
};

// Might add other MIDI message types.
// type MidiMessage = MidiNote;

export function parseNote(data: Uint8Array): MidiNote {
  return {
    status: (data[0] & CHANNEL_BYTE) as MidiNoteStatus,
    channel: data[0] & STATUS_BYTE,
    note: data[1],
    velocity: data[2] / 127,
  };
}
