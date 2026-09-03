'use client';

import React, { useState } from 'react';
import {
  Check,
  CircleDashed,
  CreditCard,
  FileSignature,
  Landmark,
  Pencil,
  RotateCcw,
  Trash2,
  Wallet,
} from 'lucide-react';
import { CurrencyCode, FinanceAccount, FinanceCategory, Plan, PlanType, PlanWithSchedule } from '@/types';
import { deletePlan, payPlanOccurrence, unpayPlanOccurrence, updatePlan } from '@/lib/db';
import { formatDateHuman, formatMoney } from '@/services/analytics';
import { useT } from '@/i18n/context';
import { accountName, categoryName } from '@/i18n/categories';
import { Card, Field, ModalShell, PrimaryButton, inputClass } from './ui';

const KIND_ICON: Record<PlanType, typeof CreditCard> = {
  SUBSCRIPTION: CreditCard,
  PAYMENT: CreditCard,
  INVESTMENT: Wallet,
  INSTALLMENT: CreditCard,
  TAX: Landmark,
  LOAN: Wallet,
  OTHER: CircleDashed,
  CHEQUE: FileSignature,
};

const KIND_COLOR: Record<PlanType, string> = {
  SUBSCRIPTION: '#8B5CF6',
  PAYMENT: '#8B5CF6',
  INVESTMENT: '#0EA5E9',
  INSTALLMENT: '#8B5CF6',
  TAX: '#F97316',
  LOAN: '#0EA5E9',
  OTHER: '#64748B',
  CHEQUE: '#A855F7',
};

/**
 * One fixed-schedule plan with its occurrences: how much of it is already
 * paid, what is left and which payment comes next. Payments are marked paid
 * here — that is the moment they become real expenses.
 */
export function DebtCard({
  row,
  currency,
  categories,
  accounts,
}: {
  row: PlanWithSchedule;
  currency: CurrencyCode;
  categories: FinanceCategory[];
  accounts: FinanceAccount[];
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const { t } = useT();
  const { plan, paidAmount, outstandingAmount, paidCount, totalCount, nextOccurrence } = row;

  const Icon = KIND_ICON[plan.planType];
  const color = KIND_COLOR[plan.planType];
  const progress = plan.amount > 0 ? (paidAmount / plan.amount) * 100 : 0;

  return (
    <Card className={`p-3.5 space-y-2.5 ${row.isOverdue ? 'border-rose-200 dark:border-rose-900' : ''}`}>
      <div className="flex items-start gap-3" onClick={() => setIsExpanded((prev) => !prev)}>
        <span
          className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: `${color}1F`, color }}
        >
          <Icon className="w-4.5 h-4.5" style={{ width: 18, height: 18 }} />
        </span>

        <div className="flex-1 min-w-0">
          <p className="text-xs font-black text-slate-800 dark:text-slate-100 truncate">
            {plan.title}
          </p>
          <p className="text-[10.5px] text-slate-400 font-medium truncate">
            {paidCount} / {totalCount} {t('debts.ofPayments')}
            {nextOccurrence ? ` · ${t('dc.next')} ${formatDateHuman(nextOccurrence.dueDate)}` : ''}
          </p>
          {plan.note && (
            <p className="text-[10.5px] text-slate-500 dark:text-slate-400 font-medium truncate">
              {plan.note}
            </p>
          )}
        </div>

        <div className="text-right flex-shrink-0">
          <p className="text-xs font-black text-slate-900 dark:text-slate-100 tabular-nums">
            {formatMoney(outstandingAmount, plan.currency)}
          </p>
          <p className="text-[10px] font-bold text-slate-400">{t('debts.left')}</p>
        </div>
      </div>

      <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${Math.min(100, progress)}%`, backgroundColor: color }}
        />
      </div>

      <div className="flex items-center justify-between text-[11px] font-bold">
        <span className="text-slate-400 tabular-nums">
          {t('debts.paid')} {formatMoney(paidAmount, plan.currency)} / {' '}
          {formatMoney(plan.amount, plan.currency)}
        </span>
        {row.isOverdue && <span className="text-rose-500">{t('debts.overdue')}</span>}
      </div>

      {nextOccurrence && !isExpanded && (
        <button
          type="button"
          onClick={() => payPlanOccurrence(nextOccurrence.id)}
          className="w-full py-2.5 rounded-2xl text-[11px] font-black flex items-center justify-center gap-1.5 active:scale-95 transition-transform"
          style={{ backgroundColor: `${color}1A`, color }}
        >
          <Check className="w-3.5 h-3.5" />
          {t('debts.pay')} {formatMoney(nextOccurrence.amount, nextOccurrence.currency)} ·{' '}
          {formatDateHuman(nextOccurrence.dueDate)}
        </button>
      )}

      {isExpanded && (
        <div className="space-y-1 pt-1 border-t border-slate-50 dark:border-slate-800">
          {row.occurrences.map((occurrence) => (
            <div key={occurrence.id} className="flex items-center gap-2 text-[10.5px]">
              <span
                className={`w-5 h-5 rounded-lg flex items-center justify-center flex-shrink-0 text-[9px] font-black ${
                  occurrence.isPaid
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400'
                    : 'bg-slate-100 text-slate-400 dark:bg-slate-800'
                }`}
              >
                {occurrence.index}
              </span>
              <span
                className={`flex-1 font-medium ${
                  occurrence.isPaid ? 'text-slate-400 line-through' : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                {formatDateHuman(occurrence.dueDate)}
              </span>
              <span className="font-black text-slate-700 dark:text-slate-200 tabular-nums">
                {formatMoney(occurrence.amount, occurrence.currency)}
              </span>
              {occurrence.isPaid ? (
                <button
                  type="button"
                  onClick={() => unpayPlanOccurrence(occurrence.id)}
                  className="text-slate-300 hover:text-amber-500 transition-colors"
                  title={t('dc.undoPayment')}
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => payPlanOccurrence(occurrence.id)}
                  className="px-2 py-0.5 rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400 text-[9px] font-black"
                >
                  {t('debts.paid')}
                </button>
              )}
            </div>
          ))}

          <div className="flex gap-2 mt-1">
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              className="flex-1 py-2 rounded-xl text-[10px] font-black text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 flex items-center justify-center gap-1.5"
            >
              <Pencil className="w-3 h-3" />
              {t('dc.edit')}
            </button>
            <button
              type="button"
              onClick={() => deletePlan(plan.id)}
              className="flex-1 py-2 rounded-xl text-[10px] font-black text-rose-500 bg-rose-50 dark:bg-rose-950/40 flex items-center justify-center gap-1.5"
            >
              <Trash2 className="w-3 h-3" />
              {t('debts.deleteDebt')}
            </button>
          </div>
        </div>
      )}

      {isEditing && (
        <PlanEditModal
          plan={plan}
          categories={categories}
          accounts={accounts}
          onClose={() => setIsEditing(false)}
        />
      )}
    </Card>
  );
}

