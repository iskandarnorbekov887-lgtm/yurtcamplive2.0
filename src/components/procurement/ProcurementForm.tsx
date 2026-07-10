'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase, type InventoryItem } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { Search, Trash2, PackagePlus, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────

interface ProcurementFormItem {
  id: string;
  item_id: string;
  item_name: string;
  requested_quantity: number;
  unit: string;
  status: 'linked';
}

interface ProcurementFormProps {
  onSubmit: (items: ProcurementFormItem[]) => void;
  isLoading?: boolean;
}

// ─── Debounce Hook ───────────────────────────────────────────

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

// ─── Component ───────────────────────────────────────────────

export default function ProcurementForm({ onSubmit, isLoading = false }: ProcurementFormProps) {
  const { user } = useAuth();

  // ── State ──
  const [items, setItems] = useState<ProcurementFormItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [quantity, setQuantity] = useState('');
  const [suggestions, setSuggestions] = useState<InventoryItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(0);

  // ── Feedback messages ──
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [requestPending, setRequestPending] = useState(false);

  // ── Refs ──
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const debouncedQuery = useDebouncedValue(searchQuery, 300);

  // ── Click-outside to close dropdown ──
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current && !inputRef.current.contains(e.target as Node)
      ) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── Search inventory_items on debounced query ──
  useEffect(() => {
    if (!debouncedQuery.trim() || selectedItem) {
      setSuggestions([]);
      return;
    }

    const search = async () => {
      setIsSearching(true);
      try {
        const { data, error: searchErr } = await supabase
          .from('inventory_items')
          .select('id, item_name, current_stock, use_unit, buy_unit, conversion_factor, min_threshold, created_at')
          .ilike('item_name', `%${debouncedQuery.trim()}%`)
          .order('item_name')
          .limit(8);

        if (searchErr) throw searchErr;
        setSuggestions(data || []);
        setHighlightIndex(0);
      } catch (err) {
        console.error('Inventory search failed:', err);
        setSuggestions([]);
      } finally {
        setIsSearching(false);
      }
    };
    search();
  }, [debouncedQuery, selectedItem]);

  // ── Computed state ──
  const trimmedQuery = searchQuery.trim();
  const isNewItem = trimmedQuery.length >= 2 && suggestions.length === 0 && !selectedItem && !isSearching;

  // ── Select an existing item from dropdown ──
  const handleSelect = useCallback((item: InventoryItem) => {
    setSelectedItem(item);
    setSearchQuery(item.item_name);
    setIsDropdownOpen(false);
    setSuggestions([]);
    setError('');
  }, []);

  // ── Add linked item to the request list ──
  const addItem = useCallback(() => {
    if (!selectedItem || !quantity) {
      setError('Select a product and enter a quantity');
      return;
    }
    const qty = parseFloat(quantity);
    if (isNaN(qty) || qty <= 0) {
      setError('Quantity must be a positive number');
      return;
    }

    // Prevent duplicates
    if (items.some(i => i.item_id === selectedItem.id)) {
      setError(`${selectedItem.item_name} is already in the list`);
      return;
    }

    const newItem: ProcurementFormItem = {
      id: `temp_${Date.now()}`,
      item_id: selectedItem.id,
      item_name: selectedItem.item_name,
      requested_quantity: qty,
      unit: selectedItem.use_unit,
      status: 'linked',
    };

    setItems(prev => [...prev, newItem]);
    setSelectedItem(null);
    setSearchQuery('');
    setQuantity('');
    setError('');
    setSuccess(`✓ Added ${newItem.item_name}`);
    setTimeout(() => setSuccess(''), 2500);
  }, [selectedItem, quantity, items]);

  // ── Remove item from request list ──
  const removeItem = useCallback((itemId: string) => {
    setItems(prev => prev.filter(i => i.id !== itemId));
  }, []);

  // ── Request new item (calls RPC) ──
  const requestNewItem = useCallback(async () => {
    if (!trimmedQuery || !user?.id) return;

    setRequestPending(true);
    setError('');
    try {
      const { data, error: rpcErr } = await supabase.rpc('request_or_link_item', {
        p_item_name: trimmedQuery,
        p_requested_by: user.id,
      });

      if (rpcErr) throw rpcErr;

      const result = data as { status: string; message?: string; item_id?: string; item_name?: string };

      if (result.status === 'linked') {
        // Surprise — the item actually exists (race condition or typo correction)
        setSuccess(`✓ "${result.item_name}" found in inventory — you can add it now`);
        // Re-run search to populate dropdown
        setSearchQuery(result.item_name || trimmedQuery);
        setSelectedItem(null);
      } else if (result.status === 'requested') {
        setSuccess('✓ Request sent to Manager for approval');
        setSearchQuery('');
      } else if (result.status === 'already_requested') {
        setSuccess(result.message || 'This item was already requested');
        setSearchQuery('');
      } else if (result.status === 'error') {
        setError(result.message || 'Failed to submit request');
      }

      setTimeout(() => setSuccess(''), 4000);
    } catch (err: any) {
      console.error('request_or_link_item failed:', err);
      setError(err?.message || 'Failed to submit item request');
    } finally {
      setRequestPending(false);
    }
  }, [trimmedQuery, user?.id]);

  // ── Submit full procurement request ──
  const handleSubmit = useCallback(() => {
    if (items.length === 0) {
      setError('Add at least one item before submitting');
      return;
    }
    onSubmit(items);
  }, [items, onSubmit]);

  // ── Keyboard navigation for dropdown ──
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!isDropdownOpen || suggestions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIndex(prev => Math.min(prev + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (suggestions[highlightIndex]) {
        handleSelect(suggestions[highlightIndex]);
      }
    } else if (e.key === 'Escape') {
      setIsDropdownOpen(false);
    }
  }, [isDropdownOpen, suggestions, highlightIndex, handleSelect]);

  // ════════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════════

  return (
    <div style={{
      background: '#FFFFFF',
      border: '1px solid #000000',
      padding: '24px',
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
      {/* ── Header ── */}
      <div style={{
        borderBottom: '1px solid #000000',
        paddingBottom: '16px',
        marginBottom: '24px',
      }}>
        <h2 style={{
          fontSize: '20px',
          fontWeight: 800,
          color: '#000000',
          margin: 0,
          letterSpacing: '-0.02em',
        }}>
          New Procurement Request
        </h2>
        <p style={{
          fontSize: '12px',
          color: '#666666',
          margin: '4px 0 0',
          letterSpacing: '0.05em',
          textTransform: 'uppercase' as const,
        }}>
          Search inventory to add items — new items require Manager approval
        </p>
      </div>

      {/* ── Error & Success Messages ── */}
      {error && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '12px 16px',
          background: '#FFF5F5',
          border: '1px solid #E53E3E',
          marginBottom: '16px',
          fontSize: '13px',
          color: '#C53030',
          fontWeight: 600,
        }}>
          <AlertTriangle size={14} />
          {error}
        </div>
      )}
      {success && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '12px 16px',
          background: '#F0FFF4',
          border: '1px solid #228B22',
          marginBottom: '16px',
          fontSize: '13px',
          color: '#228B22',
          fontWeight: 600,
        }}>
          <CheckCircle2 size={14} />
          {success}
        </div>
      )}

      {/* ── Search + Quantity Row ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr auto',
        gap: '16px',
        marginBottom: '16px',
      }}>
        {/* Search Input */}
        <div style={{ position: 'relative' }}>
          <label style={{
            display: 'block',
            fontSize: '10px',
            fontWeight: 800,
            color: '#000000',
            textTransform: 'uppercase' as const,
            letterSpacing: '0.1em',
            marginBottom: '6px',
          }}>
            Product Search
          </label>
          <div style={{ position: 'relative' }}>
            <Search
              size={14}
              style={{
                position: 'absolute',
                left: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: '#999999',
              }}
            />
            <input
              ref={inputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setSelectedItem(null);
                setIsDropdownOpen(true);
                setError('');
              }}
              onFocus={() => {
                if (searchQuery.trim().length >= 1 && !selectedItem) {
                  setIsDropdownOpen(true);
                }
              }}
              onKeyDown={handleKeyDown}
              placeholder="Type to search inventory..."
              autoComplete="off"
              style={{
                width: '100%',
                paddingLeft: '36px',
                paddingRight: '12px',
                paddingTop: '10px',
                paddingBottom: '10px',
                background: '#FFFFFF',
                border: '1px solid #000000',
                fontSize: '14px',
                color: '#000000',
                outline: 'none',
                boxSizing: 'border-box' as const,
              }}
            />
            {isSearching && (
              <Loader2
                size={14}
                style={{
                  position: 'absolute',
                  right: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: '#999',
                  animation: 'spin 1s linear infinite',
                }}
              />
            )}
          </div>

          {/* ── Autocomplete Dropdown ── */}
          {isDropdownOpen && !selectedItem && trimmedQuery.length >= 1 && (
            <div
              ref={dropdownRef}
              style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                marginTop: '4px',
                background: '#FFFFFF',
                border: '1px solid #000000',
                zIndex: 50,
                maxHeight: '260px',
                overflowY: 'auto' as const,
                boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
              }}
            >
              {suggestions.length > 0 ? (
                suggestions.map((item, i) => (
                  <button
                    key={item.id}
                    onClick={() => handleSelect(item)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      width: '100%',
                      padding: '10px 16px',
                      background: i === highlightIndex ? '#F0FFF4' : '#FFFFFF',
                      borderLeft: i === highlightIndex ? '3px solid #228B22' : '3px solid transparent',
                      borderBottom: '1px solid #EEEEEE',
                      cursor: 'pointer',
                      textAlign: 'left' as const,
                      fontSize: '13px',
                      color: '#000000',
                      transition: 'background 0.1s',
                    }}
                    onMouseEnter={() => setHighlightIndex(i)}
                  >
                    <div>
                      <span style={{ fontWeight: 700, color: '#000000' }}>{item.item_name}</span>
                      <span style={{
                        display: 'block',
                        fontSize: '10px',
                        color: '#888888',
                        marginTop: '2px',
                      }}>
                        Stock: <span style={{ fontFamily: 'monospace' }}>{item.current_stock}</span> {item.use_unit}
                      </span>
                    </div>
                    <span style={{
                      fontSize: '9px',
                      fontWeight: 800,
                      textTransform: 'uppercase' as const,
                      letterSpacing: '0.08em',
                      color: '#666666',
                      border: '1px solid #CCCCCC',
                      padding: '2px 8px',
                      background: '#F9F9F9',
                    }}>
                      {item.use_unit}
                    </span>
                  </button>
                ))
              ) : !isSearching && trimmedQuery.length >= 2 ? (
                /* ── No Match — Show "Request New Item" prompt ── */
                <div style={{
                  padding: '20px 16px',
                  textAlign: 'center' as const,
                }}>
                  <AlertTriangle size={20} style={{ color: '#B8860B', margin: '0 auto 8px' }} />
                  <p style={{
                    fontSize: '12px',
                    fontWeight: 700,
                    color: '#000000',
                    margin: '0 0 4px',
                  }}>
                    &quot;{trimmedQuery}&quot; not found in inventory
                  </p>
                  <p style={{
                    fontSize: '11px',
                    color: '#888888',
                    margin: '0 0 12px',
                  }}>
                    You can request the Manager to add this item
                  </p>
                  <button
                    onClick={requestNewItem}
                    disabled={requestPending}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '8px 20px',
                      background: requestPending ? '#D4A017' : '#B8860B',
                      color: '#FFFFFF',
                      border: '1px solid #000000',
                      fontSize: '11px',
                      fontWeight: 800,
                      textTransform: 'uppercase' as const,
                      letterSpacing: '0.1em',
                      cursor: requestPending ? 'wait' : 'pointer',
                      opacity: requestPending ? 0.7 : 1,
                      transition: 'opacity 0.15s',
                    }}
                  >
                    {requestPending ? (
                      <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} />
                    ) : (
                      <PackagePlus size={12} />
                    )}
                    {requestPending ? 'Sending...' : 'Request New Item'}
                  </button>
                </div>
              ) : null}
            </div>
          )}
        </div>

        {/* Quantity Input */}
        <div style={{ minWidth: '140px' }}>
          <label style={{
            display: 'block',
            fontSize: '10px',
            fontWeight: 800,
            color: '#000000',
            textTransform: 'uppercase' as const,
            letterSpacing: '0.1em',
            marginBottom: '6px',
          }}>
            Quantity
          </label>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'stretch' }}>
            <input
              type="number"
              step="0.01"
              min="0"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="0.00"
              disabled={!selectedItem}
              style={{
                width: '90px',
                padding: '10px 12px',
                background: '#FFFFFF',
                border: '1px solid #000000',
                fontSize: '14px',
                fontFamily: 'monospace',
                color: '#000000',
                outline: 'none',
                opacity: selectedItem ? 1 : 0.4,
                boxSizing: 'border-box' as const,
              }}
            />
            {selectedItem && (
              <span style={{
                display: 'flex',
                alignItems: 'center',
                padding: '0 10px',
                background: '#F5F5F5',
                border: '1px solid #000000',
                fontSize: '10px',
                fontWeight: 800,
                textTransform: 'uppercase' as const,
                letterSpacing: '0.08em',
                color: '#333333',
              }}>
                {selectedItem.use_unit}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Add Item Button ── */}
      <div style={{ marginBottom: '24px' }}>
        {isNewItem ? (
          /* When text is typed but not found — show inline "Request New Item" */
          <button
            onClick={requestNewItem}
            disabled={requestPending}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '10px 24px',
              background: requestPending ? '#D4A017' : '#B8860B',
              color: '#FFFFFF',
              border: '1px solid #000000',
              fontSize: '12px',
              fontWeight: 800,
              textTransform: 'uppercase' as const,
              letterSpacing: '0.08em',
              cursor: requestPending ? 'wait' : 'pointer',
              opacity: requestPending ? 0.7 : 1,
              transition: 'opacity 0.15s',
            }}
          >
            {requestPending ? (
              <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
            ) : (
              <PackagePlus size={14} />
            )}
            {requestPending ? 'Sending Request...' : 'Request New Item'}
          </button>
        ) : (
          <button
            onClick={addItem}
            disabled={!selectedItem || !quantity || isLoading}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '10px 24px',
              background: (!selectedItem || !quantity) ? '#E0E0E0' : '#228B22',
              color: (!selectedItem || !quantity) ? '#999999' : '#FFFFFF',
              border: '1px solid #000000',
              fontSize: '12px',
              fontWeight: 800,
              textTransform: 'uppercase' as const,
              letterSpacing: '0.08em',
              cursor: (!selectedItem || !quantity) ? 'not-allowed' : 'pointer',
              transition: 'background 0.15s',
            }}
          >
            + Add Item
          </button>
        )}
      </div>

      {/* ── Items Table ── */}
      {items.length > 0 && (
        <>
          <div style={{
            border: '1px solid #000000',
            marginBottom: '16px',
            overflow: 'hidden',
          }}>
            <table style={{
              width: '100%',
              borderCollapse: 'collapse' as const,
              fontSize: '13px',
            }}>
              <thead>
                <tr style={{
                  borderBottom: '1px solid #000000',
                  background: '#FAFAFA',
                }}>
                  <th style={{
                    padding: '10px 16px',
                    textAlign: 'left' as const,
                    fontSize: '10px',
                    fontWeight: 800,
                    color: '#000000',
                    textTransform: 'uppercase' as const,
                    letterSpacing: '0.1em',
                  }}>
                    Item
                  </th>
                  <th style={{
                    padding: '10px 16px',
                    textAlign: 'center' as const,
                    fontSize: '10px',
                    fontWeight: 800,
                    color: '#000000',
                    textTransform: 'uppercase' as const,
                    letterSpacing: '0.1em',
                  }}>
                    Quantity
                  </th>
                  <th style={{
                    padding: '10px 16px',
                    textAlign: 'right' as const,
                    fontSize: '10px',
                    fontWeight: 800,
                    color: '#000000',
                    textTransform: 'uppercase' as const,
                    letterSpacing: '0.1em',
                  }}>
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr
                    key={item.id}
                    style={{ borderBottom: '1px solid #EEEEEE' }}
                  >
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{ fontWeight: 700, color: '#000000' }}>{item.item_name}</span>
                      <span style={{
                        display: 'block',
                        fontSize: '10px',
                        fontFamily: 'monospace',
                        color: '#999999',
                        marginTop: '2px',
                      }}>
                        ID: {item.item_id.slice(0, 8)}
                      </span>
                    </td>
                    <td style={{
                      padding: '12px 16px',
                      textAlign: 'center' as const,
                    }}>
                      <span style={{
                        fontFamily: 'monospace',
                        fontWeight: 700,
                        color: '#000000',
                      }}>
                        {item.requested_quantity}
                      </span>
                      <span style={{
                        marginLeft: '4px',
                        fontSize: '9px',
                        fontWeight: 800,
                        textTransform: 'uppercase' as const,
                        color: '#888888',
                      }}>
                        {item.unit}
                      </span>
                    </td>
                    <td style={{
                      padding: '12px 16px',
                      textAlign: 'right' as const,
                    }}>
                      <button
                        onClick={() => removeItem(item.id)}
                        style={{
                          padding: '4px',
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: '#999999',
                          transition: 'color 0.15s',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.color = '#E53E3E')}
                        onMouseLeave={(e) => (e.currentTarget.style.color = '#999999')}
                        title="Remove item"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ── Summary ── */}
          <div style={{
            background: '#FAFAFA',
            padding: '12px 16px',
            border: '1px solid #000000',
            marginBottom: '16px',
            fontSize: '13px',
            color: '#000000',
          }}>
            <span style={{ fontWeight: 700 }}>Items to Request:</span>{' '}
            <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{items.length}</span>
          </div>

          {/* ── Submit Button ── */}
          <button
            onClick={handleSubmit}
            disabled={isLoading}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              width: '100%',
              padding: '14px 24px',
              background: isLoading ? '#CCCCCC' : '#228B22',
              color: isLoading ? '#888888' : '#FFFFFF',
              border: '1px solid #000000',
              fontSize: '13px',
              fontWeight: 800,
              textTransform: 'uppercase' as const,
              letterSpacing: '0.08em',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              transition: 'background 0.15s',
            }}
          >
            {isLoading ? (
              <>
                <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                Submitting...
              </>
            ) : (
              '✓ Submit Request'
            )}
          </button>
        </>
      )}

      {/* ── Keyframe for spinner (injected inline) ── */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
