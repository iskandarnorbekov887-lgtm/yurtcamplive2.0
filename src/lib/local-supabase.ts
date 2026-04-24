// LocalStorage-based mock Supabase client for offline development
// Switch to real Supabase by replacing this with the real client in supabase.ts

import type { Profile, Yurt, Booking, Finance } from './supabase';

const STORAGE_KEYS = {
  users: 'camp_users',
  profiles: 'camp_profiles',
  yurts: 'camp_yurts',
  bookings: 'camp_bookings',
  expenses: 'camp_expenses',
  camp_finances: 'camp_finances',
  session: 'camp_session',
  service_pricing: 'camp_service_pricing',
  deleted_records: 'camp_deleted_records',
  notifications: 'camp_notifications',
};

// Check if we're on client
const isClient = typeof window !== 'undefined';

// Default credentials for different roles
export const DEFAULT_ACCOUNTS = {
  ceo: { email: 'ceo@camp.com', password: 'ceo123', fullName: 'Camp CEO', role: 'CEO' as const },
  manager: { email: 'manager@camp.com', password: 'manager123', fullName: 'Camp Manager', role: 'Manager' as const },
  cook: { email: 'cook@camp.com', password: 'cook123', fullName: 'Camp Cook', role: 'Cook' as const },
  reserver: { email: 'reserver@camp.com', password: 'reserver123', fullName: 'Camp Reserver', role: 'Reserver' as const },
};

export const DEFAULT_CEO = DEFAULT_ACCOUNTS.ceo;

// Initialize default data
const initDefaultData = () => {
  if (!isClient) return;
  
  const users = JSON.parse(localStorage.getItem(STORAGE_KEYS.users) || '[]');
  const profiles = JSON.parse(localStorage.getItem(STORAGE_KEYS.profiles) || '[]');
  
  // Create all default accounts if they don't exist
  Object.values(DEFAULT_ACCOUNTS).forEach(account => {
    const exists = users.some((u: any) => u.email === account.email);
    
    if (!exists) {
      const id = crypto.randomUUID();
      users.push({
        id,
        email: account.email,
        password: account.password,
        created_at: new Date().toISOString(),
      });
      
      profiles.push({
        id,
        email: account.email,
        role: account.role,
        full_name: account.fullName,
      });
      
      console.log(`✅ Default ${account.role} account created:`, account.email);
    }
  });

  localStorage.setItem(STORAGE_KEYS.users, JSON.stringify(users));
  localStorage.setItem(STORAGE_KEYS.profiles, JSON.stringify(profiles));

  
  // Create default yurts if they don't exist
  const existingYurts = JSON.parse(localStorage.getItem(STORAGE_KEYS.yurts) || '[]');
  if (existingYurts.length === 0) {
    const defaultYurts: Yurt[] = [
      { id: 1, name: 'Yurt #1', status: 'Clean', type: 'Standard', capacity: 4 },
      { id: 2, name: 'Yurt #2', status: 'Clean', type: 'Standard', capacity: 4 },
      { id: 3, name: 'Yurt #3', status: 'Clean', type: 'Standard', capacity: 4 },
      { id: 4, name: 'Yurt #4', status: 'Clean', type: 'Premium', capacity: 2 },
      { id: 5, name: 'Yurt #5', status: 'Maintenance', type: 'Standard', capacity: 4 },
    ];
    localStorage.setItem(STORAGE_KEYS.yurts, JSON.stringify(defaultYurts));
  }

  // No hardcoded example bookings - start with empty bookings
  // Data will only come from the database (or user-created bookings)
  const existingBookings = JSON.parse(localStorage.getItem(STORAGE_KEYS.bookings) || '[]');
  // Deduplicate existing bookings just in case there are ID collisions
  const uniqueBookings = existingBookings.filter((v: any, i: number, a: any[]) => 
    a.findIndex(t => t.id === v.id) === i
  );
  if (uniqueBookings.length !== existingBookings.length) {
    console.log('🧹 Deduplicated bookings in localStorage');
    localStorage.setItem(STORAGE_KEYS.bookings, JSON.stringify(uniqueBookings));
  }

  // Create dummy expenses for the current month if none exist
  const existingExpenses = JSON.parse(localStorage.getItem(STORAGE_KEYS.expenses) || '[]');
  if (existingExpenses.length === 0) {
    const today = new Date();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();
    
    const dummyExpenses: any[] = [
      {
        id: 1,
        category: 'Grocery',
        item_name: 'Weekly Kitchen Supply',
        quantity: 1,
        unit_price: 450.50,
        total_amount: 450.50,
        receipt_url: '',
        created_at: new Date(currentYear, currentMonth, 2).toISOString(),
        created_by: 'manager@camp.com'
      },
      {
        id: 2,
        category: 'Maintenance',
        item_name: 'Solar Panel Repair',
        quantity: 1,
        unit_price: 800.00,
        total_amount: 800.00,
        receipt_url: '',
        created_at: new Date(currentYear, currentMonth, 5).toISOString(),
        created_by: 'manager@camp.com'
      },
      {
        id: 3,
        category: 'Grocery',
        item_name: 'Fresh Vegetables & Meat',
        quantity: 1,
        unit_price: 230.25,
        total_amount: 230.25,
        receipt_url: '',
        created_at: new Date(currentYear, currentMonth, 12).toISOString(),
        created_by: 'manager@camp.com'
      },
      {
        id: 4,
        category: 'Freelance',
        item_name: 'Camp Photographer',
        quantity: 1,
        unit_price: 500.00,
        total_amount: 500.00,
        receipt_url: '',
        created_at: new Date(currentYear, currentMonth, 15).toISOString(),
        created_by: 'manager@camp.com'
      }
    ];
    localStorage.setItem(STORAGE_KEYS.expenses, JSON.stringify(dummyExpenses));
  }
};

