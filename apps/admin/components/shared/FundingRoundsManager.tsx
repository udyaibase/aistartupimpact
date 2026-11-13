'use client';

import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';

/**
 * A round is saved in the currency it was typed in. The other amount is only a provisional figure here: the
 * database replaces it with a conversion at the exchange rate on the announcement date (trigger funding_round_fill_fx).
 */
const PROVISIONAL_USD_INR = 94;

const ROUND_TYPES = [
  'Pre-Seed', 'Angle', 'Seed', 'Pre-Series A', 'Series A',
  'Pre-Series B', 'Series B', 'Pre-Series C', 'Series C', 'Pre-Series D', 'Series D',
  'Series E', 'Series F', 'Series G', 'Series I', 'Series J',
  'Growth', 'Bridge', 'Debt', 'Grant', 'Internal Funding',
  'IPO', 'Public',
];

const AMOUNT_UNITS = [
  { value: 'M_USD', label: 'M ($)', currency: 'USD', size: 1_000_000 },
  { value: 'K_USD', label: 'K ($)', currency: 'USD', size: 1_000 },
  { value: 'CR_INR', label: 'Cr (₹)', currency: 'INR', size: 10_000_000 },
  { value: 'L_INR', label: 'L (₹)', currency: 'INR', size: 100_000 },
] as const;

export interface FundingRound {
  id?: string;
  roundType: string;
  amountValue: string;
  amountUnit: string;
  announcedAt: string;
  leadInvestors: string;
  allInvestors: string;
}

export interface FundingRoundForSave {
  roundType: string;
  amountUsd: number; // in cents
  amountInr: number; // in paise
  /** The amount the database calculates (the one not typed): 'INR' when dollars were typed, 'USD' when rupees. */
  fxDerived: 'INR' | 'USD';
  announcedAt: string;
  leadInvestors: string[];
  allInvestors: string[];
}

interface FundingRoundsManagerProps {
  rounds: FundingRound[];
  onChange: (rounds: FundingRound[]) => void;
  maxRounds?: number;
}

export function convertToSaveFormat(rounds: FundingRound[]): FundingRoundForSave[] {
  return rounds
    .filter(r => r.roundType && r.amountValue && r.announcedAt)
    .map(r => {
      const unit = AMOUNT_UNITS.find(u => u.value === r.amountUnit) || AMOUNT_UNITS[0];
      const amount = parseFloat(r.amountValue) * unit.size;
      const typedUsd = unit.currency === 'USD';
      const usd = typedUsd ? amount : amount / PROVISIONAL_USD_INR;
      const inr = typedUsd ? amount * PROVISIONAL_USD_INR : amount;

      return {
        roundType: r.roundType,
        amountUsd: Math.round(usd * 100),
        amountInr: Math.round(inr * 100),
        fxDerived: typedUsd ? 'INR' as const : 'USD' as const,
        announcedAt: r.announcedAt,
        leadInvestors: (r.leadInvestors || '').split(',').map(s => s.trim()).filter(Boolean),
        allInvestors: (r.allInvestors || '').split(',').map(s => s.trim()).filter(Boolean),
      };
    });
}

// Convert from DB format back to display format
export function convertFromDbFormat(dbRounds: any[]): FundingRound[] {
  return dbRounds.map(r => {
    let amountValue = '';
    let amountUnit: string = 'M_USD';
    // Shown in the currency it was typed in: rupees when the dollar amount was the calculated one.
    const amountInrRaw = Number(r.amountInr || 0) / 100;
    const amountUsdRaw = Number(r.amountUsd || 0) / 100;
    if (r.fxDerived === 'USD' && amountInrRaw > 0) {
      const crores = amountInrRaw >= 10_000_000;
      amountValue = String(Number((amountInrRaw / (crores ? 10_000_000 : 100_000)).toFixed(4)));
      amountUnit = crores ? 'CR_INR' : 'L_INR';
    } else if (amountUsdRaw >= 1_000_000) {
      amountValue = (amountUsdRaw / 1_000_000).toString();
      amountUnit = 'M_USD';
    } else if (amountUsdRaw >= 1_000) {
      amountValue = (amountUsdRaw / 1_000).toString();
      amountUnit = 'K_USD';
    } else {
      amountValue = amountUsdRaw.toString();
      amountUnit = 'K_USD';
    }

    return {
      id: r.id,
      roundType: r.roundType || '',
      amountValue,
      amountUnit,
      announcedAt: r.announcedAt ? new Date(r.announcedAt).toISOString().split('T')[0] : '',
      leadInvestors: Array.isArray(r.leadInvestors) ? r.leadInvestors.join(', ') : '',
      allInvestors: Array.isArray(r.allInvestors) ? r.allInvestors.join(', ') : '',
    };
  });
}

