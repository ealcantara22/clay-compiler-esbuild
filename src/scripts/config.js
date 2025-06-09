import path from "node:path";
import process from "node:process";
import * as esbuild from 'esbuild';
import fs from 'fs-extra';
import { globby } from "globby";
import { parse } from "acorn";
import { simple, ancestor } from "acorn-walk";
import acornGlobals from "acorn-globals";
import MagicString from "magic-string";
import { getBucketByFilename, getModuleId, resolveModule} from "./helpers.js";
import vueSfcHandler from "./vue/vue-sfc-handler.js";
import { builtIns, supportedGlobals } from "./node/polyfills.js";
import _keyBy from "lodash/keyBy.js";
import _isFinite from "lodash/isFinite.js";

const publicDir = path.resolve(process.cwd(), 'public', 'js');
const registryPath = path.join(publicDir, '_registry.json');
const idsPath = path.join(publicDir, '_ids.json');
const clientEnvPath = path.join(process.cwd(), 'client-env.json');
const paths =  { publicDir, registryPath, idsPath, clientEnvPath };

// globs: commented for now, as we're on early development
// const componentClientsSrc = await globby(path.join(process.cwd(), 'components', '**', 'client.js'));
// const componentModelsSrc = await globby(path.join(process.cwd(), 'components', '**', 'model.js'));
// const componentKilnGlob = await globby(path.join(process.cwd(), 'components', '**', 'kiln.js'));
// const layoutClientsSrc = await globby(path.join(process.cwd(), 'layouts', '**', 'client.js'));
// const layoutModelsSrc = await globby(path.join(process.cwd(), 'layouts', '**', 'model.js'));
// const kilnPluginsGlob = await globby(path.join(process.cwd(), 'services', 'kiln', 'index.js'));
// const entryFiles = []
//   .concat(componentClientsSrc)
//   .concat(componentModelsSrc)
//   .concat(componentKilnGlob)
//   .concat(layoutClientsSrc)
//   .concat(layoutModelsSrc);
//   .concat(kilnPluginsGlob);

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

