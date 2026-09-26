<div align="center">

<img src="./images/banner.png" alt="Discord Token Login" width="100%" />

# Discord Token Login

**Discord のマルチアカウントマネージャとトークンスイッチャー**  
*Chromium（Manifest V3）拡張機能。すべてローカルで動作します — アナリティクスなし、テレメトリなし、サードパーティのエンドポイントなし。*

[![Manifest V3](https://img.shields.io/badge/Manifest-V3-5865F2?style=flat-square&logo=googlechrome&logoColor=white)](https://developer.chrome.com/docs/extensions/mv3/intro)
[![AES-256-GCM](https://img.shields.io/badge/AES--256--GCM-5865F2?style=flat-square&logo=lock&logoColor=white)](#-セキュリティモデル)
[![Zero Telemetry](https://img.shields.io/badge/Zero-Telemetry-57F287?style=flat-square&logo=shield&logoColor=white)](#-セキュリティモデル)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?style=flat-square&logo=typescript&logoColor=white)](tsconfig.json)
[![Build](https://img.shields.io/badge/Build-Passing-57F287?style=flat-square&logo=githubactions&logoColor=white)](#-開発と品質ゲート)
[![Tests](https://img.shields.io/badge/Tests-91%2F91-57F287?style=flat-square&logo=jest&logoColor=white)](#-開発と品質ゲート)
[![License: MIT](https://img.shields.io/badge/License-MIT-ED4245?style=flat-square)](LICENSE)

</div>

<p align="center">
  <a href="#-機能">機能</a> •
  <a href="#-スクリーンショット">スクリーンショット</a> •
  <a href="#-インストール">インストール</a> •
  <a href="#-セキュリティモデル">セキュリティ</a> •
  <a href="#-トークンキャプチャの仕組み">仕組み</a> •
  <a href="#-開発と品質ゲート">開発</a> •
  <a href="#-スター履歴">スター履歴</a>
</p>

---

## 🌐 多言語

<p align="center">
  <a href="./README.md"><img src="https://img.shields.io/badge/README-English-5865F2?style=flat-square&logo=googlechrome&logoColor=white" alt="English" /></a>
  <a href="./README_VI.md"><img src="https://img.shields.io/badge/README-Ti%E1%BA%BFng_Vi%E1%BB%87t-5865F2?style=flat-square" alt="Tiếng Việt" /></a>
  <a href="./README_ZH.md"><img src="https://img.shields.io/badge/README-%E7%AE%80%E4%BD%93%E4%B8%AD%E6%96%87-5865F2?style=flat-square" alt="简体中文" /></a>
  <a href="./README_KO.md"><img src="https://img.shields.io/badge/README-%ED%95%9C%EA%B5%AD%EC%96%B4-5865F2?style=flat-square" alt="한국어" /></a>
  <a href="./README_JA.md"><img src="https://img.shields.io/badge/README-%E6%97%A5%E6%9C%AC%E8%AA%9E-5865F2?style=flat-square" alt="日本語" /></a>
</p>

---
## 📸 スクリーンショット

<div align="center">

### メインポップアップ — クイックログイン、アカウント切り替え、セッション状態

<img src="./images/popup.png" alt="Discord Token Login ポップアップ" width="820" />

<br />

### アカウント管理 — 複数プロファイル、トークンの健全性、プライベートメモ

<img src="./images/accounts.png" alt="Discord Token Login アカウント管理" width="820" />

<br />

### 設定 — 暗号化モード、パスフレーズボールト、キャプチャ動作

<img src="./images/settings.png" alt="Discord Token Login 設定" width="820" />

</div>

---

## ✨ 機能

| 領域 | 内容 |
| --- | --- |
| **クイックログイン** | トークンを貼り付けてログインします。トークンはどこにも書き込まれる前に検証されます。 |
| **トークンキャプチャ** | すでにログイン済みの Discord タブからトークンを直接読み取ります。手作業でコピーする必要はありません。 |
| **アカウントマネージャ** | 複数のアカウントを保管して切り替え、ローカルメモを添え、どのトークンがまだ有効かを確認できます。 |
| **暗号化ストレージ** | すべてのトークンは `chrome.storage.local` に到達する前に **AES-256-GCM** で封じ込められます。任意のパスフレーズ保護は **PBKDF2-HMAC-SHA256** を 310,000 回反復して鍵を導出します。 |
| **コンテキストメニュー** | ツールバーのアイコンを右クリックすれば、ポップアップを開かずにクイックログイン、トークンキャプチャ、設定を実行できます。 |
| **ツールバーバッジ** | 何も開かずに保存済みのアカウント数が分かります。 |
| **クリーンな UI** | Discord 2023 パレットを基にしたダークテーマ、ビルド時にベンダリングされる Tabler の塗りアイコンセット、そして個別値ではなくスケールで設計されたデザインシステム。 |

---

## 📥 インストール

### ソースからビルド

```bash
git clone https://github.com/nguyenphanno/Extensions-Discord-Token-Login.git
cd Extensions-Discord-Token-Login
npm install          # 一度だけ
npm run build        # dist/ を生成
```

### ブラウザに読み込む

Chrome、Edge、Brave、Opera、Arc のいずれかで:

1. `chrome://extensions`（または `edge://extensions`、`brave://extensions`）を開く
2. **開発者モード** をオンにする（右上部のトグル）
3. **展開して読み込み** をクリック
4. `dist/` フォルダーを選択

> **npm が `install-scripts` 警告を表示することがあります。** npm 11 は既定で
> 依存関係のライフサイクルスクリプトをブロックします。esbuild はこれを必要としません ——
> プラットフォームバイナリはオプショナル依存 `@esbuild/win32-x64` 経由で供給される
> ため、ビルドは正常に動作します。この警告は無視して構いません。

### 必要条件

| | |
| --- | --- |
| **ブラウザ** | Chrome / Edge / Brave / Opera / Arc 110+（Manifest V3） |
| **Node.js** | 18 以上（ビルド専用 — 拡張機能自体はランタイム不要） |
| **権限** | `storage`、`tabs`、`scripting`、`contextMenus` — すべて `src/manifest.json` で宣言 |

---

## 🔒 セキュリティモデル

自らの保証を強調しすぎるツールは、自らの限界を素直に認めるツールより悪いものです。
率直にお書きします。

**保証できること**

- トークンは AES-256-GCM 暗号文として保存されます。書き込むたびに 96 ビットの
  ランダム IV を生成するため、`(鍵, nonce)` のペアが再利用されることはありません。
- **パスフレーズ**モードでは鍵はあなたのパスフレーズから導出され、ディスクに
  *一切* 書き込まれません。鍵は `chrome.storage.session` にあり、メモリベース、
  コンテンツスクリプトからは到達できず、ブラウザを閉じると消えます。
- 誤ったパスフレーズは改ざんされたレコードとまったく同じエラーを返します。
  したがって攻撃者は「パスワードの誤り」と「データの破損」を区別できません。
- 保護モードを切り替えるとすべてのレコードが再暗号化され、書き込みが失敗した場合は
  ボールトが半分だけ移行した状態になる代わりに、以前の暗号文へロールバックします。

**保証できないこと**

- 既定の**デバイス鍵**モードでは、鍵は暗号文の隣の `chrome.storage.local` に
  あります。これはコピーされたプロファイル、同期バックアップ、開発者ツールを
  適当に開いて見る人には阻止できますが、**すでにあなたのマシンで動作中のコードに
  対しては防御できません**。
- 拡張機能が Discord トークンを読み取れるのは、それがまさに役割だからです。認証情報に
  触れ得る他のあらゆるツールと同じ扱いをしてください。信頼できるソースから
  インストールしてください。
- Discord の利用規約は、あなた自身のトークンを含め、トークンの利用を支配します。

**痕跡は残りますか？** ロガーはトークン風の文字列を service worker のコンソールに
届ける前に必ずマスクします。したがって詳細ログを有効にすることが
`chrome://extensions` に認証情報を漏らす原因になることはありません。

### データフロー

```
トークン入力  ──►  構造チェック  ──►  AES-256-GCM 封緘  ──►  chrome.storage.local
                                              ▲
                                              │
                        デバイス鍵  ───────────┤
                        PBKDF2(パスフレーズ) ───┘   （パスフレーズモードでは
                                                    鍵は chrome.storage.session
                                                    にのみ存在）
```

### 脅威モデルのまとめ

| シナリオ | デバイス鍵モード | パスフレーズモード |
| --- | --- | --- |
| ブラウザプロフィールの窃取 | ⚠️ 鍵と暗号文が一緒に流出 | ✅ ディスク上には暗号文のみ |
| 同期・バックアップされたプロファイル | ⚠️ 両方のコピーが読まれる | ✅ 暗号文のみ |
| 開発者ツールを開かれる | ⚠️ 見える | ✅ 見えるが、パスフレーズなしでは無意味 |
| あなたの権限で動作中のマルウェア | ❌ 防御不可 | ❌ 防御不可 |
| ブラウザを閉じる | 鍵は残る | ✅ 鍵はメモリから消える |

---

## 🧠 トークンキャプチャの仕組み

Discord タブのセッションはページが所有しているため、キャプチャは
`world: 'MAIN'` を指定した `chrome.scripting.executeScript` 経由で、ページ自身の
JavaScript コンテキストの中で行われます。コンテンツスクリプトは隔離されたワールドで
動き、ページストレージもクライアントのモジュールも見えません。

Discord はトークンを固定のストレージキーに置いて**いません**。実行中のクライアントは
トークンをメモリに保持し、ページのアンロード中のみ `localStorage` へ複製します。よって
十分に生きているセッションに対して `localStorage.getItem('token')` は空を返します。
そこでキャプチャは 4 つのレイヤーを順に試し、どのレイヤーが応答したかを報告します。

1. **文書化されたキー** — 旧ビルドではそのまま機能します。ちょうど読み込みが終わった
   ページでも有効です。
2. **合成 `beforeunload`** — クライアント自身がデータを書き出す際に使うまさにその
   シグナルなので、動作中のクライアントが保持している内容を公開します。ここでは何も
   書き込みません。拡張機能はクライアントのベルを鳴らすだけです。
3. **クライアント自身の `getToken()`** — バンドルのモジュールキャッシュ経由で、
   コールバックにキャッシュを渡す no-op チャンクを押し込むことで到達します。何時間も
   開いたままのタブで機能するのはこの経路です。トークンを*書き込むことも*できる
   モジュールだけが認証ストアとして扱われ、そのチャンクのエントリは再び取り出される
 ため、ページは見つかったときのままに保たれます。
4. **ストレージ値の有界スキャン** でトークン状の文字列を探します。これによりトークン
   を新しいキーへ移したビルドでも読み取れます。*実際に*セッション
   トークンである値はキーの名前に関係なく受理されますが、より大きな塊に埋もれた値は
   キー名がその中身を示している場合にだけ取り出されます。

```
 ┌──────────────────────────────────────────────────────────┐
 │            Discord タブからのトークン抽出                  │
 └──────────────────────────────────────────────────────────┘
          │
          │  1. 文書化されたストレージキー
          │  2. 合成 beforeunload  → メモリのフラッシュ
          │  3. バンドルのモジュールキャッシュ → getToken()
          │  4. 有界ストレージスキャン → トークン状の値
          ▼
   出所と構造に基づいて候補を順位付け
          │
          ▼
   どれが本物かを Discord /users/@me が判定
```

ページは*提案するだけ*です。クライアント内の他のモジュールは、トークンとまったく同じ
長さと文字集合を持つ文字列（キャプチャ、アナリティクス ID、ナンスなど）を出しますが、
ローカルでそれらをセッションと区別する方法はありません。そこでページは候補となりうる
値をすべて返し、どこから来たかと、本物のトークンの*構造*（先頭セグメントをデコード
すると数値のアカウント ID になる base64url セグメント）を持っているかをタグ付けして
返します。worker は次に Discord に問い合わせて、どれが本物かを確認します。候補は信頼度
順に小さな上限まで試行され、最初に Discord が受け入れたものが勝ちます。誤検出は
キャプチャ全体を壊す代わりにリクエスト 1 回分のコストで済み、何も使えるものが見つから
ない場合は、素の 401 ではなくその旨を明示するようになりました。

### サインインの仕組み

サインインはまったく同じ物語を逆向きにたどります。同じ罠もあります。クライアントは
アンロード時にメモリ内のセッションを公開するため、単純なストレージ書き込みは、その
セッションを有効化するために行ったリロード自身によって打ち消されます。そこで書き込み
は次のように行います。

- クライアントと同じ形式でトークンを保存する — JSON の引用符付き。これは値が存在
  する限り `getItem` が返す形式そのものです。
- 見つけられた場合はクライアント自身の `setToken` を呼び、バンドルが起動して
  モジュールキャッシュが埋まるまで少し待つ。
- 意図した値をもう一度主張する、一度きりの `beforeunload` リスナーを登録する。
  リスナーは登録順に実行されるため、私たちのものはクライアント自身のハンドラーの
  後に走って勝ちます。自前で解除されるので、以降のナビゲーションには影響しません。

サインアウトは同じガードを逆の意図で使うため、サインアウト済みのタブはリロード
後もサインアウト状態を維持します。

> ⚠️ **自分自身のアカウントのトークンだけを取得してください。** トークンは
> パスワードです。本プロジェクトは独立したオープンソースツールであり、
> Discord Inc. とは**一切関係・承認・公式な提携はありません**。トークンの利用は
> あなた自身のものを含め Discord の利用規約に従います。

---

## 📁 プロジェクト構成

```
src/
├── manifest.json          MV3 manifest
├── assets/icons/          生成される PNG（16/32/48/128/512）
│
├── core/                  Chrome API も DOM もない純粋なドメインロジック
│   ├── constants.ts       プロジェクト内の調整可能な値をすべて
│   ├── types.ts           ドメインモデル + worker メッセージプロトコル
│   ├── logger.ts          トークンをマスクするスコープ付きログ
│   └── utils/             エンコーディング、非同期制御フロー、書式整形
│
├── crypto/                ボールト
│   ├── aes-gcm.ts         エンベロープ暗号化
│   ├── key-derivation.ts  PBKDF2 / デバイス鍵
│   └── vault.ts           ロック状態機械、アトミック再鍵化
│
├── platform/              Chrome API の薄いラッパー
│   ├── messaging.ts       worker への型付きリクエスト／レスポンス
│   └── settings.ts        平文の設定値
│
├── services/              アプリケーションロジック
│   ├── discord-client.ts  Discord API を呼ぶ唯一のモジュール
│   ├── account-service.ts オーケストレーション
│   ├── session-injector.ts サインイン／サインアウト
│   └── token-extractor.ts  生存中のタブからキャプチャ
│
├── background/            service worker
│   ├── index.ts           リスナーの配線のみ
│   ├── router.ts          リクエスト → ハンドラ、例外を投げない
│   ├── menu.ts            右クリックメニュー
│   └── badge.ts           ツールバーバッジ
│
├── ui/                    共有、フレームワークなし
│   ├── icons.ts           SVG アイコンセット
│   ├── dom.ts             要素ヘルパー
│   ├── feedback.ts        トースト、シート、処理中状態
│   └── styles/            tokens → base → components
│
├── popup/                 380 × 600 のポップアップ画面
└── options/               フル設定タブ
```

依存の向きは厳密に一方向です: `ui → platform → services → crypto → core`。
`core/` には Chrome API を import するものが一切なく、それがセキュリティ上重要な
コードを隔離された状態でテストできる理由です。

---

## 🛠️ 開発と品質ゲート

```bash
npm install

npm run typecheck      # tsc --noEmit、strict モード
npm run verify:crypto  # 実物の AES-GCM / PBKDF2 / 再鍵化パスを実行
npm run verify:api     # トークンが載る送信リクエストを検証
npm run verify:signin  # スタブ化したブラウザ API でサインインを実行
npm run verify:page    # 偽物のページで注入されるページ関数を実行
npm run build          # バンドル + コピー + 検証して dist/ に出力
npm run watch          # 差分ビルド
npm run icons          # PNG セットを再生成
npm run icons:preview  # icon-sheet.html にアイコン一覧を生成
npm run clean          # dist/ を削除
npm run verify         # 6 つのゲートをすべて順番に実行
```

ビルドは、manifest や HTML が存在しないファイルを参照している `dist/` を出力することを
拒否します — 壊れたパッケージは Chrome ではなくビルドを失敗させます。

| ゲート | チェック数 | 存在する理由 |
| --- | --- | --- |
| `typecheck` | strict `tsc` | 型、死んだ import、API のずれ |
| `verify:crypto` | 20 | 暗号文がトークンを隠す、IV の再利用なし、誤ったパスフレーズを拒否、ロックが機能、再鍵化が記録を一つも失わずに移行 |
| `verify:api` | 18 | トークンが接頭辞も空白もなく正しいヘッダーで送られること。200/401/429 の分類が正しいこと |
| `verify:signin` | 12 | サインインがコミット済みのドキュメントを待ち、フレーム間でフォールバックし、失敗時にトークンではなくタブを報告する |
| `verify:page` | 41 | 4 つのキャプチャ層、候補の優先順位付け、そしてクライアント自身のハンドラーを上回るアンロードガード |
| `build` | manifest + HTML | 参照されるすべてのファイルが `dist/` に実際に存在する |

各テストスイートは、実際に発見したバグがあるから存在します。`verify:crypto` は、新しく
 新しいプロファイルがデバイス鍵を生成しながらも初期化前のメタデータを読んでしまう、
初回実行のバグを検出しました。`verify:api` は、完全に有効なトークンに対して Discord が
`401 Unauthorized` を返していた `Token ` という接頭辞を捕まえました。その時点でも他の
すべてのゲートは緑でした。`verify:page` は Chrome の注入モデルを正確に再現します —
関数自身のソースを空の realm で評価します — キャプチャを数ヶ月も壊し続けていたバグが、
ページに存在しないモジュール束縛を参照する注入関数で、それ自身の `try/catch` に
飲み込まれていたからです。

---

## ❓ よくある質問

**私のアカウントを盗みますか？**
いいえ。サーバーも分析もなく、`discord.com` 以外へのネットワーク通信もありません。
`src/manifest.json` と `src/services/discord-client.ts` を読んでみて —
 どれも短く、コードベース全体を確認できます。

**単に `localStorage.getItem('token')` を読めばいいのでは？**
現代の Discord はトークンをメモリに保持し、ページのアンロード時にのみストレージへ
複製します。[トークンキャプチャの仕組み](#-トークンキャプチャの仕組み) を参照して
ください。

**アカウントが期限切れと表示されます。**
そのセッションは Discord によって無効化されました。まだログインしているタブから
トークンを再取得して、保存し直してください。

**Firefox でも動作しますか？**
そのままでは動作しません。この拡張機能は Chromium MV3 を対象としており、
`world: 'MAIN'` を指定した `chrome.scripting.executeScript` を使用しますが、
Firefox はこれを同じ manner で実装していません。

**パスフレーズモードはマルウェアから守ってくれますか？**
いいえ。あなたの権限で動作しているものはすべてプロセスメモリを読み取れます。
守られるのは*保存された*コピーであり、共用マシンやバックアップされたマシンで
現実的なリスクになっているのはこちらのほうです。

---

## 📈 スター履歴

このリポジトリにスターを付けて応援してください！

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=nguyenphanno/Extensions-Discord-Token-Login&type=Date&theme=dark" />
    <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=nguyenphanno/Extensions-Discord-Token-Login&type=Date" />
    <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=nguyenphanno/Extensions-Discord-Token-Login&type=Date" />
  </picture>
</p>

---

## ⚠️ 免責事項

- 本プロジェクトは独立したオープンソースツールであり、Discord Inc. とは
  **一切関係、承認、推奨、公式な提携はありません**。
- 「Discord」および Discord のロゴは Discord Inc. の商標です。
- Discord の利用規約を遵守し、本拡張機能を責任ある運用で正式に使用してください。
  認証トークンを信頼できない相手と決して共有しないでください。
- 不正な使用の結果として生じたアカウントの紛失や制限について、作者は責任を負いません。

---

## 📜 ライセンス

[MIT License](LICENSE) のもとで配布されています。❤️ を込めて
[nguyenphanno](https://github.com/nguyenphanno) が開発しています。

編集中に差分ビルドを行いたい場合は `npm run watch` を使用してください。

