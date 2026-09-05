'use client';

import React, { useMemo, useState } from 'react';
import { CalendarClock, CalendarRange, Pencil, Repeat } from 'lucide-react';
import { FinanceAccount, FinanceCategory, Plan, PlanOccurrence } from '@/types';
import {
  getPlanOccurrenceOverride,
  updatePlanOccurrenceFields,
  upsertPlanOccurrenceOverride,
} from '@/lib/db';
import { useT } from '@/i18n/context';
import { accountName, categoryName } from '@/i18n/categories';
import { Card, CategoryGrid, Field, ModalShell, PrimaryButton, inputClass } from './ui';

export type PlanEditScope = 'THIS' | 'THIS_AND_FUTURE' | 'RULE';

/**
 * «Только эту операцию / эту и будущие / всё правило» — shown before editing
 * any not-yet-fired item that belongs to a plan with more than one future
 * payment. A plain one-off has nothing to disambiguate and skips this
 * entirely (see the callers in planned-tab.tsx / debt-card.tsx).
 */
export function EditScopeModal({ onChoose, onClose }: { onChoose: (scope: PlanEditScope) => void; onClose: () => void }) {
  const { t } = useT();

  const options: { scope: PlanEditScope; icon: React.ReactNode; label: string; hint: string }[] = [
    { scope: 'THIS', icon: <Pencil className="w-4 h-4" />, label: t('pes.this'), hint: t('pes.thisHint') },
    {
      scope: 'THIS_AND_FUTURE',
      icon: <CalendarRange className="w-4 h-4" />,
      label: t('pes.thisAndFuture'),
      hint: t('pes.thisAndFutureHint'),
    },
    { scope: 'RULE', icon: <Repeat className="w-4 h-4" />, label: t('pes.rule'), hint: t('pes.ruleHint') },
  ];

  return (
    <ModalShell title={t('pes.title')} icon={<CalendarClock className="w-5 h-5" />} onClose={onClose}>
      <div className="space-y-2">
        {options.map((option) => (
          <button
            key={option.scope}
            type="button"
            onClick={() => onChoose(option.scope)}
            className="w-full flex items-start gap-3 p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/70 text-left active:scale-[0.99] transition-transform"
          >
            <span className="w-9 h-9 rounded-xl bg-white dark:bg-slate-900 text-sky-600 dark:text-sky-400 flex items-center justify-center flex-shrink-0">
              {option.icon}
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-xs font-black text-slate-800 dark:text-slate-100">
                {option.label}
              </span>
              <span className="block text-[10.5px] text-slate-400 font-medium leading-snug mt-0.5">
                {option.hint}
              </span>
            </span>
          </button>
        ))}
      </div>
    </ModalShell>
  );
}

/**
 * «Только эту операцию» on a not-yet-fired item: RECURRING (identified by
 * `plan` + `date`) writes a `PlanOccurrenceOverride`; FIXED_SCHEDULE
 * (identified by `occurrence`) writes straight onto that occurrence row.
 * Either way the plan and every other occurrence stay untouched.
 */
export function OccurrenceOverrideModal({
  plan,
  date,
  occurrence,
  categories,
  accounts,
  onClose,
  onSaved,
}: {
  plan: Plan;
  date: string;
  occurrence?: PlanOccurrence;
  categories: FinanceCategory[];
  accounts: FinanceAccount[];
  onClose: () => void;
  onSaved?: () => void;
}) {
  const { t, language } = useT();
  const [existingOverride, setExistingOverride] = useState<Awaited<ReturnType<typeof getPlanOccurrenceOverride>>>();
  const [loaded, setLoaded] = useState(occurrence != null);

  React.useEffect(() => {
    if (occurrence) return;
    let cancelled = false;
    getPlanOccurrenceOverride(plan.id, date).then((found) => {
      if (!cancelled) {
        setExistingOverride(found);
        setLoaded(true);
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan.id, date]);

  const seed = occurrence || existingOverride;
  const [amount, setAmount] = useState(String(seed?.amount ?? plan.amount));
  const [categoryId, setCategoryId] = useState(seed?.categoryId || plan.categoryId);
  const [subcategoryId, setSubcategoryId] = useState<string | undefined>(
    seed?.subcategoryId ?? plan.subcategoryId
  );
  const [accountId, setAccountId] = useState(seed?.accountId || plan.accountId);
  const [note, setNote] = useState(seed?.note || '');
  const [isSaving, setIsSaving] = useState(false);

  // Reseed once the async override lookup for a RECURRING date resolves —
  // the fields above render with plan defaults on the first paint otherwise.
  React.useEffect(() => {
    if (!existingOverride) return;
    setAmount(String(existingOverride.amount ?? plan.amount));
    setCategoryId(existingOverride.categoryId || plan.categoryId);
    setSubcategoryId(existingOverride.subcategoryId ?? plan.subcategoryId);
    setAccountId(existingOverride.accountId || plan.accountId);
    setNote(existingOverride.note || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingOverride]);

  const rootCategories = useMemo(
    () => categories.filter((c) => c.kind === plan.kind && !c.parentId && !c.isHidden),
    [categories, plan.kind]
  );
  const subcategories = useMemo(
    () => (categoryId ? categories.filter((c) => c.parentId === categoryId && !c.isHidden) : []),
    [categories, categoryId]
  );

  const handleSave = async () => {
    setIsSaving(true);
    const numericAmount = parseFloat(amount.replace(',', '.')) || plan.amount;
    const patch = {
      amount: numericAmount,
      categoryId,
      subcategoryId,
      accountId,
      note: note.trim() || undefined,
    };
    if (occurrence) {
      await updatePlanOccurrenceFields(occurrence.id, patch);
    } else {
      await upsertPlanOccurrenceOverride(plan.id, date, patch);
    }
    onSaved?.();
    onClose();
  };

  if (!loaded) return null;

  return (
    <ModalShell
      title={t('pes.overrideTitle')}
      subtitle={date}
      icon={<Pencil className="w-5 h-5" />}
      onClose={onClose}
      footer={<PrimaryButton onClick={handleSave} disabled={isSaving}>{t('common.save')}</PrimaryButton>}
    >
      <Field label={`${t('common.amount')}`}>
        <input
          type="text"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className={inputClass}
        />
      </Field>

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

      <Field label={t('common.account')}>
        <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className={inputClass}>
          {accounts
            .filter((a) => !a.isArchived || a.id === accountId)
            .map((account) => (
              <option key={account.id} value={account.id}>
                {accountName(account, language)}
              </option>
            ))}
        </select>
      </Field>

      <Field label={t('common.note')} hint={t('pl.optional')}>
        <input type="text" value={note} onChange={(e) => setNote(e.target.value)} className={inputClass} />
      </Field>

      <Card className="p-3">
        <p className="text-[10.5px] text-slate-400 font-medium leading-relaxed">{t('pes.overrideHint')}</p>
      </Card>
    </ModalShell>
  );
}
