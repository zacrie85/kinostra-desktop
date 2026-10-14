/* Loader ESM untuk transformers.js (webpack ESM build) -> window.transformers */
import * as T from './transformers.min.js';
window.transformers = T;
window.dispatchEvent(new Event('transformers-ready'));
