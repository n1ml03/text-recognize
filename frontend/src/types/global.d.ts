// Global type declarations for Tauri

declare global {
  interface Window {
    __TAURI__?: {
      invoke: (command: string, args?: Record<string, unknown>) => Promise<unknown>;
      // Add other Tauri APIs as needed
    };
  }
}

export {};
