import { useEffect } from 'react';

export interface KeyboardShortcut {
  key: string;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
  action: () => void;
  description: string;
  category: string;
}

export interface ShortcutDefinition {
  key: string;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
  description: string;
  category: string;
}

export interface ShortcutWithKey extends ShortcutDefinition {
  shortcutKey: string;
}

export const useKeyboardShortcuts = (shortcuts: KeyboardShortcut[]) => {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in input fields
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        (event.target as HTMLElement)?.contentEditable === 'true'
      ) {
        return;
      }

      const matchingShortcut = shortcuts.find(shortcut => {
        return (
          event.key.toLowerCase() === shortcut.key.toLowerCase() &&
          !!event.ctrlKey === !!shortcut.ctrlKey &&
          !!event.shiftKey === !!shortcut.shiftKey &&
          !!event.altKey === !!shortcut.altKey &&
          !!event.metaKey === !!shortcut.metaKey
        );
      });

      if (matchingShortcut) {
        event.preventDefault();
        matchingShortcut.action();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [shortcuts]);
};

export const defaultShortcuts: Record<string, ShortcutDefinition> = {
  // File operations
  openFile: { key: 'o', ctrlKey: true, description: 'Open file', category: 'File' },
  saveFile: { key: 's', ctrlKey: true, description: 'Save/Export', category: 'File' },
  
  // OCR operations
  processOCR: { key: 'p', ctrlKey: true, description: 'Process OCR', category: 'OCR' },
  
  // Grammar operations
  checkGrammar: { key: 'g', ctrlKey: true, description: 'Check grammar', category: 'Grammar' },
  
  // UI operations
  toggleSettings: { key: ',', ctrlKey: true, description: 'Open settings', category: 'UI' },
  showHelp: { key: 'F1', description: 'Show help', category: 'UI' },
  toggleFullscreen: { key: 'F11', description: 'Toggle fullscreen', category: 'UI' },
  
  // Text operations
  selectAll: { key: 'a', ctrlKey: true, description: 'Select all text', category: 'Text' },
  copy: { key: 'c', ctrlKey: true, description: 'Copy text', category: 'Text' },
  paste: { key: 'v', ctrlKey: true, description: 'Paste text', category: 'Text' },
  undo: { key: 'z', ctrlKey: true, description: 'Undo', category: 'Text' },
  redo: { key: 'y', ctrlKey: true, description: 'Redo', category: 'Text' },
  
  // Navigation
  nextTab: { key: 'Tab', ctrlKey: true, description: 'Next tab', category: 'Navigation' },
  prevTab: { key: 'Tab', ctrlKey: true, shiftKey: true, description: 'Previous tab', category: 'Navigation' },
};

export const formatShortcut = (shortcut: Partial<ShortcutDefinition | KeyboardShortcut>): string => {
  const parts: string[] = [];
  
  // Use platform-specific modifier key names
  const isMac = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  
  if (shortcut.ctrlKey) parts.push(isMac ? '⌃' : 'Ctrl');
  if (shortcut.shiftKey) parts.push(isMac ? '⇧' : 'Shift');
  if (shortcut.altKey) parts.push(isMac ? '⌥' : 'Alt');
  if (shortcut.metaKey) parts.push(isMac ? '⌘' : 'Win');
  
  if (shortcut.key) {
    const key = shortcut.key.length === 1 ? shortcut.key.toUpperCase() : shortcut.key;
    parts.push(key);
  }
  
  return parts.join(isMac ? '' : ' + ');
};

export const getShortcutCategories = (): Record<string, ShortcutWithKey[]> => {
  const categories: Record<string, ShortcutWithKey[]> = {};
  
  Object.entries(defaultShortcuts).forEach(([shortcutKey, shortcut]) => {
    if (!categories[shortcut.category]) {
      categories[shortcut.category] = [];
    }
    categories[shortcut.category].push({
      ...shortcut,
      shortcutKey
    });
  });
  
  return categories;
};
