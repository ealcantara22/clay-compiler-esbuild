import path from "node:path";
import process from "node:process";
import { globby } from "globby";

const cwd = process.cwd();
const outdir = path.join(cwd, 'public', 'media');
const mediaGlobs = '*.+(jpg|jpeg|png|gif|webp|svg|ico)';
const modules = {
  components: {
    path: path.join(cwd, 'components'),
    src: globby(path.join(cwd, 'components', '**', 'media', mediaGlobs)),
  },
  sites: {
    path: path.join(cwd, 'sites'),
    src: globby([
      path.join(cwd, 'sites', '**', 'media', mediaGlobs),
    ]),
  }
}

/**
 * determine filepath for compiled assets, based on the source filepath
 * components/<component>/media/<asset-name>.svg
 * becomes public/media/components/<component><asset-name>.svg
 * @param {string} filePath
 * @param {string} module - components | sites
 * @returns {{in: string, out: string}}
 */
function formatEntryPoint(filePath, module) {
  const modulePath = modules[module].path;
  const ext = path.extname(filePath);
  const basename = path.basename(filePath, ext);
  const styleguide = filePath.replace(`${modulePath}/`, '').split('/')[0];
  const subsitePath = `${modulePath}/${styleguide}/subsites/`;

  /**
   * handling subsites assets
   * There are some todos around this as claycli copy the assets from the subsite dir parent directory as well, and
   * if both have the same asset (name) it keeps the one in the subsite dir
   */
  if (filePath.includes(subsitePath)) {
    const subsiteStyleguide = filePath.replace(`${subsitePath}`, '').split('/')[0];

    return {
      in: filePath,
      out: `${module}/${styleguide}/${subsiteStyleguide}/${basename}`
    }
  }

  return {
    in: filePath,
    out: `${module}/${styleguide}/${basename}`
  }
}

/**
 * Returns formated entry points found by glob matching
 * @returns {Promise}
 */
async function getEntries() {
  const promises = Object.keys(modules).map(async module => {
    return (await modules[module].src).map(entry => formatEntryPoint(entry, module));
  });
  const result = await Promise.all(promises);

  return result.reduce((arr, row) => {
    return arr.concat(row);
  }, [])
}

export const mediaConfig = {
  entryPoints: (await getEntries()),
  outdir,
  bundle: true,
  loader: {
    '.gif': 'copy',
    '.jpeg': 'copy',
    '.jpg': 'copy',
    '.ico': 'copy',
    '.png': 'copy',
    '.svg': 'copy',
    '.webp': 'copy',
  }
}
