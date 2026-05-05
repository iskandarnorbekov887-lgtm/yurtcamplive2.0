'use client';

interface ManagerGroceryProps {
  groceryRequest: any;
  setGroceryRequest: (req: any) => void;
  onMarkPurchased: () => void;
}

export function ManagerGrocery({ groceryRequest, setGroceryRequest, onMarkPurchased }: ManagerGroceryProps) {
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="bg-white rounded-[32px] p-8 shadow-xl border border-slate-100">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h2 className="text-3xl font-black text-slate-900 uppercase tracking-tight">Grocery Purchase Mode</h2>
            <p className="text-slate-500 font-bold">Review and update the list from the Kitchen</p>
          </div>
          {groceryRequest?.status === 'requested' && (
            <span className="bg-amber-100 text-amber-700 px-4 py-1.5 rounded-full text-xs font-black uppercase border border-amber-200">
              New Request
            </span>
          )}
        </div>

        {!groceryRequest || groceryRequest.status === 'received' ? (
          <div className="py-20 text-center text-slate-400">
            <div className="text-5xl mb-4">🛒</div>
            <p className="text-lg font-bold">No active grocery requests</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-3">
              {groceryRequest.items.map((item: any, idx: number) => (
                <div key={idx} className="flex gap-3 items-center p-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <input
                    type="text"
                    value={item.name}
                    onChange={(e) => {
                      const next = { ...groceryRequest };
                      next.items[idx].name = e.target.value;
                      setGroceryRequest(next);
                    }}
                    className="flex-1 px-4 py-2 bg-white border border-slate-200 rounded-xl font-bold text-slate-900"
                  />
                  <input
                    type="text"
                    value={item.qty}
                    onChange={(e) => {
                      const next = { ...groceryRequest };
                      next.items[idx].qty = e.target.value;
                      setGroceryRequest(next);
                    }}
                    className="w-24 px-4 py-2 bg-white border border-slate-200 rounded-xl font-bold text-slate-900 text-center"
                  />
                  <span className="text-xs font-black text-slate-400 w-10 uppercase">{item.unit}</span>
                </div>
              ))}
            </div>

            {groceryRequest.status === 'requested' ? (
              <button
                onClick={onMarkPurchased}
                className="w-full py-5 bg-indigo-600 text-white rounded-[24px] text-sm font-black uppercase tracking-[0.2em] shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all mt-6 active:scale-95"
              >
                Mark as Purchased
              </button>
            ) : (
              <div className="p-6 bg-emerald-50 border border-emerald-100 rounded-2xl text-center">
                <p className="text-emerald-700 font-black uppercase tracking-widest text-xs">
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
