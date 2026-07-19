"use client";

import { useState, ChangeEvent, useEffect } from 'react';
import { TradeCalculation, CalculationResult, SUPPORTED_EXCHANGES, SUPPORTED_PAIRS, ExchangeFees } from './types';
import Link from 'next/link';
import { createClient } from '../../../lib/supabase/client';
import { useRouter } from 'next/navigation';
import { User } from '@supabase/supabase-js';

const PLCalculator = () => {
  const router = useRouter();
  const supabase = createClient();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
    };
    getUser();
  }, [supabase.auth]);

  const [trade, setTrade] = useState<TradeCalculation>({
    entryPrice: 0,
    exitPrice: 0,
    quantity: 0,
    fees: {
      entryFee: 0.001,
      exitFee: 0.001,
      priorityFee: 0.0005
    },
    leverage: 1,
    symbol: 'BTC/USD',
    exchange: 'Binance'
  });

  const calculatePL = (): CalculationResult => {
    const grossPL = (trade.exitPrice - trade.entryPrice) * trade.quantity * (trade.leverage || 1);
    const totalFees = (trade.fees.entryFee + trade.fees.exitFee + trade.fees.priorityFee) * trade.quantity * trade.exitPrice;
    const netPL = grossPL - totalFees;
    const roi = Number(((netPL / (trade.entryPrice * trade.quantity)) * 100).toFixed(2));
    
    return { grossPL, netPL, roi, totalFees };
  };

  const handleInputChange = (field: keyof Omit<TradeCalculation, 'fees' | 'symbol' | 'exchange'>, value: number) => {
    setTrade((prev: TradeCalculation) => ({
      ...prev,
      [field]: value
    }));
  };

  const handleExchangeChange = (exchangeName: string) => {
    const exchange = SUPPORTED_EXCHANGES.find((e: ExchangeFees) => e.name === exchangeName);
    if (exchange) {
      setTrade((prev: TradeCalculation) => ({
        ...prev,
        exchange: exchangeName,
        fees: {
          entryFee: exchange.makerFee,
          exitFee: exchange.takerFee,
          priorityFee: exchange.networkFee
        }
      }));
    }
  };

  return (
    <div className="bg-white rounded-2xl p-8 shadow-xl border border-gray-100">
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-8 gap-6">
        <div className="flex items-center gap-3">
          <Link 
            href={user ? "/dashboard" : "/"} 
            className="bg-gray-100 p-2.5 rounded-lg hover:bg-gray-200 transition-colors mr-2"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </Link>
          <div className="bg-gradient-to-r from-amber-500 to-amber-600 p-2.5 rounded-lg">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4 4a2 2 0 00-2 2v4a2 2 0 002 2V6h10a2 2 0 00-2-2H4zm2 6a2 2 0 012-2h8a2 2 0 012 2v4a2 2 0 01-2 2H8a2 2 0 01-2-2v-4zm6 4a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
            </svg>
          </div>
          <h3 className="text-2xl font-bold text-gray-900">מחשבון רווח/הפסד</h3>
        </div>
        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3 w-full md:w-auto">
          <div className="relative group">
            <select
              className="w-full md:w-[140px] bg-gray-50 border border-gray-200 text-gray-900 text-sm rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-amber-500 focus:border-transparent hover:border-amber-500 transition-colors appearance-none"
              value={trade.exchange}
              onChange={(e: ChangeEvent<HTMLSelectElement>) => handleExchangeChange(e.target.value)}
            >
              {SUPPORTED_EXCHANGES.map((exchange: ExchangeFees) => (
                <option key={exchange.name} value={exchange.name}>
                  {exchange.name}
                </option>
              ))}
            </select>
            <div className="absolute left-3 top-1/2 transform -translate-y-1/2 pointer-events-none">
              <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>
          <div className="relative group">
            <select
              className="w-full md:w-[160px] bg-gray-50 border border-gray-200 text-gray-900 text-sm rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-amber-500 focus:border-transparent hover:border-amber-500 transition-colors appearance-none pl-10"
              value={trade.symbol}
              onChange={(e: ChangeEvent<HTMLSelectElement>) => setTrade((prev: TradeCalculation) => ({ ...prev, symbol: e.target.value }))}
            >
              {SUPPORTED_PAIRS.map((pair: string) => (
                <option key={pair} value={pair}>
                  {pair}
                </option>
              ))}
            </select>
            <div className="absolute left-3 top-1/2 transform -translate-y-1/2">
              <div className="h-5 w-5 rounded-full bg-amber-100 flex items-center justify-center">
                <span className="text-amber-700 text-xs">₿</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        {/* Price Inputs */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="relative">
            <label className="block text-sm font-medium text-gray-700 mb-2">מחיר כניסה</label>
            <div className="relative">
              <input
                type="number"
                className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-gray-900 focus:ring-2 focus:ring-amber-500 focus:border-transparent hover:border-amber-500 transition-colors"
                value={trade.entryPrice || ''}
                onChange={(e: ChangeEvent<HTMLInputElement>) => handleInputChange('entryPrice', parseFloat(e.target.value) || 0)}
                placeholder="0.00"
              />
              <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">$</span>
            </div>
          </div>
          <div className="relative">
            <label className="block text-sm font-medium text-gray-700 mb-2">מחיר יציאה</label>
            <div className="relative">
              <input
                type="number"
                className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-gray-900 focus:ring-2 focus:ring-amber-500 focus:border-transparent hover:border-amber-500 transition-colors"
                value={trade.exitPrice || ''}
                onChange={(e: ChangeEvent<HTMLInputElement>) => handleInputChange('exitPrice', parseFloat(e.target.value) || 0)}
                placeholder="0.00"
              />
              <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">$</span>
            </div>
          </div>
        </div>

        {/* Quantity and Leverage */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">כמות</label>
            <input
              type="number"
              className="w-full px-4 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-gray-900 focus:ring-2 focus:ring-amber-500 focus:border-transparent hover:border-amber-500 transition-colors"
              value={trade.quantity || ''}
              onChange={(e: ChangeEvent<HTMLInputElement>) => handleInputChange('quantity', parseFloat(e.target.value) || 0)}
              placeholder="0.00"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">מינוף</label>
            <div className="relative">
              <input
                type="number"
                className="w-full pr-4 pl-8 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-gray-900 focus:ring-2 focus:ring-amber-500 focus:border-transparent hover:border-amber-500 transition-colors"
                value={trade.leverage || ''}
                onChange={(e: ChangeEvent<HTMLInputElement>) => handleInputChange('leverage', parseFloat(e.target.value) || 1)}
                placeholder="1"
                min="1"
              />
              <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">×</span>
            </div>
          </div>
        </div>

        {/* Fees */}
        <div>
          <h4 className="text-sm font-medium text-gray-700 mb-3">עמלות</h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <div className="relative">
                <input
                  type="number"
                  className="w-full pl-16 pr-4 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-gray-900 focus:ring-2 focus:ring-amber-500 focus:border-transparent hover:border-amber-500 transition-colors"
                  value={trade.fees.entryFee}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setTrade((prev: TradeCalculation) => ({
                    ...prev,
                    fees: { ...prev.fees, entryFee: parseFloat(e.target.value) || 0 }
                  }))}
                  placeholder="עמלת כניסה"
                  step="0.0001"
                />
                <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">%</span>
              </div>
            </div>
            <div>
              <div className="relative">
                <input
                  type="number"
                  className="w-full pl-16 pr-4 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-gray-900 focus:ring-2 focus:ring-amber-500 focus:border-transparent hover:border-amber-500 transition-colors"
                  value={trade.fees.exitFee}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setTrade((prev: TradeCalculation) => ({
                    ...prev,
                    fees: { ...prev.fees, exitFee: parseFloat(e.target.value) || 0 }
                  }))}
                  placeholder="עמלת יציאה"
                  step="0.0001"
                />
                <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">%</span>
              </div>
            </div>
            <div>
              <div className="relative">
                <input
                  type="number"
                  className="w-full pl-16 pr-4 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-gray-900 focus:ring-2 focus:ring-amber-500 focus:border-transparent hover:border-amber-500 transition-colors"
                  value={trade.fees.priorityFee}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setTrade((prev: TradeCalculation) => ({
                    ...prev,
                    fees: { ...prev.fees, priorityFee: parseFloat(e.target.value) || 0 }
                  }))}
                  placeholder="עמלת רשת"
                  step="0.0001"
                />
                <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">%</span>
              </div>
            </div>
          </div>
        </div>

        {/* Results */}
        {trade.entryPrice > 0 && trade.exitPrice > 0 && trade.quantity > 0 && (
          <div className="mt-8 space-y-4 border-t border-gray-100 pt-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-gray-50 rounded-xl p-4">
                <span className="block text-sm text-gray-600 mb-1">רווח/הפסד ברוטו</span>
                <span className={`text-lg font-semibold ${calculatePL().grossPL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  ${Math.abs(calculatePL().grossPL).toFixed(2)}
                  <span className="text-xs ml-1">{calculatePL().grossPL >= 0 ? '+' : '-'}</span>
                </span>
              </div>
              <div className="bg-gray-50 rounded-xl p-4">
                <span className="block text-sm text-gray-600 mb-1">סך עמלות</span>
                <span className="text-lg font-semibold text-gray-900">
                  ${calculatePL().totalFees.toFixed(2)}
                </span>
              </div>
              <div className="bg-gray-50 rounded-xl p-4">
                <span className="block text-sm text-gray-600 mb-1">רווח/הפסד נטו</span>
                <span className={`text-lg font-semibold ${calculatePL().netPL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  ${Math.abs(calculatePL().netPL).toFixed(2)}
                  <span className="text-xs ml-1">{calculatePL().netPL >= 0 ? '+' : '-'}</span>
                </span>
              </div>
              <div className="bg-gray-50 rounded-xl p-4">
                <span className="block text-sm text-gray-600 mb-1">ROI</span>
                <span className={`text-lg font-semibold ${calculatePL().roi >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {Math.abs(calculatePL().roi)}%
                  <span className="text-xs ml-1">{calculatePL().roi >= 0 ? '+' : '-'}</span>
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PLCalculator; 