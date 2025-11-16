# デプロイメントガイド

このドキュメントでは、WireGuard VPN on EC2ソリューションの詳細なデプロイ手順を説明します。

## 目次

- [前提条件](#前提条件)
- [環境準備](#環境準備)
- [CDKプロジェクトのセットアップ](#cdkプロジェクトのセットアップ)
- [インフラのデプロイ](#インフラのデプロイ)
- [WireGuardサーバーの設定](#wireguardサーバーの設定)
- [クライアントの設定](#クライアントの設定)
- [動作確認](#動作確認)
- [スタックの削除](#スタックの削除)

## 前提条件

### 必要なツール

以下のツールがインストールされていることを確認してください:

| ツール | 最小バージョン | インストール確認コマンド |
|--------|--------------|----------------------|
| Node.js | 18.x | `node --version` |
| pnpm | 8.x | `pnpm --version` |
| AWS CLI | 2.x | `aws --version` |
| Git | 2.x | `git --version` |

### pnpmのインストール

pnpmがインストールされていない場合:

```bash
# npmを使用してpnpmをグローバルインストール
npm install -g pnpm

# またはHomebrewを使用 (macOS)
brew install pnpm

# バージョン確認
pnpm --version
```

### AWSアカウント要件

- AWSアカウントの作成済み
- 管理者権限またはCDKデプロイに必要な権限
- AWS CLIの設定済み

必要なIAM権限:
- EC2 (フル権限)
- VPC (フル権限)
- CloudFormation (フル権限)
- IAM (ロール/ポリシー作成)
- CloudWatch (フル権限)
- Systems Manager (フル権限)

## 環境準備

### 1. AWS CLI の設定

```bash
# AWS CLIの設定（対話式）
aws configure

# 入力項目
# - AWS Access Key ID
# - AWS Secret Access Key
# - Default region name: ap-northeast-1
# - Default output format: json
```

設定の確認:

```bash
# 設定確認
aws sts get-caller-identity

# 出力例
{
  "UserId": "AIDAXXXXXXXXXXXXXXXXX",
  "Account": "123456789012",
  "Arn": "arn:aws:iam::123456789012:user/your-username"
}
```

### 2. リポジトリのクローン

```bash
# GitHubからクローン
git clone https://github.com/yourusername/wire-guard-ec2.git

# ディレクトリに移動
cd wire-guard-ec2

# ブランチ確認
git branch
```

## CDKプロジェクトのセットアップ

### 1. 依存関係のインストール

```bash
# cdkディレクトリに移動
cd cdk

# pnpmで依存関係をインストール
pnpm install

# インストール完了確認
pnpm list --depth=0
```

**期待される出力**:

```
wire-guard-vpn@1.0.0 /Users/yourname/wire-guard-ec2/cdk
├── aws-cdk-lib@2.x.x
├── aws-cdk@2.x.x
├── constructs@10.x.x
├── typescript@5.x.x
└── ... (その他の依存関係)
```

### 2. TypeScriptのコンパイル

```bash
# TypeScriptをJavaScriptにコンパイル
pnpm build

# ビルド成功確認
ls -la dist/
```

### 3. CDK Bootstrapの実行

**重要**: 初回のみ実行が必要です。同じAWSアカウント・リージョンで既にBootstrapしている場合はスキップできます。

```bash
# Bootstrap実行
pnpm cdk bootstrap

# 実行例
pnpm cdk bootstrap aws://123456789012/ap-northeast-1
```

**出力例**:

```
✨  Bootstrapping environment aws://123456789012/ap-northeast-1...
✅  Environment aws://123456789012/ap-northeast-1 bootstrapped.
```

Bootstrapによって作成されるリソース:
- S3バケット (CDKアセット保存用)
- IAMロール (デプロイ用)
- ECRリポジトリ (コンテナイメージ用、本プロジェクトでは不使用)

### 4. CDKスタックの確認

```bash
# 利用可能なスタック一覧を表示
pnpm cdk list

# 期待される出力
WireguardVpcStack
WireguardEc2Stack
WireguardMonitoringStack
```

### 5. 差分確認 (推奨)

デプロイ前に作成されるリソースを確認:

```bash
# 全スタックの差分を表示
pnpm cdk diff --all
```

## インフラのデプロイ

### デプロイ手順

#### オプション1: 全スタック一括デプロイ (推奨)

```bash
# 全スタックをデプロイ
pnpm cdk deploy --all

# 確認プロンプトが表示されます
Do you wish to deploy these changes (y/n)? y
```

#### オプション2: スタック個別デプロイ

```bash
# 1. VPCスタックをデプロイ
pnpm cdk deploy WireguardVpcStack

# 2. EC2スタックをデプロイ
pnpm cdk deploy WireguardEc2Stack

# 3. 監視スタックをデプロイ
pnpm cdk deploy WireguardMonitoringStack
```

### デプロイの進行状況

デプロイ中は以下のような出力が表示されます:

```
✨  Synthesis time: 3.45s

WireguardVpcStack: deploying...
[0%] start: Publishing asset:xxxxx
[50%] success: Published asset:xxxxx
[100%] success: Published asset:xxxxx

WireguardVpcStack: creating CloudFormation changeset...
[██████████████████████████████████████████████████] (15/15)

 ✅  WireguardVpcStack

Stack ARN:
arn:aws:cloudformation:ap-northeast-1:123456789012:stack/WireguardVpcStack/xxxxx

✨  Deployment time: 120.45s

Outputs:
WireguardVpcStack.VpcId = vpc-0123456789abcdef0
WireguardVpcStack.PublicSubnetId = subnet-0123456789abcdef0
```

### 重要な出力情報

デプロイ完了後、以下の情報が出力されます。**必ずメモしてください**。

```
Outputs:
WireguardEc2Stack.InstanceId = i-0123456789abcdef0
WireguardEc2Stack.ElasticIP = 52.68.XXX.XXX
WireguardEc2Stack.ServerPublicKey = <server-public-key>
```

| 出力名 | 用途 |
|--------|------|
| InstanceId | EC2インスタンスへの接続に使用 |
| ElasticIP | クライアント設定に使用 |
| ServerPublicKey | クライアント設定に使用 |

## WireGuardサーバーの設定

### 1. EC2インスタンスへの接続

SSH不要でSession Managerを使用します:

```bash
# Session Managerで接続
aws ssm start-session --target <instance-id>

# 例
aws ssm start-session --target i-0123456789abcdef0
```

**成功時の出力**:

```
Starting session with SessionId: your-name-0123456789abcdef0
sh-4.2$
```

### 2. WireGuardのステータス確認

```bash
# rootユーザーに切り替え
sudo su -

# WireGuardサービスの状態確認
systemctl status wg-quick@wg0

# 期待される出力
● wg-quick@wg0.service - WireGuard via wg-quick(8) for wg0
   Loaded: loaded (/usr/lib/systemd/system/wg-quick@.service; enabled)
   Active: active (exited) since ...
```

### 3. WireGuard設定の確認

```bash
# 現在の設定を表示
wg show

# 出力例
interface: wg0
  public key: <server-public-key>
  private key: (hidden)
  listening port: 51820
```

### 4. 初期設定の完了確認

```bash
# IP転送の確認
cat /proc/sys/net/ipv4/ip_forward
# 出力: 1 (有効)

# iptablesルールの確認
iptables -t nat -L -n -v | grep MASQUERADE
# MASQUERADE ルールが存在することを確認
```

## クライアントの設定

### クライアント追加スクリプトの実行

EC2インスタンス上で実行:

```bash
# クライアント追加（例: iPhone用）
sudo /usr/local/bin/add-client.sh iphone-shirasu

# 出力例
Generating private key...
Generating public key...
Generating pre-shared key...
Adding client configuration to server...
Restarting WireGuard...

Client configuration:
======================
[Interface]
Address = 10.8.0.2/32
PrivateKey = <client-private-key>
DNS = 8.8.8.8

[Peer]
PublicKey = <server-public-key>
PresharedKey = <preshared-key>
Endpoint = 52.68.XXX.XXX:51820
AllowedIPs = 0.0.0.0/0
PersistentKeepalive = 25

QR Code:
```

### QRコードでの設定 (iPhone/iPad)

1. QRコードが表示されます
2. iPhoneでWireGuardアプリを開く
3. 「トンネルを追加」→「QRコードから作成」
4. 表示されたQRコードをスキャン
5. トンネル名を入力（例: "Japan VPN"）
6. 保存

### 手動設定 (MacBook)

設定ファイルをダウンロード:

```bash
# 設定ファイルの表示
cat /etc/wireguard/clients/iphone-shirasu.conf

# ローカルマシンにコピー（別のターミナルで実行）
aws ssm start-session --target <instance-id> \
  --document-name AWS-StartInteractiveCommand \
  --parameters command="cat /etc/wireguard/clients/iphone-shirasu.conf" > ~/wireguard-client.conf
```

MacBookでの設定:

1. WireGuardアプリをインストール
2. 「トンネルを追加」→「ファイルから作成」
3. ダウンロードした設定ファイルを選択
4. 保存

### 複数クライアントの追加

```bash
# iPad用
sudo /usr/local/bin/add-client.sh ipad-shirasu

# MacBook用
sudo /usr/local/bin/add-client.sh macbook-shirasu

# 家族用
sudo /usr/local/bin/add-client.sh iphone-family-member
```

### クライアント一覧の確認

```bash
# 登録されているクライアント一覧
sudo /usr/local/bin/list-clients.sh

# 出力例
Active WireGuard Clients:
========================
1. iphone-shirasu (10.8.0.2)
2. ipad-shirasu (10.8.0.3)
3. macbook-shirasu (10.8.0.4)

Total: 3 clients
```

## 動作確認

### 1. VPN接続の確立

#### iPhone/iPad

1. WireGuardアプリを開く
2. 作成したトンネルをタップして有効化
3. 「接続済み」と表示されることを確認

#### MacBook

1. WireGuardアプリを開く
2. トンネルを選択して「Activate」
3. ステータスが「Active」になることを確認

### 2. 接続の確認

#### クライアント側

```bash
# 割り当てられたIPアドレスの確認
# (WireGuardアプリのインターフェース情報を確認)

# ブラウザで確認
https://ifconfig.me/
# 日本のIPアドレス (Elastic IP) が表示されることを確認
```

#### サーバー側

```bash
# EC2インスタンスで接続状況を確認
sudo wg show

# 出力例
interface: wg0
  public key: <server-public-key>
  private key: (hidden)
  listening port: 51820

peer: <client-public-key>
  preshared key: (hidden)
  endpoint: XXX.XXX.XXX.XXX:XXXXX
  allowed ips: 10.8.0.2/32
  latest handshake: 30 seconds ago
  transfer: 1.52 MiB received, 15.23 MiB sent
```

**確認ポイント**:
- `latest handshake` が最近の時刻
- `transfer` でデータ転送が発生していること

### 3. 通信テスト

#### Pingテスト

```bash
# VPN接続中のクライアントで実行
ping -c 4 10.8.0.1

# 期待される出力
PING 10.8.0.1 (10.8.0.1): 56 data bytes
64 bytes from 10.8.0.1: icmp_seq=0 ttl=64 time=25.123 ms
64 bytes from 10.8.0.1: icmp_seq=1 ttl=64 time=24.987 ms
```

#### インターネット接続テスト

```bash
# ブラウザでアクセス
https://ifconfig.me/

# 日本のIPアドレスが表示されることを確認
52.68.XXX.XXX
```

#### DNS解決テスト

```bash
# ターミナルで実行
nslookup google.com

# 期待される出力
Server:		8.8.8.8
Address:	8.8.8.8#53

Non-authoritative answer:
Name:	google.com
Address: 142.250.XXX.XXX
```

### 4. 動画視聴テスト

日本の動画配信サービスにアクセスして、地域制限が解除されていることを確認:

- Netflix Japan
- Amazon Prime Video Japan
- YouTube (日本版)
- その他の日本国内サービス

## トラブルシューティング

詳細は [troubleshooting.md](troubleshooting.md) を参照してください。

### よくある問題

#### 接続できない

```bash
# サーバー側でファイアウォール確認
sudo iptables -L -n -v

# Security Group確認
aws ec2 describe-security-groups \
  --group-ids <security-group-id> \
  --query 'SecurityGroups[0].IpPermissions'
```

#### 通信が遅い

```bash
# サーバー側でCPU使用率確認
top

# ネットワーク使用状況確認
iftop
```

## スタックの削除

### 使用後の削除 (重要)

コストを抑えるため、使用後は必ずスタックを削除してください。

```bash
# 全スタックを削除
pnpm cdk destroy --all

# 確認プロンプト
Are you sure you want to delete: WireguardMonitoringStack, WireguardEc2Stack, WireguardVpcStack (y/n)? y
```

### 削除の進行状況

```bash
WireguardMonitoringStack: destroying...
[██████████████████████████████████████████████████] (5/5)

 ✅  WireguardMonitoringStack: destroyed

WireguardEc2Stack: destroying...
[██████████████████████████████████████████████████] (8/8)

 ✅  WireguardEc2Stack: destroyed

WireguardVpcStack: destroying...
[██████████████████████████████████████████████████] (6/6)

 ✅  WireguardVpcStack: destroyed
```

### 削除の確認

```bash
# CloudFormationスタックの確認
aws cloudformation list-stacks \
  --stack-status-filter DELETE_COMPLETE \
  --query 'StackSummaries[?contains(StackName, `Wireguard`)].StackName'

# 期待される出力
[
    "WireguardMonitoringStack",
    "WireguardEc2Stack",
    "WireguardVpcStack"
]
```

### リソース残存確認

念のため、以下のリソースが削除されていることを確認:

```bash
# EC2インスタンス
aws ec2 describe-instances \
  --filters "Name=tag:Project,Values=WireGuard-VPN" \
  --query 'Reservations[].Instances[].InstanceId'

# Elastic IP
aws ec2 describe-addresses \
  --filters "Name=tag:Project,Values=WireGuard-VPN" \
  --query 'Addresses[].PublicIp'

# VPC
aws ec2 describe-vpcs \
  --filters "Name=tag:Project,Values=WireGuard-VPN" \
  --query 'Vpcs[].VpcId'
```

すべて空の配列 `[]` が返されればOKです。

## 再デプロイ

次回使用時は、再度デプロイするだけです:

```bash
cd cdk
pnpm cdk deploy --all
```

以前の設定は残っていないため、新しい鍵が生成されます。クライアント設定も再度追加が必要です。

## まとめ

### デプロイチェックリスト

- [ ] AWS CLI設定完了
- [ ] pnpmインストール完了
- [ ] リポジトリクローン完了
- [ ] 依存関係インストール完了
- [ ] CDK Bootstrap完了
- [ ] 全スタックデプロイ完了
- [ ] Elastic IP取得確認
- [ ] WireGuardサーバー起動確認
- [ ] クライアント設定追加完了
- [ ] VPN接続テスト成功
- [ ] インターネット接続確認完了

### 次のステップ

- [ユーザーガイド](user-guide.md) でクライアント管理方法を確認
- [トラブルシューティング](troubleshooting.md) で問題対処法を確認
- [アーキテクチャ](architecture.md) でシステム構成を理解

## 参考資料

- [AWS CDK Workshop](https://cdkworkshop.com/)
- [WireGuard Quick Start](https://www.wireguard.com/quickstart/)
- [AWS Systems Manager Session Manager](https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager.html)
- [pnpm Documentation](https://pnpm.io/)

---

**更新日**: 2025-11-17
**バージョン**: 1.0
