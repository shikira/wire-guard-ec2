# ユーザーガイド

このドキュメントでは、WireGuard VPN on EC2の日常的な使用方法と管理方法を説明します。

## 目次

- [VPN接続の基本](#vpn接続の基本)
- [クライアント管理](#クライアント管理)
- [設定のカスタマイズ](#設定のカスタマイズ)
- [パフォーマンス最適化](#パフォーマンス最適化)
- [セキュリティのベストプラクティス](#セキュリティのベストプラクティス)

## VPN接続の基本

### iPhone/iPadでの接続

1. **WireGuardアプリのダウンロード**
   - App Storeから「WireGuard」をダウンロード
   - 無料アプリです

2. **トンネルの追加**
   - アプリを開く
   - 右上の「+」ボタンをタップ
   - 「QRコードから作成」を選択
   - EC2上で生成されたQRコードをスキャン

3. **接続**
   - トンネル名をタップしてONにする
   - 「接続済み」と表示されれば成功

4. **切断**
   - トンネル名をタップしてOFFにする

### MacBookでの接続

1. **WireGuardアプリのダウンロード**
   ```bash
   # Homebrewでインストール
   brew install --cask wireguard-tools
   ```

2. **設定ファイルのインポート**
   - WireGuardアプリを起動
   - 「Import Tunnel(s) from File」
   - ダウンロードした`.conf`ファイルを選択

3. **接続**
   - トンネルを選択
   - 「Activate」ボタンをクリック

4. **切断**
   - 「Deactivate」ボタンをクリック

### 接続状態の確認

#### iOS/iPadOS
- WireGuardアプリで転送量を確認
- 「最新のハンドシェイク」が最近の時刻であることを確認

#### macOS
- メニューバーのWireGuardアイコンをクリック
- 転送量と最終ハンドシェイク時刻を確認

#### ブラウザで確認
```
https://ifconfig.me/
```
日本のIPアドレス（Elastic IP）が表示されればVPN経由で接続されています。

## クライアント管理

### 新しいクライアントの追加

```bash
# EC2インスタンスに接続
aws ssm start-session --target <instance-id>

# クライアント追加
sudo /usr/local/bin/add-client.sh <client-name>
```

**命名規則の推奨**:
- `iphone-yourname`
- `ipad-yourname`
- `macbook-yourname`
- `iphone-familymember`

### クライアントの削除

```bash
# クライアント削除
sudo /usr/local/bin/remove-client.sh <client-name>

# 確認プロンプト
Are you sure you want to remove client '<client-name>'? (y/n): y
```

削除すると、そのクライアントは即座に接続できなくなります。

### クライアント一覧の表示

```bash
# 登録済みクライアント一覧
sudo /usr/local/bin/list-clients.sh
```

**出力例**:
```
Active WireGuard Clients:
========================
1. iphone-shirasu (10.8.0.2) - Last seen: 2 minutes ago
2. ipad-shirasu (10.8.0.3) - Last seen: never
3. macbook-shirasu (10.8.0.4) - Last seen: 1 hour ago

Total: 3 clients
```

### 設定ファイルの再取得

設定ファイルを紛失した場合:

```bash
# 設定ファイルの表示
sudo cat /etc/wireguard/clients/<client-name>.conf

# QRコード再表示
sudo qrencode -t ansiutf8 < /etc/wireguard/clients/<client-name>.conf
```

## 設定のカスタマイズ

### スプリットトンネリング

すべてのトラフィックをVPN経由にせず、特定のサイトのみVPN経由にする設定。

#### クライアント設定の編集

デフォルト（フルトンネル）:
```ini
AllowedIPs = 0.0.0.0/0
```

スプリットトンネル（日本の特定サービスのみ）:
```ini
# 例: 特定のIPレンジのみVPN経由
AllowedIPs = 203.0.113.0/24, 198.51.100.0/24
```

**メリット**:
- データ転送量の削減（コスト削減）
- 一般的なWebブラウジングは直接接続で高速化
- 必要なサービスのみVPN経由

### DNS設定の変更

#### デフォルト設定
```ini
DNS = 8.8.8.8
```

#### カスタムDNS
```ini
# Cloudflare DNS
DNS = 1.1.1.1

# Google Public DNS（複数指定）
DNS = 8.8.8.8, 8.8.4.4

# DNS無効化（システムデフォルトを使用）
# DNS行を削除
```

### Keep Aliveの調整

モバイルネットワークで接続が切れやすい場合:

```ini
PersistentKeepalive = 25
```

値の調整:
- `15`: より頻繁（バッテリー消費増、安定性向上）
- `25`: 標準（推奨）
- `60`: 節電モード（接続安定性低下）

## パフォーマンス最適化

### 動画視聴の最適化

#### 推奨設定
1. **動画品質を調整**
   - 4K → 1080p: データ転送量約70%削減
   - 1080p → 720p: データ転送量約50%削減

2. **ダウンロードより streaming**
   - オフライン視聴用のダウンロードはVPN切断後に

3. **広告ブロッカーの使用**
   - データ転送量約20%削減
   - Safari Content Blocker推奨

### 接続速度の確認

```bash
# Speed test
https://fast.com/
https://speedtest.net/
```

**期待される速度**:
- ダウンロード: 30-100 Mbps
- アップロード: 10-50 Mbps
- Ping: 50-150 ms (距離による)

### 速度低下時の対処

1. **サーバー側CPU確認**
   ```bash
   # EC2インスタンスで実行
   top
   ```
   CPU使用率が80%超の場合、インスタンスタイプのアップグレードを検討

2. **同時接続数の確認**
   ```bash
   sudo wg show
   ```
   多数のpeerが接続中の場合、不要なクライアントを削除

3. **ネットワークの確認**
   - クライアント側のWi-Fi/4G/5G接続を確認
   - 他のアプリケーションのバックグラウンドダウンロードを停止

## セキュリティのベストプラクティス

### 鍵管理

1. **秘密鍵の保護**
   - デバイス外に保存しない
   - スクリーンショットを撮らない
   - メールやメッセージで送信しない

2. **定期的な鍵ローテーション**
   ```bash
   # 6ヶ月ごとに推奨
   # 古いクライアントを削除
   sudo /usr/local/bin/remove-client.sh old-client

   # 新しいクライアントを追加
   sudo /usr/local/bin/add-client.sh new-client
   ```

3. **不要なクライアントの削除**
   ```bash
   # 紛失したデバイスのクライアント削除
   sudo /usr/local/bin/remove-client.sh lost-iphone
   ```

### 接続監視

```bash
# 現在の接続を確認
sudo wg show

# 不審な接続がないか確認
# - 知らないエンドポイントIP
# - 異常に多いデータ転送量
```

### VPN使用時の注意事項

1. **公共Wi-Fiでは必ず接続**
   - カフェ、ホテル、空港などでは常時VPN接続

2. **重要な操作前に確認**
   ```
   https://ifconfig.me/
   ```
   日本のIPアドレスであることを確認

3. **ログアウトを忘れずに**
   - 共有デバイスでは使用後にVPN切断

### セキュリティインシデント対応

#### デバイス紛失時
```bash
# 即座にクライアント削除
sudo /usr/local/bin/remove-client.sh lost-device

# ログ確認
sudo journalctl -u wg-quick@wg0 -n 100
```

#### 不正アクセス疑い
```bash
# 全クライアント削除
sudo /usr/local/bin/remove-client.sh client1
sudo /usr/local/bin/remove-client.sh client2
# ...

# サーバー秘密鍵の再生成（全クライアント再設定が必要）
sudo systemctl stop wg-quick@wg0
sudo wg genkey | sudo tee /etc/wireguard/server_private.key
sudo wg pubkey < /etc/wireguard/server_private.key | sudo tee /etc/wireguard/server_public.key
# 設定ファイルを手動更新
sudo systemctl start wg-quick@wg0
```

## 日常的な使い方のヒント

### 出張時のチェックリスト

**出発前**:
- [ ] VPN接続テスト完了
- [ ] 全デバイスで設定完了
- [ ] Elastic IPアドレスをメモ
- [ ] 動画サービスのログイン確認

**滞在中**:
- [ ] 空港/ホテルで即座にVPN接続
- [ ] データ転送量の定期確認
- [ ] バッテリー残量に注意

**帰国後**:
- [ ] CDKスタック削除（コスト削減）
- [ ] CloudWatch費用確認

### コスト管理

```bash
# AWS Cost Explorerで確認
aws ce get-cost-and-usage \
  --time-period Start=2025-11-01,End=2025-11-30 \
  --granularity MONTHLY \
  --metrics BlendedCost \
  --filter file://filter.json
```

**目標コスト**:
- 10日間: $15-20
- 30日間: $40-50

### バックアップ

クライアント設定のバックアップ（ローカルマシン）:

```bash
# 安全な場所に保存
mkdir -p ~/Documents/wireguard-backup
cp ~/Downloads/client.conf ~/Documents/wireguard-backup/
chmod 600 ~/Documents/wireguard-backup/client.conf
```

**注意**: バックアップは暗号化された場所に保存してください。

## よくある質問（FAQ）

### Q1: VPN接続中にインターネットが遅くなりますか？

A: 通常、若干の遅延は発生しますが、動画視聴には十分な速度です。WireGuardは非常に高速なプロトコルです。

### Q2: バッテリー消費は増えますか？

A: 若干増えますが、最適化されているため大きな影響はありません。`PersistentKeepalive`を60秒に設定すると節電できます。

### Q3: 複数デバイスで同時接続できますか？

A: はい、最大10台まで同時接続可能です。

### Q4: VPN経由でNetflixやAmazon Primeを見れますか？

A: はい、日本のIPアドレス経由でアクセスできるため、日本のコンテンツを視聴できます。

### Q5: 接続が頻繁に切れます

A: `PersistentKeepalive = 25`を設定してください。モバイルネットワークでは特に有効です。

### Q6: 設定を間違えて削除してしまいました

A: EC2インスタンスから再度設定を取得できます（上記「設定ファイルの再取得」参照）。

## 次のステップ

- [トラブルシューティング](troubleshooting.md) で問題解決方法を確認
- [アーキテクチャ](architecture.md) でシステムの仕組みを理解
- [コスト分析](cost-analysis.md) で費用最適化を検討

## 参考資料

- [WireGuard公式ドキュメント](https://www.wireguard.com/)
- [iOS WireGuardアプリ](https://apps.apple.com/app/wireguard/id1441195209)
- [macOS WireGuardアプリ](https://apps.apple.com/app/wireguard/id1451685025)

---

**更新日**: 2025-11-17
**バージョン**: 1.0
