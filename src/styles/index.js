import esbuild from 'esbuild';
import { stylesConfig } from "./config.js";

export default async function compileStyles(options = {}) {
  try {
    if (options.watch) {
      const context = await esbuild.context(stylesConfig);
      await context.watch()
      console.info('watching styles assets...');
    } else {
      await esbuild.build(stylesConfig);
    }
  } catch (e) {
    console.error(`error processing styles assets:`, e);
  }
}
