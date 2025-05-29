import path from "node:path";
import process from "node:process";
import * as esbuild from 'esbuild';
import fs from 'fs-extra';
import { globby } from "globby";
import { parse } from "acorn";
import { simple } from "acorn-walk";
import MagicString from "magic-string";
import { getModuleId, resolveModule} from "./helpers.js";
import vueSfcHandler from "./vue-sfc-handler.js";
import _keyBy from "lodash/keyBy.js";

const publicDir = path.resolve(process.cwd(), 'public', 'js');
const registryPath = path.join(publicDir, '_registry.json');
const idsPath = path.join(publicDir, '_ids.json');
const clientEnvPath = path.join(publicDir, '_client-env.json');
const paths =  { publicDir, registryPath, idsPath, clientEnvPath };

// globs: commented for now, as we're on early development
// const componentClientsSrc = await globby(path.join(process.cwd(), 'components', '**', 'client.js'));
// const componentModelsSrc = await globby(path.join(process.cwd(), 'components', '**', 'model.js'));
// const componentKilnGlob = await globby(path.join(process.cwd(), 'components', '**', 'kiln.js'));
// const layoutClientsSrc = await globby(path.join(process.cwd(), 'layouts', '**', 'client.js'));
// const layoutModelsSrc = await globby(path.join(process.cwd(), 'layouts', '**', 'model.js'));
// const entryFiles = []
//   .concat(componentClientsSrc)
//   .concat(componentModelsSrc)
//   .concat(componentKilnGlob)
//   .concat(layoutClientsSrc)
//   .concat(layoutModelsSrc);

//todo: replace with process.cwd(), hardcoding this for now, also, check helpers.js getModuleId method
const cwd = '<path to your project>';
const entryFiles = [
  path.join(cwd, 'components', 'my-test-component', 'client.js'), // todo: replace with your actual component
]

let isWatching = false;

// esbuild config
const config = {
  entryPoints: entryFiles,
  bundle: false,
  write: false, // Don't write bundled output
  metafile: false,
  platform: 'browser',
  outdir: publicDir,
  sourcemap: false,
  plugins: [ clayScriptPlugin() ]
};

// temp init method
async function init(watch = false) {
  try {
    if (watch) {
      // watch
      const context = await esbuild.context(config);
      console.log('watching ...');
      await context.watch()
    } else {
      // build
      await esbuild.build(config);
      console.log('success...')
    }
  } catch (error) {
    console.error(error);
  }
}

/**
 * A plugin for processing and caching module information during the build process.
 * The plugin tracks resolved modules, processes them, and outputs registry and ID information.
 *
 * @param {object} [options={}] Configuration options for the plugin.
 * @return {object} Returns the plugin object containing name and setup functions.
 */
function clayScriptPlugin(options = {}) {
  return {
    name: 'clay-script',
    setup(build) {
      const registry = {};
      const ids = {};
      const cachedIds = new Map();

      build.onStart(() => {
        // called before build starts, the idea is to pre-process node-globals (process, global, etc), and built-ins here
        // so they're properly available to all modules and we can replace them with their browser equivalents
        // ex. path -> path-browserify
      })

      // track all resolved modules
      build.onResolve({ filter:/.*/ }, async (args) => {
        const filePath = args.path;

        await processModule(filePath, cachedIds, registry, ids);

        return null;
      });

      build.onEnd(async () => {
        // called after build is complete, write registry and ids to disk
        // we can handle cleanup, to write one time files to disk (env, client-init, etc), and enable watch mode

        await fs.outputJson(paths.registryPath, registry, {spaces: 2});
        await fs.outputJson(paths.idsPath, ids, {spaces: 2});

        // watch works, but it needs to by pass the cached Ids
        // to test, watch mode, uncomment the line below, and call init(true)
        // isWatching = true
      });
    }
  }
}

/**
 * Processes a module by reading its content, extracting dependencies, transforming it into a browser-compatible format,
 * and storing the result on disk. Additionally, handles `.vue` and `.json` files with specific transformations.
 *
 * @param {string} filePath - The path to the module file to be processed.
 * @param {Map<string, number>} cachedIds - A map of already processed file paths to their unique module IDs.
 * @param {Object} registry - An object used to keep track of module dependencies, keyed by module IDs.
 * @param {Object.<string, number>} ids - A map of file paths to module IDs, used for quick lookups.
 * @return {Promise<void>} A promise that resolves when processing is complete or rejects if an error occurs.
 */
