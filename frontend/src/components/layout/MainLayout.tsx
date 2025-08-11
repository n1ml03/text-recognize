import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileText,
  Settings,
  History,
  Moon,
  Sun,
  Monitor,
  AlertCircle,
  X,
  Layers,
  Keyboard,
  ChevronLeft,
  ChevronRight,
  Menu
} from 'lucide-react';
import { Button } from '@/components/ui/button';

import { useUIState } from '@/store/app-store';
import { MainWorkspace } from '@/components/MainWorkspace';
import { useKeyboardShortcuts, defaultShortcuts, formatShortcut, getShortcutCategories, type KeyboardShortcut } from '@/hooks/useKeyboardShortcuts';

export function MainLayout() {
  const { theme, setTheme, currentView, setCurrentView, error, setError } = useUIState();
  const [showSettings, setShowSettings] = useState(false);
  const [showKeyboardHelp, setShowKeyboardHelp] = useState(false);

  // Mobile-first responsive state
  const [isMobile, setIsMobile] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Setup keyboard shortcuts
  const shortcuts: KeyboardShortcut[] = [
    {
      ...defaultShortcuts.toggleSettings,
      action: () => setShowSettings(true),
    },
    {
      ...defaultShortcuts.showHelp,
      action: () => setShowKeyboardHelp(true),
    },
    {
      key: 'Escape',
      action: () => {
        setShowSettings(false);
        setShowKeyboardHelp(false);
        setError(null);
        setMobileMenuOpen(false);
      },
      description: 'Close dialogs',
      category: 'UI',
    },
  ];

  useKeyboardShortcuts(shortcuts);

  // Mobile detection and responsive behavior
  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (mobile) {
        setSidebarCollapsed(true);
      }
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Initialize theme on component mount
  useEffect(() => {
    const applyTheme = (themeValue: string) => {
      const root = document.documentElement;
      
      // Remove all theme classes first
      root.classList.remove('light', 'dark');
      
      if (themeValue === 'dark') {
        root.classList.add('dark');
      } else if (themeValue === 'light') {
        root.classList.add('light');
      } else {
        // System theme
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        if (prefersDark) {
          root.classList.add('dark');
        } else {
          root.classList.add('light');
        }
      }
    };

    // Apply current theme
    applyTheme(theme);

    // Listen for system theme changes when in system mode
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleSystemThemeChange = () => {
      if (theme === 'system') {
        applyTheme('system');
      }
    };

    mediaQuery.addEventListener('change', handleSystemThemeChange);
    return () => mediaQuery.removeEventListener('change', handleSystemThemeChange);
  }, [theme]);

  const toggleTheme = () => {
    const themes = ['light', 'dark', 'system'] as const;
    const currentIndex = themes.indexOf(theme);
    const nextTheme = themes[(currentIndex + 1) % themes.length];
    setTheme(nextTheme);
  };

  const getThemeIcon = () => {
    switch (theme) {
      case 'light': return <Sun className="h-4 w-4" />;
      case 'dark': return <Moon className="h-4 w-4" />;
      default: return <Monitor className="h-4 w-4" />;
    }
  };

  const sidebarItems = [
    { 
      id: 'main', 
      label: 'OCR & Grammar', 
      icon: FileText, 
      description: 'Process individual files',
      status: 'active'
    },
    { 
      id: 'batch', 
      label: 'Batch Processing', 
      icon: Layers, 
      description: 'Process multiple files',
      status: 'available'
    },
    { 
      id: 'history', 
      label: 'Export History', 
      icon: History, 
      description: 'View past exports',
      status: 'available'
    },
  ];

  return (
    <div className="flex h-full bg-background relative">
      {/* Mobile Menu Overlay */}
      <AnimatePresence>
        {isMobile && mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40 md:hidden"
            onClick={() => setMobileMenuOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Enhanced Sidebar - Mobile-first responsive */}
      <motion.aside
        initial={false}
        animate={{
          width: isMobile
            ? (mobileMenuOpen ? 280 : 0)
            : (sidebarCollapsed ? 72 : 220),
          x: isMobile && !mobileMenuOpen ? -280 : 0
        }}
        className={`
          bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60
          border-r border-border flex flex-col
          ${isMobile ? 'fixed left-0 top-0 h-full z-50 shadow-mobile-lg' : 'relative'}
          ${isMobile && !mobileMenuOpen ? 'pointer-events-none' : ''}
        `}
      >
        {/* Brand Header - Mobile-first responsive */}
        <div className="border-b border-border/50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 safe-area-inset-top">
          <div className={`flex items-center py-2 bg-card/50 min-h-[4rem] ${
            sidebarCollapsed && !isMobile ? 'justify-center px-2' : 'justify-between px-4 sm:px-6'
          }`}>
            {/* Brand/Logo section - only show when expanded */}
            {!sidebarCollapsed && !isMobile && (
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="min-w-0">
                  <h2 className="text-base font-semibold truncate">Text Recognize</h2>
                </div>
              </div>
            )}

            {/* Close button for mobile, collapse button for desktop */}
            <Button
              variant="ghost"
              size={isMobile ? "default" : "icon"}
              onClick={() => {
                if (isMobile) {
                  setMobileMenuOpen(false);
                } else {
                  setSidebarCollapsed(!sidebarCollapsed);
                }
              }}
              className={`hover:bg-muted transition-colors touch-target ${
                isMobile
                  ? 'ml-auto'
                  : 'h-8 w-8'
              }`}
            >
              {isMobile ? (
                <X className="h-4 w-4" />
              ) : sidebarCollapsed ? (
                <ChevronRight className="h-4 w-4" />
              ) : (
                <ChevronLeft className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-3 mt-1">
          <div className="space-y-1">
            {sidebarItems.map((item, index) => {
              const Icon = item.icon;
              const isActive = currentView === item.id;
              
              return (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                >
                  <Button
                    variant="ghost"
                    className={`w-full transition-all duration-200 ${
                      sidebarCollapsed 
                        ? 'flex items-center justify-center h-10 px-0' 
                        : 'px-3 py-2.5 h-auto justify-start'
                    } ${
                      isActive 
                        ? 'bg-card border border-border/50 shadow-sm text-foreground hover:bg-card/80' 
                        : 'hover:bg-card/50 hover:translate-x-0.5'
                    }`}
                    onClick={() => setCurrentView(item.id as any)}
                  >
                    {sidebarCollapsed ? (
                      // Collapsed state - only icon, centered
                      <div className={`${isActive ? 'text-primary' : 'text-muted-foreground'} transition-colors`}>
                        <Icon className="h-4 w-4" />
                      </div>
                    ) : (
                      // Expanded state - full layout
                      <div className="flex items-center gap-3 w-full">
                        <div className={`${isActive ? 'text-primary' : 'text-muted-foreground'} transition-colors`}>
                          <Icon className="h-4 w-4" />
                        </div>
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="flex-1 text-left"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">{item.label}</span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
                        </motion.div>
                      </div>
                    )}
                  </Button>
                </motion.div>
              );
            })}
          </div>
        </nav>

        {/* Enhanced Theme Toggle */}
        <div className="p-3 border-t border-border/50 bg-card/30">
          {sidebarCollapsed ? (
            <div className="flex justify-center">
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleTheme}
                className="h-8 w-8 hover:bg-card/50"
              >
                {getThemeIcon()}
              </Button>
            </div>
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-2"
            >
              <p className="text-xs font-medium text-muted-foreground">Appearance</p>
               <div className="grid grid-cols-3 gap-1">
                {['light', 'dark', 'system'].map((themeOption) => {
                  const isSelected = theme === themeOption;
                  const icons = {
                    light: Sun,
                    dark: Moon,
                    system: Monitor
                  };
                  const ThemeIcon = icons[themeOption as keyof typeof icons];
                  
                  return (
                    <Button
                      key={themeOption}
                      variant="ghost"
                      size="sm"
                      onClick={() => setTheme(themeOption as any)}
                      className={`h-8 border transition-all ${
                        isSelected 
                          ? 'bg-card border-border shadow-sm text-foreground' 
                          : 'border-transparent hover:bg-card/50 hover:border-border/30'
                      }`}
                    >
                      <ThemeIcon className="h-3 w-3" />
                    </Button>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground capitalize text-center">
                {theme} mode active
              </p>
            </motion.div>
          )}
        </div>
      </motion.aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Header - Mobile-first responsive */}
        <div className="border-b border-border/50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 safe-area-inset-top">
          <div className="flex items-center justify-between px-4 sm:px-6 py-2 bg-card/50 min-h-[4rem]">
            <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
              {/* Mobile menu button */}
              {isMobile && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setMobileMenuOpen(true)}
                  className="touch-target hover:bg-muted md:hidden"
                  title="Open menu"
                >
                  <Menu className="h-5 w-5" />
                </Button>
              )}

              <div className="flex items-center gap-3 min-w-0">
                <div className="min-w-0">
                  <h2 className="text-base sm:text-lg font-semibold truncate">
                    {currentView === 'main' && 'OCR & Grammar Assistant'}
                    {currentView === 'batch' && 'Batch Processing'}
                    {currentView === 'history' && 'Export History'}
                  </h2>
                  <p className="text-xs text-muted-foreground -mt-0.5 hidden sm:block">
                    {currentView === 'main' && 'Process and analyze text from images and documents'}
                    {currentView === 'batch' && 'Process multiple files simultaneously'}
                    {currentView === 'history' && 'View and manage exported results'}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1 sm:gap-2">
              <Button
                variant="ghost"
                size={isMobile ? "default" : "icon"}
                onClick={() => setShowKeyboardHelp(true)}
                className={`hover:bg-muted transition-colors ${
                  isMobile ? 'touch-target hidden xs:flex' : 'h-8 w-8'
                }`}
                title="Keyboard Shortcuts (F1)"
              >
                <Keyboard className="h-4 w-4" />
                {isMobile && <span className="ml-2 text-sm">Help</span>}
              </Button>
              <Button
                variant="ghost"
                size={isMobile ? "default" : "icon"}
                onClick={() => setShowSettings(true)}
                className={`hover:bg-muted transition-colors ${
                  isMobile ? 'touch-target' : 'h-8 w-8'
                }`}
                title="Settings (Ctrl+,)"
              >
                <Settings className="h-4 w-4" />
                {isMobile && <span className="ml-2 text-sm">Settings</span>}
              </Button>
            </div>
          </div>
        </div>
        {/* Error Banner */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="bg-destructive text-destructive-foreground px-4 py-2 flex items-center justify-between"
            >
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                <span className="text-sm">{error}</span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setError(null)}
                className="h-6 w-6 text-destructive-foreground hover:bg-destructive-foreground/10"
              >
                <X className="h-3 w-3" />
              </Button>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex-1 h-0 overflow-hidden">
          <MainWorkspace 
            currentView={currentView}
            showSettings={showSettings}
            onSettingsClose={() => setShowSettings(false)}
          />
        </div>
      </main>

      {/* Keyboard Help Modal */}
      <AnimatePresence>
        {showKeyboardHelp && (
          <KeyboardHelpModal onClose={() => setShowKeyboardHelp(false)} />
        )}
      </AnimatePresence>
    </div>
  );
}


function KeyboardHelpModal({ onClose }: { onClose: () => void }) {
  const shortcutCategories = Object.entries(getShortcutCategories());

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/90 border border-border rounded-lg shadow-lg w-full max-w-2xl max-h-[100vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-border/50 bg-card/30">
          <h3 className="text-lg font-semibold flex items-center gap-2 text-foreground">
            <Keyboard className="h-5 w-5" />
            Keyboard Shortcuts
          </h3>
        </div>

        <div className="p-4 overflow-y-auto max-h-96 space-y-6 bg-background/50">
          {shortcutCategories.map(([category, shortcuts]) => (
            <div key={category}>
              <h4 className="font-medium mb-3 text-foreground">{category}</h4>
              <div className="space-y-2">
                {shortcuts.map((shortcut) => (
                  <div key={shortcut.shortcutKey} className="flex items-center justify-between p-3 rounded-md border border-border/50 bg-card/50 hover:bg-card/70 transition-colors">
                    <span className="text-sm font-medium text-foreground">{shortcut.description}</span>
                    <kbd className="px-3 py-1.5 bg-muted/80 border border-border/50 rounded-md text-xs font-mono text-muted-foreground">
                      {formatShortcut(shortcut)}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="p-4 border-t border-border/50 bg-card/30 flex justify-end">
          <Button onClick={onClose}>Close</Button>
        </div>
      </motion.div>
    </motion.div>
  );
}
