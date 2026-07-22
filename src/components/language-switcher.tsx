'use client';

import { useLanguage } from '@/lib/language-context';

export function LanguageSwitcher({ variant = 'dark' }: { variant?: 'light' | 'dark' }) {
  const { language, setLanguage } = useLanguage();

  const isDark = variant === 'dark';

  return (
    <div className={`flex p-1 rounded-xl border ${
      isDark 
        ? 'bg-[#1C232E]/50 backdrop-blur-md border-[#5C4A2E]/30' 
        : 'bg-[#1C232E]/50 border-[#5C4A2E]/30'
    }`}>
      <button
        onClick={() => setLanguage('en')}
        className={`px-3 py-1.5 rounded-lg text-[11px] font-black transition-all ${
          language === 'en' 
            ? 'bg-[#0B6E4F] text-[#C9A227] shadow-lg' 
            : isDark 
              ? 'text-[#9C9384] hover:bg-[#2A1518]' 
              : 'text-[#9C9384] hover:bg-[#2A1518]'
        }`}
      >
        ENG
      </button>
      <button
        onClick={() => setLanguage('uz')}
        className={`px-3 py-1.5 rounded-lg text-[11px] font-black transition-all ${
          language === 'uz' 
            ? 'bg-[#0B6E4F] text-[#C9A227] shadow-lg' 
            : isDark 
              ? 'text-[#9C9384] hover:bg-[#2A1518]' 
              : 'text-[#9C9384] hover:bg-[#2A1518]'
        }`}
      >
        UZ
      </button>
      <button
        onClick={() => setLanguage('ru')}
        className={`px-3 py-1.5 rounded-lg text-[11px] font-black transition-all ${
          language === 'ru' 
            ? 'bg-[#0B6E4F] text-[#C9A227] shadow-lg' 
            : isDark 
              ? 'text-[#9C9384] hover:bg-[#2A1518]' 
              : 'text-[#9C9384] hover:bg-[#2A1518]'
        }`}
      >
        RU
      </button>
    </div>
  );
}
