import * as esbuild from 'esbuild';
import { mediaConfig } from "./config.js";

// watch
try {
  const context = await esbuild.context(mediaConfig);
  console.log('watching ...');
  await context.watch()
} catch (e) {
  console.error(e);
}
