# WireGuard VPN on AWS EC2

海外出張中にiPhoneから日本のVPNに接続するための、コスト最適化されたWireGuardベースのVPNソリューションです。

## 概要

このプロジェクトは、AWS CDK (TypeScript)を使用してWireGuard VPNサーバーをAWS EC2上に構築します。AWS Client VPNと比較して**62%のコスト削減**を実現し、10日間の利用で約$38.73（約5,800円）で運用可能です。

### 主な特徴

- **コスト効率**: AWS Client VPNと比較して62%安価（10日間で約$62の節約）
- **高性能**: WireGuardプロトコルによる高速で軽量なVPN接続
- **Infrastructure as Code**: AWS CDKによる完全自動化されたインフラ構築
- **マルチデバイス対応**: iPhone、iPad、MacBookなど最大10台のデバイスをサポート
- **簡単な運用**: スクリプトによるクライアント管理の自動化
- **監視機能**: CloudWatchによるリアルタイム監視とアラート
- **セキュリティ強化**: Pre-Shared Key (PSK)による認証強化

## コスト見積もり

### 10日間の利用コスト: **$38.73 (約5,800円)**

| 項目 | コスト |
|------|--------|
| EC2 t3.micro (240時間) | $3.07 |
| EBSストレージ (8GB) | $0.26 |
| データ転送OUT (300GB) | $34.20 |
| Elastic IP | $1.20 |
| **合計** | **$38.73** |

詳細なコスト分析は [docs/cost-analysis.md](docs/cost-analysis.md) を参照してください。

## アーキテクチャ

```
Internet
    │
    │ WireGuard UDP:51820
    │
    ▼
┌───────────────────────────────────────┐
│  AWS Tokyo Region (ap-northeast-1)    │
│                                        │
│  ┌──────────────────────────────┐    │
│  │  VPC (10.0.0.0/16)            │    │
│  │                                │    │
│  │  ┌─────────────────────────┐  │    │
│  │  │ Public Subnet           │  │    │
│  │  │                         │  │    │
│  │  │  ┌──────────────────┐  │  │    │
│  │  │  │ EC2 t3.micro     │  │  │    │
│  │  │  │ WireGuard Server │  │  │    │
│  │  │  │ + CloudWatch     │  │  │    │
│  │  │  └──────────────────┘  │  │    │
│  │  │         │               │  │    │
│  │  │    Elastic IP           │  │    │
│  │  └─────────────────────────┘  │    │
│  └──────────────────────────────┘    │
└───────────────────────────────────────┘
```

詳細なアーキテクチャは [docs/architecture.md](docs/architecture.md) を参照してください。

## 前提条件

- Node.js 18.x 以上
- pnpm 8.x 以上
- AWS CLI v2
- AWS CDK v2
- AWSアカウントとIAM権限
- WireGuardクライアントアプリ（iPhone/iPad/MacBook）

## ディレクトリ構成

```
wire-guard-ec2/
├── README.md                          # このファイル
├── CLAUDE.md                          # Claude Codeカスタムインストラクション
├── docs/
│   ├── architecture.md                # アーキテクチャ詳細
│   ├── cost-analysis.md               # コスト分析詳細
│   ├── deployment-guide.md            # デプロイメントガイド
│   ├── user-guide.md                  # ユーザーガイド
│   └── troubleshooting.md             # トラブルシューティング
├── cdk/
│   ├── bin/
│   │   └── wireguard-vpn.ts          # CDK Appエントリーポイント
│   ├── lib/
│   │   ├── wireguard-vpc-stack.ts    # VPCスタック
│   │   ├── wireguard-ec2-stack.ts    # EC2スタック
│   │   └── wireguard-monitoring-stack.ts  # 監視スタック
│   ├── test/
│   │   └── *.test.ts                 # ユニットテスト
│   ├── package.json
│   ├── tsconfig.json
│   ├── cdk.json
│   └── .gitignore
├── scripts/
│   ├── setup-wireguard.sh            # WireGuard初期セットアップ
│   ├── add-client.sh                 # クライアント追加
│   ├── remove-client.sh              # クライアント削除
│   ├── list-clients.sh               # クライアント一覧
│   ├── backup-config.sh              # 設定バックアップ
│   └── install-cloudwatch-agent.sh   # CloudWatch Agent設定
├── configs/
│   ├── wireguard/
│   │   ├── wg0.conf.template         # サーバー設定テンプレート
│   │   └── client.conf.template      # クライアント設定テンプレート
│   └── cloudwatch/
│       └── cloudwatch-config.json    # CloudWatch Agent設定
├── .gitignore
└── LICENSE
```

