# Axios時代の次へ: TypeScriptの通信層を「信頼性ポリシー」で設計する pureq

多くのTypeScriptプロジェクトでは、API通信層の構築時に「とりあえずAxiosを使う」という選択が今でも一般的です。
Axiosは長年安定して使われてきた実績があり、開発体験も良いライブラリです。

一方で、2026年の開発現場では、単なる通信の実装容易性だけでなく、信頼性・可観測性・保守性をどう設計するかがより重要になっています。

この記事では、従来の選択肢の課題を整理したうえで、pureqが目指している価値と、実運用での使いどころを紹介します。

## 従来の選択肢と課題

### fetch APIの課題

生のfetch APIは柔軟ですが、次のような信頼性機能は自前実装になりがちです。

- タイムアウト
- リトライ
- サーキットブレーカー
- 重複リクエスト抑制
- エラー分類と統一ハンドリング

結果として、似た処理がプロジェクト内に分散し、品質のばらつきと保守コストの増大を招きます。

### Axiosの課題

Axiosのインタセプターは便利ですが、設定の可変性が高く、運用が大きくなるほど次の問題が出やすくなります。

- 変更の影響範囲が読みにくい
- クライアント単位の責務分離が崩れやすい
- 設定の積み上げ順序が暗黙化しやすい

## pureqという選択

pureqは、単なるfetchラッパーではなく、通信の信頼性ポリシーを型安全かつ不変に構成するためのHTTP transport layerです。

キーワードは次の3つです。

- Policy-first
- Immutable client
- Composable middleware

- GitHub: [https://github.com/shiro-shihi/pureq](https://github.com/shiro-shihi/pureq)
- npm: [https://www.npmjs.com/package/@pureq/pureq](https://www.npmjs.com/package/@pureq/pureq)

## まずは最小構成

```bash
npm install @pureq/pureq
```

```ts
import { createClient } from "@pureq/pureq";

const api = createClient({
  baseURL: "https://api.example.com",
  headers: {
    "Content-Type": "application/json",
  },
});
```

## 設計上の重要ポイント

### 1. 不変性による安全な合成

`use()` は既存インスタンスを破壊せず、新しいクライアントを返します。

```ts
import { createClient, retry, authRefresh, dedupe } from "@pureq/pureq";

const base = createClient({ baseURL: "https://api.example.com" })
  .use(retry({ maxRetries: 2, delay: 300 }));

const privateApi = base.use(
  authRefresh({
    status: 401,
    refresh: async () => getNewToken(),
  })
);

const publicApi = base.use(dedupe());
```

これにより「管理者API」と「公開API」のように、責務別の通信ポリシーを安全に分岐できます。

### 2. Onion Modelで順序を明示

ミドルウェアの順序は通信挙動そのものです。pureqではこの順序を明示的に管理できます。

```ts
import { createClient, dedupe, retry, circuitBreaker } from "@pureq/pureq";

const resilientApi = createClient({ baseURL: "https://api.example.com" })
  .use(dedupe())
  .use(
    retry({
      maxRetries: 3,
      delay: 200,
      retryOnStatus: [429, 500, 503],
    })
  )
  .use(
    circuitBreaker({
      failureThreshold: 5,
      cooldownMs: 30_000,
    })
  );
```

## 主な機能

- retry
- circuitBreaker
- dedupe
- deadline / defaultTimeout
- authRefresh
- hedge
- concurrencyLimit
- httpCache
- offlineQueue
- validation / fallback
- diagnostics / OpenTelemetry mapping

## プリセットの正しい使い方

`frontendPreset()` は「ミドルウェア配列」を返すため、`middlewares` で渡します。

```ts
import { createClient, frontendPreset } from "@pureq/pureq";

const api = createClient({
  baseURL: "/api",
  middlewares: frontendPreset(),
});
```

## 型安全な呼び出し

### パスパラメータ

```ts
const user = await api.getJson<User>("/users/:userId/profile", {
  params: { userId: "12345" },
});
```

### POST

`postJson(url, body, options?)` の形で渡します。第3引数の `options` は任意です。

```ts
const created = await api.postJson<Post>("/posts", {
  title: "Hello pureq",
  content: "...",
});

const createdWithOptions = await api.postJson<Post>(
  "/posts",
  {
    title: "Hello pureq",
    content: "...",
  },
  {
    headers: {
      "x-request-source": "article-sample",
    },
  }
);
```

## エラーハンドリング

Resultパターンで、transportエラーとHTTPエラーを明示的に扱えます。

```ts
const result = await api.getJsonResult<User>("/users/:id", {
  params: { id: "42" },
});

if (!result.ok) {
  switch (result.error.kind) {
    case "timeout":
      showToast("サーバーの応答がありませんでした");
      break;
    case "circuit-open":
      showFallbackUI();
      break;
    case "http":
      if (result.error.status === 401) {
        logout();
      }
      break;
    default:
      reportError(result.error);
  }
  return;
}

renderUser(result.data);
```

## React Query / SWRとの役割分担

pureqを通信層、React Query/SWRを状態管理層に分離すると、責務が明確になります。

```ts
import { useQuery } from "@tanstack/react-query";

function useUser(id: string) {
  return useQuery({
    queryKey: ["user", id],
    queryFn: async () => {
      const result = await api.getJsonResult<User>("/users/:id", {
        params: { id },
      });

      if (!result.ok) {
        throw result.error;
      }

      return result.data;
    },
  });
}
```

## pureqが向いているケース

- BFFを持つプロジェクト
- 通信ポリシーをチーム横断で統一したい大規模フロントエンド
- 可観測性を重視するバックエンド
- Edge Runtimeを含むマルチランタイム運用

## 別の選択肢が向くケース

- 小規模で通信要件が単純
- 短命なPoC
- まずは速度重視で厳密な信頼性要件がない

## まとめ

pureqの価値は「便利なHTTPクライアント」であること以上に、通信の信頼性をポリシーとして明示的に設計・運用できることにあります。

長期保守やチーム開発で、通信レイヤーの一貫性を重視するなら、pureqは有力な選択肢です。
