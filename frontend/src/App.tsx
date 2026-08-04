/**
 * Root application component.
 * Renders the layout (Topbar + Sidebar + Content) and routes
 * to the correct page component based on currentPage in the store.
 * Hides the left sidebar on the GENTERA home page for a full-width landing layout.
 * Includes a safety ErrorBoundary to catch and recover from any UI runtime exceptions.
 */
import React from 'react';
import { useAppStore } from '@/store/appStore';
import Topbar from '@/components/layout/Topbar';
import Sidebar from '@/components/layout/Sidebar';
import MainContent from '@/components/layout/MainContent';

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; error: any }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error('React ErrorBoundary caught error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: 32, background: '#FFF1F2', color: '#9F1239', fontFamily: 'sans-serif',
          height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            background: '#FFFFFF', padding: '32px 40px', borderRadius: 16,
            border: '1px solid #FECDD3', boxShadow: '0 10px 25px rgba(0,0,0,0.05)', maxWidth: 540, width: '100%',
          }}>
            <h2 style={{ fontSize: 18, color: '#BE123C', marginBottom: 12 }}>Application Encountered an Exception</h2>
            <p style={{ fontSize: 13, color: '#475569', lineHeight: 1.6, marginBottom: 20 }}>
              {String(this.state.error?.message || this.state.error)}
            </p>
            <button
              onClick={() => {
                localStorage.clear();
                window.location.reload();
              }}
              style={{
                padding: '10px 20px', background: '#E11D48', color: '#FFFFFF',
                border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer',
              }}
            >
              Reset Session & Reload Application
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const { currentPage, setPage } = useAppStore();

  React.useEffect(() => {
    // Opening application link always defaults to Home Page
    setPage('home');
  }, []);

  const showSidebar = currentPage !== 'home';

  return (
    <ErrorBoundary>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
        <Topbar />
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {showSidebar && <Sidebar />}
          <MainContent />
        </div>
      </div>
    </ErrorBoundary>
  );
}
