import path from 'node:path'
import process from 'node:process'
import { globby } from "globby";
import fs from 'fs-extra';
import postcss from 'postcss';
import cssImport from 'postcss-import';
import autoprefixer from 'autoprefixer';
import mixins from 'postcss-mixins';
import simpleVars from 'postcss-simple-vars';
import nested from 'postcss-nested'
import esbuild from 'esbuild';
import compiler, { styleOptions } from '../constants.js'

const outdir = path.join(process.cwd(), 'public', 'css');
const cssStyleGuidesPath = path.join(process.cwd(), 'styleguides');
const stylesGlobs = [
  path.join(cssStyleGuidesPath, '**', 'components', '*.css'),
  path.join(cssStyleGuidesPath, '**', 'layouts', '*.css'),
];

// add exclude glob for excluded sites' styleGuides
if (styleOptions.excludedStyleGuides)
  stylesGlobs.push(`!${path.join(cssStyleGuidesPath, `{${styleOptions.excludedStyleGuides}}`, '**', '*.css')}`);

// add exclude globs for excluded renders
if (styleOptions.excludedRenders) {
  styleOptions.excludedRenders.split(',').forEach(render => {
    stylesGlobs.push(...[
      `!${path.join(cssStyleGuidesPath, '**', 'components', `*_${render.trim()}.css`)}`,
      `!${path.join(cssStyleGuidesPath, '**', 'layouts', `*_${render.trim()}.css`)}`,
    ]);
  });
}

// esbuild config for styles compilation
const stylesConfig = {
  entryPoints: (await globby(stylesGlobs)).map(entry => formatEntryPoint(entry)),
  outdir,
  bundle: false,
  plugins: [
    clayPostCssPlugin({
      plugins: [
        cssImport({ path: [cssStyleGuidesPath] }),
        autoprefixer({ overrideBrowserslist: ['> 2%'] }),
        mixins(),
        simpleVars({
          variables: {
            'asset-host': styleOptions.assetHost,
            'asset-path': styleOptions.assetPath,
          }
        }),
        nested()
      ]
    }),
  ],
  logLevel: compiler.logLever,
  minify: compiler.minify,
}

/**
 * determine filePath for compiled CSS, based on the source filepath
 * styleguide/<styleguide>/components/<component>.css
 * becomes public/css/<component>.<styleguide>.css
 * @param {string} filePath
 * @returns {{in, out: string}}
 */
function formatEntryPoint(filePath) {
  const ext = path.extname(filePath);
  const basename = path.basename(filePath, ext);
  const styleguide = filePath.replace(`${cssStyleGuidesPath}/`, '').split('/')[0];

  return {
    in: filePath,
    out: `${basename}.${styleguide}`
  }
}

/**
 * A plugin to integrate PostCSS with a build tool, allowing the transformation of CSS files using specified PostCSS plugins.
 *
 * @param {Object} [options={}] Configuration options for the plugin.
 * @param {Array} [options.plugins=[]] An array of PostCSS plugins to apply to the CSS files.
 * @return {Object} The build tool plugin configuration for processing CSS files using PostCSS.
 */
function clayPostCssPlugin(options = {}) {
  return {
    name: "clay-postcss",
    setup: function (build) {
      build.onLoad(
        { filter: /.\.(css)$/, namespace: 'file' },async (args) => {
          const sourceFullPath = args.path;
          const plugins = options.plugins || [];
          const css = await fs.readFile(sourceFullPath, 'utf8');
          const result = await postcss(plugins).process(css);

          return {
            contents: result.css,
            loader: 'css',
            watchFiles: [sourceFullPath],
          };
        }
      );
    },
  }
}

/**
 * Compiles style assets using the esbuild configuration. Can watch for changes if specified in the options.
 *
 * @return {Promise<void>} A promise that resolves when the styles are successfully compiled or fails with an error.
 */
export default async function compileStyles() {
  try {
    if (compiler.watchMode) {
      const context = await esbuild.context(stylesConfig);
      await context.watch()
      console.info('watching styles assets...');
    } else {
      await esbuild.build(stylesConfig);
      console.log('style assets built!')
    }
  } catch (e) {
    console.error(`error processing styles assets:`, e);
  }
}
