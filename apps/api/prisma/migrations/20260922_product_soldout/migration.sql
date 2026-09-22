-- Prodotto "esaurito" (86'd): flag manuale indipendente dalla giacenza
ALTER TABLE "Product" ADD COLUMN "soldOut" BOOLEAN NOT NULL DEFAULT false;
