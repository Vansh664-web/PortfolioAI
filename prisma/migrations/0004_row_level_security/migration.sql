-- RLS identity is set by the server-only Prisma connection from the user ID
-- already verified in the signed session cookie. Direct clients cannot choose it.
-- Keep the runtime database role non-owner and NOSUPERUSER/NOBYPASSRLS.

ALTER TABLE "Session" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Session" FORCE ROW LEVEL SECURITY;
CREATE POLICY "session_owner" ON "Session"
  USING ("userId" = current_setting('app.user_id', true))
  WITH CHECK ("userId" = current_setting('app.user_id', true));

ALTER TABLE "StudentProfile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StudentProfile" FORCE ROW LEVEL SECURITY;
CREATE POLICY "profile_owner" ON "StudentProfile"
  USING ("userId" = current_setting('app.user_id', true))
  WITH CHECK ("userId" = current_setting('app.user_id', true));

ALTER TABLE "Education" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Education" FORCE ROW LEVEL SECURITY;
CREATE POLICY "education_owner" ON "Education"
  USING (EXISTS (SELECT 1 FROM "StudentProfile" p WHERE p."id" = "Education"."profileId" AND p."userId" = current_setting('app.user_id', true)))
  WITH CHECK (EXISTS (SELECT 1 FROM "StudentProfile" p WHERE p."id" = "Education"."profileId" AND p."userId" = current_setting('app.user_id', true)));

ALTER TABLE "Skill" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Skill" FORCE ROW LEVEL SECURITY;
CREATE POLICY "skill_owner" ON "Skill"
  USING (EXISTS (SELECT 1 FROM "StudentProfile" p WHERE p."id" = "Skill"."profileId" AND p."userId" = current_setting('app.user_id', true)))
  WITH CHECK (EXISTS (SELECT 1 FROM "StudentProfile" p WHERE p."id" = "Skill"."profileId" AND p."userId" = current_setting('app.user_id', true)));

ALTER TABLE "Project" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Project" FORCE ROW LEVEL SECURITY;
CREATE POLICY "project_owner" ON "Project"
  USING (EXISTS (SELECT 1 FROM "StudentProfile" p WHERE p."id" = "Project"."profileId" AND p."userId" = current_setting('app.user_id', true)))
  WITH CHECK (EXISTS (SELECT 1 FROM "StudentProfile" p WHERE p."id" = "Project"."profileId" AND p."userId" = current_setting('app.user_id', true)));

ALTER TABLE "Experience" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Experience" FORCE ROW LEVEL SECURITY;
CREATE POLICY "experience_owner" ON "Experience"
  USING (EXISTS (SELECT 1 FROM "StudentProfile" p WHERE p."id" = "Experience"."profileId" AND p."userId" = current_setting('app.user_id', true)))
  WITH CHECK (EXISTS (SELECT 1 FROM "StudentProfile" p WHERE p."id" = "Experience"."profileId" AND p."userId" = current_setting('app.user_id', true)));

ALTER TABLE "Certification" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Certification" FORCE ROW LEVEL SECURITY;
CREATE POLICY "certification_owner" ON "Certification"
  USING (EXISTS (SELECT 1 FROM "StudentProfile" p WHERE p."id" = "Certification"."profileId" AND p."userId" = current_setting('app.user_id', true)))
  WITH CHECK (EXISTS (SELECT 1 FROM "StudentProfile" p WHERE p."id" = "Certification"."profileId" AND p."userId" = current_setting('app.user_id', true)));

ALTER TABLE "Achievement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Achievement" FORCE ROW LEVEL SECURITY;
CREATE POLICY "achievement_owner" ON "Achievement"
  USING (EXISTS (SELECT 1 FROM "StudentProfile" p WHERE p."id" = "Achievement"."profileId" AND p."userId" = current_setting('app.user_id', true)))
  WITH CHECK (EXISTS (SELECT 1 FROM "StudentProfile" p WHERE p."id" = "Achievement"."profileId" AND p."userId" = current_setting('app.user_id', true)));