// buckets
const bucketsConfig = {
  deps: {
    'a-d': { fileName: '_deps-a-d.js', content: '' },
    'e-h': { fileName: '_deps-e-h.js', content: '' },
    'i-l': { fileName: '_deps-i-l.js', content: '' },
    'm-p': { fileName: '_deps-m-p.js', content: '' },
    'q-t': { fileName: '_deps-q-t.js', content: '' },
    'u-z': { fileName: '_deps-u-z.js', content: '' },
  },
  kiln: {
    'a-d': { fileName: '_kiln-a-d.js', content: '' },
    'e-h': { fileName: '_kiln-e-h.js', content: '' },
    'i-l': { fileName: '_kiln-i-l.js', content: '' },
    'm-p': { fileName: '_kiln-m-p.js', content: '' },
    'q-t': { fileName: '_kiln-q-t.js', content: '' },
    'u-z': { fileName: '_kiln-u-z.js', content: '' },
  },
  models: {
    'a-d': { fileName: '_models-a-d.js', content: '' },
    'e-h': { fileName: '_models-e-h.js', content: '' },
    'i-l': { fileName: '_models-i-l.js', content: '' },
    'm-p': { fileName: '_models-m-p.js', content: '' },
    'q-t': { fileName: '_models-q-t.js', content: '' },
    'u-z': { fileName: '_models-u-z.js', content: '' },
  },
  kilnPlugins: {
    fileName: '_kiln-plugins.js',
    content: ''
  },
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
      const envs = []; // client-envs.json content

      build.onStart(async () => {
        // called before build starts, the idea is to pre-process node-globals (process, global, etc), and built-ins here
        // so they're properly available to all modules and we can replace them with their browser equivalents
        // ex. path -> path-browserify
        await registerGlobalsAndBuiltInsPolyfills(cachedIds, registry, ids, envs);
      })

      // track all resolved modules
      build.onResolve({ filter:/.*/ }, async (args) => {
        const filePath = args.path;

        await processModule(filePath, cachedIds, registry, ids, envs);

        return null;
      });

      build.onEnd(async () => {
        // called after build is complete, write registry and ids to disk
        // we can handle cleanup, to write one time files to disk (env, client-init, etc), and enable watch mode

        await fs.writeJson(paths.registryPath, registry, {spaces: 2});
        await fs.writeJson(paths.idsPath, ids, {spaces: 2});
        await fs.writeJson(paths.clientEnvPath, envs, {spaces: 2});

        // write each bucket content to disk
        await processBuckets();

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
 * @param {string[]} envs - holds found env vars.
 * @return {Promise<void>} A promise that resolves when processing is complete or rejects if an error occurs.
 */
async function processModule(filePath, cachedIds, registry, ids, envs) {
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
    await writeToDisk(filePath, moduleId, s.toString());

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
      CallExpression(node) {
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
      },
      MemberExpression(node) {
        if (
          node.object.type === 'MemberExpression' &&
          node.object.property &&
          node.object.property.type === 'Identifier' &&
          node.object.property.name === 'env' &&
          node.object.object &&
          node.object.object.type === 'Identifier' &&
          node.object.object.name === 'process' &&
          node.property &&
          node.property.type === 'Identifier'
        ) {
          const envName = node.property.name;

          // save the env var name into client-envs.json
          if (envs.indexOf(envName) === -1) envs.push(envName);

          // override to window.process.env
          s.overwrite(node.object.start, node.object.end, 'window.process.env');
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
  await writeToDisk(filePath, moduleId, s.toString());

  // process module dependencies
  return processModuleDependencies(toProcess, cachedIds, registry, ids, envs);
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
    const requireText = dependencyId.toString().endsWith('.kilnplugin')
      ? `require("${dependencyId}")`
      : `require(${dependencyId})`;

    s.overwrite(node.start, node.end, requireText);
  }
}

/**
 * Processes a list of module dependencies by invoking a handler function for each dependency.
 *
 * @param {string[]} dependencies - An array of file paths representing module dependencies. Defaults to an empty array if not provided.
 * @param {Map<string, number>} cachedIds - A set containing cached module IDs to prevent redundant processing.
 * @param {Object} registry - A registry mapping module paths to their processed data.
 * @param {Object} ids - A set for tracking IDs of processed modules.
 * @param {string[]} envs - holds found env vars.
 * @return {Promise<void>} A promise that resolves when all module dependencies are processed.
 */
async function processModuleDependencies(dependencies = [], cachedIds, registry, ids, envs) {
  for (const filePath of dependencies) {
    await processModule(filePath, cachedIds, registry, ids, envs);
  }
}

/**
 * Asynchronously registers global and built-in polyfills by processing each module in the input list.
 *
 * @param {Map<string, number>} cachedIds - A cache object that holds identifiers of previously processed modules.
 * @param {Object} registry - Registry object that manages module registrations and dependencies.
 * @param {Object<string, number>} ids - A map of identifiers to be used for tracking and linking modules.
 * @param {string[]} envs - holds found env vars.
 * @return {Promise<void>} A promise that resolves when all modules have been processed and registered.
 */
async function registerGlobalsAndBuiltInsPolyfills(cachedIds, registry, ids, envs) {
  for (const filePath of Object.values(builtIns)) {
    await processModule(filePath, cachedIds, registry, ids, envs);
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

/**
 * Writes content to disk and updates the corresponding bucket configuration
 * based on the provided module type and file path.
 *
 * @param {string} filePath - The path of the file being written to disk.
 * @param {string|number} moduleId - The identifier of the module, which determines how and where the content is stored.
 * @param {string} content - The content to be written to the file and relevant bucket configurations.
 * @return {Promise<void>} A promise that resolves when the content has been written to the disk and the bucket configurations are updated.
 */
async function writeToDisk(filePath, moduleId, content) {
  // all kiln plugins get compiled to public/js/_kiln-plugins.js
  if (moduleId.toString().endsWith('.kilnplugin')) {
    // having a single output for all kiln plugin files represents a problem for watch mode and incremental builds.
    // it's ok for now as we're looking one to one parity with claycli first and improve later
    bucketsConfig.kilnPlugins.content += content;
    return;
  }

  // write <name(.model|.client|.kiln)/number>.js
  await fs.writeFile(path.join(paths.publicDir, `${moduleId}.js`), content);

  if (moduleId.toString().endsWith('.kiln')) {
    // kiln.js files are compiled to <name>.kiln.js and _kiln-<letter>-<letter>.js
    const bucket = getBucketByFilename(moduleId);

    bucketsConfig.kiln[bucket].content += content;
  } else if (moduleId.toString().endsWith('.model')) {
    // model.js files are compiled to <name>.model.js and _models-<letter>-<letter>.js
    const bucket = getBucketByFilename(moduleId);

    bucketsConfig.models[bucket].content += content;
  } else if (_isFinite(parseInt(moduleId))){
    // dependency buckets, deps get put into <number>.js and _deps-<letter>-<letter>.js
    const name = path.parse(filePath).name;
    const bucket = getBucketByFilename(name);

    bucketsConfig.deps[bucket].content += content;
  }
}

/**
 * Processes and writes bucket configurations to their respective file paths.
 * Iterates through different bucket configurations such as models, kiln, and dependencies
 * and writes their associated content to files in the public directory.
 *
 * @return {Promise<void>} A promise that resolves once all bucket configurations are processed and written to disk.
 */
async function processBuckets() {
  if (bucketsConfig.kilnPlugins.content) {
    const filePath = path.join(paths.publicDir, bucketsConfig.kilnPlugins.fileName);

    await fs.writeFile(filePath, bucketsConfig.kilnPlugins.content);
  }

  for (const bucket in bucketsConfig.models) {
    const fileName = bucketsConfig.models[bucket].fileName;
    const content = bucketsConfig.models[bucket].content;
    if (content) {
      const filePath = path.join(paths.publicDir, fileName);

      await fs.writeFile(filePath, content);
    }
  }

  for (const bucket in bucketsConfig.kiln) {
    const fileName = bucketsConfig.kiln[bucket].fileName;
    const content = bucketsConfig.kiln[bucket].content;
    if (content) {
      const filePath = path.join(paths.publicDir, fileName);

      await fs.writeFile(filePath, content);
    }
  }

  for (const bucket in bucketsConfig.deps) {
    const fileName = bucketsConfig.deps[bucket].fileName;
    const content = bucketsConfig.deps[bucket].content;
    if (content) {
      const filePath = path.join(paths.publicDir, fileName);

      await fs.writeFile(filePath, content);
    }
  }
}

await init()
