# トラブルシューティング

このドキュメントでは、WireGuard VPN on EC2の一般的な問題と解決方法を説明します。

## 目次

- [接続の問題](#接続の問題)
- [パフォーマンスの問題](#パフォーマンスの問題)
- [デプロイの問題](#デプロイの問題)
- [設定の問題](#設定の問題)
- [コストの問題](#コストの問題)

## 接続の問題

### VPNに接続できない

#### 症状
- WireGuardアプリで接続ボタンを押しても接続されない
- 「Handshake failed」エラー

#### 原因と解決方法

**1. サーバーのElastic IPが変わった**

確認:
```bash
# 現在のElastic IP確認
aws ec2 describe-addresses \
  --filters "Name=tag:Project,Values=WireGuard-VPN" \
  --query 'Addresses[0].PublicIp'
```

解決:
- クライアント設定の`Endpoint`を新しいIPに更新
- 再デプロイした場合は新しい設定を取得

**2. Security Groupでポートが閉じている**

確認:
```bash
aws ec2 describe-security-groups \
  --group-ids <sg-id> \
  --query 'SecurityGroups[0].IpPermissions[?FromPort==`51820`]'
```

解決:
```bash
# CDKで修正してデプロイ
pnpm cdk deploy WireguardEc2Stack
```

**3. WireGuardサービスが停止している**

確認:
```bash
# EC2で実行
sudo systemctl status wg-quick@wg0
```

解決:
```bash
# サービス起動
sudo systemctl start wg-quick@wg0

# 自動起動有効化
sudo systemctl enable wg-quick@wg0
```

**4. クライアント設定が間違っている**

確認項目:
- `PrivateKey`: クライアントの秘密鍵
- `PublicKey`: サーバーの公開鍵（クライアント公開鍵ではない）
- `Endpoint`: 正しいElastic IP:51820
- `AllowedIPs`: 通常は`0.0.0.0/0`

### 接続は確立するがインターネットに繋がらない

#### 症状
- WireGuardは「接続済み」だがWebページが開かない
- `ping 10.8.0.1`は成功するが外部への通信が失敗

#### 原因と解決方法

**1. IP転送が無効**

確認:
```bash
# EC2で実行
cat /proc/sys/net/ipv4/ip_forward
# 出力: 1 (有効), 0 (無効)
```

解決:
```bash
# 一時的に有効化
sudo sysctl -w net.ipv4.ip_forward=1

# 永続的に有効化
echo "net.ipv4.ip_forward=1" | sudo tee -a /etc/sysctl.conf
sudo sysctl -p
```

**2. iptablesのNATルールが欠落**

確認:
```bash
# EC2で実行
sudo iptables -t nat -L -n -v | grep MASQUERADE
```

解決:
```bash
# NATルール追加
sudo iptables -t nat -A POSTROUTING -s 10.8.0.0/24 -o eth0 -j MASQUERADE
sudo iptables -A FORWARD -i wg0 -j ACCEPT

# 永続化（再起動後も有効）
sudo iptables-save | sudo tee /etc/iptables/rules.v4
```

**3. DNS解決の失敗**

確認:
```bash
# クライアントで実行
nslookup google.com
```

解決:
- クライアント設定に`DNS = 8.8.8.8`を追加
- または`DNS = 1.1.1.1, 8.8.8.8`で冗長化

### 接続が頻繁に切れる

#### 症状
- 数分おきに接続が切断される
- モバイルネットワークで特に発生

#### 解決方法

**1. PersistentKeepaliveの設定**

クライアント設定に追加:
```ini
[Peer]
PersistentKeepalive = 25
```

値の推奨:
- Wi-Fi: 60秒
- モバイル(4G/5G): 25秒
- 不安定なネットワーク: 15秒

**2. MTU調整**

クライアント設定:
```ini
[Interface]
MTU = 1280
```

試す値:
- デフォルト: 1420
- モバイル: 1280
- PPPoE環境: 1400

## パフォーマンスの問題

### 通信速度が遅い

#### 症状
- ダウンロード速度が1Mbps未満
- 動画が頻繁にバッファリング

#### 診断

**1. スピードテスト**

VPN接続前後で測定:
```
https://fast.com/
https://speedtest.net/
```

**2. サーバー側CPU確認**

```bash
# EC2で実行
top

# CPU使用率を確認
# 80%超の場合、インスタンスタイプアップグレードを検討
```

**3. ネットワーク帯域確認**

```bash
# EC2で実行
sudo iftop -i wg0
```

#### 解決方法

**1. インスタンスタイプのアップグレード**

```typescript
// cdk/lib/wireguard-ec2-stack.ts
instanceType: ec2.InstanceType.of(
  ec2.InstanceClass.T3,
  ec2.InstanceSize.SMALL  // microからsmallへ
)
```

再デプロイ:
```bash
pnpm cdk deploy WireguardEc2Stack
```

**2. 同時接続数の削減**

```bash
# 不要なクライアント削除
sudo /usr/local/bin/remove-client.sh unused-client
```

**3. クライアント側ネットワークの確認**

- Wi-Fiの5GHz帯を使用
- モバイルは4G/5Gの電波強度確認
- 他のアプリのバックグラウンド通信を停止

### Pingが高い (遅延)

#### 症状
- Ping: 200ms以上
- ゲームやビデオ通話でラグ

#### 原因
- 物理的な距離（海外→日本）
- ネットワーク経路

#### 解決方法

**現実的な期待値**:
- アジア圏: 50-100ms
- ヨーロッパ: 150-250ms
- 北米: 100-200ms

**改善策**:
- より近いAWSリージョンを使用（将来的に）
- スプリットトンネリングで重要な通信のみVPN経由

## デプロイの問題

### CDK Bootstrapが失敗する

#### エラーメッセージ
```
Error: Need to perform AWS calls for account XXX, but no credentials found
```

#### 解決方法

```bash
# AWS CLI設定確認
aws sts get-caller-identity

# 設定が必要な場合
aws configure
```

### CDK Deployが失敗する

#### エラー1: IAM権限不足

エラーメッセージ:
```
User: arn:aws:iam::XXX:user/YYY is not authorized to perform: XXX
```

解決:
- AWSアカウント管理者に必要な権限を依頼
- または管理者権限のあるユーザーで実行

#### エラー2: リソース名の競合

エラーメッセージ:
```
Resource of type 'AWS::EC2::VPC' with identifier 'XXX' already exists
```

解決:
```bash
# 既存スタック削除
pnpm cdk destroy --all

# 再デプロイ
pnpm cdk deploy --all
```

#### エラー3: EIPクォータ超過

エラーメッセージ:
```
The maximum number of addresses has been reached
```

解決:
```bash
# 未使用のEIP確認
aws ec2 describe-addresses \
  --query 'Addresses[?AssociationId==null].AllocationId'

# 未使用のEIP解放
aws ec2 release-address --allocation-id eipalloc-XXXXX
```

### UserData実行の失敗

#### 症状
- インスタンスは起動するがWireGuardが動かない

#### 確認

```bash
# EC2で実行
sudo cat /var/log/cloud-init-output.log

# エラーを確認
sudo grep -i error /var/log/cloud-init-output.log
```

#### 解決

UserDataスクリプトを修正してインスタンス再作成:
```bash
pnpm cdk destroy WireguardEc2Stack
pnpm cdk deploy WireguardEc2Stack
```

## 設定の問題

### クライアント追加スクリプトが動かない

#### エラー: コマンドが見つからない

```bash
# スクリプトの場所確認
ls -la /usr/local/bin/add-client.sh

# 存在しない場合、UserDataで配置されているか確認
sudo cat /var/log/cloud-init-output.log | grep add-client
```

#### エラー: Permission denied

```bash
# 権限確認
ls -la /usr/local/bin/add-client.sh

# 実行権限付与
sudo chmod +x /usr/local/bin/add-client.sh
```

### QRコードが表示されない

#### 原因
- `qrencode`がインストールされていない

#### 解決

```bash
# インストール
sudo yum install -y qrencode

# 再実行
sudo /usr/local/bin/add-client.sh client-name
```

### 設定ファイルが見つからない

#### 確認

```bash
# 設定ファイルの場所
sudo ls -la /etc/wireguard/
sudo ls -la /etc/wireguard/clients/
```

#### 解決

```bash
# ディレクトリ作成
sudo mkdir -p /etc/wireguard/clients

# クライアント再追加
sudo /usr/local/bin/add-client.sh client-name
```

## コストの問題

### 予想より高額な請求

#### 確認

```bash
# 今月のコスト確認
aws ce get-cost-and-usage \
  --time-period Start=$(date -u -d "$(date +%Y-%m-01)" +%Y-%m-%d),End=$(date -u +%Y-%m-%d) \
  --granularity MONTHLY \
  --metrics BlendedCost \
  --group-by Type=SERVICE
```

#### よくある原因

**1. データ転送量超過**

確認:
```bash
# CloudWatchでネットワーク使用量確認
aws cloudwatch get-metric-statistics \
  --namespace AWS/EC2 \
  --metric-name NetworkOut \
  --dimensions Name=InstanceId,Value=<instance-id> \
  --start-time $(date -u -d '30 days ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 86400 \
  --statistics Sum
```

対策:
- スプリットトンネリング設定
- 動画品質を下げる
- 不要な通信を停止

**2. スタック削除忘れ**

確認:
```bash
# 稼働中のスタック確認
aws cloudformation list-stacks \
  --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE \
  --query 'StackSummaries[?contains(StackName, `Wireguard`)].StackName'
```

対策:
```bash
# 即座に削除
pnpm cdk destroy --all
```

**3. Elastic IP未解放**

確認:
```bash
# 未割り当てのEIP確認
aws ec2 describe-addresses \
  --query 'Addresses[?AssociationId==null].[PublicIp,AllocationId]'
```

対策:
```bash
# 未使用のEIP解放
aws ec2 release-address --allocation-id eipalloc-XXXXX
```

**4. CloudWatchログ保持期間**

確認:
```bash
# ログ保持期間確認
aws logs describe-log-groups \
  --query 'logGroups[?contains(logGroupName, `wireguard`)].retentionInDays'
```

対策:
```bash
# 保持期間を7日に設定
aws logs put-retention-policy \
  --log-group-name /aws/ec2/wireguard \
  --retention-in-days 7
```

## 診断ツール

### 総合診断スクリプト

EC2インスタンスで実行:

```bash
#!/bin/bash
echo "=== WireGuard Diagnostics ==="
echo ""
echo "1. WireGuard Service Status:"
sudo systemctl status wg-quick@wg0 | head -10
echo ""
echo "2. WireGuard Interface:"
sudo wg show
echo ""
echo "3. IP Forwarding:"
cat /proc/sys/net/ipv4/ip_forward
echo ""
echo "4. NAT Rules:"
sudo iptables -t nat -L -n -v | grep MASQUERADE
echo ""
echo "5. Active Connections:"
sudo wg show wg0 peers
echo ""
echo "6. CPU Usage:"
top -bn1 | head -5
echo ""
echo "7. Disk Usage:"
df -h
echo ""
echo "8. Memory Usage:"
free -h
```

保存して実行:
```bash
chmod +x ~/diagnostics.sh
./diagnostics.sh
```

## サポートとヘルプ

### ログの収集

問題報告時に以下のログを収集:

```bash
# WireGuardログ
sudo journalctl -u wg-quick@wg0 -n 100 > wireguard.log

# システムログ
sudo tail -100 /var/log/messages > system.log

# Cloud-initログ
sudo cat /var/log/cloud-init-output.log > cloudinit.log

# 圧縮
tar -czf logs.tar.gz wireguard.log system.log cloudinit.log
```

### GitHub Issueの作成

以下の情報を含めてください:

1. **環境情報**
   - OS (iOS/macOS/Windows)
   - WireGuardバージョン
   - インスタンスタイプ

2. **問題の詳細**
   - 症状
   - 再現手順
   - エラーメッセージ

3. **ログ**
   - 上記で収集したログファイル

4. **試した対処法**
   - このドキュメントで試した項目

## まとめ

### トラブルシューティングフローチャート

```
問題発生
  ↓
接続できない？
  → YES: Security Group確認 → WireGuardサービス確認
  → NO: ↓

遅い？
  → YES: CPU確認 → 同時接続数確認 → インスタンス強化
  → NO: ↓

コストが高い？
  → YES: データ転送量確認 → スタック削除忘れ確認
  → NO: ↓

その他
  → ログ確認 → GitHub Issue作成
```

## 参考資料

- [WireGuard Troubleshooting](https://www.wireguard.com/quickstart/#debugging)
- [AWS Support](https://console.aws.amazon.com/support/)
- [CloudWatch Logs Insights](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/AnalyzingLogData.html)

---

**更新日**: 2025-11-17
**バージョン**: 1.0
