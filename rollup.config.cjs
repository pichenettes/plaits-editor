const typescript = require('@rollup/plugin-typescript');
const terser = require('@rollup/plugin-terser');

module.exports = {
  input: 'src/midi_devices.ts',
  output: {
    file: 'public/assets/midi.min.js',
    format: 'iife',
    name: 'Midi',
    // plugins: [terser()],
  },
  plugins: [typescript()],
};