## クイックスタート

### 1. リポジトリのクローン

```bash
git clone https://github.com/yourusername/wire-guard-ec2.git
cd wire-guard-ec2
```

### 2. CDK依存関係のインストール

```bash
cd cdk
pnpm install
```

### 3. AWSアカウントの設定

```bash
# AWS CLIの設定
aws configure

# CDK Bootstrap（初回のみ）
pnpm cdk bootstrap
```

### 4. インフラのデプロイ

```bash
# スタックのデプロイ
pnpm cdk deploy --all

# 出力されるElastic IPアドレスをメモしてください
```

### 5. WireGuardクライアントの設定

```bash
# EC2インスタンスに接続（Session Manager経由）
aws ssm start-session --target <instance-id>

# クライアント設定の生成
sudo /usr/local/bin/add-client.sh client-name

# 出力されたQRコードをiPhoneでスキャン、または設定ファイルをダウンロード
```

### 6. VPN接続のテスト

- iPhoneのWireGuardアプリでVPNを有効化
- https://ifconfig.me/ で日本のIPアドレスが表示されることを確認

詳細な手順は [docs/deployment-guide.md](docs/deployment-guide.md) を参照してください。

## 使い方

### クライアントの追加

```bash
# EC2インスタンスに接続
aws ssm start-session --target <instance-id>

# クライアント追加
sudo /usr/local/bin/add-client.sh <client-name>
```

### クライアントの削除

```bash
sudo /usr/local/bin/remove-client.sh <client-name>
```

### クライアント一覧の確認

```bash
sudo /usr/local/bin/list-clients.sh
```

### インフラの削除

```bash
# 使用後は必ずスタックを削除してコストを節約
cd cdk
pnpm cdk destroy --all
```

詳細は [docs/user-guide.md](docs/user-guide.md) を参照してください。

## 監視とアラート

CloudWatchダッシュボードで以下のメトリクスを監視できます:

- CPU使用率
- ネットワーク送受信量
- ディスク使用率
- WireGuardアクティブ接続数

アラーム設定:
- CPU使用率 > 80% (5分間)
- ネットワーク異常検知
- インスタンスステータスチェック失敗

## セキュリティ

- **認証**: 公開鍵暗号 + Pre-Shared Key (PSK)
- **接続**: WireGuard (UDP 51820) のみ許可
- **管理**: AWS Systems Manager Session Manager（SSH不要）
- **暗号化**: ChaCha20-Poly1305

詳細なセキュリティベストプラクティスは [docs/architecture.md](docs/architecture.md) を参照してください。

## トラブルシューティング

よくある問題と解決方法は [docs/troubleshooting.md](docs/troubleshooting.md) を参照してください。

## ライセンス

MIT License - 詳細は [LICENSE](LICENSE) を参照してください。

## 貢献

Issue や Pull Request を歓迎します。

## 参考資料

- [WireGuard公式サイト](https://www.wireguard.com/)
- [AWS CDK TypeScript リファレンス](https://docs.aws.amazon.com/cdk/api/v2/docs/aws-construct-library.html)
- [AWS Systems Manager Session Manager](https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager.html)

## お問い合わせ

質問や問題がある場合は、GitHubのIssueを作成してください。
