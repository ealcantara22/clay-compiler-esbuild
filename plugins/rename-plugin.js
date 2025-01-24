export function renamePlugin() {
  return {
    name: 'rename-plugin',
    setup(build) {
      build.onResolve({ filter: /.\.(css)$/, namespace: "file" }, async (args) => {
        const resolution = await build.resolve(args.path, {
          resolveDir: args.resolveDir,
          kind: args.kind,
        });
        if (resolution.errors.length > 0) {
          return { errors: result.errors }
        }

        console.log('vamos bien')
        console.log('resolution', resolution)

      });
    },
  };
}
