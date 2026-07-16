// Single Source of Truth for receipt line item calculations
// This function is the ONLY place where meal/accommodation/service prices are calculated from raw snapshot data

export interface ReceiptLineItem {
  label: string;
  amount: number;
  isPrepaid: boolean;
}

export interface ReceiptLineItemsResult {
  lineItems: ReceiptLineItem[];
  total: number;
}

export function buildReceiptLineItems(
  snapshot: any,
  pricingConfig: any,
  actualTotal?: number,
  receiptId?: string
): ReceiptLineItemsResult {
  const lineItems: ReceiptLineItem[] = [];
  const items = snapshot.items || {};

  // 1. Accommodation
  if (items.accommodation !== undefined && items.accommodation > 0) {
    lineItems.push({
      label: 'Accommodation',
      amount: items.isPrepaid ? 0 : items.accommodation,
      isPrepaid: items.isPrepaid || false
    });
  }

  // 2. Meals - prefer stored charged amounts, fall back to count × pricing
  if (items.meals) {
    const meals = items.meals;
    
    // Lunch
    if (meals.lunch > 0) {
      const lunchAmount = meals.lunchCharged !== undefined 
        ? meals.lunchCharged 
        : meals.lunch * (pricingConfig?.lunch_price || 10);
      lineItems.push({
        label: `Lunch x${meals.lunch}`,
        amount: lunchAmount,
        isPrepaid: false
      });
    }

    // Dinner
    if (meals.dinner > 0) {
      const dinnerAmount = meals.dinnerCharged !== undefined 
        ? meals.dinnerCharged 
        : meals.dinner * (pricingConfig?.dinner_price || 10);
      lineItems.push({
        label: `Dinner x${meals.dinner}`,
        amount: dinnerAmount,
        isPrepaid: false
      });
    }
  }

  // 3. Services
  if (items.services) {
    Object.entries(items.services).forEach(([name, price]: [string, any]) => {
      if (price) {
        lineItems.push({
          label: name.charAt(0).toUpperCase() + name.slice(1),
          amount: price,
          isPrepaid: false
        });
      }
    });
  }

  // 4. Stay adjustment
  if (items.stay_adjustment > 0) {
    lineItems.push({
      label: 'Stay Extension Fee',
      amount: items.stay_adjustment,
      isPrepaid: false
    });
  }

  // 5. Extras (from snapshot)
  if (items.extras && Array.isArray(items.extras)) {
    items.extras.forEach((extra: any) => {
      if (extra.name && extra.price) {
        lineItems.push({
          label: extra.name,
          amount: parseFloat(extra.price) || 0,
          isPrepaid: false
        });
      }
    });
  }

  // 6. Discount
  if (items.discount && items.discount.amount > 0) {
    lineItems.push({
      label: `Discount${items.discount.reason ? ` (${items.discount.reason})` : ''}`,
      amount: -items.discount.amount,
      isPrepaid: false
    });
  }

  // Calculate total from line items
  const lineItemSum = lineItems.reduce((sum, item) => sum + item.amount, 0);

  // Dev-time consistency check
  if (actualTotal !== undefined && Math.abs(lineItemSum - actualTotal) > 0.01) {
    console.warn(
      `Receipt${receiptId ? ` ${receiptId}` : ''} mismatch: line items sum to $${lineItemSum.toFixed(2)}, but total is $${actualTotal.toFixed(2)}`
    );
  }

  return {
    lineItems,
    total: lineItemSum
  };
}
