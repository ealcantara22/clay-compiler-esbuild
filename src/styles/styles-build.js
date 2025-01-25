import * as esbuild from 'esbuild';
import { stylesConfig } from './config.js'

// build
try {
  console.log('building styles ...')
  let result = await esbuild.build(stylesConfig);
  // console.log('result:', result);
} catch (e) {
  console.error(e);
}
