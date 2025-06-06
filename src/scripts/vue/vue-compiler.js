// the entire content of this file was copied from
// https://github.com/apeschar/esbuild-vue/blob/master/src/compiler.js

import { parse } from "@vue/component-compiler-utils";
import templateCompiler from "vue-template-compiler";
import hash from "hash-sum";
import path from "node:path";

export const compileToDescriptorAsync = async function (filename, source) {
  const descriptor = parse({
    source,
    filename,
    needMap: true,
    compiler: templateCompiler,
  });
  const scopeId =
    "data-v-" +
    (this.template.isProduction
      ? hash(path.basename(filename) + source)
      : hash(filename + source));
  const template = descriptor.template
    ? this.compileTemplate(filename, descriptor.template)
    : undefined;
  const styles = await Promise.all(
    descriptor.styles.map((style) =>
      this.compileStyleAsync(filename, scopeId, style)
    )
  );
  const { script: rawScript, customBlocks } = descriptor;
  const script = rawScript
    ? {
      code: rawScript.src
        ? this.read(rawScript.src, filename)
        : rawScript.content,
      map: rawScript.map,
      lang: rawScript.lang,
    }
    : undefined;

  return {
    scopeId,
    template,
    styles,
    script,
    customBlocks,
  };
};
