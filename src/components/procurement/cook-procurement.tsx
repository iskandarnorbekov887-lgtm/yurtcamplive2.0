'use client';

import { useState, useEffect } from 'react';
import useSWR, { mutate } from 'swr';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase, type ProcurementRequest, type InventoryItem, type ProcurementItem } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { ShoppingBag, Search, Plus, Send, ClipboardCheck, AlertCircle, MessageSquare, CheckCircle2 } from 'lucide-react';

const fetchDrafts = async () => {
  const { data } = await supabase
    .from('procurement_requests')
    .select('*, procurement_items(*, inventory(*))')
    .in('status', ['draft', 'sent', 'reviewed'])
    .order('created_at', { ascending: false });
  return data as ProcurementRequest[];
};

export function CookProcurement() {
  const { user } = useAuth();
  const { data: requests = [], error } = useSWR('procurement_drafts', fetchDrafts);
  const [isAdding, setIsAdding] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [inventory, setInventory] = useState<InventoryItem[]>([]);

  useEffect(() => {
    supabase.from('inventory').select('*').then(({ data }) => setInventory(data || []));
  }, []);

  const handleCreateRequest = async () => {
    const { data: newReq } = await supabase
      .from('procurement_requests')
      .insert([{ status: 'draft', total_cost: 0, created_by: user?.id }])
      .select()
      .single();
    mutate('procurement_drafts');
  };

  const addItemToRequest = async (requestId: string, item: InventoryItem) => {
    await supabase.from('procurement_items').insert([{
      request_id: requestId,
      item_id: item.id,
      requested_qty: 1,
      actual_received_qty: 0,
      unit_price: 0,
      item_status: 'pending'
    }]);
    mutate('procurement_drafts');
  };

  const updateRequestedQty = async (itemId: string, qty: number) => {
    await supabase.from('procurement_items').update({ requested_qty: qty }).eq('id', itemId);
    mutate('procurement_drafts');
  };

  const sendToManager = async (requestId: string) => {
    await supabase.from('procurement_requests').update({ status: 'sent' }).eq('id', requestId);
    mutate('procurement_drafts');
  };

  const finalizeVerification = async (requestId: string) => {
    // ── RPC: Atomic Handshake ──
    const { error } = await supabase.rpc('finalize_procurement_request', { 
      p_request_id: requestId,
      p_user_id: user?.id
    });
    
    if (error) {
      alert(`Finalization failed: ${error.message}`);
    } else {
      mutate('procurement_drafts');
    }
  };

  const filteredInventory = inventory.filter(i => 
    i.item_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-noir-950 text-white p-8">
      <div className="max-w-6xl mx-auto space-y-10">
        
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-4xl font-black uppercase tracking-tighter flex items-center gap-4">
              <ShoppingBag className="text-electric-blue" size={32} />
              Supply Handshake
            </h1>
            <p className="text-slate-500 font-bold tracking-[0.3em] text-[10px] uppercase mt-2">Inventory Augmentation Protocol</p>
          </div>
          <button 
            onClick={handleCreateRequest}
            className="px-8 py-4 bg-electric-blue text-white rounded-2xl font-black uppercase tracking-widest hover:bg-blue-600 transition-all shadow-xl shadow-blue-900/20 active:scale-95 flex items-center gap-3"
          >
            <Plus size={20} />
            New Manifest
          </button>
        </div>

        {/* Manifest List */}
        <div className="space-y-8">
          {requests.map((req) => (
            <motion.div 
              key={req.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass-card rounded-[40px] overflow-hidden"
            >
              {/* Header */}
              <div className="px-10 py-8 border-b border-white/5 bg-white/5 flex justify-between items-center">
                <div className="flex items-center gap-6">
                  <div className={`w-3 h-3 rounded-full ${
                    req.status === 'draft' ? 'bg-slate-500' :
                    req.status === 'sent' ? 'bg-electric-blue animate-pulse' :
                    'bg-safety-orange glow-pending'
                  }`} />
                  <div>
                    <h3 className="font-black uppercase tracking-tight text-lg">Manifest #{req.id.slice(0, 8)}</h3>
                    <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest">Status: {req.status}</p>
                  </div>
                </div>
                
                {req.status === 'draft' && (
                  <button 
                    onClick={() => sendToManager(req.id)}
                    className="px-6 py-2.5 bg-electric-blue/10 border border-electric-blue/20 text-electric-blue rounded-xl text-xs font-black uppercase tracking-widest hover:bg-electric-blue hover:text-white transition-all flex items-center gap-2"
                  >
                    <Send size={14} />
                    Transmit to Manager
                  </button>
                )}

                {req.status === 'reviewed' && (
                  <button 
                    onClick={() => finalizeVerification(req.id)}
                    className="px-8 py-3 bg-emerald-500 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-900/20 flex items-center gap-2"
                  >
                    <ClipboardCheck size={14} />
                    Finalize & Inbound
                  </button>
                )}
              </div>

              {/* Items Table */}
              <div className="p-10">
                <table className="w-full">
                  <thead>
                    <tr className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">
                      <th className="text-left pb-6">Item Specification</th>
                      <th className="text-center pb-6">Expected (Order)</th>
                      {req.status === 'reviewed' && <th className="text-center pb-6 text-safety-orange">Inbound (Actual)</th>}
                      <th className="text-right pb-6">Unit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {req.procurement_items?.map((item) => {
                      const isDiscrepancy = req.status === 'reviewed' && item.actual_received_qty !== item.requested_qty;
                      return (
                        <tr key={item.id} className={`group transition-all ${isDiscrepancy ? 'bg-safety-orange/5' : ''}`}>
                          <td className="py-6">
                            <div className="flex items-center gap-4">
                              <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-slate-400 font-black">
                                {item.inventory?.item_name[0]}
                              </div>
                              <div>
                                <p className="font-bold uppercase tracking-tight">{item.inventory?.item_name}</p>
                                {isDiscrepancy && (
                                  <span className="text-[9px] font-black text-safety-orange flex items-center gap-1 mt-1">
                                    <AlertCircle size={10} /> DISCREPANCY DETECTED
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="py-6 text-center">
                            {req.status === 'draft' ? (
                              <input 
                                type="number" 
                                value={item.requested_qty || ''}
                                onChange={(e) => {
                                  const val = e.target.value === '' ? 0 : parseFloat(e.target.value);
                                  updateRequestedQty(item.id, val);
                                }}
                                className="w-24 bg-white/5 border border-white/10 rounded-lg py-1 px-2 text-center font-bold focus:border-electric-blue outline-none"
                              />
                            ) : (
                              <span className="font-black text-lg">{item.requested_qty}</span>
                            )}
                          </td>
                          {req.status === 'reviewed' && (
                            <td className="py-6 text-center">
                              <div className={`inline-block px-4 py-2 rounded-xl font-black text-xl ${
                                isDiscrepancy ? 'text-safety-orange bg-safety-orange/10 border-discrepancy' : 'text-emerald-500'
                              }`}>
                                {item.actual_received_qty}
                              </div>
                            </td>
                          )}
                          <td className="py-6 text-right">
                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest bg-white/5 px-3 py-1.5 rounded-lg">
                              {req.status === 'reviewed' ? item.inventory?.buy_unit : item.inventory?.use_unit}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {req.status === 'draft' && (
                  <div className="mt-8 relative">
                    <div className="flex items-center gap-4 bg-white/5 rounded-2xl px-6 py-4 border border-white/5 focus-within:border-electric-blue transition-all">
                      <Search className="text-slate-500" size={18} />
                      <input 
                        type="text" 
                        placeholder="Search Inventory to augment..."
                        className="bg-transparent w-full font-bold uppercase tracking-tight outline-none placeholder:text-slate-700"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onFocus={() => setIsAdding(true)}
                      />
                    </div>
                    
                    <AnimatePresence>
                      {isAdding && searchQuery && (
                        <motion.div 
                          initial={{ opacity: 0, y: -10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0 }}
                          className="absolute top-full left-0 right-0 mt-2 bg-noir-800 border border-white/10 rounded-2xl shadow-2xl z-50 max-h-60 overflow-y-auto"
                        >
                          {filteredInventory.length > 0 ? (
                            filteredInventory.map(item => (
                              <button
                                key={item.id}
                                onClick={() => {
                                  addItemToRequest(req.id, item);
                                  setSearchQuery('');
                                  setIsAdding(false);
                                }}
                                className="w-full px-6 py-4 text-left hover:bg-electric-blue/10 transition-colors flex justify-between items-center group"
                              >
                                <div>
                                  <span className="font-black uppercase tracking-tight block">{item.item_name}</span>
                                  <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Base Unit: {item.use_unit}</span>
                                </div>
                                <div className="flex items-center gap-2 bg-white/5 px-3 py-1 rounded-lg border border-white/5 group-hover:bg-electric-blue/20 group-hover:border-electric-blue/30 transition-all">
                                  <Plus size={12} className="text-electric-blue" />
                                  <span className="text-[10px] font-black uppercase text-slate-400 group-hover:text-electric-blue">Add {item.use_unit}</span>
                                </div>
                              </button>
                            ))
                          ) : (
                            <div className="px-6 py-8 text-center">
                              <AlertCircle className="mx-auto mb-2 text-safety-orange" size={24} />
                              <p className="text-xs font-black uppercase tracking-widest text-slate-500">No matching resource found</p>
                            </div>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
