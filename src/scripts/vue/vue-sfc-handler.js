// most of this file content was copied from https://github.com/apeschar/esbuild-vue/blob/master/src/worker.js
import esbuild from 'esbuild';

let usedFiles;

import componentCompiler from "@vue/component-compiler";
import { generateCodeFrame } from "vue-template-compiler"
import {  compileToDescriptorAsync } from "./vue-compiler.js";

export default async ({
  filename,
  source,
  extractCss,
  production,
  postcssPlugins,
}) => {
  const compilerOptions = {
    template: {
      isProduction: production,
      compilerOptions: { outputSourceRange: true },
    },
    style: {
      postcssPlugins,
    },
  };
  const compiler = componentCompiler.createDefaultCompiler(compilerOptions);
  usedFiles = new Set();
  try {
    if (/^\s*$/.test(source)) {
      throw new Error("File is empty");
    }
    const result = await compileToDescriptorAsync.call(compiler, filename, source);
    let styles;

    const resultErrors = getErrors(result);
    if (resultErrors.length > 0) {
      return { errors: resultErrors, usedFiles };
    }

    if (extractCss) {
      styles = result.styles.map(({ code }) => ({ code }));
      // Remove the style code to prevent it from being injected
      // in the JS bundle, but keep it as reference to preserve scopeId value.
      for (const style of result.styles) {
        style.code = "";
      }
    }

    // --- Custom Assembly Logic to mimic Vueify ---
    // the compiler assembler is responsible for merging all the SFC pieces, but its output is set to ESM by default
    // with no option to override. The browser doesn't like ESM modules so we need a custom assembler logic to
    // generate an output similar to Vueify. see https://github.com/vuejs/vueify/blob/master/lib/compiler.js
    let scriptContent = result.script ? result.script.code : 'module.exports = {};';
    let templateCode = result.template?.code || '';

    // ironic, but it is possible to have ESM Vue SFC files, this conditions uses esbuild to transform those to CJS
    // but, only the code between the script tags.
    if (scriptContent.includes('export default')) {
      scriptContent = (await esbuild.transform(scriptContent, { format: 'cjs', target: 'es2015'})).code
    }

    // Now, manually construct the `vueify`-like output
    templateCode = templateCode.replace(/var render =/, '__vue__options__.render =');
    templateCode = templateCode.replace(/render._withStripped =/, '__vue__options__.render._withStripped =');
    templateCode = templateCode.replace(/var staticRenderFns =/, '__vue__options__.staticRenderFns =');

    let customAssembledCode = `
      !function() {
        ${scriptContent}
      }()

      // Handle ES module default export conversion if necessary
      module.exports.__esModule && (module.exports = module.exports.default);

      var __vue__options__ = "function" == typeof module.exports ? module.exports.options : module.exports;

      // Inject compiled template render functions
      ${templateCode}

      if (${JSON.stringify(result.scopeId)}) {
        __vue__options__._scopeId = ${JSON.stringify(result.scopeId)};
      }
    `;

    return {
      code: customAssembledCode,
      styles,
      usedFiles,
      loader: result.script ? result.script.lang : undefined,
    };
  } catch (e) {
    return {
      errors: [
        {
          text: `Could not compile Vue single-file component: ${e}`,
          detail: e,
        },
      ],
      usedFiles,
    };
  }
};

function getErrors(result) {
  let errors = [];
  if (result.template && result.template.errors) {
    errors = errors.concat(getTemplateErrors(result.template));
  }
  if (result.styles) {
    errors = errors.concat(combineErrors(result.styles));
  }
  return errors;
}

function getTemplateErrors(template) {
  if (!template.errors) {
    return [];
  }
  return template.errors.map((e) => ({
    text: e.msg + "\n\n" + generateCodeFrame(template.source, e.start, e.end),
    detail: e,
  }));
}

function combineErrors(outputs) {
  return outputs
    .map((o) => {
      if (!o || !o.errors) {
        return [];
      }
      return o.errors.map((e) => convertError(e));
    })
    .flat();
}

function convertError(e) {
  if (typeof e === "string") {
    return { text: e };
  }
  if (e instanceof Error) {
    return { text: e.message, detail: e };
  }
  throw new Error(`Cannot convert Vue compiler error: ${e}`);
}

function editModule(name, fn) {
  fn(require(name));
}
