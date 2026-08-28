'use client';

import React, { useState } from 'react';
import { Check, CreditCard, Landmark, RotateCcw, Trash2, Wallet } from 'lucide-react';
import { CurrencyCode, DebtWithSchedule } from '@/types';
import { deleteDebtPlan, payDebtInstallment, unpayDebtInstallment } from '@/lib/db';
import { formatDateHuman, formatMoney } from '@/services/analytics';
import { Card } from './ui';

const KIND_ICON = {
  INSTALLMENT: CreditCard,
  TAX: Landmark,
  LOAN: Wallet,
};

const KIND_COLOR = {
  INSTALLMENT: '#8B5CF6',
  TAX: '#F97316',
  LOAN: '#0EA5E9',
};

/**
 * One debt with its schedule: how much of it is already paid, what is left and
 * which payment comes next. Payments are marked paid here — that is the moment
 * they become real expenses.
 */
export function DebtCard({
  row,
  currency,
}: {
  row: DebtWithSchedule;
  currency: CurrencyCode;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const { debt, paidAmount, outstandingAmount, paidCount, totalCount, nextInstallment } = row;

  const Icon = KIND_ICON[debt.kind];
  const color = KIND_COLOR[debt.kind];
  const progress = debt.totalAmount > 0 ? (paidAmount / debt.totalAmount) * 100 : 0;

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
            {debt.title}
          </p>
          <p className="text-[10.5px] text-slate-400 font-medium truncate">
            {paidCount} из {totalCount} платежей
            {nextInstallment ? ` · следующий ${formatDateHuman(nextInstallment.dueDate)}` : ' · закрыт'}
          </p>
        </div>

        <div className="text-right flex-shrink-0">
          <p className="text-xs font-black text-slate-900 dark:text-slate-100 tabular-nums">
            {formatMoney(outstandingAmount, debt.currency)}
          </p>
          <p className="text-[10px] font-bold text-slate-400">осталось</p>
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
          Оплачено {formatMoney(paidAmount, debt.currency)} из{' '}
          {formatMoney(debt.totalAmount, debt.currency)}
        </span>
        {row.isOverdue && <span className="text-rose-500">просрочен платёж</span>}
      </div>

      {nextInstallment && !isExpanded && (
        <button
          type="button"
          onClick={() => payDebtInstallment(nextInstallment.id)}
          className="w-full py-2.5 rounded-2xl text-[11px] font-black flex items-center justify-center gap-1.5 active:scale-95 transition-transform"
          style={{ backgroundColor: `${color}1A`, color }}
        >
          <Check className="w-3.5 h-3.5" />
          Оплатить {formatMoney(nextInstallment.amount, nextInstallment.currency)} ·{' '}
          {formatDateHuman(nextInstallment.dueDate)}
        </button>
      )}

      {isExpanded && (
        <div className="space-y-1 pt-1 border-t border-slate-50 dark:border-slate-800">
          {row.installments.map((installment) => (
            <div key={installment.id} className="flex items-center gap-2 text-[10.5px]">
              <span
                className={`w-5 h-5 rounded-lg flex items-center justify-center flex-shrink-0 text-[9px] font-black ${
                  installment.isPaid
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400'
                    : 'bg-slate-100 text-slate-400 dark:bg-slate-800'
                }`}
              >
                {installment.index}
              </span>
              <span
                className={`flex-1 font-medium ${
                  installment.isPaid ? 'text-slate-400 line-through' : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                {formatDateHuman(installment.dueDate)}
              </span>
              <span className="font-black text-slate-700 dark:text-slate-200 tabular-nums">
                {formatMoney(installment.amount, installment.currency)}
              </span>
              {installment.isPaid ? (
                <button
                  type="button"
                  onClick={() => unpayDebtInstallment(installment.id)}
                  className="text-slate-300 hover:text-amber-500 transition-colors"
                  title="Отменить оплату"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => payDebtInstallment(installment.id)}
                  className="px-2 py-0.5 rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400 text-[9px] font-black"
                >
                  Оплачено
                </button>
              )}
            </div>
          ))}

          <button
            type="button"
            onClick={() => deleteDebtPlan(debt.id)}
            className="w-full mt-1 py-2 rounded-xl text-[10px] font-black text-rose-500 bg-rose-50 dark:bg-rose-950/40 flex items-center justify-center gap-1.5"
          >
            <Trash2 className="w-3 h-3" />
            Удалить обязательство
          </button>
        </div>
      )}
    </Card>
  );
}
