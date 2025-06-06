import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

/**
 * An object containing built-in module paths to be replaced or resolved in a browser environment.
 *
 * The `builtIns` object maps Node.js core modules and other system modules
 * to their browser-compatible counterparts or empty replacements. This allows
 * Node.js-based modules to work in the browser by providing appropriate
 * polyfills or stubs.
 *
 * Each property of the `builtIns` object corresponds to a core/module name as a string and is
 * resolved via the specified module or path.
 *
 * @see https://github.com/browserify/browserify/blob/master/lib/builtins.js
 * @type {Object}
 * @property {string} assert - Path to the browser-compatible `assert` implementation.
 * @property {string} buffer - Path to the browser-compatible `buffer` module.
 * @property {string} child_process - Path to an empty implementation for `child_process`.
 * @property {string} cluster - Path to an empty implementation for `cluster`.
 * @property {string} crypto - Path to the browser-compatible `crypto-browserify` module.
 * @property {string} dgram - Path to an empty implementation for `dgram`.
 * @property {string} dns - Path to an empty implementation for `dns`.
 * @property {string} events - Path to the browser-compatible `events` module.
 * @property {string} fs - Path to an empty implementation for `fs`.
 * @property {string} http2 - Path to an empty implementation for `http2`.
 * @property {string} https - Path to the browser-compatible `https-browserify` module.
 * @property {string} net - Path to an empty implementation for `net`.
 * @property {string} os - Path to the browser-compatible `os-browserify` module.
 * @property {string} path - Path to the browser-compatible `path-browserify` module.
 * @property {string} process - Path to the browser-compatible `process/browser` module.
 * @property {string} repl - Path to an empty implementation for `repl`.
 * @property {string} stream - Path to the browser-compatible `stream-browserify` module.
 * @property {string} timers - Path to the browser-compatible `timers-browserify` module.
 * @property {string} tls - Path to an empty implementation for `tls`.
 * @property {string} tty - Path to the browser-compatible `tty-browserify` module.
 * @property {string} zlib - Path to the browser-compatible `browserify-zlib` module.
 * @property {string} vm - Path to the browser-compatible `vm-browserify` module.
 * @property {string} sys - Path to the browser-compatible `util` module (legacy alias).
 * @property {string} util - Path to the browser-compatible `util` module.
 */
export const builtIns = {
  assert: require.resolve('assert/'),
  buffer: require.resolve('buffer/'),
  child_process: require.resolve('./_empty.js'),
  cluster: require.resolve('./_empty.js'),
  crypto: require.resolve('crypto-browserify'),
  dgram: require.resolve('./_empty.js'),
  dns: require.resolve('./_empty.js'),
  events: require.resolve('events/'),
  fs: require.resolve('./_empty.js'),
  http2: require.resolve('./_empty.js'),
  https: require.resolve('https-browserify'),
  net: require.resolve('./_empty.js'),
  os: require.resolve('os-browserify/browser.js'),
  path: require.resolve('path-browserify'),
  process: require.resolve('process/browser'),
  repl: require.resolve('./_empty.js'),
  stream: require.resolve('stream-browserify'),
  timers: require.resolve('timers-browserify'),
  tls: require.resolve('./_empty.js'),
  tty: require.resolve('tty-browserify'),
  zlib: require.resolve('browserify-zlib'),
  vm: require.resolve('vm-browserify'),
  sys: require.resolve('util/util.js'),
  util: require.resolve('util/util.js'),
}

/**
 * A list of supported global variables specific to Node.js runtime environment.
 * These variables are commonly used and are either unique to Node.js or have specific behavior in Node.js.
 *
 * - 'process': Provides information about, and control over, the current Node.js process.
 * - 'Buffer': A global object that provides a way of handling binary data.
 * - '__dirname': A Node.js-specific variable containing the directory name of the current module.
 * - '__filename': A Node.js-specific variable containing the file name of the current module.
 */
export const supportedGlobals = [
  'process',
  'Buffer',
  // 'console', // is also a browser global, its behavior/completeness can differ.
  // 'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval', // Also browser globals.
  // 'setImmediate', 'clearImmediate', // Node.js specific timers
  // 'global', // Node.js global object (like 'window' in browsers)
  '__dirname', // Node.js specific
  '__filename' // Node.js specific
]
