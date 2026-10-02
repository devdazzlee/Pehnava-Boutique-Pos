/**
 * Offline Sync Manager
 * Handles synchronization of offline data when connection is restored
 */

import { offlineDB } from './offline-db';
import apiClient from './apiClient';
import { collectPaginatedData } from './paginated-fetch';

export interface SyncStatus {
  isOnline: boolean;
  isSyncing: boolean;
  lastSync: number;
  pendingCount: number;
  failedCount: number;
}

class OfflineSyncManager {
  private syncInterval: NodeJS.Timeout | null = null;
  private listeners: ((status: SyncStatus) => void)[] = [];
  private status: SyncStatus = {
    isOnline: typeof window !== 'undefined' ? navigator.onLine : true,
    isSyncing: false,
    lastSync: 0,
    pendingCount: 0,
    failedCount: 0
  };

  constructor() {
    if (typeof window !== 'undefined') {
      // Listen for online/offline events
      window.addEventListener('online', () => this.handleOnline());
      window.addEventListener('offline', () => this.handleOffline());
      
      // Check online status periodically
      this.startPeriodicCheck();
    }
  }

  private handleOnline() {
    console.log('🌐 Connection restored - starting sync...');
    this.status.isOnline = true;
    this.notifyListeners();
    this.syncAll();
  }

  private handleOffline() {
    console.log('📡 Connection lost - switching to offline mode');
    this.status.isOnline = false;
    this.notifyListeners();
  }

  private startPeriodicCheck() {
    // Check every 30 seconds
    this.syncInterval = setInterval(() => {
      if (this.status.isOnline && !this.status.isSyncing) {
        this.syncAll();
      }
    }, 30000);
  }

  // Sync all pending data
  async syncAll() {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    if (this.status.isSyncing || !this.status.isOnline || !token) {
      return;
    }

    this.status.isSyncing = true;
    this.notifyListeners();

    try {
      // 1. Sync pending requests
      await this.syncPendingRequests();
      
      // 2. Sync unsynced sales
      await this.syncSales();
      
      // 3. Pull fresh data from server
      await this.pullFreshData();
      
      this.status.lastSync = Date.now();
      this.status.pendingCount = 0;
      this.status.failedCount = 0;
      
      console.log('✅ Sync completed successfully');
    } catch (error) {
      console.error('❌ Sync failed:', error);
      this.status.failedCount++;
    } finally {
      this.status.isSyncing = false;
      this.notifyListeners();
    }
  }

  // Sync pending API requests
  private async syncPendingRequests() {
    const pending = await offlineDB.getPendingRequests();
    console.log(`📤 Syncing ${pending.length} pending requests...`);

    for (const request of pending) {
      try {
        // Skip if too many retries
        if (request.retries > 5) {
          console.warn(`⚠️ Skipping request after ${request.retries} retries:`, request.url);
          await offlineDB.removePendingRequest(request.id);
          continue;
        }

        const token = localStorage.getItem('token');
        const authHeader = token ? { 'Authorization': `Bearer ${token}` } : {};

        // Make the request
        const response = await fetch(request.url, {
          method: request.method,
          headers: {
            'Content-Type': 'application/json',
            ...authHeader,
            ...request.headers
          },
          body: request.body ? JSON.stringify(request.body) : undefined
        });

        if (response.ok) {
          console.log('✅ Synced request:', request.url);
          await offlineDB.removePendingRequest(request.id);
        } else {
          console.warn('⚠️ Request failed:', response.status, request.url);
          await offlineDB.incrementRetries(request.id);
        }
      } catch (error) {
        console.error('❌ Failed to sync request:', error);
        await offlineDB.incrementRetries(request.id);
      }
    }
  }

  // Sync unsynced sales
  private async syncSales() {
    const unsyncedSales = await offlineDB.getUnsyncedSales();
    console.log(`📤 Syncing ${unsyncedSales.length} unsynced sales...`);

    for (const sale of unsyncedSales) {
      try {
        // Prepare sale payload for API
        const salePayload = {
          items: sale.products.map((item: any) => ({
            productId: item.productId || item.id,
            quantity: item.quantity,
            price: item.price
          })),
          paymentMethod: sale.payment?.method || 'CASH',
          branchId: sale.branchId,
          customerId: sale.customer?.id,
          salespersonId: (sale as any).salespersonId || undefined,
        };
        
        // Post sale to server
        const response = await apiClient.post('/sale', salePayload);
        
        if (response?.data?.data) {
          console.log('✅ Synced sale:', sale.id);
          await offlineDB.markSaleSynced(sale.id);
        }
      } catch (error) {
        console.error('❌ Failed to sync sale:', error);
        // Don't mark as synced if it failed
      }
    }
  }

  // Pull fresh data from server
  private async pullFreshData() {
    console.log('📥 Pulling fresh data from server...');

    try {
      const productsArray = await collectPaginatedData('/products', {}, { limit: 100, maxPages: 50 });
      if (productsArray.length > 0) {
        await offlineDB.saveProducts(productsArray);
        console.log(`✅ Updated ${productsArray.length} products`);
      } else {
        console.warn('No products array found in response');
      }

      const customersArray = await collectPaginatedData('/customer', {}, { limit: 100, maxPages: 50 });
      if (customersArray.length > 0) {
        await offlineDB.saveCustomers(customersArray);
        console.log(`✅ Updated ${customersArray.length} customers`);
      } else {
        console.warn('No customers array found in response');
      }

      await offlineDB.clearExpiredCache();
    } catch (error) {
      console.error('❌ Failed to pull fresh data:', error);
    }
  }

  // Status management
  subscribe(listener: (status: SyncStatus) => void) {
    this.listeners.push(listener);
    listener(this.status); // Immediately call with current status
    
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private notifyListeners() {
    this.listeners.forEach(listener => listener({ ...this.status }));
  }

  getStatus(): SyncStatus {
    return { ...this.status };
  }

  // Manual sync trigger
  async triggerSync() {
    if (this.status.isOnline) {
      await this.syncAll();
    } else {
      console.warn('⚠️ Cannot sync - no internet connection');
    }
  }

  // Check if we can make API requests
  canMakeRequest(): boolean {
    return this.status.isOnline;
  }

  // Cleanup
  destroy() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', () => this.handleOnline());
      window.removeEventListener('offline', () => this.handleOffline());
    }
  }
}

// Create singleton instance
export const syncManager = new OfflineSyncManager();

export default syncManager;

