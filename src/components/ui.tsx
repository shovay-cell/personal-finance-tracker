'use client';

import React, { useEffect } from 'react';
import { Plus, X } from 'lucide-react';
import { CATEGORY_COLORS, getCategoryIcon } from '@/constants/categories';
import { categoryName } from '@/i18n/categories';
import { useT } from '@/i18n/context';
import { FinanceCategory, ReceiptFieldFlag } from '@/types';

interface ModalShellProps {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidthClass?: string;
}

export function ModalShell({
  title,
  subtitle,
  icon,
  onClose,
  children,
  footer,
  maxWidthClass = 'max-w-lg',
}: ModalShellProps) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`bg-white dark:bg-slate-900 w-full ${maxWidthClass} rounded-t-3xl sm:rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col max-h-[92vh] animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200`}
      >
        <div className="flex items-start gap-3 p-5 pb-3 border-b border-slate-100 dark:border-slate-800">
          {icon && (
            <div className="w-10 h-10 rounded-2xl bg-sky-100 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400 flex items-center justify-center flex-shrink-0">
              {icon}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-black text-slate-900 dark:text-slate-100 leading-tight">
              {title}
            </h3>
            {subtitle && (
              <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium mt-0.5">
                {subtitle}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 flex items-center justify-center flex-shrink-0 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">{children}</div>

        {footer && (
          <div className="p-4 border-t border-slate-100 dark:border-slate-800 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export function Field({
  label,
  hint,
  warn,
  children,
}: {
  label: string;
  hint?: string;
  warn?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span
        className={`text-[11px] font-black uppercase tracking-wide ${
          warn ? 'text-amber-600 dark:text-amber-400' : 'text-slate-500 dark:text-slate-400'
        }`}
      >
        {label}
        {warn && ' · проверьте'}
      </span>
      {children}
      {hint && <span className="block text-[10px] text-slate-400 font-medium">{hint}</span>}
    </label>
  );
}

export const inputClass =
  'w-full px-3.5 py-2.5 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 text-sm font-semibold text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-400/60 focus:border-transparent transition-all';

export const warnInputClass =
  'w-full px-3.5 py-2.5 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border-2 border-amber-300 dark:border-amber-700 text-sm font-semibold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-400/60 transition-all';

export function fieldClass(uncertain: ReceiptFieldFlag[], field: ReceiptFieldFlag): string {
  return uncertain.includes(field) ? warnInputClass : inputClass;
}

export function PrimaryButton({
  children,
  onClick,
  disabled,
  type = 'button',
  variant = 'primary',
  className = '',
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: 'button' | 'submit';
  variant?: 'primary' | 'danger' | 'ghost' | 'success';
  className?: string;
}) {
  const styles = {
    primary: 'bg-gradient-to-tr from-sky-500 to-cyan-400 text-white shadow-lg shadow-sky-500/30',
    success: 'bg-gradient-to-tr from-emerald-500 to-teal-400 text-white shadow-lg shadow-emerald-500/30',
    danger: 'bg-rose-600 hover:bg-rose-700 text-white shadow-lg shadow-rose-600/20',
    ghost:
      'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700',
  }[variant];

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`w-full py-3 rounded-2xl font-extrabold text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-all disabled:opacity-40 disabled:active:scale-100 ${styles} ${className}`}
    >
      {children}
    </button>
  );
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string; activeClass?: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex p-1 rounded-2xl bg-slate-100 dark:bg-slate-800/80 gap-1">
      {options.map((option) => {
        const isActive = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`flex-1 py-2 rounded-xl text-xs font-black transition-all ${
              isActive
                ? option.activeClass || 'bg-white dark:bg-slate-900 text-sky-600 dark:text-sky-400 shadow-sm'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function CategoryGrid({
  categories,
  selectedId,
  onSelect,
  onCreate,
  columns = 4,
}: {
  categories: FinanceCategory[];
  selectedId?: string;
  onSelect: (id: string) => void;
  /** When given, a «Создать» tile is appended for making a category on the spot. */
  onCreate?: () => void;
  columns?: number;
}) {
  const { language } = useT();

  return (
    <div className={`grid gap-2`} style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
      {categories.map((category) => {
        const Icon = getCategoryIcon(category.iconName);
        const isActive = category.id === selectedId;
        return (
          <button
            key={category.id}
            type="button"
            onClick={() => onSelect(category.id)}
            className={`flex flex-col items-center gap-1.5 py-2.5 px-1 rounded-2xl border transition-all active:scale-95 ${
              isActive
                ? 'border-transparent ring-2 ring-offset-1 dark:ring-offset-slate-900'
                : 'border-slate-200 dark:border-slate-700 hover:border-slate-300'
            }`}
            style={
              isActive
                ? ({
                    backgroundColor: `${category.colorHex}1A`,
                    // CSS custom property drives the Tailwind ring colour
                    '--tw-ring-color': category.colorHex,
                  } as React.CSSProperties)
                : undefined
            }
          >
            <span
              className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: `${category.colorHex}22`, color: category.colorHex }}
            >
              <Icon className="w-4.5 h-4.5" style={{ width: 18, height: 18 }} />
            </span>
            <span className="text-[9.5px] font-bold leading-tight text-center text-slate-600 dark:text-slate-300 line-clamp-2">
              {categoryName(category, language)}
            </span>
          </button>
        );
      })}

      {onCreate && (
        <button
          type="button"
          onClick={onCreate}
          className="flex flex-col items-center gap-1.5 py-2.5 px-1 rounded-2xl border border-dashed border-slate-300 dark:border-slate-600 text-slate-400 hover:text-sky-500 hover:border-sky-400 transition-all active:scale-95"
        >
          <span className="w-9 h-9 rounded-xl flex items-center justify-center bg-slate-100 dark:bg-slate-800">
            <Plus className="w-4 h-4" />
          </span>
          <span className="text-[9.5px] font-bold leading-tight text-center">Создать</span>
        </button>
      )}
    </div>
  );
}

export function ColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {CATEGORY_COLORS.map((color) => (
        <button
          key={color}
          type="button"
          onClick={() => onChange(color)}
          className={`w-7 h-7 rounded-full transition-transform ${
            value === color ? 'ring-2 ring-offset-2 dark:ring-offset-slate-900 ring-slate-400 scale-110' : ''
          }`}
          style={{ backgroundColor: color }}
          aria-label={color}
        />
      ))}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-14 px-6 gap-3">
      <div className="w-16 h-16 rounded-3xl bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center">
        {icon}
      </div>
      <h4 className="text-sm font-black text-slate-700 dark:text-slate-200">{title}</h4>
      <p className="text-xs text-slate-400 font-medium max-w-xs leading-relaxed">{description}</p>
    </div>
  );
}

export function SectionTitle({
  title,
  action,
}: {
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between px-1 mb-2">
      <h3 className="text-[11px] font-black uppercase tracking-wider text-slate-400">{title}</h3>
      {action}
    </div>
  );
}

export function Card({
  children,
  className = '',
  onClick,
}: {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm ${
        onClick ? 'cursor-pointer active:scale-[0.99] transition-transform' : ''
      } ${className}`}
    >
      {children}
    </div>
  );
}
