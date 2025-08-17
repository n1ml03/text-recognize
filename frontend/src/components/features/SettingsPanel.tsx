import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Settings,
  Palette,
  Zap,
  Shield,
  Save,
  RotateCcw,
  Monitor,
  Moon,
  Sun,
  X,
  Eye,
  Cpu,
  HardDrive,
  Image,
  FileText} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { useUIState, useAppStore, useOCRState } from '@/store/app-store';

interface SettingsPanelProps {
  onClose: () => void;
}

export function SettingsPanel({ onClose }: SettingsPanelProps) {
  const { theme, setTheme } = useUIState();
  const { setError } = useAppStore();
  const { preprocessingOptions, setPreprocessingOptions } = useOCRState();
  const [activeTab, setActiveTab] = useState<'appearance' | 'performance' | 'ocr' | 'privacy'>('appearance');
  const [settings, setSettings] = useState({
    // Appearance
    enableAnimations: true,
    compactMode: false,
    showPreviewImages: true,
    
    // Performance
    hardwareAcceleration: true,
    autoSave: true,
    maxConcurrentFiles: 3,
    cacheResults: true,
    
    // OCR
    autoEnhanceContrast: true,
    denoiseImages: true,
    ocrLanguage: 'en',
    ocrEngine: 'auto',
    
    // Privacy
    saveHistory: true,
    analyticsOptOut: false,
    clearCacheOnExit: false,
  });

  const tabs = [
    { 
      id: 'appearance' as const, 
      label: 'Appearance', 
      icon: Palette,
      description: 'Themes and visual preferences'
    },
    { 
      id: 'performance' as const, 
      label: 'Performance', 
      icon: Zap,
      description: 'Speed and processing options'
    },
    { 
      id: 'ocr' as const, 
      label: 'OCR Settings', 
      icon: Eye,
      description: 'Text recognition configuration'
    },
    { 
      id: 'privacy' as const, 
      label: 'Privacy', 
      icon: Shield,
      description: 'Data and privacy settings'
    },
  ];

  const themeOptions = [
    { value: 'light' as const, label: 'Light', icon: Sun, description: 'Clean and bright interface' },
    { value: 'dark' as const, label: 'Dark', icon: Moon, description: 'Easy on the eyes' },
    { value: 'system' as const, label: 'System', icon: Monitor, description: 'Follow system preference' },
  ];

  const updateSetting = (key: string, value: any) => {
    setSettings(prev => {
      const next = { ...prev, [key]: value };
      try {
        // Persist immediately
        if (typeof window !== 'undefined') {
          localStorage.setItem('app-settings', JSON.stringify(next));
        }
      } catch (e) {
        console.warn('Failed to persist setting', e);
      }

      // Apply OCR-related settings immediately to global store
      if (key === 'autoEnhanceContrast') {
        setPreprocessingOptions({ ...preprocessingOptions, enhance_contrast: Boolean(value) });
      }
      if (key === 'denoiseImages') {
        setPreprocessingOptions({ ...preprocessingOptions, denoise: Boolean(value) });
      }

      return next;
    });
  };

  // Load saved settings on mount
  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        const saved = localStorage.getItem('app-settings');
        if (saved) {
          const parsed = JSON.parse(saved);
          setSettings((prev) => ({ ...prev, ...parsed }));
          // Sync OCR toggles into store on load
          if (parsed.autoEnhanceContrast !== undefined) {
            setPreprocessingOptions({ ...preprocessingOptions, enhance_contrast: Boolean(parsed.autoEnhanceContrast) });
          }
          if (parsed.denoiseImages !== undefined) {
            setPreprocessingOptions({ ...preprocessingOptions, denoise: Boolean(parsed.denoiseImages) });
          }
        }
      }
    } catch (e) {
      console.warn('Failed to load saved settings', e);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSave = () => {
    // Here you would save settings to localStorage or backend
    try {
      localStorage.setItem('app-settings', JSON.stringify(settings));
      console.log('Settings saved successfully');
      onClose();
    } catch (error) {
      setError('Failed to save settings');
    }
  };

  const handleReset = () => {
    setSettings({
      enableAnimations: true,
      compactMode: false,
      showPreviewImages: true,
      hardwareAcceleration: true,
      autoSave: true,
      maxConcurrentFiles: 3,
      cacheResults: true,
      autoEnhanceContrast: true,
      denoiseImages: true,
      ocrLanguage: 'en',
      ocrEngine: 'auto',
      saveHistory: true,
      analyticsOptOut: false,
      clearCacheOnExit: false,
    });
    setTheme('system');
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/90 border border-border rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="border-b border-border/50 bg-card/30 p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <Settings className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold">Settings</h2>
                  <p className="text-sm text-muted-foreground">Customize your experience</p>
                </div>
              </div>
              <motion.div
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onClose}
                  className="h-10 w-10 rounded-lg"
                >
                  <X className="h-5 w-5" />
                </Button>
              </motion.div>
            </div>
          </div>

          <div className="flex h-[calc(90vh-200px)]">
            {/* Sidebar */}
            <div className="w-64 border-r border-border/50 bg-background/50 p-4">
              <nav className="space-y-2">
                {tabs.map((tab) => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.id;
                  
                  return (
                    <motion.button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`w-full flex items-start gap-3 p-3 rounded-lg text-left transition-all duration-200 ${
                        isActive
                          ? 'bg-primary text-primary-foreground shadow-md'
                          : 'hover:bg-muted/50 text-muted-foreground hover:text-foreground'
                      }`}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <Icon className="h-5 w-5 mt-0.5 flex-shrink-0" />
                      <div className="min-w-0">
                        <div className="font-medium">{tab.label}</div>
                        <div className={`text-xs mt-0.5 ${isActive ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>
                          {tab.description}
                        </div>
                      </div>
                    </motion.button>
                  );
                })}
              </nav>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 bg-background/50">
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeTab}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.2 }}
                >
                  {activeTab === 'appearance' && (
                    <AppearanceSettings 
                      theme={theme} 
                      setTheme={setTheme} 
                      themeOptions={themeOptions}
                      settings={settings}
                      updateSetting={updateSetting}
                    />
                  )}
                  {activeTab === 'performance' && (
                    <PerformanceSettings 
                      settings={settings}
                      updateSetting={updateSetting}
                    />
                  )}
                  {activeTab === 'ocr' && (
                    <OCRSettings 
                      settings={settings}
                      updateSetting={updateSetting}
                    />
                  )}
                  {activeTab === 'privacy' && (
                    <PrivacySettings 
                      settings={settings}
                      updateSetting={updateSetting}
                    />
                  )}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>

          {/* Footer */}
          <div className="border-t border-border/50 bg-card/30 p-4 flex justify-between">
            <motion.div
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <Button variant="outline" onClick={handleReset}>
                <RotateCcw className="h-4 w-4 mr-2" />
                Reset to Defaults
              </Button>
            </motion.div>
            <div className="flex gap-2">
              <motion.div
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <Button variant="outline" onClick={onClose}>
                  Cancel
                </Button>
              </motion.div>
              <motion.div
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <Button onClick={handleSave}>
                  <Save className="h-4 w-4 mr-2" />
                  Save Changes
                </Button>
              </motion.div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function AppearanceSettings({ 
  theme, 
  setTheme, 
  themeOptions, 
  settings, 
  updateSetting 
}: {
  theme: string;
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
  themeOptions: Array<{ value: 'light' | 'dark' | 'system'; label: string; icon: React.ComponentType<{ className?: string }>; description: string }>;
  settings: any;
  updateSetting: (key: string, value: any) => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-xl font-bold mb-2 flex items-center gap-2">
          <Palette className="h-5 w-5 text-primary" />
          Appearance & Theme
        </h3>
        <p className="text-sm text-muted-foreground mb-6">
          Customize the look and feel of the application
        </p>
      </div>

      <Card className="border-border/50 bg-card/50 hover:bg-card/70 transition-colors">
        <CardHeader>
          <CardTitle className="text-lg">Theme Selection</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            {themeOptions.map((option) => {
              const Icon = option.icon;
              const isSelected = theme === option.value;
              
              return (
                <motion.button
                  key={option.value}
                  onClick={() => setTheme(option.value)}
                  className={`flex flex-col items-center gap-3 p-4 rounded-lg border-2 transition-all duration-200 ${
                    isSelected
                      ? 'border-primary bg-primary/10 text-primary shadow-sm'
                      : 'border-border hover:bg-muted/50 hover:border-muted-foreground/50'
                  }`}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <Icon className="h-8 w-8" />
                  <div className="text-center">
                    <div className="font-medium">{option.label}</div>
                    <div className="text-xs text-muted-foreground mt-1">{option.description}</div>
                  </div>
                  {isSelected && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="w-2 h-2 bg-primary rounded-full"
                    />
                  )}
                </motion.button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/50 bg-card/50 hover:bg-card/70 transition-colors">
        <CardHeader>
          <CardTitle className="text-lg">Interface Options</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <SettingToggle
            checked={settings.enableAnimations}
            onChange={(checked) => updateSetting('enableAnimations', checked)}
            title="Enable Animations"
            description="Smooth transitions and micro-interactions"
            icon={<Zap className="h-4 w-4" />}
          />
          <SettingToggle
            checked={settings.showPreviewImages}
            onChange={(checked) => updateSetting('showPreviewImages', checked)}
            title="Show Image Previews"
            description="Display thumbnails in file lists"
            icon={<Image className="h-4 w-4" />}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function PerformanceSettings({ settings, updateSetting }: { settings: any; updateSetting: (key: string, value: any) => void }) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-xl font-bold mb-2 flex items-center gap-2">
          <Zap className="h-5 w-5 text-primary" />
          Performance & Processing
        </h3>
        <p className="text-sm text-muted-foreground mb-6">
          Optimize speed and resource usage
        </p>
      </div>

      <Card className="border-border/50 bg-card/50 hover:bg-card/70 transition-colors">
        <CardHeader>
          <CardTitle className="text-lg">System Performance</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <SettingToggle
            checked={settings.hardwareAcceleration}
            onChange={(checked) => updateSetting('hardwareAcceleration', checked)}
            title="Hardware Acceleration"
            description="Use GPU for faster image processing"
            icon={<Cpu className="h-4 w-4" />}
          />
          <SettingToggle
            checked={settings.autoSave}
            onChange={(checked) => updateSetting('autoSave', checked)}
            title="Auto-save Progress"
            description="Automatically save your work"
            icon={<Save className="h-4 w-4" />}
          />
          <SettingToggle
            checked={settings.cacheResults}
            onChange={(checked) => updateSetting('cacheResults', checked)}
            title="Cache OCR Results"
            description="Store results to speed up re-processing"
            icon={<HardDrive className="h-4 w-4" />}
          />
        </CardContent>
      </Card>

      <Card className="border-border/50 bg-card/50 hover:bg-card/70 transition-colors">
        <CardHeader>
          <CardTitle className="text-lg">Processing Limits</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-2 block">Maximum Concurrent Files</label>
            <select 
              value={settings.maxConcurrentFiles}
              onChange={(e) => updateSetting('maxConcurrentFiles', parseInt(e.target.value))}
              className="w-full p-3 border rounded-lg bg-background"
            >
              <option value={1}>1 file (Slower, less memory)</option>
              <option value={3}>3 files (Balanced)</option>
              <option value={5}>5 files (Faster, more memory)</option>
              <option value={10}>10 files (Maximum speed)</option>
            </select>
            <p className="text-xs text-muted-foreground mt-2">
              Higher values use more memory but process faster
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function OCRSettings({ settings, updateSetting }: { settings: any; updateSetting: (key: string, value: any) => void }) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-xl font-bold mb-2 flex items-center gap-2">
          <Eye className="h-5 w-5 text-primary" />
          OCR Configuration
        </h3>
        <p className="text-sm text-muted-foreground mb-6">
          Configure text recognition settings
        </p>
      </div>

      <Card className="border-border/50 bg-card/50 hover:bg-card/70 transition-colors">
        <CardHeader>
          <CardTitle className="text-lg">OCR Engine</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-2 block">Primary OCR Engine</label>
            <select 
              value={settings.ocrEngine}
              onChange={(e) => updateSetting('ocrEngine', e.target.value)}
              className="w-full p-3 border rounded-lg bg-background"
            >
              <option value="oneocr">OneOCR</option>
            </select>
            <p className="text-xs text-muted-foreground mt-2">
              Auto mode selects the best engine for each file type
            </p>
          </div>

          <div>
            <label className="text-sm font-medium mb-2 block">Default Language</label>
            <select 
              value={settings.ocrLanguage}
              onChange={(e) => updateSetting('ocrLanguage', e.target.value)}
              className="w-full p-3 border rounded-lg bg-background"
            >
              <option value="en">English</option>
              <option value="es">Spanish</option>
              <option value="fr">French</option>
              <option value="de">German</option>
              <option value="auto">Auto-detect</option>
            </select>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/50 bg-card/50 hover:bg-card/70 transition-colors">
        <CardHeader>
          <CardTitle className="text-lg">Image Processing</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <SettingToggle
            checked={settings.autoEnhanceContrast}
            onChange={(checked) => updateSetting('autoEnhanceContrast', checked)}
            title="Auto-enhance Contrast"
            description="Automatically improve text clarity"
            icon={<Image className="h-4 w-4" />}
          />
          <SettingToggle
            checked={settings.denoiseImages}
            onChange={(checked) => updateSetting('denoiseImages', checked)}
            title="Noise Reduction"
            description="Remove image artifacts for better recognition"
            icon={<Eye className="h-4 w-4" />}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function PrivacySettings({ settings, updateSetting }: { settings: any; updateSetting: (key: string, value: any) => void }) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-xl font-bold mb-2 flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          Privacy & Data
        </h3>
        <p className="text-sm text-muted-foreground mb-6">
          Control how your data is handled
        </p>
      </div>

      <Card className="border-border/50 bg-card/50 hover:bg-card/70 transition-colors">
        <CardHeader>
          <CardTitle className="text-lg">Data Storage</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <SettingToggle
            checked={settings.saveHistory}
            onChange={(checked) => updateSetting('saveHistory', checked)}
            title="Save Processing History"
            description="Keep records of processed files and results"
            icon={<FileText className="h-4 w-4" />}
          />
          <SettingToggle
            checked={settings.clearCacheOnExit}
            onChange={(checked) => updateSetting('clearCacheOnExit', checked)}
            title="Clear Cache on Exit"
            description="Remove temporary files when closing the app"
            icon={<HardDrive className="h-4 w-4" />}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function SettingToggle({
  checked,
  onChange,
  title,
  description,
  icon
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  title: string;
  description: string;
  icon: React.ReactNode;
}) {
  return (
    <motion.label 
      className="flex items-start gap-3 cursor-pointer p-3 rounded-lg hover:bg-muted/30 transition-colors group"
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
    >
      <Checkbox 
        checked={checked}
        onCheckedChange={onChange}
        className="mt-1"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          {icon}
          <span className="font-medium group-hover:text-primary transition-colors">{title}</span>
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
      </div>
    </motion.label>
  );
}