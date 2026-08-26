'use client';

import React, { useMemo, useState } from 'react';
import { Eye, EyeOff, Plus, Shapes, Trash2 } from 'lucide-react';
import { FinanceCategory, TransactionKind } from '@/types';
import { addCategory, deleteCategory, updateCategory } from '@/lib/db';
import { CATEGORY_COLORS, CATEGORY_ICONS, getCategoryIcon } from '@/constants/categories';
import {
  ColorPicker,
  Field,
  ModalShell,
  PrimaryButton,
  SegmentedControl,
  inputClass,
} from './ui';

export function CategoryManagerModal({
  categories,
  onClose,
}: {
  categories: FinanceCategory[];
  onClose: () => void;
}) {
  const [kind, setKind] = useState<TransactionKind>('EXPENSE');
  const [editing, setEditing] = useState<FinanceCategory | 'NEW' | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const roots = useMemo(
    () =>
      categories
        .filter((c) => c.kind === kind && !c.parentId)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [categories, kind]
  );

  const childrenOf = (parentId: string) =>
    categories.filter((c) => c.parentId === parentId).sort((a, b) => a.sortOrder - b.sortOrder);

  const handleDelete = async (category: FinanceCategory) => {
    const result = await deleteCategory(category.id);
    setNotice(result.deleted ? 'Категория удалена' : result.reason || null);
  };

  return (
    <ModalShell
      title="Категории"
      subtitle="Создавайте свои, скрывайте лишние, добавляйте подкатегории"
      icon={<Shapes className="w-5 h-5" />}
      onClose={onClose}
      footer={
        <PrimaryButton onClick={() => setEditing('NEW')}>
          <Plus className="w-4 h-4" />
          Создать категорию
        </PrimaryButton>
      }
    >
      <SegmentedControl<TransactionKind>
        value={kind}
        onChange={setKind}
        options={[
          { value: 'EXPENSE', label: 'РАСХОДЫ' },
          { value: 'INCOME', label: 'ДОХОДЫ' },
        ]}
      />

      {notice && (
        <p className="text-[11px] font-bold text-amber-600 dark:text-amber-400 text-center">
          {notice}
        </p>
      )}

      <div className="space-y-1.5">
        {roots.map((category) => {
          const Icon = getCategoryIcon(category.iconName);
          const children = childrenOf(category.id);

          return (
            <div key={category.id} className="space-y-1">
              <div
                className={`flex items-center gap-3 p-2.5 rounded-2xl border transition-opacity ${
                  category.isHidden
                    ? 'opacity-40 border-slate-200 dark:border-slate-800'
                    : 'border-slate-100 dark:border-slate-800'
                }`}
              >
                <span
                  className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: `${category.colorHex}1F`, color: category.colorHex }}
                >
                  <Icon className="w-4 h-4" />
                </span>

                <button
                  type="button"
                  onClick={() => setEditing(category)}
                  className="flex-1 min-w-0 text-left"
                >
                  <span className="block text-xs font-black text-slate-800 dark:text-slate-100 truncate">
                    {category.name}
                  </span>
                  <span className="block text-[10px] text-slate-400 font-medium">
                    {category.isSystem ? 'Системная' : 'Своя'}
                    {children.length > 0 ? ` · ${children.length} подкатегорий` : ''}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => updateCategory(category.id, { isHidden: !category.isHidden })}
                  className="w-8 h-8 rounded-xl bg-slate-50 dark:bg-slate-800 text-slate-400 flex items-center justify-center flex-shrink-0"
                  title={category.isHidden ? 'Показать' : 'Скрыть'}
                >
                  {category.isHidden ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>

                {!category.isSystem && (
                  <button
                    type="button"
                    onClick={() => handleDelete(category)}
                    className="w-8 h-8 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-500 flex items-center justify-center flex-shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {children.length > 0 && (
                <div className="pl-12 space-y-1">
                  {children.map((child) => (
                    <div
                      key={child.id}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 ${
                        child.isHidden ? 'opacity-40' : ''
                      }`}
                    >
                      <span className="flex-1 text-[11px] font-bold text-slate-600 dark:text-slate-300 truncate">
                        {child.name}
                      </span>
                      <button
                        type="button"
                        onClick={() => updateCategory(child.id, { isHidden: !child.isHidden })}
                        className="text-slate-400"
                      >
                        {child.isHidden ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                      </button>
                      {!child.isSystem && (
                        <button
                          type="button"
                          onClick={() => handleDelete(child)}
                          className="text-rose-400"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {editing && (
        <CategoryEditorModal
          category={editing === 'NEW' ? null : editing}
          defaultKind={kind}
          categories={categories}
          onClose={() => setEditing(null)}
        />
      )}
    </ModalShell>
  );
}

/**
 * Also used straight from the category pickers, so a category can be created
 * without leaving the operation form.
 */
export function CategoryEditorModal({
  category,
  defaultKind,
  categories,
  onClose,
  onCreated,
}: {
  category: FinanceCategory | null;
  defaultKind: TransactionKind;
  categories: FinanceCategory[];
  onClose: () => void;
  /** Fires with the freshly created category so the caller can select it. */
  onCreated?: (category: FinanceCategory) => void;
}) {
  const [name, setName] = useState(category?.name || '');
  const [kind, setKind] = useState<TransactionKind>(category?.kind || defaultKind);
  const [iconName, setIconName] = useState(category?.iconName || 'ShoppingBag');
  const [colorHex, setColorHex] = useState(category?.colorHex || CATEGORY_COLORS[4]);
  const [parentId, setParentId] = useState(category?.parentId || '');
  const [error, setError] = useState<string | null>(null);

  const possibleParents = categories.filter(
    (c) => c.kind === kind && !c.parentId && c.id !== category?.id
  );

  const handleSave = async () => {
    if (!name.trim()) return setError('Введите название');

    const payload = {
      name: name.trim(),
      kind,
      iconName,
      colorHex,
      parentId: parentId || undefined,
    };

    if (category) {
      await updateCategory(category.id, payload);
    } else {
      const created = await addCategory(payload);
      onCreated?.(created);
    }
    onClose();
  };

  return (
    <ModalShell
      title={category ? 'Категория' : 'Новая категория'}
      icon={<Shapes className="w-5 h-5" />}
      onClose={onClose}
      maxWidthClass="max-w-md"
      footer={
        <div className="space-y-2">
          {error && <p className="text-[11px] font-bold text-rose-500 text-center">{error}</p>}
          <PrimaryButton onClick={handleSave}>Сохранить</PrimaryButton>
        </div>
      }
    >
      <Field label="Название">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Например, Домашние животные"
          className={inputClass}
          autoFocus
        />
      </Field>

      {!category?.isSystem && (
        <SegmentedControl<TransactionKind>
          value={kind}
          onChange={(next) => {
            setKind(next);
            setParentId('');
          }}
          options={[
            { value: 'EXPENSE', label: 'РАСХОД' },
            { value: 'INCOME', label: 'ДОХОД' },
          ]}
        />
      )}

      <Field label="Родительская категория" hint="Оставьте пустым для основной категории">
        <select value={parentId} onChange={(e) => setParentId(e.target.value)} className={inputClass}>
          <option value="">— Основная категория —</option>
          {possibleParents.map((parent) => (
            <option key={parent.id} value={parent.id}>
              {parent.name}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Цвет">
        <ColorPicker value={colorHex} onChange={setColorHex} />
      </Field>

      <Field label="Иконка">
        <div className="grid grid-cols-8 gap-1.5 max-h-40 overflow-y-auto">
          {Object.keys(CATEGORY_ICONS).map((key) => {
            const Icon = CATEGORY_ICONS[key];
            return (
              <button
                key={key}
                type="button"
                onClick={() => setIconName(key)}
                className={`aspect-square rounded-xl flex items-center justify-center transition-all ${
                  iconName === key
                    ? 'ring-2 ring-sky-400'
                    : 'bg-slate-50 dark:bg-slate-800 text-slate-400'
                }`}
                style={
                  iconName === key ? { backgroundColor: `${colorHex}1F`, color: colorHex } : undefined
                }
              >
                <Icon className="w-4 h-4" />
              </button>
            );
          })}
        </div>
      </Field>
    </ModalShell>
  );
}
