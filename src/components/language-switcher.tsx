'use client';

import { useLanguage } from '@/lib/language-context';

export function LanguageSwitcher({ variant = 'dark' }: { variant?: 'light' | 'dark' }) {
  const { language, setLanguage } = useLanguage();

  const isDark = variant === 'dark';

  return (
    <div className={`flex p-1 rounded-xl border ${
      isDark 
        ? 'bg-white/10 backdrop-blur-md border-white/20' 
        : 'bg-slate-100 border-slate-200'
    }`}>
      <button
        onClick={() => setLanguage('en')}
        className={`px-3 py-1.5 rounded-lg text-[11px] font-black transition-all ${
          language === 'en' 
            ? 'bg-white text-indigo-900 shadow-lg' 
            : isDark 
              ? 'text-white/70 hover:bg-white/10' 
              : 'text-slate-500 hover:bg-slate-200'
        }`}
      >
        ENG
      </button>
      <button
        onClick={() => setLanguage('uz')}
        className={`px-3 py-1.5 rounded-lg text-[11px] font-black transition-all ${
          language === 'uz' 
            ? 'bg-white text-indigo-900 shadow-lg' 
            : isDark 
              ? 'text-white/70 hover:bg-white/10' 
              : 'text-slate-500 hover:bg-slate-200'
        }`}
      >
        UZ
      </button>
    </div>
  );
}
