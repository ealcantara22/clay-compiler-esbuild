import path from 'node:path';
import process from 'node:process';
import esbuild from 'esbuild';
import fs from 'fs-extra';
import _findKey from 'lodash/findKey.js'
import _includes from 'lodash/includes.js'
import _find from 'lodash/find.js'
import { globby } from 'globby';
import compiler, { styleOptions } from '../constants.js'

const sourcePath = path.join(process.cwd(), 'styleguides');
const publicPath = path.join(process.cwd(), 'public');
const destPath = path.join(process.cwd(), 'public', 'fonts');
// these are the font weights, styles, and formats we support
// from https://developer.mozilla.org/en-US/docs/Web/CSS/font-weight
const fontWeights = {
  100: ['100', 'thin', 'hairline'],
  200: ['200', 'extralight', 'ultralight'],
  300: ['300', 'light'],
  400: ['400', 'normal'],
  500: ['500', 'medium'],
  600: ['600', 'semibold', 'demibold'],
  700: ['700', 'bold'],
  800: ['800', 'extrabold', 'ultrabold'],
  900: ['900', 'black', 'heavy']
};
const fontStyles = ['normal', 'italic', 'oblique'];
const fontFormats = ['woff', 'woff2', 'otf', 'ttf', 'css'];
const fontsSrc = await globby(path.join(sourcePath, '**', 'fonts', `*.{${fontFormats.join(',')}}`));
const config = {
  entryPoints: fontsSrc.map(entry => formatEntryPoint(entry)),
  outdir: destPath,
  bundle: false,
  write: true,
  minify: compiler.minify,
  logLevel: compiler.logLever,
  plugins: [clayFontsPlugin()],
}
const buckets = {
  linked: {},
  inlined: {}
}

/**
 * default 'linked' to true, if inlined is NOT set
 * @param  {boolean} linked
 * @param  {boolean} inlined
 * @return {boolean}
 */
function getLinkedSetting(linked, inlined) {
  // default linked to true UNLESS inlined is set (and linked isn't)
  if (typeof linked === 'undefined' && inlined) {
    // inlined is set, so don't link fonts
    return false;
  } else if (typeof linked === 'undefined') {
    // inlined isn't set, so link fonts by default
    return true;
  } else {
    return linked;
  }
}

/**
 * get name, style, and weight based on a font's filename
 * @param  {array} fontArray e.g. ['georgiapro', 'bold', 'italic']
 * @return {object} w/ { name, style, weight } css declarations
 */
function getFontAttributes(fontArray) {
  let name = fontArray[0], // e.g. georgiapro, note: font families are case insensitive in css
    weight, style;

  if (fontArray.length === 3) {
    // name-weight-style
    weight = _findKey(fontWeights, (val) => _includes(val, fontArray[1]));
    style = _find(fontStyles, (val) => val === fontArray[2]);
  } else if (fontArray.length === 2 && _find(fontStyles, (val) => val === fontArray[1])) {
    // name-style (note: checking for style is faster than weight, so we do that first)
    style = _find(fontStyles, (val) => val === fontArray[1]);
  } else if (fontArray.length === 2) {
    // name-weight
    weight = _findKey(fontWeights, (val) => _includes(val, fontArray[1]));
  } // else it's just the name

  return {
    name: `font-family: "${name}"; `, // note: trailing spaces so they can all be concatenated
    weight: weight ? `font-weight: ${weight}; ` : '',
    style: style ? `font-style: ${style}; ` : ''
  };
}

/**
 * get filename, file format, font name, font style, and font weight
 * note: the returned 'css' is the beginning of the @font-face declaration
 * for both inlined and linked fonts
 * @param  {string} filePath
 * @param  {boolean} isInlined
 * @return {string} @font-face declaration
 */
