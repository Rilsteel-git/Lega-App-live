/* ============================================================
   CategoriesPage.tsx — salinan section #page-categories dari
   personal-wallet/index.html + logika render.categories().
   ============================================================ */

import { useCallback, useState } from 'react';
import type { TransactionType } from '../types';
import { useAppData } from '../context/AppDataContext';
import { useUi } from '../context/UiContext';
import { categoriesByType, categoryTransactionCount } from '../lib/selectors';
import { txCount } from '../lib/format';
import { Icon } from '../components/IconSprite';
import { EmptyState, Loading, Segmented } from '../components/Ui';
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
      .then(() => toast('Category order updated'))
      .catch((reason) => toast(reason instanceof Error ? reason.message : 'Could not reorder categories.', { variant: 'error' }));
  }, [reorderCategories, toast]);
  const activeIds = list.map((category) => category.id);
  const { order, containerRef, draggingId } = useReorderableList(activeIds, handleReorder);
  const sameSet = order.length === list.length && order.every((id) => list.some((category) => category.id === id));
  const orderedList = sameSet ? order.map((id) => list.find((category) => category.id === id)!) : list;
  // Lima kategori per batch. Item lama tetap terlihat; hanya batch yang baru
  // diminta lewat scroll yang menampilkan loader Lega sebelum ditambahkan.
  const { visible, hasMore, loading, sentinel } = useIncrementalList(orderedList.length, 10, {
    delayMs: 800,
    resetKey: type,
    rootMargin: '0px 0px 48px 0px'
  });
  const visibleList = orderedList.slice(0, visible);

  async function restore(id: string, name: string) {
    try {
      await restoreCategory(id);
      toast(name + ' restored');
    } catch (reason) {
      toast(reason instanceof Error ? reason.message : 'Could not restore category.', { variant: 'error' });
    }
  }

  return (
    <section className="page active" id="page-categories" aria-label="Categories">
      <article className="card">
        <div className="card-head">
          <div><h2>Categories</h2><p>Group your income and spending</p></div>
        </div>
        <Segmented
          id="category-filter"
          label="Category type"
          value={type}
          onChange={setType}
          options={[{ value: 'expense', label: 'Expense' }, { value: 'income', label: 'Income' }]}
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
                  <span className="category-icon" aria-hidden="true">{category.icon}</span>
                  <div>
                    <strong>{category.name}</strong>
                    <small>
                      {category.type === 'income' ? 'Income' : 'Expense'} ·{' '}
                      {txCount(categoryTransactionCount(transactions, category.id))}
                    </small>
                  </div>
                </div>
                <div className="wallet-actions">
                  <button
                    className="wallet-menu"
                    type="button"
                    aria-label={`Edit category ${category.name}`}
                    title="Edit"
                    onClick={() => openModal({ kind: 'category', id: category.id })}
                  >
                    <Icon name="edit" />
                  </button>
                  <button
                    className="wallet-menu"
                    type="button"
                    aria-label={`Delete category ${category.name}`}
                    title="Delete"
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
              title={`No ${type === 'income' ? 'income' : 'expense'} categories yet`}
              message="Add one so your transactions can be grouped neatly."
            />
          )}

          {hasMore && <div className="incremental-list-sentinel" ref={sentinel} aria-hidden="true" />}
          {loading && <Loading message="Memuat kategori berikutnya" />}

          {archived.length > 0 && (
            <div className="category-archive">
              <p className="category-archive-head">Archived · {archived.length}</p>
              {archived.map((category) => (
                <div className="category-row archived" key={category.id}>
                  <div className="category-info">
                    <span className="category-icon" aria-hidden="true">{category.icon}</span>
                    <div>
                      <strong>{category.name}</strong>
                      <small>Archived · {txCount(categoryTransactionCount(transactions, category.id))}</small>
                    </div>
                  </div>
                  <button
                    className="btn ghost category-restore"
                    type="button"
                    onClick={() => void restore(category.id, category.name)}
                  >
                    Restore
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
          <Icon name="plus" /> New category
        </button>
      </article>
    </section>
  );
}
