import "dotenv/config";
import { defineConfig } from "prisma/config";

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