async function getFontCSS(filePath, isInlined = false) {
  const ext = path.extname(filePath); // e.g. '.woff'
  const fileName = path.basename(filePath); // e.g. 'GeorgiaProBold.woff'
  const basename = path.basename(filePath, ext);
  const fontAttrs = getFontAttributes(basename.toLowerCase().split('-'));
  const format = ext.slice(1); // e.g. 'woff'
  const basedir = path.dirname(filePath);
  const styleguide = basedir.split('/').slice(-2)[0];

  if (ext === '.css') {
    return fs.readFile(filePath, 'utf8')
  } else {
    let css = `@font-face { ${fontAttrs.name}${fontAttrs.style}${fontAttrs.weight}`;

    if (isInlined) {
      const code = await fs.readFile(filePath, 'utf8');

      css += `/* inlined */`
      css += `src: url(data:font/${format};charset=utf-8;base64,${code.toString('base64')}) format("${format}"); }`;
    } else {
      let assetHost = styleOptions.assetHost,
        assetPath = styleOptions.assetPath
          ? `/${styleOptions.assetPath}`
          : '';

      css += `/* not inlined */`
      css += `src: url("${assetHost}${assetPath}/fonts/${styleguide}/${fileName}"); }`;
    }

    return css;
  }
}

/**
 * Processes a file path to extract and format key details for an entry point representation.
 *
 * @param {string} filePath - The full file path to be formatted.
 * @returns {object} An object containing the formatted details:
 * - `in`: The original file path.
 * - `out`: A formatted string in the format "styleguide/basename", where:
 *    - `styleguide` refers to the site.
 *    - `basename` is the name of the file without its extension.
 */
function formatEntryPoint(filePath) {
  const ext = path.extname(filePath);
  const basename = path.basename(filePath, ext);
  const basedir = path.dirname(filePath);
  const styleguide = basedir.split('/').slice(-2)[0];

  return {
    in: filePath,
    out: `${styleguide}/${basename}`,
  }
}

/**
 * Minifies the given CSS string using the esbuild library.
 *
 * @param {string} css - The CSS code to be minified.
 * @return {Promise<string>} A promise that resolves to the minified CSS string.
 */
async function minifyCSS(css) {
  const resp = await esbuild.transform(css, { minify: true, loader: 'css' })

  return resp.code;
}

/**
 * A plugin for processing and bundling font files such as `.woff`, `.woff2`, `.otf`, `.ttf`, and `.css`
 * during the build process. The plugin supports inlining or linking fonts based on configuration.
 *
 * @param {Object} [options={}] Configuration options for the plugin, which can define settings such as inlining, linking, and minification of font files.
 * @return {Object} An object representing the configured plugin, containing its name and setup functionality to customize the build process.
 */
function clayFontsPlugin(options = {}) {
  return {
    name: 'clay-fonts-plugin',
    setup(build) {

      build.onLoad({ filter:/\.(woff|woff2|otf|ttf|css)$/ }, async (args) => {
        const filePath = args.path;
        const inlined = styleOptions.inlinedFonts;
        const linked = styleOptions.linkedFonts || getLinkedSetting(styleOptions.linkedFonts, inlined);
        const basedir = path.dirname(filePath);
        const styleguide = basedir.split('/').slice(-2)[0];
        let contents = '';

        if (linked) {
          contents = await getFontCSS(filePath, false);

          if (!buckets.linked[styleguide]) {
            buckets.linked[styleguide] = { fileName: `_linked-fonts.${styleguide}.css`, content: contents };
          } else {
            buckets.linked[styleguide].content += contents;
          }
        } else if (inlined) {
          contents = await getFontCSS(filePath, true);

          if (!buckets.inlined[styleguide]) {
            buckets.inlined[styleguide] = { fileName: `_inlined-fonts.${styleguide}.css`, content: contents };
          } else {
            buckets.inlined[styleguide].content += contents;
          }
        }

        return {
          contents,
          loader: 'css',
        };
      })

      build.onEnd(async () => {
        // process the buckets
        const minify = compiler.minify;

        for (const bucketKey of Object.keys(buckets)) {
          for (const siteKey of Object.keys(buckets[bucketKey])) {
            const bucket = buckets[bucketKey][siteKey];
            const bucketPath = path.join(publicPath, 'css');
            const bucketFile = path.join(bucketPath, bucket.fileName);
            let content = bucket.content;

            if (content) {
              if (minify) content = await minifyCSS(content);

              await fs.writeFile(bucketFile, content);
            }
          }
        }
      })
    }
  }
}

/**
 * Compiles font assets using the specified options.
 *
 * @return {Promise<void>} A promise that resolves when the font compilation process is complete.
 */
export default async function compileFonts() {
  try {
    if (compiler.watchMode) {
      const context = await esbuild.context(config);
      await context.watch()
    } else {
      await esbuild.build(config);
      console.log('fonts built!')
    }
  } catch (e) {
    console.error(`error processing fonts assets:`, e);
  }
}
