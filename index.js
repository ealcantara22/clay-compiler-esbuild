import compileMedia from './src/media/config.js';
import compileStyles from './src/styles/config.js';
import compileScripts from "./src/scripts/config.js";
import compileFonts from "./src/fonts/config.js";

// todo: capture and pass down the compiler options, e.g. watch, minify, dev, prod, etc.
const options = {};

await compileMedia(options)
await compileStyles(options)
await compileFonts(options)
await compileScripts(options)
