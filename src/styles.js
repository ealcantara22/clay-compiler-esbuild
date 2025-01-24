import path from 'node:path'
import process from 'node:process'
import * as esbuild from 'esbuild'
import { globby } from "globby";
import postCssPlugin from '@deanc/esbuild-plugin-postcss';
import cssImport from 'postcss-import';
import autoprefixer from 'autoprefixer';
import mixins from 'postcss-mixins';
import simpleVars from "postcss-simple-vars";
import nested from 'postcss-nested'

const outdir = path.join(process.cwd(), 'public', 'css');
const cssImportPath = path.join(process.cwd(), 'styleguides')
const componentsSrc = await globby(path.join(process.cwd(), 'styleguides', '**', 'components', '*.css'));
const layoutsSrc = await globby(path.join(process.cwd(), 'styleguides', '**', 'layouts', '*.css'));
// const variables = {
//   'asset-host': 'https://assets.nymag.com', // todo: change
//   'asset-path': '',
//   minify: ''
// };
const {
  CLAYCLI_COMPILE_ASSET_HOST,
  CLAYCLI_COMPILE_ASSET_PATH,
  CLAYCLI_COMPILE_MINIFIED,
  CLAYCLI_COMPILE_MINIFIED_STYLES
} = process.env;
const variables = {
  'asset-host': CLAYCLI_COMPILE_ASSET_HOST?.replace(/\/$/, '') || '',
  'asset-path': CLAYCLI_COMPILE_ASSET_PATH || '',
  minify: CLAYCLI_COMPILE_MINIFIED || CLAYCLI_COMPILE_MINIFIED_STYLES || ''
};

/**
 * determine filepath for compiled css, based on the source filepath
 * styleguide/<styleguide>/components/<component>.css
 * becomes public/css/<component>.<styleguide>.css
 * @param {string} filePath
 * @returns {{in, out: string}}
 */
const formatEntryPoint = (filePath) => {
  const ext = path.extname(filePath);
  const basename = path.basename(filePath, ext);
  const styleguide = filePath.replace(`${cssImportPath}/`, '').split('/')[0];

  return {
    in: filePath,
    out: `${basename}.${styleguide}`
  }
}

export default async () => {
  try {
    let result = await esbuild.build({
      entryPoints: componentsSrc.concat(layoutsSrc).map(entry => formatEntryPoint(entry)),
      outdir,
      bundle: true,
      platform: 'browser',
      format: 'cjs',
      plugins: [
        postCssPlugin({
          plugins: [
            cssImport({path: [cssImportPath]}),
            autoprefixer({overrideBrowserslist: ['> 2%']}),
            mixins(),
            simpleVars({variables}),
            nested()
          ]
        }),
      ],
    });
    console.log('result:', result);
  } catch (e) {
    console.error(e);
  }
}

