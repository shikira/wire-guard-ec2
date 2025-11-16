# Claude Code カスタムインストラクション

このファイルは、Claude Codeがこのプロジェクトで作業する際に従うべきカスタムインストラクションを定義します。

## プロジェクト概要

このプロジェクトは、AWS CDK (TypeScript)を使用してWireGuard VPNサーバーをAWS EC2上に構築するためのInfrastructure as Codeプロジェクトです。

### 主要技術スタック
- **IaC**: AWS CDK v2 (TypeScript)
- **パッケージマネージャー**: pnpm (npmは使用しない)
- **VPNソフトウェア**: WireGuard
- **クラウドプロバイダー**: AWS (Tokyo Region: ap-northeast-1)
- **インスタンスタイプ**: EC2 t3.micro
- **OS**: Amazon Linux 2023

### パッケージ管理

**重要**: このプロジェクトでは **pnpm** を使用します。npmは使用しません。

#### pnpm使用理由
1. **ディスク効率**: シンボリックリンクによる重複排除
2. **高速インストール**: 並列ダウンロードと効率的なキャッシュ
3. **厳密な依存関係管理**: Phantom dependenciesの回避
4. **モノレポサポート**: 将来的な拡張に対応

#### コマンド対応表

| npm コマンド | pnpm コマンド |
|------------|--------------|
| `npm install` | `pnpm install` |
| `npm install <pkg>` | `pnpm add <pkg>` |
| `npm install -D <pkg>` | `pnpm add -D <pkg>` |
| `npm run <script>` | `pnpm <script>` または `pnpm run <script>` |
| `npx <command>` | `pnpm dlx <command>` または `pnpm exec <command>` |
| `npm uninstall <pkg>` | `pnpm remove <pkg>` |
| `npm update` | `pnpm update` |

#### CDK関連コマンド

```bash
# CDKコマンドの実行
pnpm cdk deploy --all
pnpm cdk destroy --all
pnpm cdk diff
pnpm cdk synth

# ビルド・テスト
pnpm build
pnpm test
pnpm lint
```

## コーディング規約

### TypeScript (CDK)

1. **命名規則**
   - クラス名: PascalCase (例: `WireguardVpcStack`)
   - 変数・関数名: camelCase (例: `createVpc`, `securityGroup`)
   - 定数: UPPER_SNAKE_CASE (例: `VPC_CIDR`, `WIREGUARD_PORT`)
   - インターフェース: PascalCase with `I` prefix (例: `IStackProps`)

2. **型定義**
   - 明示的な型定義を使用（型推論に頼りすぎない）
   - `any`型の使用を避ける
   - 必要に応じてカスタムインターフェースを定義

3. **CDK ベストプラクティス**
   - スタックは論理的な単位で分割（VPC、EC2、監視など）
   - リソースにわかりやすいIDを付与
   - タグ付けを徹底（Environment, Project, ManagedByなど）
   - リソースの削除ポリシーを明示的に設定
   - Outputs を活用して重要な情報を出力

4. **コメント**
   - クラスと重要な関数にはJSDocコメントを記述
   - 複雑なロジックには行コメントで説明を追加
   - 日本語コメントも可（プロジェクトが日本語ベースのため）

### Bash スクリプト

1. **シバン**
   - 常に `#!/bin/bash` で始める
   - 必要に応じて `set -euo pipefail` を使用

2. **エラーハンドリング**
   - 重要なコマンドの戻り値をチェック
   - エラーメッセージを標準エラー出力に出力

3. **変数**
   - 大文字のSNAKE_CASEを使用
   - 読み取り専用の変数には `readonly` を使用

4. **関数**
   - 複雑なロジックは関数に分割
   - 関数名は小文字のsnake_caseを使用

## ファイル構成規則

### ディレクトリ構造

```
cdk/                    # CDKプロジェクトルート
├── bin/               # CDK Appエントリーポイント
├── lib/               # スタック定義
├── test/              # テストコード
└── (設定ファイル)

scripts/               # 運用スクリプト
configs/               # 設定ファイル・テンプレート
docs/                  # ドキュメント
```

### ファイル命名規則

- CDKスタック: `{resource}-{purpose}-stack.ts` (例: `wireguard-vpc-stack.ts`)
- スクリプト: `{action}-{target}.sh` (例: `add-client.sh`)
- 設定テンプレート: `{name}.conf.template`
- ドキュメント: `{topic}.md` (小文字のケバブケース)

## セキュリティ要件

### 機密情報の取り扱い

1. **Git管理から除外**
   - 秘密鍵（`*.key`, `*.pem`）
   - WireGuard設定ファイル（`*.conf`、テンプレート以外）
   - AWS認証情報
   - 環境変数ファイル（`.env`）

2. **ハードコーディング禁止**
   - パスワード、APIキー、トークン
   - アクセスキー、シークレットキー
   - プライベートIPアドレス（設定可能にする）

3. **AWS Systems Manager Parameter Store の活用**
   - 設定値は Parameter Store に保存
   - SecureString を使用して暗号化

### セキュリティベストプラクティス

1. **最小権限の原則**
   - IAMロールは必要最小限の権限のみ付与
   - セキュリティグループは必要なポートのみ開放

2. **SSH無効化**
   - EC2へのアクセスはSystems Manager Session Managerのみ
   - ポート22は開放しない

