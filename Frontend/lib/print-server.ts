/**
 * Print Server API Client
 * Sends print requests to local print server running on client machine
 * Uses same API format as backend (printer, job, receiptData)
 * Falls back to backend API if local server is not available
 */

import { PRINT_API_BASE, PRINT_API_FALLBACK } from '@/config/constants';

// Determine which print server to use based on availability
const getPrintServerUrl = (): string => {
  // Try local print server first
  return PRINT_API_BASE;
};

// Fallback to backend API if local server fails
const getFallbackUrl = (): string => {
  return PRINT_API_FALLBACK;
};

export interface ReceiptItem {
  name: string;
  quantity: number;
  price: number;
  unit?: string;
  unitName?: string;
  /** Return/credit line — amount shown as negative on receipt */
  isCredit?: boolean;
  /** Signed or absolute line total for display (overrides price × qty when set) */
  lineTotal?: number;
}

export interface ReceiptSection {
  title: string;
  items: ReceiptItem[];
}

export interface ReceiptSummaryLine {
  label: string;
  value: string;
  emphasis?: boolean;
}

export interface ReceiptData {
  storeName?: string;
  tagline?: string;
  address?: string;
  strn?: string;
  /** e.g. RETURN RECEIPT, EXCHANGE RECEIPT, SALES RECEIPT */
  documentTitle?: string;
  transactionId: string;
  /** Original sale this return/exchange relates to */
  originalSaleNumber?: string;
  timestamp?: string;
  cashier?: string;
  salesperson?: string;
  customerType?: string;
  customerPhone?: string;
  items: ReceiptItem[];
  /** When set, items are grouped under section headings on print/PDF */
  itemSections?: ReceiptSection[];
  /** When set, replaces generic Subtotal / Grand Total block */
  summaryLines?: ReceiptSummaryLine[];
  subtotal: number;
  discount?: number;
  taxPercent?: number;
  total?: number;
  paymentMethod?: string;
  amountPaid?: number;
  changeAmount?: number;
  promo?: string;
  thankYouMessage?: string;
  footerMessage?: string;
  logoPath?: string;
}

export interface Printer {
  name: string;
  columns?: {
    fontA: number;
    fontB: number;
  };
}

export interface PrintJob {
  copies?: number;
  cut?: boolean;
  openDrawer?: boolean;
}

/**
 * Check if local print server is available
 */
export async function checkPrintServer(): Promise<boolean> {
  try {
    // Create timeout controller for compatibility
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);
    
    const response = await fetch(`${getPrintServerUrl()}/health`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    const data = await response.json();
    return data.status === 'ok';
  } catch (error) {
    console.log('Local print server not available, will use backend API');
    return false;
  }
}

/**
 * Get available printers - tries local server first, then backend
 */
