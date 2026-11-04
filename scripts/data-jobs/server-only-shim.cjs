/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS preload for tsx */
// `server-only` is a Next.js build-time marker (Next aliases it; it is not an
// installed package). Outside Next (tsx scripts in the worker) it resolves to
// nothing — load with `tsx --require ./scripts/data-jobs/server-only-shim.cjs`.
const Module = require('node:module')
const empty = require.resolve('./server-only-empty.cjs')
const original = Module._resolveFilename
Module._resolveFilename = function (request, ...rest) {
  if (request === 'server-only') return empty
  return original.call(this, request, ...rest)
}
