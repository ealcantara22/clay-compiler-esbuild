import process from 'node:process';

const {
  CLAY_COMPILER_WATCH_MODE,
  CLAY_COMPILER_MINIFY,
  CLAY_COMPILER_LOG_LEVEL,
  CLAY_COMPILER_ASSET_HOST,
  CLAYCLI_COMPILE_ASSET_PATH,
  CLAY_COMPILER_INLINED_FONTS,
  CLAY_COMPILER_LINKED_FONTS,
  CLAY_COMPILER_EXCLUDED_STYLEGUIDES,
  CLAY_COMPILER_EXCLUDED_STYLE_RENDERS,
  CLAY_COMPILER_LEGACY_GLOBS,
  NODE_ENV
} = process.env;


const watchMode = CLAY_COMPILER_WATCH_MODE === 'true';
const minify = CLAY_COMPILER_MINIFY === 'true';
const logLever = CLAY_COMPILER_LOG_LEVEL || 'warning';
const assetHost = CLAY_COMPILER_ASSET_HOST?.replace(/\/$/, '') || '';
const assetPath = CLAYCLI_COMPILE_ASSET_PATH || '';
const inlinedFonts = CLAY_COMPILER_INLINED_FONTS === 'true';
const linkedFonts = CLAY_COMPILER_LINKED_FONTS === 'true';
const excludedStyleGuides = CLAY_COMPILER_EXCLUDED_STYLEGUIDES;
const excludedRenders = CLAY_COMPILER_EXCLUDED_STYLE_RENDERS;
const legacyGlobs = CLAY_COMPILER_LEGACY_GLOBS?.replace(/\s+/g, '').split(',') || [];
const env = NODE_ENV || '';

export default {
  env,
  logLever,
  minify,
  watchMode,
}

export const styleOptions = {
  assetHost,
  assetPath,
  inlinedFonts,
  linkedFonts,
  excludedStyleGuides,
  excludedRenders,
}

export const scriptOptions = {
  assetHost,
  assetPath,
  legacyGlobs,
}