3. **IMDSv2の強制**
   - EC2インスタンスでIMDSv2を必須化

## コスト最適化

### 設計時の考慮事項

1. **リソースの最小化**
   - 必要最小限のリソースのみデプロイ
   - NATゲートウェイは使用しない（パブリックサブネットのみ）

2. **削除の容易性**
   - スタック削除時にリソースが完全に削除されるよう設定
   - Elastic IPはスタックに紐付け

3. **モニタリング**
   - 無料枠のCloudWatch基本メトリクスを活用
   - カスタムメトリクスは最小限に

## テスト要件

### CDK テスト

1. **スナップショットテスト**
   - 各スタックの CloudFormation テンプレートをスナップショット
   - 意図しない変更を検出

2. **リソース検証**
   - 重要なリソースの存在確認
   - セキュリティグループルールの検証
   - タグの検証

3. **命名規則**
   - テストファイル: `{stack-name}.test.ts`
   - テストスイート: `describe('{Stack Name}', ...)`

## ドキュメント要件

### ドキュメント更新タイミング

以下の場合、関連するドキュメントを更新すること:

1. **アーキテクチャ変更時**
   - `docs/architecture.md` を更新
   - システム構成図の更新が必要な場合は明記

2. **新機能追加時**
   - `README.md` の機能リストを更新
   - `docs/user-guide.md` に使用方法を追記

3. **コスト構造変更時**
   - `docs/cost-analysis.md` を更新
   - `README.md` のコスト見積もりを更新

4. **トラブルシューティング追加時**
   - `docs/troubleshooting.md` に追記

5. **デプロイ手順変更時**
   - `docs/deployment-guide.md` を更新
   - `README.md` のクイックスタートを更新

### ドキュメント記載内容

- **具体的なコマンド例**: コピペで実行できるコマンドを記載
- **前提条件**: 必要なツールやバージョン情報
- **エラーハンドリング**: 予想されるエラーと対処法
- **参考リンク**: 公式ドキュメントへのリンク

## AWS リソース命名規則

### タグ付け標準

すべてのAWSリソースに以下のタグを付与:

```typescript
{
  Project: 'WireGuard-VPN',
  Environment: 'Production',
  ManagedBy: 'CDK',
  CostCenter: 'Infrastructure',
  Owner: '{your-name}',
  Purpose: 'Personal-VPN'
}
```

### リソース名

- VPC: `wireguard-vpc`
- サブネット: `wireguard-public-subnet-{az}`
- セキュリティグループ: `wireguard-sg`
- EC2インスタンス: `wireguard-server`
- IAMロール: `wireguard-ec2-role`
- CloudWatchダッシュボード: `wireguard-dashboard`

## エラーハンドリング

### CDK デプロイエラー

- エラーメッセージを確認し、根本原因を特定
- CloudFormation コンソールでスタックイベントを確認
- 必要に応じてロールバック

### WireGuard 設定エラー

- `/var/log/wireguard.log` を確認
- `wg show` コマンドで現在の状態を確認
- `systemctl status wg-quick@wg0` でサービス状態を確認

## 変更管理

### コード変更時のチェックリスト

1. [ ] TypeScript型チェック通過（`npm run build`）
2. [ ] Linting通過（`npm run lint`）
3. [ ] ユニットテスト通過（`npm test`）
4. [ ] CDK diff確認（`cdk diff`）
5. [ ] 関連ドキュメント更新
6. [ ] セキュリティレビュー（機密情報の確認）

### デプロイ前チェックリスト

1. [ ] AWS認証情報の確認
2. [ ] リージョン設定の確認（ap-northeast-1）
3. [ ] コスト見積もりの確認
4. [ ] バックアップの確認（既存リソースがある場合）
5. [ ] 削除ポリシーの確認

## Claude Code への追加指示

### コード生成時

1. **セキュリティを最優先**
   - 機密情報をハードコーディングしない
   - 最小権限の原則を守る
   - セキュリティグループは厳格に設定

2. **コスト意識**
   - 不要なリソースは作成しない
   - 削除が容易な設計を心がける

3. **可読性**
   - コメントを適切に追加
   - 変数名・関数名は意味が明確に
   - 複雑なロジックは分割

4. **テスタビリティ**
   - テスト可能な設計
   - ハードコーディングを避ける

### ドキュメント生成時

1. **実用性**
   - コピペで動作するコマンド例
   - トラブルシューティング情報を含める

2. **網羅性**
   - 前提条件を明記
   - エラーケースも記載

3. **保守性**
   - バージョン情報を含める
   - 更新日を記載

## 参考資料

- [AWS CDK TypeScript Best Practices](https://docs.aws.amazon.com/cdk/v2/guide/best-practices.html)
- [WireGuard Quick Start](https://www.wireguard.com/quickstart/)
- [AWS Systems Manager Session Manager](https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager.html)
- [TypeScript Coding Guidelines](https://github.com/microsoft/TypeScript/wiki/Coding-guidelines)

## 更新履歴

このファイルは会話中に必要に応じて更新してください。重要な設計決定や規約の追加があった場合、このセクションに記録します。

---

**注意**: このファイルに記載された規約に従ってコードを生成・修正してください。規約に違反する場合や、より良い代替案がある場合は、まずユーザーに確認してください。
