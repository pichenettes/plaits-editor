const typescript = require("@rollup/plugin-typescript");
const terser = require("@rollup/plugin-terser");

module.exports = {
	input: "src/patch_bank.js",
	output: {
		file: "public/assets/patch_bank.min.js",
		format: "iife",
		name: "PatchBank",
		// plugins: [terser()],
	},
	plugins: [typescript()],
};
