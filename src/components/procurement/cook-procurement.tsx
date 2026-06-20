'use client';

import { useState, useEffect } from 'react';
import useSWR, { mutate } from 'swr';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase, type ProcurementRequest, type InventoryItem, type ProcurementItem } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { ShoppingBag, Search, Plus, Send, ClipboardCheck, AlertCircle, MessageSquare, CheckCircle2, Truck, Info, Zap } from 'lucide-react';

const fetchDrafts = async () => {
  const { data } = await supabase
    .from('procurement_requests')
    .select('*, procurement_items(*, inventory:inventory_items(*))')
    .in('status', ['draft', 'sent', 'reviewed', 'finalized'])
    .order('created_at', { ascending: false });
  return (data || []) as ProcurementRequest[];
};

export function CookProcurement() {
  const { user } = useAuth();
  const { data: requests = [], error } = useSWR('procurement_drafts', fetchDrafts);
  const [isAdding, setIsAdding] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [inventory, setInventory] = useState<InventoryItem[]>([]);

  useEffect(() => {
    supabase.from('inventory_items').select('*').then(({ data }) => setInventory(data || []));
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

  const filteredInventory = (inventory || []).filter(i => 
    i.item_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-[#0F1419] text-[#EDE6D6] p-8 font-sans">
      <div className="max-w-6xl mx-auto space-y-12">
        
        {/* Header */}
        <div className="flex justify-between items-end border-b-2 border-[#5C4A2E]/30 pb-8">
          <div>
            <h1 className="text-4xl font-black uppercase tracking-tighter flex items-center gap-4 text-[#EDE6D6]">
              <ShoppingBag className="text-[#EDE6D6]" size={32} />
              Supply Handshake
            </h1>
            <p className="text-[#9C9384] font-black tracking-[0.3em] text-[10px] uppercase mt-2">Inventory Augmentation Interface</p>
          </div>
          <button 
            onClick={handleCreateRequest}
            className="px-8 py-4 bg-[#0B6E4F] text-[#C9A227] rounded-none font-black uppercase tracking-[0.2em] text-xs hover:bg-[#0B6E4F]/80 transition-all border border-[#0B6E4F]/40 shadow-[4px_4px_0px_0px_rgba(92,74,46,0.3)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none flex items-center gap-3"
          >
            <Plus size={20} />
            New Manifest
          </button>
        </div>

        {/* Manifest List */}
        <div className="space-y-12">
          {(requests || []).map((req) => (
            <motion.div 
              key={req.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-[#1C232E] border border-[#5C4A2E]/30 rounded-none overflow-hidden shadow-[8px_8px_0px_0px_rgba(92,74,46,0.3)]"
            >
              {/* Header */}
              <div className="px-8 py-6 border-b border-[#5C4A2E]/30 bg-[#1C232E]/50 flex justify-between items-center">
                <div className="flex items-center gap-8">
                  <div className={`w-4 h-4 border border-[#5C4A2E]/30 ${
                    req.status === 'draft' ? 'bg-[#9C9384]' :
                    req.status === 'sent' ? 'bg-[#C9A227] animate-pulse' :
                    req.status === 'finalized' ? 'bg-[#0B6E4F]' :
                    'bg-[#EDE6D6]'
                  }`} />
                  <div>
                    <h3 className="font-black text-[#EDE6D6] text-sm uppercase tracking-tight">Manifest #{req.id.slice(0, 8)}</h3>
                    <p className="text-[#9C9384] text-[10px] font-black uppercase tracking-widest mt-0.5 font-mono">STATUS: {req.status}</p>
                  </div>
                </div>
                
                <div className="flex items-center gap-4">
                  {req.status === 'draft' && (
                    <button 
                      onClick={() => sendToManager(req.id)}
                      className="px-6 py-2.5 bg-[#0B6E4F] text-[#C9A227] text-[10px] font-black uppercase tracking-widest hover:bg-[#0B6E4F]/80 transition-all flex items-center gap-2 border border-[#0B6E4F]/40"
                    >
                      <Send size={14} />
                      Transmit to Manager
                    </button>
                  )}

                  {req.status === 'reviewed' && (
                    <button 
                      onClick={() => finalizeVerification(req.id)}
                      className="px-6 py-2.5 bg-[#0B6E4F] text-[#C9A227] text-[10px] font-black uppercase tracking-widest hover:bg-[#0B6E4F]/80 transition-all shadow-[2px_2px_0px_0px_rgba(92,74,46,0.3)] flex items-center gap-2 border border-[#0B6E4F]/40"
                    >
                      <ClipboardCheck size={14} />
                      Finalize & Inbound
                    </button>
                  )}

                  {req.status === 'finalized' && (
                    <div className="bg-[#0B6E4F]/10 border border-[#5C4A2E]/30 px-6 py-2 flex flex-col items-end">
                       <p className="text-[10px] font-black text-[#EDE6D6] uppercase">Finalized Spent</p>
                       <p className="text-lg font-mono font-black text-[#EDE6D6]">{(req.total_spent_uzs || 0).toLocaleString()} UZS</p>
                       {req.currency !== 'UZS' && (
                         <p className="text-[8px] font-mono font-black text-[#0B6E4F] uppercase">
                           Original: {req.total_cost?.toLocaleString()} {req.currency} @ {req.exchange_rate?.toLocaleString()}
                         </p>
                       )}
                    </div>
                  )}
                </div>
              </div>

              {/* Items Table */}
              <div className="p-8">
                <table className="w-full">
                  <thead>
                    <tr className="text-[10px] font-black text-[#9C9384] uppercase tracking-widest border-b border-[#5C4A2E]/30 pb-4">
                      <th className="text-left pb-6">Specification</th>
                      <th className="text-center pb-6">Target Qty</th>
                      {req.status === 'reviewed' && <th className="text-center pb-6 text-[#EDE6D6]">Inbound Act.</th>}
                      <th className="text-right pb-6">Unit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#5C4A2E]/30">
                    {(req.procurement_items || []).map((item) => {
                      const isDiscrepancy = req.status === 'reviewed' && item.actual_received_qty !== item.requested_qty;
                      return (
                        <tr key={item.id} className={`group transition-all ${isDiscrepancy ? 'bg-[#C9A227]/10' : ''}`}>
                          <td className="py-6">
                            <div className="flex items-center gap-6">
                              <div className="w-10 h-10 border border-[#5C4A2E]/30 flex items-center justify-center text-[#EDE6D6] font-black text-sm bg-[#1C232E] shadow-[2px_2px_0px_0px_rgba(92,74,46,0.3)]">
                                {item.inventory?.item_name?.[0] || '?'}
                              </div>
                              <div>
                                <p className="font-black uppercase tracking-tight text-[#EDE6D6] text-sm">{item.inventory?.item_name || 'NULL_SPEC'}</p>
                                {isDiscrepancy && (
                                  <span className="text-[9px] font-black text-[#C9A227] flex items-center gap-1 mt-1">
                                    <AlertCircle size={10} /> VARIANCE DETECTED
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
                                className="w-24 bg-[#1C232E] border border-[#5C4A2E]/30 py-2 px-3 text-center font-mono font-black text-[#EDE6D6] outline-none focus:bg-[#2A1518]"
                              />
                            ) : (
                               <span className="font-mono text-base font-black text-[#EDE6D6]">{item.requested_qty}</span>
                            )}
                          </td>
                          {req.status === 'reviewed' && (
                            <td className="py-6 text-center">
                              <div className={`inline-block px-4 py-1 border border-[#5C4A2E]/30 font-mono text-xl font-black ${
                                isDiscrepancy ? 'bg-[#C9A227] text-[#1C232E]' : 'bg-[#0B6E4F] text-[#C9A227]'
                              }`}>
                                {item.actual_received_qty}
                              </div>
                            </td>
                          )}
                          <td className="py-6 text-right">
                            <span className="text-[9px] font-black text-[#EDE6D6] uppercase tracking-widest border border-[#5C4A2E]/30 px-3 py-1 bg-[#1C232E]">
                              {req.status === 'reviewed' ? item.inventory?.buy_unit : item.inventory?.use_unit}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {req.status === 'draft' && (
                  <div className="mt-10 relative">
                    <div className="flex items-center gap-4 bg-[#1C232E] px-6 py-4 border border-[#5C4A2E]/30 focus-within:bg-[#2A1518] transition-all shadow-[4px_4px_0px_0px_rgba(92,74,46,0.3)]">
                      <Search className="text-[#EDE6D6]" size={18} />
                      <input 
                        type="text" 
                        placeholder="SEARCH INVENTORY TO AUGMENT..."
                        className="bg-transparent w-full font-black text-xs uppercase tracking-widest outline-none placeholder:text-[#9C9384] text-[#EDE6D6]"
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
                          className="absolute top-full left-0 right-0 mt-4 bg-[#1C232E] border border-[#5C4A2E]/30 shadow-[8px_8px_0px_0px_rgba(92,74,46,0.3)] z-50 max-h-64 overflow-y-auto"
                        >
                          {(filteredInventory || []).length > 0 ? (
                            filteredInventory.map(item => (
                              <button
                                key={item.id}
                                onClick={() => {
                                  addItemToRequest(req.id, item);
                                  setSearchQuery('');
                                  setIsAdding(false);
                                }}
                                className="w-full px-6 py-4 text-left hover:bg-[#0B6E4F] hover:text-[#C9A227] transition-colors flex justify-between items-center group border-b border-[#5C4A2E]/30 last:border-0"
                              >
                                <div>
                                  <span className="font-black text-sm text-[#EDE6D6] block uppercase tracking-tight group-hover:text-[#C9A227]">{item.item_name}</span>
                                  <span className="text-[9px] font-black text-[#9C9384] uppercase tracking-[0.2em] group-hover:text-[#C9A227]/80">BASE UNIT: {item.use_unit}</span>
                                </div>
                                <div className="flex items-center gap-2 border border-[#5C4A2E]/30 px-3 py-1 bg-[#1C232E] group-hover:bg-[#0B6E4F] transition-all">
                                  <Plus size={14} className="text-[#EDE6D6] group-hover:text-[#C9A227]" />
                                  <span className="text-[9px] font-black text-[#EDE6D6] group-hover:text-[#C9A227] uppercase tracking-widest">ADD</span>
                                </div>
                              </button>
                            ))
                          ) : (
                            <div className="px-6 py-12 text-center">
                              <AlertCircle className="mx-auto mb-4 text-[#EDE6D6]" size={32} />
                              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#9C9384]">Resource Not Found</p>
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
        
        {/* Footnote on Fiscal Handshake */}
        <div className="bg-zinc-50 border border-black p-6 flex items-start gap-4">
           <Zap className="text-black mt-1" size={18} />
           <div>
              <p className="text-[10px] font-black text-black uppercase tracking-widest mb-1">Fiscal Handshake Logic</p>
              <p className="text-[10px] font-medium text-slate-500 uppercase tracking-tighter leading-relaxed">
                All supply requests are converted to UZS upon finalization. 
                Unit valuation is calculated based on current market exchange rates and distributed across the inbound manifest.
              </p>
           </div>
        </div>
      </div>
    </div>
  );
}
