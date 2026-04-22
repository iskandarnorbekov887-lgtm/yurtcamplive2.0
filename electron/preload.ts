import { contextBridge, ipcRenderer } from 'electron';

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Add any IPC communication methods here
  // Example:
  // sendMessage: (message: string) => ipcRenderer.send('message', message),
  // onMessage: (callback: (message: string) => void) => ipcRenderer.on('message', (_, message) => callback(message)),
});

// Type for the exposed API
export interface ElectronAPI {
  // Define your exposed API methods here
}
