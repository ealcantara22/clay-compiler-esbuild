import * as esbuild from 'esbuild'
import { globby } from 'globby';
import { polyfillNode } from 'esbuild-plugin-polyfill-node';
// import vuePlugin from 'esbuild-vue'
import packageJson from './package.json' assert { type: 'json' };
const vuePlugin = await import('esbuild-vue');

// const models = await globby('components/**/model.js');
const componentModels = await globby('components/**/model.js');
const componentClients = await globby('components/**/client.js');
const outbase = `${process.cwd()}/components`;
const dependencies = Object.keys(packageJson.dependencies);

const replaceNodeBuiltIns = () => {
  const replace = {
    'crypto': import('crypto-browserify'),
    'fs': import('browserify-fs'),
    'net': import('net-browserify'),
    'os': import('os-browserify'),
    'path': import('path-browserify'),
    'stream': import('stream-browserify'),
    'util': import('utils'),
    'vm': import('vm-browserify'),
    // 'url': require.resolve('url/'),
  }
  const filter = RegExp(`^(${Object.keys(replace).join("|")})$`);
  return {
    name: "replaceNodeBuiltIns",
    setup(build) {
      build.onResolve({ filter }, arg => ({
        path: replace[arg.path],
      }));
    },
  };
}

/**
 * approach 1:
 * Questions
 * - How much browserify libs actually needs to be overridden, and how many external libraries are actually not playing nice?
 * - what's claycli output format and target?
 * - dependencies are mapped by id?
 *
 *
 * actions:
 * - manually replace node libraries with browserify libraries
 * - list only failing packages as external
 *
 * notes:
 * - need a plugin to replace service/server to services/client
 */
await esbuild.build({
  entryPoints: componentModels,
  entryNames: '[dir].model.js',
  bundle: true,
  platform: 'browser',
  format: 'cjs',
  outbase,
  outdir: 'public-test/js',
  target: 'es2016',
  plugins: [replaceNodeBuiltIns()],
  external: ['pg', 'redis-parser', 'xhr-sync-worker.js'],
  // external: dependencies,
})

/**
 * approach 2:
 * use polyfill to satisfy node libs to browser compatibility
 *
 * notes:
 * - it takes longer to complete
 */
await esbuild.build({
  entryPoints: componentClients,
  entryNames: '[dir].client.js',
  bundle: true,
  platform: 'browser',
  format: 'cjs',
  outbase,
  outdir: 'public-test/js',
  target: 'es2016',
  plugins: [polyfillNode(), vuePlugin()],
  external: ['pg', 'redis-parser'],
  // plugins: [replaceNodeBuiltIns()],
  // external: dependencies,
})
