/**
 * Bundles the MAL-Sync chibi runtime (ChibiProxy + ChibiConsumer + the functions
 * registry) for the browser, wired to the preview api stub in `src/apiStub.ts`.
 *
 * Build: npm run preview:build   (from the repo root)
 */
const path = require('path');
const webpack = require('webpack');

const repoRoot = path.join(__dirname, '..');

module.exports = {
  mode: 'development',
  devtool: false,
  entry: {
    harness: path.join(__dirname, 'src', 'harness.ts'),
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        loader: 'ts-loader',
        exclude: /node_modules/,
        options: {
          transpileOnly: true,
          configFile: path.join(repoRoot, 'tsconfig.json'),
        },
      },
    ],
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
    alias: {
      src: path.join(repoRoot, 'src'),
    },
  },
  output: {
    path: path.join(__dirname, 'public', 'build'),
    filename: '[name].js',
    globalObject: 'window',
  },
  plugins: [
    new webpack.ProvidePlugin({
      api: path.join(__dirname, 'src', 'apiStub.ts'),
      con: path.resolve(repoRoot, 'src/utils/console'),
      utils: path.resolve(repoRoot, 'src/utils/general'),
      j: path.resolve(repoRoot, 'src/utils/j'),
    }),
  ],
  performance: { hints: false },
  stats: 'errors-warnings',
};
