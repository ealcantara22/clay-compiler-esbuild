import * as esbuild from 'esbuild';
import { mediaConfig } from "./config.js";

// build
try {
  console.log('building media ...')
  let result = await esbuild.build(mediaConfig);
  console.log('result:', result);
} catch (e) {
  console.error(e);
}

