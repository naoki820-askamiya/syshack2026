import { config as loadDotenv } from "dotenv";
import express from "express";
import cors from "cors";
import type { Express, Router } from "express";
import type { CorsOptions } from "cors";
import { errorHandler } from "./middlewares/errorHandler.js";
import { readEnv } from "./utils/index.js";
import { requestIdFrom } from "./v17/http.js";

type OptionalRouterModule = {
    default?: Router;
};

// 共有設定より開発者固有の設定を優先し、秘密値をリポジトリへ置かずに上書きできるようにします。
loadDotenv({ path: ".env" });
loadDotenv({ path: ".env.local", override: true });

const defaultAllowedOrigins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "https://kigen404.vercel.app",
    "https://syshack2026.vercel.app",
];

const allowedOrigins = readAllowedOrigins();

const corsOptions: CorsOptions = {
    origin(origin, callback) {
        // curlやヘルスチェックはOriginを送らないため許可し、ブラウザだけをallowlistで制限します。
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
            return;
        }

        callback(new Error(`Origin ${origin} is not allowed by CORS.`));
    },
    credentials: true,
};

export async function createServerApp() {
    const app = express();

    app.use(cors(corsOptions));
    app.use(express.json());

    app.use((req, res, next) => {
        const requestId = requestIdFrom(req);
        res.locals.requestId = requestId;
        res.setHeader("x-request-id", requestId);
        next();
    });

    app.get("/health", (_req, res) => {
        res.json({ status: "ok" });
    });

    await mountOptionalRouter(
        app,
        "/api/me",
        () => import("./routes/me.routes.js"),
    );
    await mountOptionalRouter(
        app,
        "/api/persons",
        () => import("./v17/persons.routes.js"),
    );
    await mountOptionalRouter(
        app,
        "/api/analysis-cases",
        () => import("./v17/analysisCases.routes.js"),
    );
    await mountOptionalRouter(
        app,
        "/api/user-pattern-summary",
        () => import("./v17/userPattern.routes.js"),
    );
    await mountOptionalRouter(
        app,
        "/api/privacy-settings",
        () => import("./v17/privacy.routes.js"),
    );
    await mountOptionalRouter(
        app,
        "/api",
        () => import("./v17/feedback.routes.js"),
    );

    // routeから転送された例外を取りこぼさないよう、必ず全routeの後に置きます。
    app.use(errorHandler);

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
    app: Express,
    path: string,
    importer: () => Promise<OptionalRouterModule>,
) {
    const routeModule = await importer();

    if (routeModule.default) {
        app.use(path, routeModule.default);
    }
}

function readAllowedOrigins(): string[] {
    const envOrigins = readEnv("ALLOWED_ORIGINS") ?? readEnv("FRONTEND_ORIGIN");

    if (!envOrigins) {
        return defaultAllowedOrigins;
    }

    const origins = envOrigins
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean);

    return origins.length > 0 ? origins : defaultAllowedOrigins;
}
