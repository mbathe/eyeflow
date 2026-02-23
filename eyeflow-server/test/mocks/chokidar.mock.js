/**
 * CJS mock for chokidar v5 (pure ESM).
 * Jest requires CJS modules; this shim prevents the
 * "Cannot use import statement outside a module" error.
 */
const EventEmitter = require('events');

class FSWatcher extends EventEmitter {
  add() { return this; }
  unwatch() { return this; }
  getWatched() { return {}; }
  close() { return Promise.resolve(); }
}

module.exports = {
  watch: (_paths, _opts) => new FSWatcher(),
  FSWatcher,
};
