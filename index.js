import compileMedia from './src/media/index.js';
import compileStyles from './src/styles/index.js';
import compileScripts from "./src/scripts/config.js";

// todo: capture and pass down the compiler options, e.g. watch, minify, dev, prod, etc.
const options = {};

await compileMedia(options)
await compileStyles(options)
await compileScripts(options)