export async function getPrinters(): Promise<{
  success: boolean;
  data?: Array<{ name: string; isDefault?: boolean; status?: string }>;
  error?: string;
}> {
  // Try local print server first
  console.log('🔍 Checking for local print server...');
  const isLocalAvailable = await checkPrintServer();
  
  if (isLocalAvailable) {
    console.log('✅ Local print server available, using:', getPrintServerUrl());
    try {
      const response = await fetch(`${getPrintServerUrl()}/printers`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      const result = await response.json();
      if (result.success) {
        console.log('✅ Got printers from local print server');
        return result;
      }
    } catch (error: any) {
      console.warn('⚠️ Local print server failed, trying backend:', error.message);
    }
  } else {
    console.log('⚠️ Local print server not available, using backend');
  }

  // Fallback to backend API
  try {
    console.log('📡 Using backend API for printers:', `${getFallbackUrl()}/printers`);
    const response = await fetch(`${getFallbackUrl()}/printers`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    if (!response.ok) {
      throw new Error(`Backend API returned ${response.status}`);
    }
    
    const result = await response.json();
    
    // Backend returns { success: true, data: [...] } or { data: [...] }
    if (result.success && result.data) {
      return {
        success: true,
        data: result.data,
      };
    } else if (result.data) {
      return {
        success: true,
        data: result.data,
      };
    } else {
      return {
        success: true,
        data: result,
      };
    }
  } catch (error: any) {
    console.error('Error getting printers from backend:', error);
    return {
      success: false,
      error: error.message || 'Failed to get printers',
    };
  }
}

/**
 * Print receipt - tries local server first, then backend API
 * Uses same API format (printer, job, receiptData)
 */
export async function printReceiptViaServer(
  printer: Printer,
  receiptData: ReceiptData,
  job?: PrintJob
): Promise<{
  success: boolean;
  error?: string;
  message?: string;
}> {
  // Try local print server first
  const isLocalAvailable = await checkPrintServer();
  
  if (isLocalAvailable) {
    try {
      const response = await fetch(`${getPrintServerUrl()}/print-receipt`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          printer,
          job: job ?? { copies: 1, cut: true, openDrawer: false },
          receiptData,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || result.error || 'Print failed');
      }

      console.log('✅ Receipt printed via local print server');
      return {
        success: true,
        message: result.message || 'Receipt printed successfully',
      };
    } catch (error: any) {
      console.warn('Local print server failed, trying backend:', error.message);
      // Continue to fallback below
    }
  }

  // Fallback to backend API
  try {
    console.log('📡 Using backend API for printing');
    const response = await fetch(`${getFallbackUrl()}/print-receipt`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        printer,
        job: job ?? { copies: 1, cut: true, openDrawer: false },
        receiptData,
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message || result.error || 'Print failed');
    }

    console.log('✅ Receipt printed via backend API');
    return {
      success: true,
      message: result.message || 'Receipt printed successfully',
    };
  } catch (error: any) {
    console.error('Print failed (both local and backend):', error);
    return {
      success: false,
      error: error.message || 'Failed to connect to print server',
    };
  }
}

/**
 * Try to print via local server, fallback to browser print
 * (Helper function - use printReceiptViaServer directly for more control)
 */
export async function printReceipt(
  printer: Printer,
  receiptData: ReceiptData,
  job?: PrintJob,
  fallbackToBrowser: () => void = () => {}
): Promise<boolean> {
  // Check if print server is available
  const isAvailable = await checkPrintServer();

  if (isAvailable) {
    // Use local print server (same format as backend)
    const result = await printReceiptViaServer(printer, receiptData, job);
    if (result.success) {
      return true;
    }
    // If print server fails, fallback to browser
    console.warn('Print server failed, falling back to browser print:', result.error);
  } else {
    console.warn('Print server not available, falling back to browser print');
  }

  // Fallback to browser print
  fallbackToBrowser();
  return false;
}

export interface BarcodeLabelItem {
  id: string;
  name: string;
  barcode: string;
  netWeight?: string;
  price?: number;
  packageDateISO?: string;
  expiryDateISO?: string;
}

export interface PrintBarcodeLabelsInput {
  printerName: string;
  items: BarcodeLabelItem[];
  paperSize?: '3x2inch' | '50x30mm' | '60x40mm';
  copies?: number;
  dpi?: 203 | 300;
  humanReadable?: boolean;
}

/**
 * Print barcode labels - uses print server with user-selected printer
 */
export async function printBarcodeLabelsViaServer(
  input: PrintBarcodeLabelsInput
): Promise<{
  success: boolean;
  error?: string;
  message?: string;
}> {
  try {
    const response = await fetch(`${getPrintServerUrl()}/print-barcode-labels`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message || result.error || 'Print failed');
    }

    console.log('✅ Barcode labels printed via print server');
    return {
      success: true,
      message: result.message || 'Barcode labels printed successfully',
    };
  } catch (error: any) {
    console.error('Print barcode labels failed:', error);
    return {
      success: false,
      error: error.message || 'Failed to connect to print server',
    };
  }
}