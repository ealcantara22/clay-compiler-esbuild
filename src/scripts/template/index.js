import path from "node:path";
import fs from 'fs-extra';
import clayHbs from 'clayhandlebars'
import _last from 'lodash/last.js'

const hbs = clayHbs();

export async function compileTemplate(filePath) {
  const name = _last(path.dirname(filePath).split('/'));
  const wrapped = await wrapTemplate(filePath, name);
  const precompiled = await precompile(wrapped, name);
  const registered = registerTemplate(precompiled, name);

  return {
    moduleId: `${name}.template`,
    content: registered,
  }
}

/**
 * wrap templates so they don't render without data, see https://github.com/clay/handlebars/blob/master/index.js#L45
 * @param  {string} filePath
 * @param  {string} name
 * @return {string}
 */
async function wrapTemplate(filePath, name) {
  // let source = _includes(filePath, 'clay-kiln') ? file.contents.toString('utf8') : inlineRead(file.contents.toString('utf8'), filePath);

  // todo: revisit: why does the original method don't call inlineRead if the file path (or content?) includes `clay-kiln`?
  const source = await fs.readFile(filePath, 'utf8');
  const sourceWithInlineContent = await inlineRead(source, name);

  return clayHbs.wrapPartial(name, sourceWithInlineContent);
}

/**
 * precompile handlebars templates into js functions
 * @param  {string} source
 * @param  {string} name
 */
async function precompile(source, name) {
  try {
    return hbs.precompile(source);
  } catch (e) {
    console.error(`Error pre-compiling template: "${name}" `, e.message)
    throw e;
  }
}

/**
 * register templates by adding them to the 'window' object
 * @param  {string} source
 * @param  {string} name
 */
function registerTemplate(source, name) {
  return `window.kiln.componentTemplates['${name}']=${source}\n`;
}


/**
 * replace `{{{ read 'file' }}}` helper with inlined file contents,
 * so they can be rendered client-side
 * note: this only replaces straight file reads, not reads from dynamic filepaths
 * note: we are explicitly ignoring clay-kiln, as it has other logic for inlining icons
 * @param  {string} source
 * @param  {string} name
 * @return {string}
 */
async function inlineRead(source, name) {
  const staticIncludes = source.match(/\{\{\{\s?read\s?'(.*?)'\s?\}\}\}/ig);

  if (!staticIncludes) return source;

  let inlined = source;

  for (const match of staticIncludes) {
    const filepath = path.join(process.cwd(), match.match(/'(.*?)'/)[1]);

    let fileContents;

    try {
      const code = await fs.readFile(filepath, 'utf8');
      fileContents = JSON.stringify(code).slice(1, -1) // escape any single-quotes
    } catch (e) {
      console.error(`Error replacing {{{ read \'${filepath}\' }}} in "${name}": `, e.message)
      process.exit(1); // todo: revisit
    }

    inlined = inlined.replace(match, fileContents);
  }

  return inlined;
}
