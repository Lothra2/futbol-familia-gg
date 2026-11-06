declare const __V__: string;
/** The version of this build, stuck to every file in public/assets: their names never change, so without it a phone keeps the old sprites in its cache after a new deploy. */
export const VERSION = typeof __V__ !== 'undefined' ? __V__ : 'dev';
/** The URL of a file in public/assets for this build. */
export const asset = (path: string): string => `${path}?v=${VERSION}`;
