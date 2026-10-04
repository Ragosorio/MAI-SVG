import { parentPort, workerData } from 'node:worker_threads';
import { convertPixels } from '@visioncortex/vtracer';
try {
  const { rgba, width, height, options } = workerData;
  parentPort.postMessage({ svg: convertPixels(new Uint8Array(rgba), width, height, options) });
} catch (error) {
  parentPort.postMessage({ error: String(error?.stack ?? error) });
}
