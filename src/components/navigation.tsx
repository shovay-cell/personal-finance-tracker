'use client';

import React from 'react';
import { BarChart3, CalendarClock, Plus, Scale, Settings, Wallet } from 'lucide-react';

export type FinanceTab = 'transactions' | 'budgets' | 'planned' | 'obligations' | 'reports' | 'settings';

import { useT } from '@/i18n/context';
import type { TranslationKey } from '@/i18n/dictionary';

const TABS: { id: FinanceTab; labelKey: TranslationKey; Icon: typeof Wallet }[] = [
  { id: 'transactions', labelKey: 'nav.operations', Icon: Wallet },
  { id: 'budgets', labelKey: 'nav.budget', Icon: BarChart3 },
  { id: 'planned', labelKey: 'nav.plans', Icon: CalendarClock },
  { id: 'obligations', labelKey: 'nav.debts', Icon: Scale },
];

export function FinanceBottomNav({
  activeTab,
  onTabChange,
  onQuickAdd,
}: {
  activeTab: FinanceTab;
  onTabChange: (tab: FinanceTab) => void;
  onQuickAdd: () => void;
}) {
  const { t } = useT();

  const renderTab = (tab: (typeof TABS)[number]) => {
    const isActive = activeTab === tab.id;
    const { Icon } = tab;
    return (
      <button
        key={tab.id}
        type="button"
        onClick={() => onTabChange(tab.id)}
        className={`flex flex-col items-center gap-1 py-1 px-2 rounded-2xl transition-all ${
          isActive
            ? 'text-sky-600 dark:text-sky-400 font-extrabold scale-105'
            : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 font-medium'
        }`}
      >
        <Icon className={`w-5 h-5 ${isActive ? 'stroke-[2.5]' : 'stroke-2'}`} />
        <span className="text-[10px] tracking-tight">{t(tab.labelKey)}</span>
      </button>
    );
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border-t border-slate-100 dark:border-slate-800 shadow-[0_-10px_30px_rgba(14,165,233,0.06)] pb-[env(safe-area-inset-bottom)]">
      <div className="max-w-lg mx-auto px-3 h-16 flex items-center justify-between relative">
        <div className="flex items-center justify-around flex-1 pr-7">
          {TABS.slice(0, 2).map(renderTab)}
        </div>

        {/* Sticky quick-entry FAB — the shortest path from opening the app to a saved trace */}
        <div className="absolute left-1/2 -top-6 -translate-x-1/2 flex flex-col items-center">
          <button
            type="button"
            onClick={onQuickAdd}
            className="w-14 h-14 rounded-full bg-gradient-to-tr from-sky-500 via-cyan-500 to-teal-400 text-white flex items-center justify-center shadow-xl shadow-sky-500/40 hover:scale-110 active:scale-95 transition-all border-4 border-white dark:border-slate-900 group"
            title={t('nav.quickAddTitle')}
          >
            <Plus className="w-7 h-7 group-hover:rotate-90 transition-transform stroke-[2.8]" />
          </button>
          <span className="text-[9px] font-black uppercase tracking-wider text-sky-600 dark:text-sky-400 mt-0.5">
            {t('nav.add')}
          </span>
        </div>

        <div className="flex items-center justify-around flex-1 pl-7">
          {TABS.slice(2, 4).map(renderTab)}
        </div>
      </div>
    </nav>
  );
}

export function FinanceHeader({
  profileName,
  subtitle,
  activeTab,
  onTabChange,
}: {
  profileName: string;
  subtitle: string;
  activeTab: FinanceTab;
  onTabChange: (tab: FinanceTab) => void;
}) {
  const { t } = useT();

  return (
    <header className="sticky top-0 z-30 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border-b border-slate-100 dark:border-slate-800">
      <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
        <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-sky-500 to-cyan-400 text-white flex items-center justify-center flex-shrink-0">
          <Wallet className="w-4.5 h-4.5" style={{ width: 18, height: 18 }} />
        </div>

        <div className="flex-1 min-w-0">
          <h1 className="text-sm font-black text-slate-900 dark:text-slate-100 truncate">
            {profileName}
          </h1>
          <p className="text-[10px] text-slate-400 font-medium truncate">{subtitle}</p>
        </div>

        <button
          type="button"
          onClick={() => onTabChange('reports')}
          className={`w-9 h-9 rounded-2xl flex items-center justify-center transition-colors ${
            activeTab === 'reports'
              ? 'bg-sky-500 text-white'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
          }`}
          title={t('nav.reports')}
        >
          <BarChart3 className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={() => onTabChange('settings')}
          className={`w-9 h-9 rounded-2xl flex items-center justify-center transition-colors ${
            activeTab === 'settings'
              ? 'bg-sky-500 text-white'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
          }`}
          title={t('nav.settings')}
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
}
