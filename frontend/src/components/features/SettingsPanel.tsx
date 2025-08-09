import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Settings,
  Keyboard,
  Eye,
  Globe,
  Save,
  RotateCcw,
  Monitor,
  Moon,
  Sun
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useUIState } from '@/store/app-store';
import { formatShortcut, getShortcutCategories } from '@/hooks/useKeyboardShortcuts';

interface SettingsPanelProps {
  onClose: () => void;
}

export function SettingsPanel({ onClose }: SettingsPanelProps) {
  const { theme, setTheme } = useUIState();
  const [activeTab, setActiveTab] = useState<'general' | 'shortcuts' | 'ocr' | 'grammar'>('general');

  const tabs = [
    { id: 'general' as const, label: 'General', icon: Settings },
    { id: 'shortcuts' as const, label: 'Shortcuts', icon: Keyboard },
    { id: 'ocr' as const, label: 'OCR', icon: Eye },
    { id: 'grammar' as const, label: 'Grammar', icon: Globe },
  ];

  const themeOptions = [
    { value: 'light' as const, label: 'Light', icon: Sun },
    { value: 'dark' as const, label: 'Dark', icon: Moon },
    { value: 'system' as const, label: 'System', icon: Monitor },
  ];

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
        className="bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/90 border border-border rounded-lg shadow-lg w-full max-w-4xl max-h-[80vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex h-full">
          {/* Sidebar */}
          <div className="w-64 border-r border-border/50 bg-card/50">
            <div className="p-4 border-b border-border/50">
              <h2 className="text-lg font-semibold flex items-center gap-2 text-foreground">
                <Settings className="h-5 w-5" />
                Settings
              </h2>
            </div>
            <nav className="p-2 space-y-1">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`w-full flex items-center gap-3 px-3 py-3 rounded-md text-left transition-all duration-200 ${
                      activeTab === tab.id
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'hover:bg-muted text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="font-medium">{tab.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto bg-background/50">
            <div className="p-6">
              {activeTab === 'general' && <GeneralSettings theme={theme} setTheme={setTheme} themeOptions={themeOptions} />}
              {activeTab === 'shortcuts' && <ShortcutsSettings />}
              {activeTab === 'ocr' && <OCRSettings />}
              {activeTab === 'grammar' && <GrammarSettings />}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-border/50 bg-card/30 p-4 flex justify-between">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <div className="flex gap-2">
            <Button variant="outline">
              <RotateCcw className="h-4 w-4 mr-2" />
              Reset to Defaults
            </Button>
            <Button onClick={onClose}>
              <Save className="h-4 w-4 mr-2" />
              Save Changes
            </Button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

function GeneralSettings({ theme, setTheme, themeOptions }: {
  theme: string;
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
  themeOptions: Array<{ value: 'light' | 'dark' | 'system'; label: string; icon: any }>;
}) {
  return (
    <div className="space-y-8">
      <div className="bg-card rounded-lg border p-6">
        <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
          <Monitor className="h-5 w-5 text-primary" />
          Appearance
        </h3>
        <p className="text-sm text-muted-foreground mb-6">
          Customize the look and feel of the application
        </p>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-3 block">Theme Selection</label>
            <div className="grid grid-cols-3 gap-3">
              {themeOptions.map((option) => {
                const Icon = option.icon;
                const isSelected = theme === option.value;
                return (
                  <button
                    key={option.value}
                    onClick={() => setTheme(option.value)}
                    className={`flex flex-col items-center gap-3 p-4 rounded-lg border-2 transition-all duration-200 ${
                      isSelected
                        ? 'border-primary bg-primary/5 text-primary shadow-sm'
                        : 'border-border hover:bg-muted/50 hover:border-muted-foreground/30'
                    }`}
                  >
                    <Icon className="h-6 w-6" />
                    <span className="text-sm font-medium">{option.label}</span>
                    {isSelected && (
                      <div className="w-2 bg-primary rounded-full"></div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-card rounded-lg border p-6">
        <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
          <Settings className="h-5 w-5 text-primary" />
          Performance
        </h3>
        <p className="text-sm text-muted-foreground mb-6">
          Configure performance and behavior settings
        </p>
        <div className="space-y-4">
          <label className="flex items-center gap-3 cursor-pointer p-3 rounded-md hover:bg-muted/30 transition-colors">
            <Checkbox defaultChecked />
            <div className="flex flex-col">
              <span className="text-sm font-medium">Enable hardware acceleration</span>
              <span className="text-xs text-muted-foreground">Use GPU for faster processing</span>
            </div>
          </label>
          <label className="flex items-center gap-3 cursor-pointer p-3 rounded-md hover:bg-muted/30 transition-colors">
            <Checkbox defaultChecked />
            <div className="flex flex-col">
              <span className="text-sm font-medium">Auto-save progress</span>
              <span className="text-xs text-muted-foreground">Automatically save your work</span>
            </div>
          </label>
          <label className="flex items-center gap-3 cursor-pointer p-3 rounded-md hover:bg-muted/30 transition-colors">
            <Checkbox />
            <div className="flex flex-col">
              <span className="text-sm font-medium">Reduce animations</span>
              <span className="text-xs text-muted-foreground">Improve performance on slower devices</span>
            </div>
          </label>
        </div>
      </div>
    </div>
  );
}

function ShortcutsSettings() {
  const shortcutCategories = Object.entries(getShortcutCategories());

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium mb-4">Keyboard Shortcuts</h3>
        <p className="text-sm text-muted-foreground mb-6">
          Customize keyboard shortcuts to improve your workflow.
        </p>
      </div>

      {shortcutCategories.map(([category, shortcuts]) => (
        <div key={category} className="bg-card rounded-lg border p-4">
          <h4 className="font-semibold mb-4 text-primary">{category}</h4>
          <div className="space-y-3">
            {shortcuts.map((shortcut) => (
              <div key={shortcut.shortcutKey} className="flex items-center justify-between p-3 rounded-md bg-muted/30 hover:bg-muted/50 transition-colors">
                <div className="flex flex-col">
                  <span className="text-sm font-medium">{shortcut.description}</span>
                  <span className="text-xs text-muted-foreground">Key combination</span>
                </div>
                <kbd className="px-3 py-2 bg-muted/80 border border-border/50 rounded-md text-sm font-mono text-muted-foreground shadow-sm">
                  {formatShortcut(shortcut)}
                </kbd>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function OCRSettings() {
  return (
    <div className="space-y-8">
      <div className="bg-card rounded-lg border p-6">
        <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
          <Eye className="h-5 w-5 text-primary" />
          OCR Configuration
        </h3>
        <p className="text-sm text-muted-foreground mb-6">
          Configure optical character recognition settings
        </p>
        <div className="space-y-6">
          <div>
            <label className="text-sm font-medium mb-3 block">Default OCR Engine</label>
            <select className="w-full p-3 border border-border bg-card text-foreground rounded-md focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors">
              <option>Tesseract</option>
              <option>PaddleOCR</option>
              <option>Auto (Best Available)</option>
            </select>
            <p className="text-xs text-muted-foreground mt-2">Choose the OCR engine for text recognition</p>
          </div>
          
          <div>
            <label className="text-sm font-medium mb-3 block">Default Language</label>
            <select className="w-full p-3 border border-border bg-card text-foreground rounded-md focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors">
              <option>English</option>
              <option>Spanish</option>
              <option>French</option>
              <option>German</option>
              <option>Auto-detect</option>
            </select>
            <p className="text-xs text-muted-foreground mt-2">Primary language for text recognition</p>
          </div>

          <div>
            <label className="text-sm font-medium mb-3 block">Image Processing</label>
            <div className="space-y-3">
              <label className="flex items-center gap-3 cursor-pointer p-3 rounded-md hover:bg-muted/30 transition-colors">
                <Checkbox defaultChecked />
                <div className="flex flex-col">
                  <span className="text-sm font-medium">Auto-enhance image contrast</span>
                  <span className="text-xs text-muted-foreground">Improve text clarity automatically</span>
                </div>
              </label>
              <label className="flex items-center gap-3 cursor-pointer p-3 rounded-md hover:bg-muted/30 transition-colors">
                <Checkbox defaultChecked />
                <div className="flex flex-col">
                  <span className="text-sm font-medium">Apply noise reduction</span>
                  <span className="text-xs text-muted-foreground">Remove image artifacts and noise</span>
                </div>
              </label>
              <label className="flex items-center gap-3 cursor-pointer p-3 rounded-md hover:bg-muted/30 transition-colors">
                <Checkbox />
                <div className="flex flex-col">
                  <span className="text-sm font-medium">Preserve original image</span>
                  <span className="text-xs text-muted-foreground">Keep a copy of the original file</span>
                </div>
              </label>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function GrammarSettings() {
  return (
    <div className="space-y-8">
      <div className="bg-card rounded-lg border p-6">
        <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
          <Globe className="h-5 w-5 text-primary" />
          Grammar Checking
        </h3>
        <p className="text-sm text-muted-foreground mb-6">
          Configure grammar and style checking preferences
        </p>
        <div className="space-y-6">
          <div>
            <label className="text-sm font-medium mb-3 block">Grammar Provider</label>
            <select className="w-full p-3 border border-border bg-card text-foreground rounded-md focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors">
              <option>Hybrid (Online + Offline)</option>
              <option>LanguageTool (Online)</option>
              <option>Offline Rules Only</option>
            </select>
            <p className="text-xs text-muted-foreground mt-2">Choose how grammar checking is performed</p>
          </div>
          
          <div>
            <label className="text-sm font-medium mb-3 block">Language</label>
            <select className="w-full p-3 border border-border bg-card text-foreground rounded-md focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors">
              <option>English (US)</option>
              <option>English (UK)</option>
              <option>Spanish</option>
              <option>French</option>
              <option>German</option>
            </select>
            <p className="text-xs text-muted-foreground mt-2">Language variant for grammar rules</p>
          </div>

          <div>
            <label className="text-sm font-medium mb-3 block">Checking Options</label>
            <div className="space-y-3">
              <label className="flex items-center gap-3 cursor-pointer p-3 rounded-md hover:bg-muted/30 transition-colors">
                <Checkbox defaultChecked />
                <div className="flex flex-col">
                  <span className="text-sm font-medium">Enable style suggestions</span>
                  <span className="text-xs text-muted-foreground">Get recommendations for better writing style</span>
                </div>
              </label>
              <label className="flex items-center gap-3 cursor-pointer p-3 rounded-md hover:bg-muted/30 transition-colors">
                <Checkbox />
                <div className="flex flex-col">
                  <span className="text-sm font-medium">Enable picky rules</span>
                  <span className="text-xs text-muted-foreground">Apply strict grammar and style rules</span>
                </div>
              </label>
              <label className="flex items-center gap-3 cursor-pointer p-3 rounded-md hover:bg-muted/30 transition-colors">
                <Checkbox defaultChecked />
                <div className="flex flex-col">
                  <span className="text-sm font-medium">Auto-correct common mistakes</span>
                  <span className="text-xs text-muted-foreground">Automatically fix obvious errors</span>
                </div>
              </label>
              <label className="flex items-center gap-3 cursor-pointer p-3 rounded-md hover:bg-muted/30 transition-colors">
                <Checkbox defaultChecked />
                <div className="flex flex-col">
                  <span className="text-sm font-medium">Offline fallback</span>
                  <span className="text-xs text-muted-foreground">Use offline grammar checking when online is unavailable</span>
                </div>
              </label>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
