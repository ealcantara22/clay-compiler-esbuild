import compileMedia from './src/media/config.js';
import compileStyles from './src/styles/config.js';
import compileScripts from "./src/scripts/config.js";
import compileFonts from "./src/fonts/config.js";

/**
 * Executes media and styles compilation tasks in parallel and returns their results.
 *
 * The method initiates two asynchronous tasks: one for handling media compilation
 * (`compileMedia`) and the other for handling styles compilation (`compileStyles`).
 * These tasks execute concurrently, and their results are waited for and returned
 * as part of an object.
 *
 * @return {Promise}
 */
async function mediaAndStylesParallelTasks() {
  const mediaTask = compileMedia();
  const stylesTask = compileStyles();

  return {
    styles: await stylesTask,
    media: await mediaTask,
  }
}


/**
 * Executes font compilation and script compilation tasks in parallel,
 * resolving both tasks and returning their results in an object.
 *
 * @return {Promise}
 */
async function fontsAndScriptsParallelTasks() {
  const fontsTask = compileFonts();
  const scriptsTask = compileScripts();

  return {
    fonts: await fontsTask,
    scripts: await scriptsTask,
  }
}

/**
 * Orders matter:
 * First process media and styles in parallel, then process fonts and scripts also in parallel.
 * - font compilation relies on the public/css to write the buckets, so, style compilation must run fist to ensure the
 * dir and prevents clearing out the dir.
 *
 * scripts compilation, specifically templates reference assets in component/media, so media needs to be run first,
 * additionally, it writes kiln plugin styles in public/css so styles also need to be run first
 */
await mediaAndStylesParallelTasks()
await fontsAndScriptsParallelTasks()