// Auth mock
const createAuthClient = () => {
  return {
    getSession: async () => {
      if (!isClient) return { data: { session: null }, error: null };
      const session = localStorage.getItem(STORAGE_KEYS.session);
      return { data: { session: session ? JSON.parse(session) : null }, error: null };
    },
    
    signInWithPassword: async ({ email, password }: { email: string; password: string }) => {
      if (!isClient) return { data: null, error: { message: 'Client-side only' } };
      
      // Ensure default accounts exist
      initDefaultData();
      
      // Force check if default accounts exist, recreate if missing
      const users = JSON.parse(localStorage.getItem(STORAGE_KEYS.users) || '[]');
      const profiles = JSON.parse(localStorage.getItem(STORAGE_KEYS.profiles) || '[]');
      
      Object.values(DEFAULT_ACCOUNTS).forEach(account => {
        const userExists = users.some((u: any) => u.email === account.email);
        if (!userExists) {
          const id = crypto.randomUUID();
          users.push({
            id,
            email: account.email,
            password: account.password,
            created_at: new Date().toISOString(),
          });
          
          const profileExists = profiles.some((p: any) => p.email === account.email);
          if (!profileExists) {
            profiles.push({
              id,
              email: account.email,
              role: account.role,
              full_name: account.fullName,
            });
          }
        }
      });
      
      localStorage.setItem(STORAGE_KEYS.users, JSON.stringify(users));
      localStorage.setItem(STORAGE_KEYS.profiles, JSON.stringify(profiles));
      
      const user = users.find((u: any) => u.email === email && u.password === password);
      
      if (!user) {
        return { data: null, error: { message: 'Invalid credentials' } };
      }
      
      const session = { user: { id: user.id, email: user.email } };
      localStorage.setItem(STORAGE_KEYS.session, JSON.stringify(session));
      
      return { data: { session }, error: null };
    },
    
    signUp: async ({ email, password }: { email: string; password: string }) => {
      if (!isClient) return { data: null, error: { message: 'Client-side only' } };
      const users = JSON.parse(localStorage.getItem(STORAGE_KEYS.users) || '[]');
      
      if (users.find((u: any) => u.email === email)) {
        return { data: null, error: { message: 'User already exists' } };
      }
      
      const newUser = {
        id: crypto.randomUUID(),
        email,
        password,
        created_at: new Date().toISOString(),
      };
      
      users.push(newUser);
      localStorage.setItem(STORAGE_KEYS.users, JSON.stringify(users));
      
      // Create profile
      const profiles = JSON.parse(localStorage.getItem(STORAGE_KEYS.profiles) || '[]');
      profiles.push({
        id: newUser.id,
        email,
        role: 'Manager',
        full_name: '',
      });
      localStorage.setItem(STORAGE_KEYS.profiles, JSON.stringify(profiles));
      
      const session = { user: { id: newUser.id, email } };
      localStorage.setItem(STORAGE_KEYS.session, JSON.stringify(session));
      
      return { data: { user: newUser }, error: null };
    },
    
    signOut: async () => {
      if (!isClient) return { error: null };
      localStorage.removeItem(STORAGE_KEYS.session);
      return { error: null };
    },
    
    onAuthStateChange: (callback: (event: string, session: any) => void) => {
      // Simple mock - just return unsubscribe function
      return { data: { subscription: { unsubscribe: () => {} } } };
    },
  };
};

// Database mock - returns proper query builder for chaining
class QueryBuilder {
  private table: string;
  private filters: ((item: any) => boolean)[] = [];
  private singleMode = false;
  private order: { column: string; ascending: boolean } | null = null;

  constructor(table: string) {
    this.table = table;
  }

  private getData(): any[] {
    if (!isClient) return [];
    return JSON.parse(localStorage.getItem((STORAGE_KEYS as any)[this.table]) || '[]');
  }

