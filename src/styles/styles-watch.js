import * as esbuild from 'esbuild';
import { stylesConfig } from './config.js'

// watch
try {
  const context = await esbuild.context(stylesConfig);
  await context.watch()
  console.log('watching ...');
} catch (e) {
  console.error(e);
}
