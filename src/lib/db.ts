import { AsyncLocalStorage } from "node:async_hooks";
import { PrismaClient } from "@prisma/client";

type PrismaGlobals = typeof globalThis & {
  portfolioPrisma?: PrismaClient;
  portfolioTenantClients?: Map<string, PrismaClient>;
  portfolioTenantContext?: AsyncLocalStorage<string | undefined>;
};

const globals = globalThis as PrismaGlobals;
const defaultClient = globals.portfolioPrisma ?? new PrismaClient();
const tenantClients = globals.portfolioTenantClients ?? new Map<string, PrismaClient>();
const tenantContext = globals.portfolioTenantContext ?? new AsyncLocalStorage<string | undefined>();

globals.portfolioPrisma = defaultClient;
globals.portfolioTenantClients = tenantClients;
globals.portfolioTenantContext = tenantContext;

function tenantClient(userId: string): PrismaClient {
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(userId)) throw new Error("Invalid authenticated database identity.");
  const cached = tenantClients.get(userId);
  if (cached) {
    tenantClients.delete(userId);
    tenantClients.set(userId, cached);
    return cached;
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL must be configured.");
  const connection = new URL(connectionString);
  const priorOptions = connection.searchParams.get("options")?.trim() || "";
  connection.searchParams.set("options", `${priorOptions} -c app.user_id=${userId}`.trim());
  connection.searchParams.set("connection_limit", "1");
  const client = new PrismaClient({ datasources: { db: { url: connection.toString() } } });
  tenantClients.set(userId, client);

  if (tenantClients.size > 100) {
    const oldestId = tenantClients.keys().next().value as string | undefined;
    if (oldestId) {
      const oldest = tenantClients.get(oldestId);
      tenantClients.delete(oldestId);
      void oldest?.$disconnect();
    }
  }
  return client;
}

export function runWithDatabaseUser<T>(userId: string, callback: () => T): T {
  return tenantContext.run(userId, callback);
}

export function setDatabaseUser(userId: string): void {
  tenantContext.enterWith(userId);
}

export const db = new Proxy(defaultClient, {
  get(_target, property) {
    const userId = tenantContext.getStore();
    const client = userId ? tenantClient(userId) : defaultClient;
    const value = Reflect.get(client, property, client) as unknown;
    return typeof value === "function" ? value.bind(client) : value;
  },
}) as PrismaClient;
