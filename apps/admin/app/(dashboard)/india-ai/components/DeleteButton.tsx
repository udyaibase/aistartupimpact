'use client';

import { notify } from '@/components/Toast';
import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { ConfirmModal } from '@/components/ConfirmModal';

interface DeleteButtonProps {
  itemId: string;
  itemName: string;
  deleteEndpoint: string;
}

export function DeleteButton({ itemId, itemName, deleteEndpoint }: DeleteButtonProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleDelete = async () => {
    try {
      const response = await fetch(deleteEndpoint, {
        method: 'POST',
      });

      if (response.ok) {
        window.location.reload();
      } else {
        notify(`Couldn't delete ${itemName}. Try again.`, 'error');
      }
    } catch (error) {
      console.error('Delete error:', error);
      notify(`Couldn't delete ${itemName}. Check your connection and try again.`, 'error');
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirmDelete(true)}
        aria-label={`Delete ${itemName}`}
        title="Delete"
        className="p-1.5 rounded-lg text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
      >
        <Trash2 className="w-4 h-4" aria-hidden />
      </button>

      <ConfirmModal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => {
          handleDelete();
          setConfirmDelete(false);
        }}
        title="Delete item"
        message={`Delete ${itemName}? It is removed from the India AI pages. This can't be undone.`}
        confirmLabel="Delete"
        variant="danger"
        requireTyping={true}
      />
    </>
  );
}
