-- Which discount code an order used, if any. The price on the order is already the discounted price.
alter table mosaics add column if not exists promo_code text;