export default function FundingRoundsManager({ rounds, onChange, maxRounds = 10 }: FundingRoundsManagerProps) {
  const addRound = () => {
    if (rounds.length >= maxRounds) return;
    onChange([...rounds, {
      roundType: 'Seed',
      amountValue: '',
      amountUnit: 'M_USD',
      announcedAt: new Date().toISOString().split('T')[0],
      leadInvestors: '',
      allInvestors: '',
    }]);
  };

  const removeRound = (index: number) => {
    onChange(rounds.filter((_, i) => i !== index));
  };

  const updateRound = (index: number, field: keyof FundingRound, value: string) => {
    const updated = [...rounds];
    updated[index] = { ...updated[index], [field]: value };
    onChange(updated);
  };

  // The other currency is filled in by the database at the rate on the announcement date (not a fixed rate).
  const getPreview = (round: FundingRound) => {
    if (!round.amountValue || isNaN(parseFloat(round.amountValue))) return '';
    const unit = AMOUNT_UNITS.find(u => u.value === round.amountUnit) || AMOUNT_UNITS[0];
    return unit.currency === 'USD' ? '₹ at that day’s rate' : '$ at that day’s rate';
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-gray-900 dark:text-white font-sora">Funding Rounds</h3>
        {rounds.length < maxRounds && (
          <button
            type="button"
            onClick={addRound}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-brand bg-brand/10 hover:bg-brand/20 rounded-lg transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Round
          </button>
        )}
      </div>

      {rounds.length === 0 && (
        <p className="text-xs text-gray-400 font-jakarta">No funding rounds added yet. Click &quot;Add Round&quot; to add one.</p>
      )}

      {rounds.map((round, index) => (
        <div key={index} className="border border-gray-200 dark:border-gray-700 rounded-xl p-4 space-y-3 relative">
          <button
            type="button"
            onClick={() => removeRound(index)}
            className="absolute top-3 right-3 p-1 text-gray-400 hover:text-red-500 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>

          <div className="grid grid-cols-2 gap-3">
            {/* Round Type */}
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1">Round Type</label>
              <select
                value={round.roundType}
                onChange={(e) => updateRound(index, 'roundType', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand focus:border-transparent"
              >
                {ROUND_TYPES.map(rt => <option key={rt} value={rt}>{rt}</option>)}
              </select>
            </div>

            {/* Date */}
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1">Announced Date</label>
              <input
                type="date"
                value={round.announcedAt}
                onChange={(e) => updateRound(index, 'announcedAt', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand focus:border-transparent"
              />
            </div>
          </div>

          {/* Amount with unit selector */}
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1">Amount</label>
            <div className="flex gap-2">
              <input
                type="number"
                value={round.amountValue}
                onChange={(e) => updateRound(index, 'amountValue', e.target.value)}
                placeholder="e.g. 45"
                step="any"
                className="flex-1 px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand focus:border-transparent"
              />
              <select
                value={round.amountUnit}
                onChange={(e) => updateRound(index, 'amountUnit', e.target.value)}
                className="w-24 px-2 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand focus:border-transparent"
              >
                {AMOUNT_UNITS.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
              </select>
              {getPreview(round) && (
                <span className="flex items-center text-xs text-emerald-600 dark:text-emerald-400 font-semibold whitespace-nowrap">
                  {getPreview(round)}
                </span>
              )}
            </div>
          </div>

          {/* Investors */}
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1">Lead Investors <span className="font-normal">(comma-separated)</span></label>
            <input
              type="text"
              value={round.leadInvestors}
              onChange={(e) => updateRound(index, 'leadInvestors', e.target.value)}
              placeholder="e.g. Sequoia, Accel"
              className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1">All Investors <span className="font-normal">(optional, comma-separated)</span></label>
            <input
              type="text"
              value={round.allInvestors}
              onChange={(e) => updateRound(index, 'allInvestors', e.target.value)}
              placeholder="e.g. Sequoia, Accel, Tiger Global"
              className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand focus:border-transparent"
            />
          </div>
        </div>
      ))}
    </div>
  );
}
