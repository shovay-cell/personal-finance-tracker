'use client';

import React, { useMemo, useState } from 'react';
import { Tag } from 'lucide-react';
import { CurrencyCode, FinanceCategory, Transaction } from '@/types';
import { bulkUpdateTransactionCategory } from '@/lib/db';
import { useT } from '@/i18n/context';
import { categoryName } from '@/i18n/categories';
import { formatDateHuman, formatMoney } from '@/services/analytics';
import { CategoryGrid, Field, ModalShell, PrimaryButton } from './ui';

/**
 * Re-categorizes a whole filtered/selected batch of already-booked
 * transactions at once. Editing a plan's own category (PlanEditModal) only
 * steers occurrences not yet paid, so once a bulk conversion has linked
 * every occurrence to a real, already-paid transaction there is nothing
 * left for that to apply to — this is the direct way to move the
 * transactions themselves.
 */
export function BulkChangeCategoryModal({
  transactions,
  categories,
  baseCurrency,
  onClose,
  onDone,
}: {
  transactions: Transaction[];
  categories: FinanceCategory[];
  baseCurrency: CurrencyCode;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t, language } = useT();
  const [categoryId, setCategoryId] = useState<string | undefined>(undefined);
  const [subcategoryId, setSubcategoryId] = useState<string | undefined>(undefined);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const kind = transactions[0]?.kind;
  const count = transactions.length;
  const total = Math.round(transactions.reduce((sum, t) => sum + t.baseAmount, 0) * 100) / 100;
  const sorted = [...transactions].sort((a, b) => a.date.localeCompare(b.date));
  const firstDate = sorted[0]?.date;
  const lastDate = sorted[sorted.length - 1]?.date;

  const rootCategories = useMemo(
    () => categories.filter((c) => c.kind === kind && !c.parentId && !c.isHidden),
    [categories, kind]
  );
  const subcategories = useMemo(
    () => (categoryId ? categories.filter((c) => c.parentId === categoryId && !c.isHidden) : []),
    [categories, categoryId]
  );

  const handleSave = async () => {
    if (!categoryId) return setError(t('pl.pickCategory'));
    setIsSaving(true);
    setError(null);
    try {
      await bulkUpdateTransactionCategory({
        transactionIds: transactions.map((t) => t.id),
        categoryId,
        subcategoryId,
      });
      onDone();
      onClose();
    } catch (err: any) {
      setError(err.message || t('qa.saveFailed'));
      setIsSaving(false);
    }
  };

  return (
    <ModalShell
      title={t('bcc.title')}
      icon={<Tag className="w-5 h-5" />}
      onClose={onClose}
      footer={
        <div className="space-y-2">
          {error && <p className="text-[11px] font-bold text-rose-500 text-center">{error}</p>}
          <PrimaryButton onClick={handleSave} disabled={isSaving || count === 0}>
            {t('bcc.confirm')}
          </PrimaryButton>
        </div>
      }
    >
      <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/70 p-3 space-y-1">
        <p className="text-xs font-black text-slate-700 dark:text-slate-200">
          {count} · {formatMoney(total, baseCurrency, { compact: true })}
        </p>
        {firstDate && lastDate && (
          <p className="text-[10.5px] text-slate-400 font-medium">
            {formatDateHuman(firstDate)} — {formatDateHuman(lastDate)}
          </p>
        )}
      </div>

      <p className="text-[10.5px] text-slate-400 font-medium leading-relaxed">{t('bcc.hint')}</p>

      <Field label={t('common.category')}>
        <CategoryGrid
          categories={rootCategories}
          allCategories={categories}
          selectedId={categoryId}
          onSelect={(id) => {
            setCategoryId(id);
            setSubcategoryId(undefined);
          }}
        />
      </Field>

      {subcategories.length > 0 && (
        <Field label={t('form.subcategory')}>
          <div className="flex flex-wrap gap-2">
            {subcategories.map((sub) => (
              <button
                key={sub.id}
                type="button"
                onClick={() => setSubcategoryId(subcategoryId === sub.id ? undefined : sub.id)}
                className={`px-3 py-1.5 rounded-xl text-[11px] font-bold border transition-all ${
                  subcategoryId === sub.id
                    ? 'bg-sky-500 text-white border-transparent'
                    : 'bg-slate-50 dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700'
                }`}
              >
                {categoryName(sub, language)}
              </button>
            ))}
          </div>
        </Field>
      )}
    </ModalShell>
  );
}
