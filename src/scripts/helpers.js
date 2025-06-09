import path from "node:path";
import process from "node:process";
import _last from 'lodash/last.js';
import fs from 'fs-extra';

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
  //todo: replace with process.cwd(), hardcoding this for now
  const cwd = '<path to your project>';

  // todo: revisit, this was copy from clay-cli, but we're going to handle legacyIds resolution a bit differently

  const name = file.split('/').slice(-2)[0];
  const isKilnPlugin = file.includes(path.join(cwd, 'services', 'kiln'));
  const isLegacyFile = legacyFiles.includes(file);
  const fileTypes = ['client', 'kiln', 'model'];

  if (isKilnPlugin) {
    const parsedPath = path.parse(file);
    return `${ _last(parsedPath.dir.split(path.sep))}_${parsedPath.name}.kilnplugin`;
  } else if (isLegacyFile) {
    return `${path.parse(file).name}.legacy`;
  } else if (file.includes(path.join(cwd, 'components'))) {
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
 * Simple module resolver using fs-extra and Node's resolution algorithm.
 * @param {string} modulePath - content of the require statement
 * @param {string} basedir - directory where the require statement is located
 * @returns {string|null} - resolved path or null if not found
 */
export function resolveModule(modulePath, basedir) {
  try {
    // Handle relative paths
    if (modulePath.startsWith('./') || modulePath.startsWith('../')) {
      const resolved = path.resolve(basedir, modulePath);
      // Try with extensions
      for (const ext of ['.js', '.json', '.vue', '.ts']) {
        if (fs.existsSync(resolved + ext)) {
          return resolved + ext;
        }
      }
      // Try as directory with index file
      for (const ext of ['.js', '.json']) {
        const indexFile = path.join(resolved, 'index' + ext);
        if (fs.existsSync(indexFile)) {
          return indexFile;
        }
      }
      return resolved;
    }

    // Handle node_modules resolution
    let currentDir = basedir;
    while (currentDir !== path.dirname(currentDir)) {
      const nodeModulesPath = path.join(currentDir, 'node_modules', modulePath);

      // Try direct file
      for (const ext of ['.js', '.json', '.vue', '.ts']) {
        if (fs.existsSync(nodeModulesPath + ext)) {
          return nodeModulesPath + ext;
        }
      }

      // Try as package directory
      if (fs.existsSync(nodeModulesPath)) {
        const packageJsonPath = path.join(nodeModulesPath, 'package.json');
        if (fs.existsSync(packageJsonPath)) {
          const pkg = fs.readJsonSync(packageJsonPath);
          const main = pkg.main || pkg.module || 'index.js';
          const mainPath = path.join(nodeModulesPath, main);
          if (fs.existsSync(mainPath)) {
            return mainPath;
          }
        }

        // Try index files
        for (const ext of ['.js', '.json']) {
          const indexFile = path.join(nodeModulesPath, 'index' + ext);
          if (fs.existsSync(indexFile)) {
            return indexFile;
          }
        }
      }

      currentDir = path.dirname(currentDir);
    }

    return null;
  } catch (err) {
    return null;
  }
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
 * Replicate getOutfile logic
 * // todo: revisit to include the rest of use cases, check clay-cli's getOutfile
 */
export function getOutputPath(filePath, moduleId) {
  const destPath = path.resolve(process.cwd(), 'public', 'js');
  const moduleIdStr = (moduleId || '').toString();

  if (moduleIdStr.endsWith('.kilnplugin')) {
    return path.join(destPath, '_kiln-plugins.js');
  } else if (moduleIdStr.endsWith('.legacy')) {
    return path.join(destPath, `${moduleIdStr}.js`);
  } else if (moduleIdStr.endsWith('.model')) {
    return path.join(destPath, `${moduleIdStr}.js`);
  } else if (moduleIdStr.endsWith('.client')) {
    return path.join(destPath, `${moduleIdStr}.js`);
  } else {
    return path.join(destPath, `${moduleIdStr}.js`);
  }
}
