-- Add payment_id column to drink_sales to link POS sales to payments
ALTER TABLE public.drink_sales
  ADD COLUMN payment_id bigint REFERENCES public.payments(id);

-- Create index for faster lookups
CREATE INDEX idx_drink_sales_payment_id ON public.drink_sales(payment_id);
