import path from 'node:path';

const newCache = Boolean(process.env.NEW_CACHE);

export default {
  mode: 'production',
  context: import.meta.dirname,
  entry: './src/index.ts',
  resolve: { extensions: ['.ts', '.js'] },
  module: {
    rules: [
      {
        test: /\.ts$/,
        loader: 'builtin:swc-loader',
        options: {
          env: { targets: ['chrome >= 100', 'firefox >= 100', 'safari >= 15', 'edge >= 100'] },
        },
      },
    ],
  },
  optimization: { minimize: false },
  experiments: { newCache },
  cache: {
    type: 'persistent',
    storage: { type: 'filesystem', directory: path.resolve(import.meta.dirname, '.cache') },
  },
};
