import path from "node:path";
import process from "node:process";
import { globby } from "globby";
import _last from 'lodash/last.js';

let numericIdCounter = 1;

export function generateNumericId() {
  return numericIdCounter++;
}

/**
 * Returns a module ID for a given file.
 * @param {string} file absolute file path
 * @param {array} legacyFiles
 * @return {string|undefined} module id
 */
export function getModuleId(file = '', legacyFiles = []) {
  const name = file.split('/').slice(-2)[0];
  const isKilnPlugin = file.includes(path.join(process.cwd(), 'services', 'kiln'));
  const isLegacyFile = legacyFiles.includes(file);
  const fileTypes = ['client', 'kiln', 'model'];

  if (isKilnPlugin) {
    const parsedPath = path.parse(file);
    return `${ _last(parsedPath.dir.split(path.sep))}_${parsedPath.name}.kilnplugin`;
  } else if (isLegacyFile) {
    return `${path.parse(file).name}.legacy`;
  } else if (file.includes(path.join(process.cwd(), 'components'))) {
    for (let fileType of fileTypes) {
      if (file.endsWith(`${fileType}.js`)) {
        return `${name}.${fileType}`;
      }
    }
  }
  // Return numeric ID if no pattern matches
  return generateNumericId();
}

/**
 * Determines the bucket category of a filename based on its starting letter.
 *
 * @param {string} name The name of the file to categorize.
 * @return {string} The bucket identifier indicating the range (e.g., 'a-d', 'e-h').
 */
export function getBucketByFilename(name) {
  if (name.match(/^[a-d]/i)) {
    return 'a-d';
  } else if (name.match(/^[e-h]/i)) {
    return 'e-h';
  } else if (name.match(/^[i-l]/i)) {
    return 'i-l';
  } else if (name.match(/^[m-p]/i)) {
    return 'm-p';
  } else if (name.match(/^[q-t]/i)) {
    return 'q-t';
  } else {
    return 'u-z';
  }
}

/**
 * Retrieves a flattened array of legacy file paths that match the provided globs.
 * The method uses the current working directory as the base path for resolving the globs.
 *
 * @param {string[]} globs - An array of glob patterns to match files against.
 * @return {Promise<string[]>} A promise that resolves to a flattened array of file paths matching the provided globs.
 */
export async function getLegacyFilesByGlobs(globs = []) {
  if (!globs.length) return [];

  const patterns = globs.map(glob => path.join(process.cwd(), glob));
  return globby(patterns);
}