ALTER TABLE "Portfolio" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Portfolio" FORCE ROW LEVEL SECURITY;
CREATE POLICY "portfolio_owner" ON "Portfolio"
  USING ("userId" = current_setting('app.user_id', true))
  WITH CHECK ("userId" = current_setting('app.user_id', true));
CREATE POLICY "portfolio_public_read" ON "Portfolio" FOR SELECT
  USING ("publishedAt" IS NOT NULL);

ALTER TABLE "PortfolioSection" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PortfolioSection" FORCE ROW LEVEL SECURITY;
CREATE POLICY "portfolio_section_owner" ON "PortfolioSection"
  USING (EXISTS (SELECT 1 FROM "Portfolio" p WHERE p."id" = "PortfolioSection"."portfolioId" AND p."userId" = current_setting('app.user_id', true)))
  WITH CHECK (EXISTS (SELECT 1 FROM "Portfolio" p WHERE p."id" = "PortfolioSection"."portfolioId" AND p."userId" = current_setting('app.user_id', true)));
CREATE POLICY "portfolio_section_public_read" ON "PortfolioSection" FOR SELECT
  USING ("visible" AND EXISTS (SELECT 1 FROM "Portfolio" p WHERE p."id" = "PortfolioSection"."portfolioId" AND p."publishedAt" IS NOT NULL));

ALTER TABLE "PortfolioTheme" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PortfolioTheme" FORCE ROW LEVEL SECURITY;
CREATE POLICY "portfolio_theme_owner" ON "PortfolioTheme"
  USING (EXISTS (SELECT 1 FROM "Portfolio" p WHERE p."id" = "PortfolioTheme"."portfolioId" AND p."userId" = current_setting('app.user_id', true)))
  WITH CHECK (EXISTS (SELECT 1 FROM "Portfolio" p WHERE p."id" = "PortfolioTheme"."portfolioId" AND p."userId" = current_setting('app.user_id', true)));
CREATE POLICY "portfolio_theme_public_read" ON "PortfolioTheme" FOR SELECT
  USING (EXISTS (SELECT 1 FROM "Portfolio" p WHERE p."id" = "PortfolioTheme"."portfolioId" AND p."publishedAt" IS NOT NULL));

ALTER TABLE "AIConversation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AIConversation" FORCE ROW LEVEL SECURITY;
CREATE POLICY "conversation_owner" ON "AIConversation"
  USING ("userId" = current_setting('app.user_id', true))
  WITH CHECK ("userId" = current_setting('app.user_id', true));

ALTER TABLE "AIMessage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AIMessage" FORCE ROW LEVEL SECURITY;
CREATE POLICY "message_owner" ON "AIMessage"
  USING (EXISTS (SELECT 1 FROM "AIConversation" c WHERE c."id" = "AIMessage"."conversationId" AND c."userId" = current_setting('app.user_id', true)))
  WITH CHECK (EXISTS (SELECT 1 FROM "AIConversation" c WHERE c."id" = "AIMessage"."conversationId" AND c."userId" = current_setting('app.user_id', true)));

ALTER TABLE "Resume" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Resume" FORCE ROW LEVEL SECURITY;
CREATE POLICY "resume_owner" ON "Resume"
  USING ("userId" = current_setting('app.user_id', true))
  WITH CHECK ("userId" = current_setting('app.user_id', true));

ALTER TABLE "PortfolioAnalytics" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PortfolioAnalytics" FORCE ROW LEVEL SECURITY;
CREATE POLICY "analytics_owner" ON "PortfolioAnalytics"
  USING ("userId" = current_setting('app.user_id', true))
  WITH CHECK ("userId" = current_setting('app.user_id', true));

ALTER TABLE "Notification" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Notification" FORCE ROW LEVEL SECURITY;
CREATE POLICY "notification_owner" ON "Notification"
  USING ("userId" = current_setting('app.user_id', true))
  WITH CHECK ("userId" = current_setting('app.user_id', true));

ALTER TABLE "CareerGoal" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CareerGoal" FORCE ROW LEVEL SECURITY;
CREATE POLICY "career_goal_owner" ON "CareerGoal"
  USING ("userId" = current_setting('app.user_id', true))
  WITH CHECK ("userId" = current_setting('app.user_id', true));
