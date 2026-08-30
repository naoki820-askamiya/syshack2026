import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";

const globalForPrisma = globalThis as typeof globalThis & {
    prisma?: PrismaClient;
};

function readDatabaseUrl(): string {
    // 実行時接続はDATABASE_URLを使い、migration用DIRECT_URLとは役割を分けます。
    const connectionString = process.env.DATABASE_URL?.trim();

    if (!connectionString) {
        throw new Error("DATABASE_URL is required to initialize PrismaClient.");
    }

    return connectionString;
}

export const prisma =
    globalForPrisma.prisma ??
    new PrismaClient({
        adapter: new PrismaPg({
            connectionString: readDatabaseUrl(),
        }),
    });

if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = prisma;
}
