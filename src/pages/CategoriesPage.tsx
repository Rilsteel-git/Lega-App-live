/* ============================================================
   CategoriesPage.tsx — salinan section #page-categories dari
   personal-wallet/index.html + logika render.categories().
   ============================================================ */

import { useCallback, useState } from 'react';
import { t } from '../i18n';
import type { TransactionType } from '../types';
import { useAppData } from '../context/AppDataContext';
import { useUi } from '../context/UiContext';
import { categoriesByType, categoryTransactionCount } from '../lib/selectors';
import { txCount } from '../lib/format';
import { Icon } from '../components/IconSprite';
import { CategoryIcon, EmptyState, Segmented } from '../components/Ui';
import { useDeleteCategory } from '../components/Modals';
import { useReorderableList } from '../hooks/useReorderableList';
import { useIncrementalList } from '../hooks/useIncrementalList';

export function CategoriesPage() {
  const { categories, transactions, restoreCategory, reorderCategories } = useAppData();
  const { openModal, toast } = useUi();
  const removeCategory = useDeleteCategory();
  const [type, setType] = useState<TransactionType>('expense');

  const list = categoriesByType(categories, type);
  const archived = categoriesByType(categories, type, { archived: true });

  const handleReorder = useCallback((ids: string[]) => {
    void reorderCategories(ids)
      .then(() => toast(t('Category order updated')))
      .catch((reason) => toast(reason instanceof Error ? reason.message : t('Could not reorder categories.'), { variant: 'error' }));
  }, [reorderCategories, toast]);
  const activeIds = list.map((category) => category.id);
  const { order, containerRef, draggingId } = useReorderableList(activeIds, handleReorder);
  const sameSet = order.length === list.length && order.every((id) => list.some((category) => category.id === id));
  const orderedList = sameSet ? order.map((id) => list.find((category) => category.id === id)!) : list;
  // The list is already in memory, so the next batch renders right away
  // instead of behind a loader.
  const { visible, hasMore, sentinel } = useIncrementalList(orderedList.length, 10, {
    resetKey: type,
    rootMargin: '0px 0px 48px 0px'
  });
  const visibleList = orderedList.slice(0, visible);

  async function restore(id: string, name: string) {
    try {
      await restoreCategory(id);
      toast(t('{name} restored', { name }));
    } catch (reason) {
      toast(reason instanceof Error ? reason.message : t('Could not restore category.'), { variant: 'error' });
    }
  }

  return (
    <section className="page active" id="page-categories" aria-label={t('Categories')}>
      <article className="card">
        <div className="card-head">
          <div><h2>{t('Categories')}</h2><p>{t('Group your income and spending')}</p></div>
        </div>
        <Segmented
          id="category-filter"
          label={t('Category type')}
          value={type}
          onChange={setType}
          options={[{ value: 'expense', label: t('Expense') }, { value: 'income', label: t('Income') }]}
        />
        <div style={{ height: 16 }} />
        <div className="category-list" id="categories-list" ref={containerRef}>
          {list.length ? (
            visibleList.map((category) => (
              <div
                className={`category-row${draggingId === category.id ? ' dragging' : ''}`}
                key={category.id}
                data-id={category.id}
                data-drag-id={category.id}
                tabIndex={0}
                role="group"
                aria-label={category.name}
              >
                <div className="category-info">
                  <span className="category-icon" aria-hidden="true"><CategoryIcon icon={category.icon} /></span>
                  <div>
                    <strong>{category.name}</strong>
                    <small>
                      {category.type === 'income' ? t('Income') : t('Expense')} ·{' '}
                      {txCount(categoryTransactionCount(transactions, category.id))}
                    </small>
                  </div>
                </div>
                <div className="wallet-actions">
                  <button
                    className="wallet-menu"
                    type="button"
                    aria-label={t('Edit category {name}', { name: category.name })}
                    title={t('Edit')}
                    onClick={() => openModal({ kind: 'category', id: category.id })}
                  >
                    <Icon name="edit" />
                  </button>
                  <button
                    className="wallet-menu"
                    type="button"
                    aria-label={t('Delete category {name}', { name: category.name })}
                    title={t('Delete')}
                    onClick={() => removeCategory(category.id)}
                  >
                    <Icon name="close" />
                  </button>
                </div>
              </div>
            ))
          ) : (
            <EmptyState
              icon="category"
              title={type === 'income' ? t('No income categories yet') : t('No expense categories yet')}
              message={t('Add one so your transactions can be grouped neatly.')}
            />
          )}

          {hasMore && <div className="incremental-list-sentinel" ref={sentinel} aria-hidden="true" />}

          {archived.length > 0 && (
            <div className="category-archive">
              <p className="category-archive-head">{t('Archived')} · {archived.length}</p>
              {archived.map((category) => (
                <div className="category-row archived" key={category.id}>
                  <div className="category-info">
                    <span className="category-icon" aria-hidden="true"><CategoryIcon icon={category.icon} /></span>
                    <div>
                      <strong>{category.name}</strong>
                      <small>{t('Archived')} · {txCount(categoryTransactionCount(transactions, category.id))}</small>
                    </div>
                  </div>
                  <button
                    className="btn ghost category-restore"
                    type="button"
                    onClick={() => void restore(category.id, category.name)}
                  >
                    {t('Restore')}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
        <button
          className="btn secondary category-add"
          type="button"
          onClick={() => openModal({ kind: 'category' })}
        >
          <Icon name="plus" /> {t('New category')}
        </button>
      </article>
    </section>
  );
}
