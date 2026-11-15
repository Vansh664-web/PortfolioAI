ALTER TABLE "Portfolio" ADD COLUMN "ogImage" TEXT;
ALTER TABLE "Portfolio" ADD COLUMN "customDomain" TEXT;
CREATE UNIQUE INDEX "Portfolio_customDomain_key" ON "Portfolio"("customDomain");

ALTER TABLE "PortfolioAnalytics" ADD COLUMN "visitorHash" TEXT;
ALTER TABLE "PortfolioAnalytics" ADD COLUMN "referrer" TEXT;
ALTER TABLE "PortfolioAnalytics" ADD COLUMN "device" TEXT;
CREATE INDEX "PortfolioAnalytics_userId_visitorHash_occurredAt_idx" ON "PortfolioAnalytics"("userId", "visitorHash", "occurredAt");
CREATE INDEX "PortfolioAnalytics_userId_event_occurredAt_idx" ON "PortfolioAnalytics"("userId", "event", "occurredAt");
