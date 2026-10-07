-- Private mapping populated from verified Stripe / RevenueCat API responses.
-- Does not update any subscription or existing team's unlimited access.
BEGIN;
CREATE TABLE public.stripe_billing_products (
  product_id text PRIMARY KEY REFERENCES public.revenuecat_products(product_id),
  stripe_product_id text NOT NULL CHECK (stripe_product_id LIKE 'prod\_%'),
  stripe_price_id text NOT NULL UNIQUE CHECK (stripe_price_id LIKE 'price\_%'),
  revenuecat_product_id text NOT NULL UNIQUE,
  portal_configuration_id text NOT NULL CHECK (portal_configuration_id LIKE 'bpc\_%'),
  environment text NOT NULL CHECK (environment IN ('SANDBOX', 'PRODUCTION'))
);
ALTER TABLE public.stripe_billing_products ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.stripe_billing_products FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.stripe_billing_products TO service_role;
COMMIT;
