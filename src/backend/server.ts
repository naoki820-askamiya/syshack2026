/**
 * このファイルは、バックエンド全体の「入口」です。
 *
 * ここでやっていることは大きく 4 つです。
 * 1. `.env` / `.env.local` を読み込んで環境変数を使えるようにする
 * 2. Express アプリを作る
 * 3. 各 route（URLごとに処理の行き先を決める場所）を登録する
 * 4. 最後に共通エラーハンドラをつないでサーバーを起動する
 *
 * 初学者向けの見方としては、
 * 「サーバーの初期設定を順番に並べているファイル」
 * と考えると追いやすいです。
 */
import { config as loadDotenv } from "dotenv";
import express from "express";
import cors from "cors";
import { randomUUID } from "node:crypto";
import type { Express, Router } from "express";
import type { CorsOptions } from "cors";
import { errorHandler } from "./middlewares/errorHandler.js";
import { readEnv } from "./utils/index.js";

type OptionalRouterModule = {
    default?: Router;
};

// まず通常の `.env` を読みます。
// そのあと `.env.local` を上書きで読むことで、
// ローカル環境だけの設定を優先できるようにしています。
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
        // ブラウザ以外のヘルスチェックや curl は Origin を付けないため、
        // それらは通しつつ、ブラウザからのアクセスは許可した URL のみに絞ります。
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
            return;
        }

        callback(new Error(`Origin ${origin} is not allowed by CORS.`));
    },
    credentials: true,
};

/**
 * Express アプリ本体を作る関数です。
 *
 * 返り値:
 * - route と middleware の登録が終わった Express アプリ
 *
 * ここでは「サーバーをどう組み立てるか」を決めています。
 * 実際の業務ロジックはここには書かず、
 * route / controller / service 側に渡します。
 */
export async function createServerApp() {
    const app = express();

    // CORS は、この API を呼び出してよいフロントエンドの URL を制御する設定です。
    // ローカル開発用と、本番で利用する Vercel のフロント URL を許可します。
    app.use(cors(corsOptions));

    // JSON の body を使えるようにする設定です。
    // `POST` で送られた JSON を `req.body` から読めるようになります。
    app.use(express.json());

    app.use((req, res, next) => {
        const supplied = req.header("x-request-id")?.trim();
        const requestId = supplied && supplied.length <= 100
            ? supplied
            : `req_${randomUUID()}`;
        res.locals.requestId = requestId;
        res.setHeader("x-request-id", requestId);
        next();
    });

    // 疎通確認用のシンプルなエンドポイントです。
    // サーバーが起動しているかだけを見たいときに使います。
    app.get("/health", (_req, res) => {
        res.json({ status: "ok" });
    });

    // route を順番に登録します。
    // ここでは URL の先頭部分だけを決めて、
    // その先の細かい分岐は各 route ファイルに任せています。
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

    // 共通エラーハンドラは最後につなぎます。
    // こうすることで、途中で `next(error)` されたエラーを
    // 最後にまとめて同じ JSON 形式へ変換できます。
    app.use(errorHandler);

    return app;
}

/**
 * 実際にポートを開いてサーバーを起動する関数です。
 *
 * 返り値:
 * - `app.listen(...)` が返すサーバーオブジェクト
 *
 * `PORT` が環境変数に無いときは、開発しやすいように 3000 を使います。
 */
export async function startServer() {
    const app = await createServerApp();
    const port = Number(readEnv("PORT") ?? 3000);

    return app.listen(port, () => {
        console.log(`Server listening on port ${port}`);
    });
}

/**
 * route ファイルを安全に登録するための小さな補助関数です。
 *
 * なぜ必要か:
 * - このリポジトリでは、まだ未実装の route ファイルがあっても
 *   サーバー全体が落ちないようにしたいからです
 * - `default export` がある route だけを Express に登録します
 *
 * `optional` と付いているのは、
 * 「ファイルはあっても中身が空かもしれない」前提で扱っているためです。
 */
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

// 実際の起動は `src/server.ts` から行います。
// ここは「Express アプリの組み立て」と「起動関数の定義」までを担当します。
