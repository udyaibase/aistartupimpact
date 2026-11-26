'use client';

import { useState, useEffect } from 'react';
import {
  Plus, Search, Zap, Radio, X, Save, Edit3, Trash2,
  CheckCircle, Clock, GripVertical, Eye, EyeOff,
} from 'lucide-react';
import {
  getBreakingTickersAction,
  createBreakingTickerAction,
  updateBreakingTickerAction,
  deleteBreakingTickerAction,
  reorderBreakingTickersAction,
  getLiveTickersAction,
  createLiveTickerAction,
  updateLiveTickerAction,
  deleteLiveTickerAction,
  reorderLiveTickersAction,
} from './actions';
import { notify } from '@/components/Toast';

interface Ticker {
  id: string;
  text: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export default function TickersPage() {
  const [breakingTickers, setBreakingTickers] = useState<Ticker[]>([]);
  const [liveTickers, setLiveTickers] = useState<Ticker[]>([]);
  const [activeTab, setActiveTab] = useState<'breaking' | 'live'>('breaking');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Ticker | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [newText, setNewText] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTickers();
  }, []);

  const loadTickers = async () => {
    setLoading(true);
    try {
      const [breaking, live] = await Promise.all([
        getBreakingTickersAction(),
        getLiveTickersAction(),
      ]);
      setBreakingTickers(breaking as Ticker[]);
      setLiveTickers(live as Ticker[]);
    } catch (error) {
      console.error('Error loading tickers:', error);
      notify("Couldn't load this. Check your connection and refresh.", 'error');
    } finally {
      setLoading(false);
    }
  };

  const currentTickers = activeTab === 'breaking' ? breakingTickers : liveTickers;
  const setCurrentTickers = activeTab === 'breaking' ? setBreakingTickers : setLiveTickers;

  const openCreate = () => {
    setEditing(null);
    setNewText('');
    setModalOpen(true);
  };

  const openEdit = (ticker: Ticker) => {
    setEditing(ticker);
    setNewText(ticker.text);
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!newText.trim()) return;

    try {
      if (editing) {
        // Update existing ticker
        const action = activeTab === 'breaking' ? updateBreakingTickerAction : updateLiveTickerAction;
        const result = await action(editing.id, newText.trim(), editing.isActive);
        if (result.success) {
          setCurrentTickers(prev => 
            prev.map(t => t.id === editing.id ? { ...t, text: newText.trim() } : t)
          );
        }
      } else {
        // Create new ticker
        const action = activeTab === 'breaking' ? createBreakingTickerAction : createLiveTickerAction;
        const result = await action(newText.trim());
        if (result.success) {
          await loadTickers(); // Reload to get the new ticker with proper ID
        }
      }
      setModalOpen(false);
      setEditing(null);
      setNewText('');
    } catch (error) {
      console.error('Error saving ticker:', error);
      notify("Couldn't save. Check your connection and try again.", 'error');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const action = activeTab === 'breaking' ? deleteBreakingTickerAction : deleteLiveTickerAction;
      const result = await action(id);
      if (result.success) {
        setCurrentTickers(prev => prev.filter(t => t.id !== id));
      }
      setDeleteConfirm(null);
    } catch (error) {
      console.error('Error deleting ticker:', error);
      notify("Couldn't delete. Check your connection and try again.", 'error');
    }
  };

  const toggleActive = async (ticker: Ticker) => {
    try {
      const action = activeTab === 'breaking' ? updateBreakingTickerAction : updateLiveTickerAction;
      const result = await action(ticker.id, ticker.text, !ticker.isActive);
      if (result.success) {
        setCurrentTickers(prev =>
          prev.map(t => t.id === ticker.id ? { ...t, isActive: !t.isActive } : t)
        );
      }
    } catch (error) {
      console.error('Error toggling ticker status:', error);
      notify("Something went wrong. Check your connection and try again.", 'error');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="portal-title">Ticker Management</h1>
          <p className="portal-subtitle">
            Manage breaking news and live ticker content
          </p>
        </div>
        <button onClick={openCreate} className="btn-brand text-sm flex items-center gap-2">
          <Plus className="w-4 h-4" /> Add Ticker
        </button>
      </div>

      {/* Tab Navigation */}
      <div className="flex space-x-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-lg w-fit">
        <button
          onClick={() => setActiveTab('breaking')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'breaking'
              ? 'bg-white dark:bg-gray-700 text-navy dark:text-white shadow-sm'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
          }`}
        >
          <Zap className="w-4 h-4" />
          Breaking Ticker ({breakingTickers.length})
        </button>
        <button
          onClick={() => setActiveTab('live')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'live'
              ? 'bg-white dark:bg-gray-700 text-navy dark:text-white shadow-sm'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
          }`}
        >
          <Radio className="w-4 h-4" />
          Live Ticker ({liveTickers.length})
        </button>
      </div>

      {/* Ticker List */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800">
        {currentTickers.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
              {activeTab === 'breaking' ? (
                <Zap className="w-8 h-8 text-gray-400" />
              ) : (
                <Radio className="w-8 h-8 text-gray-400" />
              )}
            </div>
            <h3 className="font-sora font-bold text-lg text-navy dark:text-white mb-2">
              No {activeTab} tickers yet
            </h3>
            <p className="text-gray-500 dark:text-gray-400 text-sm mb-4">
              Create your first {activeTab} ticker to get started
            </p>
            <button onClick={openCreate} className="btn-brand text-sm">
              Add {activeTab === 'breaking' ? 'Breaking' : 'Live'} Ticker
            </button>
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {currentTickers.map((ticker, index) => (
              <div key={ticker.id} className="p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                <div className="flex items-start gap-4">
                  <div className="flex items-center gap-2 shrink-0">
                    <GripVertical className="w-4 h-4 text-gray-400 cursor-move" />
                    <span className="text-xs font-mono text-gray-400 w-6 text-center">
                      {index + 1}
                    </span>
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-navy dark:text-white font-jakarta leading-relaxed">
                      {ticker.text}
                    </p>
                    <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                      <span>Created {new Date(ticker.createdAt).toLocaleDateString()}</span>
                      <span>•</span>
                      <span>Updated {new Date(ticker.updatedAt).toLocaleDateString()}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => toggleActive(ticker)}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold cursor-pointer transition-colors ${
                        ticker.isActive
                          ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                      }`}
                    >
                      {ticker.isActive ? (
                        <>
                          <Eye className="w-3 h-3" />
                          Active
                        </>
                      ) : (
                        <>
                          <EyeOff className="w-3 h-3" />
                          Inactive
                        </>
                      )}
                    </button>
                    
                    <button
                      onClick={() => openEdit(ticker)}
                      className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                    >
                      <Edit3 className="w-3.5 h-3.5 text-gray-400" />
                    </button>
                    
                    <button
                      onClick={() => setDeleteConfirm(ticker.id)}
                      className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-gray-400 hover:text-red-500" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-lg shadow-2xl border border-gray-200 dark:border-gray-800">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800">
              <h2 className="font-sora font-bold text-lg text-navy dark:text-white">
                {editing ? 'Edit' : 'Add'} {activeTab === 'breaking' ? 'Breaking' : 'Live'} Ticker
              </h2>
              <button
                onClick={() => {
                  setModalOpen(false);
                  setEditing(null);
                  setNewText('');
                }}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
              >
                <X className="w-4 h-4 text-gray-400" />
              </button>
            </div>
            
            <div className="px-6 py-5">
              <div>
                <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-2 block font-jakarta">
                  Ticker Text *
                </label>
                <textarea
                  className="input-field text-sm resize-none"
                  rows={3}
                  value={newText}
                  onChange={(e) => setNewText(e.target.value)}
                  placeholder={`Enter ${activeTab} ticker text...`}
                />
                <p className="text-xs text-gray-400 mt-1">
                  Keep it concise and newsworthy. This will scroll across the ticker.
                </p>
              </div>
            </div>
            
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 dark:border-gray-800">
              <button
                onClick={() => {
                  setModalOpen(false);
                  setEditing(null);
                  setNewText('');
                }}
                className="px-4 py-2 text-sm font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={!newText.trim()}
                className="btn-brand text-sm flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Save className="w-4 h-4" />
                {editing ? 'Update' : 'Create'} Ticker
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-sm shadow-2xl border border-gray-200 dark:border-gray-800 p-6 text-center">
            <Trash2 className="w-10 h-10 text-red-500 mx-auto mb-3" />
            <h3 className="font-sora font-bold text-lg text-navy dark:text-white">Delete Ticker?</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 font-jakarta mt-1">
              This action cannot be undone.
            </p>
            <div className="flex gap-3 mt-5">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 px-4 py-2.5 text-sm font-medium border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                className="flex-1 px-4 py-2.5 text-sm font-medium bg-red-500 hover:bg-red-600 text-white rounded-xl transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}