'use client';

interface ManagerGroceryProps {
  groceryRequest: any;
  setGroceryRequest: (req: any) => void;
  onMarkPurchased: () => void;
}

export function ManagerGrocery({ groceryRequest, setGroceryRequest, onMarkPurchased }: ManagerGroceryProps) {
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="bg-[#1C232E] rounded-[32px] p-8 shadow-xl border border-[#5C4A2E]/30">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h2 className="text-3xl font-black text-[#EDE6D6] uppercase tracking-tight">Grocery Purchase Mode</h2>
            <p className="text-[#9C9384] font-bold">Review and update the list from the Kitchen</p>
          </div>
          {groceryRequest?.status === 'requested' && (
            <span className="bg-[#B8860B]/20 text-[#B8860B] px-4 py-1.5 rounded-full text-xs font-black uppercase border border-[#B8860B]/40">
              New Request
            </span>
          )}
        </div>

        {!groceryRequest || groceryRequest.status === 'received' ? (
          <div className="py-20 text-center text-[#9C9384]">
            <div className="text-5xl mb-4">🛒</div>
            <p className="text-lg font-bold">No active grocery requests</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-3">
              {groceryRequest.items.map((item: any, idx: number) => (
                <div key={idx} className="flex gap-3 items-center p-4 bg-[#0F1419] rounded-2xl border border-[#5C4A2E]/30">
                  <input
                    type="text"
                    value={item.name}
                    onChange={(e) => {
                      const next = { ...groceryRequest };
                      next.items[idx].name = e.target.value;
                      setGroceryRequest(next);
                    }}
                    className="flex-1 px-4 py-2 bg-[#1C232E] border border-[#5C4A2E]/30 rounded-xl font-bold text-[#EDE6D6]"
                  />
                  <input
                    type="text"
                    value={item.qty}
                    onChange={(e) => {
                      const next = { ...groceryRequest };
                      next.items[idx].qty = e.target.value;
                      setGroceryRequest(next);
                    }}
                    className="w-24 px-4 py-2 bg-[#1C232E] border border-[#5C4A2E]/30 rounded-xl font-bold text-[#EDE6D6] text-center"
                  />
                  <span className="text-xs font-black text-[#9C9384] w-10 uppercase">{item.unit}</span>
                </div>
              ))}
            </div>

            {groceryRequest.status === 'requested' ? (
              <button
                onClick={onMarkPurchased}
                className="w-full py-5 bg-[#0B6E4F] text-[#C9A227] rounded-[24px] text-sm font-black uppercase tracking-[0.2em] shadow-xl shadow-[#0B6E4F]/30 hover:bg-[#0B6E4F]/80 transition-all mt-6 active:scale-95"
              >
                Mark as Purchased
              </button>
            ) : (
              <div className="p-6 bg-[#0B6E4F]/10 border border-[#0B6E4F]/30 rounded-2xl text-center">
                <p className="text-[#0B6E4F] font-black uppercase tracking-widest text-xs">
                  Waiting for Kitchen Verification...
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
