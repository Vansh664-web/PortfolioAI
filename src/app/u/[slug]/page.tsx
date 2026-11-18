import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import PublicPortfolio, { type PublicContent, type PublicProject, type PublicSocialLink, type PublicTheme } from "@/components/PublicPortfolio";
import "./public.css";

async function getPortfolio(slug: string) {
  return db.portfolio.findFirst({ where: { slug, publishedAt: { not: null } }, include: { sections: { where: { visible: true }, orderBy: { position: "asc" } }, theme: true } });
}

function objectValue(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function publicContent(value: unknown): PublicContent {
  const source = objectValue(value);
  const projects = Array.isArray(source.projectCards) ? source.projectCards.flatMap((item): PublicProject[] => {
    const project = objectValue(item);
    return typeof project.title === "string" ? [{ title: project.title, description: stringValue(project.description), ...(typeof project.url === "string" ? { url: project.url } : {}) }] : [];
  }) : undefined;
  const links = Array.isArray(source.links) ? source.links.flatMap((item): PublicSocialLink[] => {
    const link = objectValue(item);
    return typeof link.label === "string" && typeof link.url === "string" ? [{ label: link.label, url: link.url }] : [];
  }) : undefined;
  return {
    heading: stringValue(source.heading), body: stringValue(source.body), image: stringValue(source.image),
    alt: stringValue(source.alt), button: stringValue(source.button), buttonUrl: stringValue(source.buttonUrl),
    projectCards: projects, links,
  };
}

function portfolioTheme(value: unknown, themeName: string): PublicTheme {
  const settings = objectValue(value);
  const custom = objectValue(settings.customization);
  const colors = objectValue(custom.colors);
  const color = (key: string, fallback: string) => stringValue(colors[key], fallback);
  return {
    name: themeName, background: color("bg", "#ffffff"), text: color("text", "#202331"),
    primary: color("primary", "#7659e8"), secondary: color("secondary", "#f1eefb"),
    accent: color("accent", "#42ac88"), font: stringValue(custom.font, "Arial"),
    radius: typeof custom.radius === "number" ? custom.radius : 12,
  };
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const portfolio = await getPortfolio(slug);
  if (!portfolio) return { title: "Portfolio not found" };
  const title = portfolio.seoTitle || portfolio.headline || "Portfolio";
  const description = portfolio.seoDescription || portfolio.about || "A professional portfolio.";
  return { title, description, openGraph: { title, description, images: portfolio.ogImage ? [portfolio.ogImage] : [] } };
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const portfolio = await getPortfolio(slug);
  if (!portfolio) notFound();
  const jar = await cookies();
  const sections = portfolio.sections.map(section => ({ id: section.id, kind: section.kind, title: section.title, content: publicContent(section.content) }));
  const hero = sections.find(section => section.kind === "hero");
  const name = hero?.content.heading || portfolio.seoTitle || "Portfolio";
  const theme = portfolioTheme(portfolio.theme?.settings, portfolio.theme?.name || "minimal");
  return <PublicPortfolio slug={slug} name={name} sections={sections} theme={theme} consent={jar.get("portfolio_analytics_consent")?.value || ""} />;
}