/**
 * Title/merchant/category/account/note only — the schedule and amounts stay
 * fixed once occurrences exist. Changing the category here only steers
 * occurrences not yet paid; a payment already booked is a real transaction
 * with its own category, corrected separately in the ledger.
 */
export function PlanEditModal({
  plan,
  categories,
  accounts,
  onClose,
}: {
  plan: Plan;
  categories: FinanceCategory[];
  accounts: FinanceAccount[];
  onClose: () => void;
}) {
  const { t, language } = useT();
  const [title, setTitle] = useState(plan.title);
  const [merchant, setMerchant] = useState(plan.merchant || '');
  const [categoryId, setCategoryId] = useState(plan.categoryId);
  const [subcategoryId, setSubcategoryId] = useState<string | undefined>(plan.subcategoryId);
  const [accountId, setAccountId] = useState(plan.accountId);
  const [note, setNote] = useState(plan.note || '');
  const [error, setError] = useState<string | null>(null);

  const relevantCategories = categories.filter(
    (c) => c.kind === plan.kind && !c.parentId && !c.isHidden
  );
  const subcategories = categories.filter((c) => c.parentId === categoryId && !c.isHidden);

  const handleSave = async () => {
    if (!title.trim()) return setError(t('pl.enterTitle'));
    if (!categoryId) return setError(t('pl.pickCategory'));

    await updatePlan(plan.id, {
      title: title.trim(),
      merchant: merchant.trim() || undefined,
      categoryId,
      subcategoryId,
      accountId,
      note: note.trim() || undefined,
    });
    onClose();
  };

  return (
    <ModalShell
      title={t('dc.editTitle')}
      subtitle={t('dc.editHint')}
      icon={<Pencil className="w-5 h-5" />}
      onClose={onClose}
      footer={
        <div className="space-y-2">
          {error && <p className="text-[11px] font-bold text-rose-500 text-center">{error}</p>}
          <PrimaryButton onClick={handleSave}>{t('common.save')}</PrimaryButton>
        </div>
      }
    >
      <Field label={t('pl.title')}>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className={inputClass}
          autoFocus
        />
      </Field>

      <Field label={t('form.merchant')} hint={t('pl.optional')}>
        <input
          type="text"
          value={merchant}
          onChange={(e) => setMerchant(e.target.value)}
          placeholder={t('tf.merchantPlaceholder')}
          className={inputClass}
        />
      </Field>

      <Field label={t('common.category')}>
        <select
          value={categoryId}
          onChange={(e) => {
            setCategoryId(e.target.value);
            setSubcategoryId(undefined);
          }}
          className={inputClass}
        >
          {relevantCategories.map((category) => (
            <option key={category.id} value={category.id}>
              {categoryName(category, language)}
            </option>
          ))}
        </select>
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

      <Field label={t('common.note')}>
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className={inputClass}
        />
      </Field>
    </ModalShell>
  );
}
