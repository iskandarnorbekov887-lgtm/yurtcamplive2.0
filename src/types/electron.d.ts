import type { ElectronAPI } from '../../electron/preload';

export {};

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
