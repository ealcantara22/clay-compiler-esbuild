import esbuild from 'esbuild';
import { mediaConfig } from './config.js';

export default async function compileMedia(options = {}) {
  try {
    if (options.watch) {
      const context = await esbuild.context(mediaConfig);
      await context.watch()
      console.info('watching media assets...');
    } else {
      await esbuild.build(mediaConfig);
    }
  } catch (e) {
    console.error(`error processing media assets:`, e);
  }
}