async function processModule(filePath, cachedIds, registry, ids) {
  let moduleId;

  if (cachedIds.has(filePath) && ids[filePath]) {
    // already processed
    if (!isWatching) return;

    // already processed, but watch mode is on, so we need the module ID in cache
    moduleId = cachedIds.get(filePath);
  }

  moduleId = moduleId || getModuleId(filePath);
  cachedIds.set(filePath, moduleId);
  ids[filePath] = moduleId;
  registry[moduleId] = [];

  let code; // hold the file content

  try {
    code = await fs.readFile(filePath, 'utf8');
  } catch (e) {
    console.error(`error reading file: ${filePath}`, e);
  }

  if (!code) return;

  const isVue = filePath.endsWith('.vue');
  const isJson = filePath.endsWith('.json');
  const basedir = path.dirname(filePath);
  const toProcess = []; // unprocessed dependencies
  const prependContent = `window.modules["${moduleId}"] = [function(require,module,exports){`;

  // const fileName = getOutputPath(filePath, moduleId); todo
  const fileName = `${moduleId}.js`;

  // compile vue to JS before creating the magic string
  if (isVue) {
    try {
      const vueSFC = await vueSfcHandler({
        filename: fileName,
        source: code,
        extractCss: false, // todo: resolve css
        production: false,
        postcssPlugins: [],
        // assembleOptions,
      });

      if (vueSFC.code) code = vueSFC.code;
      // if (vueSFC.map) sourceMap = vueSFC.map; // todo
    } catch (e) {
      console.error(`error parsing vue file: ${filePath}`, e);
    }
  }

  // magic-string for file content manipulation
  const s = new MagicString(code);

  if (isJson) {
    s.prepend(prependContent + "module.exports=");
    s.append('},{}];');

    // write to disk
    await fs.writeFile(path.join(paths.publicDir, fileName), s.toString());
    return;
  }

  // travel AST and replace require() with require(<module ID>))
  try {
    const ast = parse(code, {ecmaVersion: 2020, sourceType: 'module'});

    // require replacement
    simple(ast, {
      async CallExpression(node) {
        if (node.callee.type === 'Identifier' && node.callee.name === 'require' && node.arguments.length === 1 && node.arguments[0].type === 'Literal') {
          const requirePath = node.arguments[0].value;
          const resolvedPath = resolveModule(requirePath, basedir);

          if (!resolvedPath) return;

          let dependencyId;

          if (!cachedIds.has(resolvedPath)) {
            dependencyId = getModuleId(resolvedPath);
            cachedIds.set(resolvedPath, dependencyId);
            toProcess.push(resolvedPath);
          } else {
            dependencyId = cachedIds.get(resolvedPath);
          }

          if (!registry[moduleId].includes(dependencyId))
            registry[moduleId].push(dependencyId);

          // Replace 'require' with 'require(<module ID>)'
          s.overwrite(node.start, node.end, `require(${dependencyId})`);
        }
      }
    });

  } catch (e) {
    console.error(`AST error: ${filePath}`, e);
    return;
  }

  // prepend and append the browserify module header and footer
  const dependencies = registry[moduleId];
  const dependenciesObj = _keyBy(dependencies || [], (number) => number.toString());
  const appendContent = `}, ${JSON.stringify(dependenciesObj)}];`;

  s.prepend(prependContent);
  s.append(appendContent);

  // write to disk
  await fs.writeFile(path.join(paths.publicDir, fileName), s.toString());

  // process module dependencies
  return processModuleDependencies(toProcess, cachedIds, registry, ids);
}

/**
 * Processes a list of module dependencies by invoking a handler function for each dependency.
 *
 * @param {string[]} dependencies - An array of file paths representing module dependencies. Defaults to an empty array if not provided.
 * @param {Map<string, number>} cachedIds - A set containing cached module IDs to prevent redundant processing.
 * @param {Object} registry - A registry mapping module paths to their processed data.
 * @param {Object} ids - A set for tracking IDs of processed modules.
 * @return {Promise<void>} A promise that resolves when all module dependencies are processed.
 */
async function processModuleDependencies(dependencies = [], cachedIds, registry, ids) {
  for (const filePath of dependencies) {
    await processModule(filePath, cachedIds, registry, ids);
  }
}

await init()
