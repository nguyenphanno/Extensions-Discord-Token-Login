/**
 * Popup entry point. Kept to two lines of logic so the controller owns
 * everything the user can observe.
 */

import { controller } from './controller';

void controller.start();

// A popup is destroyed without ceremony when it loses focus; stop the state
// subscription so the worker is not pushing snapshots into a dead document.
window.addEventListener('unload', () => controller.stop());
