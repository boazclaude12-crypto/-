"use client";

import dynamic from 'next/dynamic';
import Header from "../../components/Header";

const PLCalculator = dynamic(() => import('../../components/calculator/PLCalculator'), {
  ssr: false,
  loading: () => (
    <div className="bg-white rounded-xl p-6 shadow-lg animate-pulse">
      <div className="h-8 bg-gray-100 rounded w-1/3 mb-6"></div>
      <div className="space-y-4">
        <div className="h-10 bg-gray-100 rounded"></div>
        <div className="h-10 bg-gray-100 rounded"></div>
        <div className="h-10 bg-gray-100 rounded"></div>
      </div>
    </div>
  )
});

export default function CalculatorPage() {
  return (
    <div className="min-h-screen bg-white">
      <Header />
      
      <main className="container mx-auto px-4 py-8">
        <div className="flex flex-col gap-6">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-gray-900">כלי חישוב</h1>
          </div>
          
          <div className="grid grid-cols-1 gap-6">
            <PLCalculator />
            {/* More calculators can be added here in the future */}
          </div>
        </div>
      </main>
    </div>
  );
} 