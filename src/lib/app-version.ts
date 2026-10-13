/**
 * The site's version, shown in the footer as "v0.1.0".
 *
 * Read from package.json at build time: the JSON import is inlined into the
 * server bundle, so it also works in the `output: 'standalone'` build, where
 * neither package.json nor `npm_package_version` is guaranteed at runtime.
 */

import pkg from '../../package.json'

export const APP_VERSION: string = pkg.version