  private applyFilters(): any {
    let result = [...this.getData()];
    this.filters.forEach(filter => {
      result = result.filter(filter);
    });
    if (this.order) {
      result.sort((a, b) => {
        if (this.order!.ascending) return a[this.order!.column] > b[this.order!.column] ? 1 : -1;
        return a[this.order!.column] < b[this.order!.column] ? 1 : -1;
      });
    }
    return this.singleMode ? (result[0] || null) : result;
  }

  select(_columns?: string) {
    return {
      eq: (column: string, value: any) => {
        this.filters.push(item => item[column] === value);
        return {
          single: () => {
            this.singleMode = true;
            return { data: this.applyFilters(), error: null };
          },
          order: (col: string, { ascending = true } = {}) => {
            this.order = { column: col, ascending };
            return {
              then: (resolve: any) => resolve({ data: this.applyFilters(), error: null }),
            };
          },
          then: (resolve: any) => resolve({ data: this.applyFilters(), error: null }),
        };
      },
      order: (column: string, { ascending = true } = {}) => {
        this.order = { column, ascending };
        return {
          then: (resolve: any) => resolve({ data: this.applyFilters(), error: null }),
        };
      },
      then: (resolve: any) => resolve({ data: this.applyFilters(), error: null }),
    };
  }

  insert = async (newData: any) => {
    if (!isClient) return { data: newData, error: null };
    const items = JSON.parse(localStorage.getItem((STORAGE_KEYS as any)[this.table]) || '[]');
    const inserted = Array.isArray(newData) ? newData : [newData];
    
    inserted.forEach((item: any) => {
      const newItem = {
        ...item,
        id: item.id || (items.length > 0 ? Math.max(...items.map((i: any) => i.id || 0)) + 1 : 1),
        created_at: item.created_at || new Date().toISOString(),
      };
      items.push(newItem);
    });
    
    localStorage.setItem((STORAGE_KEYS as any)[this.table], JSON.stringify(items));
    console.log(`📝 SAVED to ${this.table}:`, inserted);
    console.log(`📦 Total items in ${this.table}:`, items.length);
    return { data: inserted, error: null };
  };

  update = (updates: any) => {
    return {
      eq: (column: string, value: any) => {
        this.filters.push(item => item[column] === value);
        return {
          then: async (resolve: any) => {
            if (!isClient) return resolve({ data: null, error: null });
            let items = JSON.parse(localStorage.getItem((STORAGE_KEYS as any)[this.table]) || '[]');
            const updatedItems = items.map((item: any) => {
              if (this.filters.every(f => f(item))) {
                return { ...item, ...updates };
              }
              return item;
            });
            localStorage.setItem((STORAGE_KEYS as any)[this.table], JSON.stringify(updatedItems));
            console.log(`🔄 UPDATED ${this.table}:`, updatedItems.filter((item: any) => this.filters.every(f => f(item))));
            this.filters = []; // Reset filters after update
            resolve({ data: null, error: null });
          },
        };
      },
    };
  };

  delete = () => {
    return {
      eq: (column: string, value: any) => {
        this.filters.push(item => item[column] === value);
        return {
          then: async (resolve: any) => {
            if (!isClient) return resolve({ data: null, error: null });
            let items = JSON.parse(localStorage.getItem((STORAGE_KEYS as any)[this.table]) || '[]');
            const filteredItems = items.filter((item: any) => !this.filters.every(f => f(item)));
            localStorage.setItem((STORAGE_KEYS as any)[this.table], JSON.stringify(filteredItems));
            this.filters = []; // Reset filters after delete
            resolve({ data: null, error: null });
          },
        };
      },
    };
  };
}

const createDbClient = () => {
  return {
    from: (table: string) => new QueryBuilder(table),
  };
};

// Storage mock (for receipts)
const createStorageClient = () => {
  return {
    from: (bucket: string) => ({
      upload: async (path: string, file: File) => {
        if (!isClient) return { data: { path }, error: { message: 'Client-side only' } };
        // Convert file to base64 and store
        return new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = () => {
            const key = `storage_${bucket}_${path}`;
            localStorage.setItem(key, reader.result as string);
            resolve({ data: { path }, error: null });
          };
          reader.readAsDataURL(file);
        });
      },
      getPublicUrl: (path: string) => {
        if (!isClient) return { data: { publicUrl: '' } };
        const key = `storage_receipts_${path}`;
        const dataUrl = localStorage.getItem(key);
        return { data: { publicUrl: dataUrl || '' } };
      },
    }),
  };
};

// Main client
export const createLocalClient = () => {
  initDefaultData();
  
  return {
    auth: createAuthClient(),
    from: createDbClient().from,
    storage: createStorageClient(),
  };
};
