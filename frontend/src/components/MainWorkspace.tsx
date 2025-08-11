import { motion, AnimatePresence } from 'framer-motion';
import { SmartTextEditor } from '@/components/features/SmartTextEditor';
import { FileUploadArea } from '@/components/features/FileUploadArea';
import { OCRPanel } from '@/components/features/OCRPanel';
import { BatchProcessingPanel } from '@/components/features/BatchProcessingPanel';
import { ExportHistoryPanel } from '@/components/features/ExportHistoryPanel';
import { SettingsPanel } from '@/components/features/SettingsPanel';

interface MainWorkspaceProps {
  currentView: string;
  showSettings: boolean;
  onSettingsClose: () => void;
}

export function MainWorkspace({ currentView, showSettings, onSettingsClose }: MainWorkspaceProps) {
  const renderContent = () => {
    switch (currentView) {
      case 'main':
        return <MainView />;
      case 'batch':
        return <BatchView />;
      case 'history':
        return <HistoryView />;
      default:
        return <MainView />;
    }
  };

  return (
    <>
      {/* Content Area */}
      <div className="h-full overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentView}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.2 }}
            className="h-full"
          >
            {renderContent()}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Settings Modal */}
      <AnimatePresence>
        {showSettings && (
          <SettingsPanel onClose={onSettingsClose} />
        )}
      </AnimatePresence>
    </>
  );
}

function MainView() {
  return (
    <div className="h-full flex flex-col lg:flex-row">
      {/* Mobile-first: Controls panel stacks on top */}
      <div className="
        w-full lg:w-80 xl:w-96
        border-b lg:border-b-0 lg:border-r border-border
        bg-muted/30 flex flex-col
        max-h-[35vh] lg:max-h-none
        overflow-hidden
      ">
        <div className="p-3 sm:p-4 space-y-3 sm:space-y-4 overflow-y-auto mobile-scroll">
          {/* File Upload Area */}
          <FileUploadArea />

          {/* OCR Panel */}
          <OCRPanel />
        </div>
      </div>

      {/* Main Editor - Responsive layout */}
      <div className="flex-1 min-w-0 h-full overflow-hidden">
        <SmartTextEditor />
      </div>
    </div>
  );
}

function BatchView() {
  return (
    <div className="h-full p-3 sm:p-4 lg:p-6">
      <BatchProcessingPanel />
    </div>
  );
}

function HistoryView() {
  return (
    <div className="h-full p-3 sm:p-4 lg:p-6">
      <ExportHistoryPanel />
    </div>
  );
}
