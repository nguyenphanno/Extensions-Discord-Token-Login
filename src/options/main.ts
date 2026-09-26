/**
 * Options page entry point.
 */

import { optionsController } from './controller';

void optionsController.start();

window.addEventListener('pagehide', () => optionsController.stop());
