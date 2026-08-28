import { config as loadDotenv } from "dotenv";
import { defineConfig } from "prisma/config";

loadDotenv({ path: ".env" });
loadDotenv({ path: ".env.local", override: true });

export default defineConfig({
    experimental: {
        externalTables: true,
    },
    schema: "prisma/schema.prisma",
    migrations: {
        path: "prisma/migrations",
        initShadowDb: "prisma/init-shadow-db.sql",
    },
    datasource: {
        url: process.env["DIRECT_URL"] ?? process.env["DATABASE_URL"],
    },
});
