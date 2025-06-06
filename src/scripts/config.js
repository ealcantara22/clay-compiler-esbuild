import path from "node:path";
import process from "node:process";
import * as esbuild from 'esbuild';
import fs from 'fs-extra';
import { globby } from "globby";
import { parse } from "acorn";
import { simple } from "acorn-walk";
import acornGlobals from "acorn-globals";
import MagicString from "magic-string";
import { getModuleId, resolveModule} from "./helpers.js";
import vueSfcHandler from "./vue/vue-sfc-handler.js";
import { builtIns, supportedGlobals } from "./node/polyfills.js";
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

const nodeBuiltIns = Object.keys(builtIns);
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

      build.onStart(async () => {
        // called before build starts, the idea is to pre-process node-globals (process, global, etc), and built-ins here
        // so they're properly available to all modules and we can replace them with their browser equivalents
        // ex. path -> path-browserify
        await registerGlobalsAndBuiltInsPolyfills(cachedIds, registry, ids);
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

  if (cachedIds.has(filePath)) { // module has already been detected

    // module already processed, do not process it again unless watch mode is enabled
    if (ids[filePath] && !isWatching) return;

    moduleId = cachedIds.get(filePath);
  } else {
    moduleId = getModuleId(filePath);
    cachedIds.set(filePath, moduleId);
  }

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
  const replacementTasks = []; // module replacement async operations queue
  const foundSupportedGlobals = []; // dedupe list of node globals found in this file

  let prependContent = `window.modules["${moduleId}"] = [function(require,module,exports){`;
  let appendContent = '';

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
      process.exit(1); // todo: handle this better
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
    const foundGlobals = acornGlobals(code);

    for (const g of foundGlobals) {
      if (supportedGlobals.includes(g.name) && !foundSupportedGlobals.includes(g.name))
        foundSupportedGlobals.push(g.name);
    }

    // AST walking is a synchronous operation. to ensure the logic executes in the correct order without
    // race conditions, async I/O operations must be queued and processed after the walk is complete.
    simple(ast, {
      async CallExpression(node) {
        if (node.callee.type === 'Identifier' && node.callee.name === 'require' && node.arguments.length === 1 && node.arguments[0].type === 'Literal') {
          const requirePath = node.arguments[0].value;

          if (nodeBuiltIns.includes(requirePath)) {
            const builtInPath = builtIns[requirePath];
            const builtInId = ids[builtInPath];

            // Replace 'require' builtin with 'require(< builtIn polyfill ID>)'
            s.overwrite(node.start, node.end, `require(${builtInId})`);
            return; // return as builtins don't have dependencies
          }

          replacementTasks.push({
            basedir,
            moduleId,
            node,
            requirePath,
          });
        }
      }
    });

    await processReplacements(replacementTasks, s, toProcess, cachedIds, registry);

  } catch (e) {
    console.error(`AST error: ${filePath}`, e);
    return;
  }

  if (foundSupportedGlobals.length > 0) {
    const { append, prepend } = await handleFileContentWithGlobals(filePath, foundSupportedGlobals, ids);

    prependContent += prepend;
    appendContent += append;
  }

  // prepend and append the browserify module header and footer
  const dependencies = registry[moduleId];
  const dependenciesObj = _keyBy(dependencies || [], (number) => number.toString());

  appendContent += `}, ${JSON.stringify(dependenciesObj)}];`;

  s.prepend(prependContent);
  s.append(appendContent);

  // write to disk
  await fs.writeFile(path.join(paths.publicDir, fileName), s.toString());

  // process module dependencies
  return processModuleDependencies(toProcess, cachedIds, registry, ids);
}

/**
 * Processes a list of replacement tasks by resolving module paths, updating dependencies,
 * and ensuring the proper client-side counterpart exists for server-side services. Replaces
 * specified nodes with updated `require` statements containing resolved module IDs.
 *
 * @param {Array<Object>} replacementTasks - A list of replacement tasks containing necessary information to process each replacement.
 * @param {Object} s - The object used to overwrite source code during the replacement process.
 * @param {Array<string>} toProcess - A list of module paths that still need to be processed.
 * @param {Map<string, number>} cachedIds - A cache mapping resolved module paths to their respective dependency IDs for performance optimization.
 * @param {Object} registry - A structure mapping module IDs to their respective dependency IDs.
 * @return {Promise<void>} A promise that resolves once all replacement tasks have been processed.
 */
async function processReplacements(replacementTasks = [], s, toProcess, cachedIds, registry) {
  for (const task of replacementTasks) {
    const { basedir, moduleId, node, requirePath } = task;

    let resolvedPath = resolveModule(requirePath, basedir);

    if (!resolvedPath) return;

    if (resolvedPath.includes('/services/server')) {
      resolvedPath = resolvedPath.replace('/services/server', '/services/client');
      const resolvedPathExists = await fs.pathExists(resolvedPath);

      if (!resolvedPathExists) {
        console.error(`A server-side only service must have a client-side counterpart: ${requirePath} -> ${resolvedPath}`);
        process.exit(1); // todo: handle this better
      }
    }

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

/**
 * Asynchronously registers global and built-in polyfills by processing each module in the input list.
 *
 * @param {Map<string, number>} cachedIds - A cache object that holds identifiers of previously processed modules.
 * @param {Object} registry - Registry object that manages module registrations and dependencies.
 * @param {Object<string, number>} ids - A map of identifiers to be used for tracking and linking modules.
 * @return {Promise<void>} A promise that resolves when all modules have been processed and registered.
 */
async function registerGlobalsAndBuiltInsPolyfills(cachedIds, registry, ids) {
  for (const filePath of Object.values(builtIns)) {
    await processModule(filePath, cachedIds, registry, ids);
  }
}

/**
 * Processes the file content with the provided global variables and IDs,
 * constructing a prepended and appended string to wrap the file content.
 *
 * @param {string} filePath - The path to the file to be processed.
 * @param {string[]} globals - An array of global variable names to include in the wrapper.
 * @param {Object<string, number>} ids - An object containing the mapping of required module IDs for specified global variables.
 * @return {Object} Returns an object containing two string properties: `prepend` and `append`
 * which represent the constructed wrapper strings for the file content.
 */
async function handleFileContentWithGlobals(filePath, globals, ids) {
  let prepend = `(function (${globals.join(',')}){(function (){`;
  let append = '}).call(this)}).call(this,';

  // todo: change, use process.cwd
  const cwd = '<path to your project>';

  globals.forEach((item, index, arr) => {
    const isLast = (arr.length === index + 1);

    if (item === 'Buffer') {
      append += `require(${ids[builtIns.buffer]}).Buffer`;
    }

    if (item === 'process') {
      append += `require(${ids[builtIns.process]})`;
    }

    if (item === '__filename') {
      append += `"/${path.relative(cwd, filePath)}"`;
    }

    if (item === '__dirname') {
      append += `"/${path.dirname(path.relative(cwd, filePath))}"`;
    }

    if (!isLast) append += ',';
    if (isLast) append += ')';
  });

  return { append, prepend };
}

await init()
