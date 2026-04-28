'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';

export function AuthDebug() {
  const { user, loading, session } = useAuth();
  const [localStorageData, setLocalStorageData] = useState<string>('');
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
    
    // Log auth state
    console.log('🔍 AuthDebug:', { user, loading, session });
    
    // Check localStorage
    const storage: Record<string, string> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) {
        storage[key] = localStorage.getItem(key)?.substring(0, 100) + '...' || '';
      }
    }
    setLocalStorageData(JSON.stringify(storage, null, 2));
    
    // Check for service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(registrations => {
        console.log('🔧 Service Workers:', registrations.length);
        registrations.forEach(reg => console.log('  -', reg.scope, reg.active?.state));
      });
    }
  }, [user, loading, session]);

  if (!isClient) return null;

  return (
    <div style={{ 
      position: 'fixed', 
      bottom: 10, 
      right: 10, 
      background: '#000', 
      color: '#0f0', 
      padding: 10, 
      fontSize: 12,
      maxWidth: 400,
      maxHeight: 300,
      overflow: 'auto',
      zIndex: 9999,
      fontFamily: 'monospace'
    }}>
      <div><strong>Auth State:</strong></div>
      <div>Loading: {loading ? 'YES' : 'NO'}</div>
      <div>User: {user ? user.email : 'null'}</div>
      <div>Role: {user?.role || 'none'}</div>
      <div>Session: {session ? 'present' : 'null'}</div>
      <hr style={{ borderColor: '#0f0', margin: '10px 0' }} />
      <div><strong>LocalStorage:</strong></div>
      <pre style={{ fontSize: 10, whiteSpace: 'pre-wrap' }}>{localStorageData}</pre>
    </div>
  );
}
