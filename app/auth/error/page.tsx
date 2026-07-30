'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

function AuthErrorContent() {
  const searchParams = useSearchParams();
  const error = searchParams?.get('error');

  return (
    <div style={{
      maxWidth: '460px',
      width: '100%',
      backgroundColor: '#0f172a',
      border: '1px solid #334155',
      borderRadius: '16px',
      padding: '32px 24px',
      textAlign: 'center',
      boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5)'
    }}>
      <div style={{ fontSize: '48px', marginBottom: '16px' }}>🚫</div>
      
      <h1 style={{
        fontSize: '20px',
        fontWeight: '800',
        color: '#ef4444',
        marginBottom: '16px',
        lineHeight: '1.4'
      }}>
        Access Denied! Reach out to Shaunneh to get access to this awesome App!
      </h1>

      <p style={{
        fontSize: '13px',
        color: '#94a3b8',
        lineHeight: '1.6',
        marginBottom: '24px'
      }}>
        Your account is not on the authorized whitelist for NEHvigation. Please reach out to Shaunneh to get access.
      </p>

      <a
        href="/api/auth/signin"
        style={{
          display: 'inline-block',
          backgroundColor: '#0284c7',
          color: '#ffffff',
          fontWeight: '700',
          fontSize: '14px',
          padding: '12px 20px',
          borderRadius: '8px',
          textDecoration: 'none',
          boxShadow: '0 4px 12px rgba(2, 132, 199, 0.3)'
        }}
      >
        🔑 Try Logging In
      </a>
    </div>
  );
}

export default function AuthErrorPage() {
  return (
    <main style={{
      minHeight: '100vh',
      backgroundColor: '#0b0f19',
      color: '#f8fafc',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
      fontFamily: 'system-ui, -apple-system, sans-serif'
    }}>
      <Suspense fallback={
        <div style={{ color: '#f8fafc', textAlign: 'center' }}>
          Loading details...
        </div>
      }>
        <AuthErrorContent />
      </Suspense>
    </main>
  );
}
