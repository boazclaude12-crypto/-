export interface TradeCalculation {
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  fees: {
    entryFee: number;
    exitFee: number;
    priorityFee: number;
  };
  leverage: number;
  symbol: string;
  exchange?: string;
}

export interface CalculationResult {
  grossPL: number;
  netPL: number;
  roi: number;
  totalFees: number;
}

export interface ExchangeFees {
  name: string;
  makerFee: number;
  takerFee: number;
  networkFee: number;
}

export const SUPPORTED_EXCHANGES: ExchangeFees[] = [
  {
    name: 'Binance',
    makerFee: 0.001,
    takerFee: 0.001,
    networkFee: 0.0005
  },
  {
    name: 'Bybit',
    makerFee: 0.001,
    takerFee: 0.001,
    networkFee: 0.0005
  },
  {
    name: 'Custom',
    makerFee: 0,
    takerFee: 0,
    networkFee: 0.0005
  }
];

export const SUPPORTED_PAIRS = [
  'BTC/USD',
  'ETH/USD',
  'BNB/USD',
  'SOL/USD',
  'XRP/USD',
  'ADA/USD',
  'DOGE/USD',
  'DOT/USD',
  'MATIC/USD',
  'SHIB/USD',
  'AVAX/USD',
  'LTC/USD',
  'UNI/USD',
  'LINK/USD',
  'ATOM/USD',
  'XLM/USD',
  'NEAR/USD',
  'ALGO/USD',
  'FTM/USD',
  'APE/USD'
]; 