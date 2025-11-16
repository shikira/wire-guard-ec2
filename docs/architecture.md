# アーキテクチャ詳細

このドキュメントでは、WireGuard VPN on EC2ソリューションの詳細なアーキテクチャについて説明します。

## 目次

- [システム概要](#システム概要)
- [ネットワークアーキテクチャ](#ネットワークアーキテクチャ)
- [コンポーネント詳細](#コンポーネント詳細)
- [セキュリティアーキテクチャ](#セキュリティアーキテクチャ)
- [監視アーキテクチャ](#監視アーキテクチャ)
- [データフロー](#データフロー)
- [スケーラビリティ](#スケーラビリティ)

## システム概要

### アーキテクチャ図

```
┌─────────────────────────────────────────────────────────┐
│                     Internet                             │
│  ┌────────┐  ┌────────┐  ┌──────────┐                  │
│  │ iPhone │  │  iPad  │  │ MacBook  │                  │
│  └───┬────┘  └───┬────┘  └─────┬────┘                  │
│      │           │              │                        │
│      └───────────┴──────────────┘                        │
│                  │                                        │
│           WireGuard Protocol                             │
│           UDP Port 51820                                 │
└──────────────────┼──────────────────────────────────────┘
                   │
                   │ Encrypted VPN Tunnel
                   │
┌──────────────────▼──────────────────────────────────────┐
│             AWS Tokyo Region                             │
│            (ap-northeast-1)                              │
│                                                           │
│  ┌─────────────────────────────────────────────────┐   │
│  │  VPC: 10.0.0.0/16                               │   │
│  │                                                   │   │
│  │  ┌────────────────────────────────────────────┐ │   │
│  │  │  Public Subnet: 10.0.1.0/24                │ │   │
│  │  │  Availability Zone: ap-northeast-1a        │ │   │
│  │  │                                             │ │   │
│  │  │  ┌───────────────────────────────────┐    │ │   │
│  │  │  │  EC2 Instance                      │    │ │   │
│  │  │  │  - Instance Type: t3.micro         │    │ │   │
│  │  │  │  - OS: Amazon Linux 2023           │    │ │   │
│  │  │  │  - Private IP: 10.0.1.x            │    │ │   │
│  │  │  │                                     │    │ │   │
│  │  │  │  Components:                       │    │ │   │
│  │  │  │  ┌──────────────────────┐         │    │ │   │
│  │  │  │  │  WireGuard Server    │         │    │ │   │
│  │  │  │  │  VPN: 10.8.0.1/24    │         │    │ │   │
│  │  │  │  └──────────────────────┘         │    │ │   │
│  │  │  │  ┌──────────────────────┐         │    │ │   │
│  │  │  │  │  CloudWatch Agent    │         │    │ │   │
│  │  │  │  └──────────────────────┘         │    │ │   │
│  │  │  │  ┌──────────────────────┐         │    │ │   │
│  │  │  │  │  SSM Agent           │         │    │ │   │
│  │  │  │  └──────────────────────┘         │    │ │   │
│  │  │  └───────────────┬───────────────────┘    │ │   │
│  │  │                  │                         │ │   │
│  │  │            Elastic IP                      │ │   │
│  │  │         (Public IPv4)                      │ │   │
│  │  │                                             │ │   │
│  │  └────────────────────────────────────────────┘ │   │
│  │                                                   │   │
│  │  ┌────────────────────────────────────────────┐ │   │
│  │  │  Security Group: wireguard-sg              │ │   │
│  │  │  ┌──────────────────────────────────────┐ │ │   │
│  │  │  │  Inbound Rules:                      │ │ │   │
│  │  │  │  - UDP 51820 from 0.0.0.0/0          │ │ │   │
│  │  │  │                                       │ │ │   │
│  │  │  │  Outbound Rules:                     │ │ │   │
│  │  │  │  - All traffic to 0.0.0.0/0          │ │ │   │
│  │  │  └──────────────────────────────────────┘ │ │   │
│  │  └────────────────────────────────────────────┘ │   │
│  │                                                   │   │
│  │  ┌────────────────────────────────────────────┐ │   │
│  │  │  Internet Gateway                          │ │   │
│  │  └───────────────┬────────────────────────────┘ │   │
│  │                  │                               │   │
│  │  ┌───────────────▼────────────────────────────┐ │   │
│  │  │  Route Table (Public)                      │ │   │
│  │  │  - 0.0.0.0/0 → Internet Gateway            │ │   │
│  │  │  - 10.0.0.0/16 → Local                     │ │   │
│  │  └────────────────────────────────────────────┘ │   │
│  └─────────────────────────────────────────────────┘   │
│                                                           │
│  ┌─────────────────────────────────────────────────┐   │
│  │  IAM Role: wireguard-ec2-role                   │   │
│  │  - CloudWatchAgentServerPolicy                  │   │
│  │  - AmazonSSMManagedInstanceCore                 │   │
│  │  - Custom Policy (SSM Parameter Store Read)     │   │
│  └─────────────────────────────────────────────────┘   │
│                                                           │
│  ┌─────────────────────────────────────────────────┐   │
│  │  CloudWatch                                      │   │
│  │  ┌───────────────────────────────────────────┐ │   │
│  │  │  Metrics:                                  │ │   │
│  │  │  - CPUUtilization                          │ │   │
│  │  │  - NetworkIn / NetworkOut                  │ │   │
│  │  │  - DiskReadBytes / DiskWriteBytes          │ │   │
│  │  │  - Custom: WireGuard Active Connections    │ │   │
│  │  └───────────────────────────────────────────┘ │   │
│  │  ┌───────────────────────────────────────────┐ │   │
│  │  │  Alarms:                                   │ │   │
│  │  │  - High CPU (> 80% for 5 min)              │ │   │
│  │  │  - Instance Status Check Failed            │ │   │
│  │  │  - High Network Traffic                    │ │   │
│  │  └───────────────────────────────────────────┘ │   │
│  │  ┌───────────────────────────────────────────┐ │   │
│  │  │  Logs:                                     │ │   │
│  │  │  - /var/log/wireguard.log                  │ │   │
│  │  │  - /var/log/messages                       │ │   │
│  │  │  - CloudWatch Agent logs                   │ │   │
│  │  └───────────────────────────────────────────┘ │   │
│  └─────────────────────────────────────────────────┘   │
│                                                           │
│  ┌─────────────────────────────────────────────────┐   │
│  │  Systems Manager                                 │   │
│  │  - Session Manager (EC2アクセス)                 │   │
│  │  - Parameter Store (設定管理)                    │   │
│  └─────────────────────────────────────────────────┘   │
└───────────────────────────────────────────────────────────┘
```

### システムコンポーネント

1. **VPNクライアント** (iPhone, iPad, MacBook)
2. **AWS VPC** (仮想プライベートクラウド)
3. **EC2インスタンス** (WireGuardサーバー)
4. **CloudWatch** (監視・ログ管理)
5. **Systems Manager** (管理・運用)

## ネットワークアーキテクチャ

### VPC設計

#### CIDR ブロック

| コンポーネント | CIDR | 用途 |
|--------------|------|------|
| VPC | 10.0.0.0/16 | 全体のネットワーク範囲 (65,536 IP) |
| Public Subnet | 10.0.1.0/24 | EC2インスタンス配置 (256 IP) |
| WireGuard VPN | 10.8.0.0/24 | VPNクライアントネットワーク (256 IP) |

#### IP アドレス割り当て

- **VPCサーバー**: 10.0.1.x (EC2のプライベートIP、自動割り当て)
- **WireGuard VPN ゲートウェイ**: 10.8.0.1
- **VPN クライアント**: 10.8.0.2 - 10.8.0.254

### ルーティング

#### パブリックサブネットルートテーブル

| Destination | Target | 説明 |
|-------------|--------|------|
| 10.0.0.0/16 | local | VPC内通信 |
| 0.0.0.0/0 | igw-xxxxx | インターネット向けトラフィック |

#### WireGuard ルーティング

クライアントからのトラフィックは以下のようにルーティングされます:

```
クライアント (10.8.0.x)
    ↓
WireGuard インターフェース (wg0)
    ↓
EC2 カーネル (IP転送有効)
    ↓
eth0 (10.0.1.x)
    ↓
Internet Gateway
    ↓
インターネット
```

### NAT設定

EC2インスタンス上でIPマスカレード(SNAT)を設定:

```bash
iptables -t nat -A POSTROUTING -s 10.8.0.0/24 -o eth0 -j MASQUERADE
```

これにより、VPNクライアントからのトラフィックがEC2インスタンスのパブリックIPからインターネットへ送出されます。

## コンポーネント詳細

### EC2インスタンス

#### インスタンススペック

| 項目 | 仕様 |
|------|------|
| インスタンスタイプ | t3.micro |
| vCPU | 2 |
| メモリ | 1 GiB |
| ネットワーク性能 | Up to 5 Gigabit |
| EBS最適化 | デフォルトで有効 |
| OS | Amazon Linux 2023 |

#### ストレージ

| ボリューム | タイプ | サイズ | IOPS | スループット |
|-----------|--------|------|------|-------------|
| Root | gp3 | 8 GB | 3000 | 125 MB/s |

#### UserData起動スクリプト

インスタンス起動時に以下の処理を自動実行:

1. システムアップデート
2. WireGuardインストール
3. カーネルパラメータ設定(IP転送有効化)
4. iptables設定(NAT/マスカレード)
5. CloudWatch Agentインストールと設定
6. WireGuard自動起動設定

### WireGuard Server

#### 設定ファイル: `/etc/wireguard/wg0.conf`

```ini
[Interface]
Address = 10.8.0.1/24
ListenPort = 51820
PrivateKey = <server-private-key>

# IP転送
PostUp = echo 1 > /proc/sys/net/ipv4/ip_forward
PostUp = iptables -A FORWARD -i wg0 -j ACCEPT
PostUp = iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE

PostDown = iptables -D FORWARD -i wg0 -j ACCEPT
PostDown = iptables -t nat -D POSTROUTING -o eth0 -j MASQUERADE

# クライアント設定は add-client.sh により動的追加
[Peer]
PublicKey = <client-public-key>
PresharedKey = <preshared-key>
AllowedIPs = 10.8.0.2/32

[Peer]
PublicKey = <client-public-key>
PresharedKey = <preshared-key>
AllowedIPs = 10.8.0.3/32

# ... (最大10台)
```

#### WireGuard プロトコル仕様

- **暗号化**: ChaCha20-Poly1305 (AEAD)
- **鍵交換**: Curve25519
- **ハッシュ**: BLAKE2s
- **トランスポート**: UDP (ポート51820)
- **認証**: 公開鍵暗号 + Pre-Shared Key (PSK)

### IAM ロール

#### 権限ポリシー

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "cloudwatch:PutMetricData",
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents",
        "logs:DescribeLogStreams"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "ssm:GetParameter",
        "ssm:GetParameters",
        "ssm:PutParameter"
      ],
      "Resource": "arn:aws:ssm:ap-northeast-1:*:parameter/wireguard/*"
    }
  ]
}
```

## セキュリティアーキテクチャ

### 多層防御

```
┌─────────────────────────────────────────┐
│ Layer 1: Network Security               │
│ - Security Group (UDP 51820のみ)        │
│ - VPC Isolation                         │
└─────────────────────────────────────────┘
            ↓
┌─────────────────────────────────────────┐
│ Layer 2: Authentication                 │
│ - WireGuard Public Key Authentication   │
│ - Pre-Shared Key (PSK)                  │
└─────────────────────────────────────────┘
            ↓
┌─────────────────────────────────────────┐
│ Layer 3: Encryption                     │
│ - ChaCha20-Poly1305 (データ暗号化)      │
│ - Perfect Forward Secrecy               │
└─────────────────────────────────────────┘
            ↓
┌─────────────────────────────────────────┐
│ Layer 4: Access Control                 │
│ - IAM Role (最小権限)                   │
│ - Session Manager (SSHレス)             │
└─────────────────────────────────────────┘
            ↓
┌─────────────────────────────────────────┐
│ Layer 5: Monitoring & Audit             │
│ - CloudWatch Logs                       │
│ - CloudWatch Alarms                     │
└─────────────────────────────────────────┘
```

### 脅威モデルと対策

| 脅威 | 対策 | 実装 |
|------|------|------|
| 不正アクセス | 公開鍵認証 + PSK | WireGuard設定 |
| DoS攻撃 | Security Group制限 | AWS Security Group |
| 中間者攻撃 | 暗号化通信 | WireGuard TLS |
| 権限昇格 | 最小権限IAM | IAM Role Policy |
| ログ改ざん | CloudWatch Logs | 中央ログ管理 |
| SSHブルートフォース | SSH無効化 | Session Manager使用 |

### 鍵管理

#### 鍵の種類と保管場所

| 鍵の種類 | 保管場所 | アクセス方法 |
|---------|---------|------------|
| サーバー秘密鍵 | EC2インスタンス `/etc/wireguard/` | root権限のみ |
| サーバー公開鍵 | クライアント設定ファイル | 配布 |
| クライアント秘密鍵 | クライアントデバイス | デバイスのみ |
| クライアント公開鍵 | サーバー設定ファイル | add-client.sh |
| Pre-Shared Key | サーバー・クライアント両方 | 暗号化保存 |

#### 鍵のライフサイクル

1. **生成**: `wg genkey` コマンドによるランダム生成
2. **配布**: QRコードまたは暗号化ファイル転送
3. **保管**: ファイルシステム権限600 (rw-------)
4. **ローテーション**: 推奨6ヶ月ごと
5. **破棄**: セキュアワイプ (`shred -u`)

## 監視アーキテクチャ

### CloudWatch メトリクス

#### 標準メトリクス (無料)

| メトリクス | 説明 | アラーム閾値 |
|-----------|------|-------------|
| CPUUtilization | CPU使用率 | > 80% (5分間) |
| NetworkIn | 受信バイト数 | 監視のみ |
| NetworkOut | 送信バイト数 | 監視のみ |
| StatusCheckFailed | ステータスチェック | >= 1 |

#### カスタムメトリクス

| メトリクス | 説明 | 収集間隔 |
|-----------|------|---------|
| WireGuardConnections | アクティブ接続数 | 1分 |
| WireGuardHandshakes | ハンドシェイク成功率 | 5分 |
| DiskUsage | ディスク使用率 | 5分 |

### CloudWatch Logs

#### ログストリーム

1. `/var/log/wireguard.log` - WireGuard接続ログ
2. `/var/log/messages` - システムログ
3. `/opt/aws/amazon-cloudwatch-agent/logs/` - CloudWatch Agentログ

#### ログ保持期間

- デフォルト: 7日間
- 必要に応じて延長可能

### CloudWatch Alarms

#### アラーム一覧

| アラーム名 | 条件 | アクション |
|-----------|------|----------|
| HighCPUAlarm | CPUUtilization > 80% (5分間) | SNS通知 |
| StatusCheckAlarm | StatusCheckFailed >= 1 | SNS通知 |
| HighNetworkOut | NetworkOut > 10GB/hour | SNS通知 (コスト監視) |

## データフロー

### VPN接続確立フロー

```
1. クライアント: WireGuard設定ファイル読み込み
      ↓
2. クライアント: サーバーの公開鍵確認
      ↓
3. クライアント → サーバー: ハンドシェイクパケット送信 (UDP 51820)
      ↓
4. サーバー: クライアント公開鍵検証
      ↓
5. サーバー → クライアント: ハンドシェイク応答
      ↓
6. クライアント: セッション鍵生成
      ↓
7. VPN接続確立 (10.8.0.x割り当て)
```

### データ転送フロー

```
iPhone (動画視聴リクエスト)
    ↓
1. アプリ → WireGuard Client: HTTPSリクエスト
    ↓
2. WireGuard Client: パケット暗号化 (ChaCha20-Poly1305)
    ↓
3. iPhone → Internet: 暗号化UDPパケット送信
    ↓
4. Internet → EC2 (Elastic IP): UDPパケット到着
    ↓
5. Security Group: UDP 51820許可チェック
    ↓
6. WireGuard Server: パケット復号化
    ↓
7. EC2 Kernel: ルーティング判定
    ↓
8. iptables: NATテーブル処理 (MASQUERADE)
    ↓
9. EC2 → Internet: HTTPSリクエスト送信 (送信元: Elastic IP)
    ↓
10. 動画サーバー: レスポンス返送
    ↓
11. Internet → EC2: HTTPSレスポンス到着
    ↓
12. iptables: NAT逆変換
    ↓
13. WireGuard Server: パケット暗号化
    ↓
14. EC2 → Internet: 暗号化UDPパケット送信
    ↓
15. Internet → iPhone: UDPパケット到着
    ↓
16. WireGuard Client: パケット復号化
    ↓
17. アプリ: 動画データ受信・再生
```

## スケーラビリティ

### 現在の設計

- **同時接続数**: 最大10台
- **想定同時利用**: 2-3名
- **インスタンス**: t3.micro (単一インスタンス)

### スケールアップ戦略

#### 垂直スケーリング (インスタンスタイプ変更)

| 接続数 | 推奨インスタンス | vCPU | メモリ | 月額コスト (東京) |
|--------|----------------|------|--------|------------------|
| ~10台 | t3.micro | 2 | 1 GB | ~$9.40 |
| ~25台 | t3.small | 2 | 2 GB | ~$18.80 |
| ~50台 | t3.medium | 2 | 4 GB | ~$37.60 |
| 100台~ | t3.large | 2 | 8 GB | ~$75.20 |

#### 水平スケーリング (複数インスタンス)

複数リージョン展開が必要な場合:

```
┌─────────────────┐    ┌─────────────────┐
│  Tokyo Region   │    │  Singapore      │
│  WireGuard-JP   │    │  WireGuard-SG   │
│  10.8.0.0/24    │    │  10.9.0.0/24    │
└─────────────────┘    └─────────────────┘
```

### 高可用性設計 (オプション)

本プロジェクトでは単一インスタンスですが、高可用性が必要な場合:

```
┌──────────────────────────────────────┐
│  Auto Scaling Group                  │
│  ┌────────────┐    ┌────────────┐   │
│  │  EC2 (1a)  │    │  EC2 (1c)  │   │
│  │  Active    │    │  Standby   │   │
│  └────────────┘    └────────────┘   │
└──────────────────────────────────────┘
            ↓                ↓
    Elastic IP (フェイルオーバー)
```

## まとめ

本アーキテクチャは以下の特徴を持ちます:

1. **シンプル**: 単一EC2インスタンスで構築
2. **セキュア**: 多層防御によるセキュリティ確保
3. **コスト効率**: 最小限のリソースで運用
4. **監視**: CloudWatchによる包括的な監視
5. **運用性**: Systems Managerによる簡単な管理

## 参考資料

- [WireGuard Protocol Overview](https://www.wireguard.com/protocol/)
- [AWS VPC User Guide](https://docs.aws.amazon.com/vpc/latest/userguide/)
- [Amazon EC2 Instance Types](https://aws.amazon.com/ec2/instance-types/)
- [AWS Systems Manager Session Manager](https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager.html)

---

**更新日**: 2025-11-17
**バージョン**: 1.0
