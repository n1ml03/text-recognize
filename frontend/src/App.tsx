import { useEffect, useCallback } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { useAppStore } from '@/store/app-store';
import { universalFileApi } from '@/lib/universal-file-api';

function App() {
  const { setError, setSupportedFormats } = useAppStore();

  // Memoize the initialization function to prevent re-creation on every render
  const initializeApp = useCallback(async () => {
    try {
      // Use universal file API for both environments
      const formats = universalFileApi.getSupportedFormats();
      
      console.log('Initializing app in', universalFileApi.isWebEnvironment() ? 'web' : 'desktop', 'environment');
      console.log('Supported formats:', formats);
      
      setSupportedFormats([...formats.image], [...formats.video]);
      
      // Show environment-specific initialization message
      if (universalFileApi.isWebEnvironment()) {
        console.log('Web version initialized - drag & drop enabled, client-side processing');
      } else {
        console.log('Desktop version initialized - native file system access, enhanced processing');
      }
      
    } catch (error) {
      console.error('Failed to initialize app:', error);
      setError('Failed to initialize application');
    }
  }, [setSupportedFormats, setError]);

  useEffect(() => {
    initializeApp();
  }, [initializeApp]);

  return (
    <div className="h-screen bg-background text-foreground overflow-hidden safe-area-inset">
      <MainLayout />
    </div>
  );
}

export default App;