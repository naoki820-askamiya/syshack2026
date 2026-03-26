import { config as loadDotenv } from "dotenv";
import express from "express";
import { errorHandler } from "./middlewares/errorHandler.ts";
import { readEnv } from "./utils/index.ts";

type OptionalRouterModule = {
    default?: unknown;
};

loadDotenv({ path: ".env" });
loadDotenv({ path: ".env.local", override: true });

export async function createServerApp() {
    const app = express();

    app.use(express.json());

    app.get("/health", (_req, res) => {
        res.json({ status: "ok" });
    });

    await mountOptionalRouter(
        app,
        "/api/sessions",
        () => import("./routes/sessions.routes.ts"),
    );
    await mountOptionalRouter(
        app,
        "/api/persons",
        () => import("./routes/persons.routes.ts"),
    );
    await mountOptionalRouter(
        app,
        "/api/analysis-cases",
        () => import("./routes/analysisCases.routes.ts"),
    );

    app.use(errorHandler as Parameters<typeof app.use>[0]);

    return app;
}

export async function startServer() {
    const app = await createServerApp();
    const port = Number(readEnv("PORT") ?? 3000);

    return app.listen(port, () => {
        console.log(`Server listening on port ${port}`);
    });
}

async function mountOptionalRouter(
    app: ReturnType<typeof express>,
    path: string,
    importer: () => Promise<OptionalRouterModule>,
) {
    const routeModule = await importer();

    if (typeof routeModule.default === "function") {
        app.use(path, routeModule.default as Parameters<typeof app.use>[0]);
    }
}

await startServer();
