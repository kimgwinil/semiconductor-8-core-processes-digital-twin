import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@/ui/App';
import { initialLang, setLang } from '@/lib/i18n';
import '@/ui/styles/index.css';

async function boot(): Promise<void> {
  await setLang(initialLang());
  const el = document.getElementById('root');
  if (!el) throw new Error('#root not found');
  createRoot(el).render(<StrictMode><App /></StrictMode>);
}

void boot();
