-- AlterTable: aggiunge notes su OrderItem per richieste/modifiche del cliente
ALTER TABLE "OrderItem" ADD COLUMN "notes" TEXT;
