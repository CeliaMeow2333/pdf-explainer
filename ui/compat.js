/**
 * Firefox exposes the promise based `browser.*` namespace, Chromium exposes
 * `chrome.*`. Both resolve to the same object in Firefox, and every API used
 * here returns a promise in Chromium's MV3, so a single alias is enough.
 */

export const ext = globalThis.browser ?? globalThis.chrome ?? null;

export function extensionUrl(path) {
  if (ext?.runtime?.getURL) {
    return ext.runtime.getURL(path);
  }
  // Dev preview over plain HTTP (no extension APIs available).
  return new URL(path, location.href).toString();
}
