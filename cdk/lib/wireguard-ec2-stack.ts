import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

/**
 * WireGuard EC2 Stack Props
 */
export interface WireguardEc2StackProps extends cdk.StackProps {
  vpc: ec2.IVpc;
  publicSubnet: ec2.ISubnet;
}

/**
 * WireGuard EC2 Stack
 *
 * このスタックはWireGuard VPNサーバーを実行するEC2インスタンスとの関連リソースを作成します。
 *
 * 主要なリソース:
 * - EC2インスタンス (t3.micro, Amazon Linux 2023)
 * - Security Group (UDP 51820)
 * - Elastic IP
 * - IAM Role (SSM, CloudWatch権限)
 * - UserData (WireGuardインストール・設定)
 */
export class WireguardEc2Stack extends cdk.Stack {
  public readonly instance: ec2.Instance;
  public readonly elasticIp: ec2.CfnEIP;
  public readonly securityGroup: ec2.SecurityGroup;

  // 定数定義
  private readonly WIREGUARD_PORT = 51820;
  private readonly VPN_NETWORK_CIDR = '10.8.0.0/24';
  private readonly SERVER_VPN_IP = '10.8.0.1';

  constructor(scope: Construct, id: string, props: WireguardEc2StackProps) {
    super(scope, id, props);

    // Security Group作成
    this.securityGroup = this.createSecurityGroup(props.vpc);

    // IAM Role作成
    const instanceRole = this.createInstanceRole();

    // EC2インスタンス作成
    this.instance = this.createInstance(props, instanceRole);

    // Elastic IP作成と関連付け
    this.elasticIp = this.createElasticIp();

    // Outputs
    this.createOutputs();
  }

  /**
   * Security Groupの作成
   */
  private createSecurityGroup(vpc: ec2.IVpc): ec2.SecurityGroup {
    const sg = new ec2.SecurityGroup(this, 'WireguardSecurityGroup', {
      vpc,
      description: 'Security Group for WireGuard VPN Server',
      allowAllOutbound: true,
    });

    // WireGuardポート（UDP 51820）を許可
    sg.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.udp(this.WIREGUARD_PORT),
      'Allow WireGuard VPN connections'
    );

    // タグ付け
    cdk.Tags.of(sg).add('Name', 'wireguard-sg');
    cdk.Tags.of(sg).add('Project', 'WireGuard-VPN');

    return sg;
  }

  /**
   * IAM Roleの作成
   */
  private createInstanceRole(): iam.Role {
    const role = new iam.Role(this, 'WireguardInstanceRole', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      description: 'IAM Role for WireGuard EC2 Instance',
      managedPolicies: [
        // Systems Manager (Session Manager)用
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'),
        // CloudWatch Agent用
        iam.ManagedPolicy.fromAwsManagedPolicyName('CloudWatchAgentServerPolicy'),
      ],
    });

    // Parameter Store読み取り権限（WireGuard設定用）
    role.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['ssm:GetParameter', 'ssm:GetParameters', 'ssm:PutParameter'],
        resources: [
          `arn:aws:ssm:${this.region}:${this.account}:parameter/wireguard/*`,
        ],
      })
    );

    return role;
  }

  /**
   * EC2インスタンスの作成
   */
  private createInstance(
    props: WireguardEc2StackProps,
    role: iam.Role
  ): ec2.Instance {
    // Amazon Linux 2023の最新AMI取得
    const ami = ec2.MachineImage.latestAmazonLinux2023({
      cpuType: ec2.AmazonLinuxCpuType.X86_64,
    });

    // UserDataスクリプト生成
    const userData = this.createUserData();

    const instance = new ec2.Instance(this, 'WireguardInstance', {
      vpc: props.vpc,
      vpcSubnets: {
        subnets: [props.publicSubnet],
      },
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MICRO),
      machineImage: ami,
      securityGroup: this.securityGroup,
      role,
      userData,
      requireImdsv2: true, // IMDSv2強制（セキュリティベストプラクティス）
      blockDevices: [
        {
          deviceName: '/dev/xvda',
          volume: ec2.BlockDeviceVolume.ebs(8, {
            volumeType: ec2.EbsDeviceVolumeType.GP3,
            encrypted: true,
            deleteOnTermination: true,
          }),
        },
      ],
    });

    // タグ付け
    cdk.Tags.of(instance).add('Name', 'wireguard-server');
    cdk.Tags.of(instance).add('Project', 'WireGuard-VPN');
    cdk.Tags.of(instance).add('Environment', 'Production');
    cdk.Tags.of(instance).add('ManagedBy', 'CDK');

    return instance;
  }

  /**
   * UserDataスクリプトの作成
   */
  private createUserData(): ec2.UserData {
    const userData = ec2.UserData.forLinux();

    userData.addCommands(
      '#!/bin/bash',
      'set -euxo pipefail',
      '',
      '# ログ設定',
      'exec > >(tee /var/log/user-data.log)',
      'exec 2>&1',
      '',
      '# システムアップデート',
      'dnf update -y',
      '',
      '# WireGuardインストール',
      'dnf install -y wireguard-tools qrencode',
      '',
      '# IP転送を有効化',
      'echo "net.ipv4.ip_forward=1" >> /etc/sysctl.conf',
      'sysctl -p',
      '',
      '# WireGuard設定ディレクトリ作成',
      'mkdir -p /etc/wireguard/clients',
      'chmod 700 /etc/wireguard',
      'chmod 700 /etc/wireguard/clients',
      '',
      '# サーバー鍵生成',
      'wg genkey | tee /etc/wireguard/server_private.key | wg pubkey > /etc/wireguard/server_public.key',
      'chmod 600 /etc/wireguard/server_private.key',
      'chmod 644 /etc/wireguard/server_public.key',
      '',
      '# サーバー設定ファイル作成',
      'cat > /etc/wireguard/wg0.conf << EOF',
      '[Interface]',
      `Address = ${this.SERVER_VPN_IP}/24`,
      'SaveConfig = false',
      `ListenPort = ${this.WIREGUARD_PORT}`,
      'PrivateKey = $(cat /etc/wireguard/server_private.key)',
      '',
      '# IP転送とNAT設定',
      'PostUp = echo 1 > /proc/sys/net/ipv4/ip_forward',
      'PostUp = iptables -A FORWARD -i %i -j ACCEPT',
      'PostUp = iptables -A FORWARD -o %i -j ACCEPT',
      'PostUp = iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE',
      '',
      'PostDown = iptables -D FORWARD -i %i -j ACCEPT',
      'PostDown = iptables -D FORWARD -o %i -j ACCEPT',
      'PostDown = iptables -t nat -D POSTROUTING -o eth0 -j MASQUERADE',
      'EOF',
      '',
      '# WireGuard自動起動設定',
      'systemctl enable wg-quick@wg0',
      'systemctl start wg-quick@wg0',
      '',
      '# CloudWatch Agentインストール',
      'wget https://s3.amazonaws.com/amazoncloudwatch-agent/amazon_linux/amd64/latest/amazon-cloudwatch-agent.rpm',
      'rpm -U ./amazon-cloudwatch-agent.rpm',
      'rm -f ./amazon-cloudwatch-agent.rpm',
      '',
      '# 運用スクリプトの配置',
      this.createAddClientScript(),
      this.createRemoveClientScript(),
      this.createListClientsScript(),
      '',
      '# スクリプトに実行権限付与',
      'chmod +x /usr/local/bin/add-client.sh',
      'chmod +x /usr/local/bin/remove-client.sh',
      'chmod +x /usr/local/bin/list-clients.sh',
      '',
      '# 完了メッセージ',
      'echo "WireGuard VPN Server setup completed successfully"',
      'echo "Server Public Key: $(cat /etc/wireguard/server_public.key)"'
    );

    return userData;
  }

  /**
   * クライアント追加スクリプト
   */
  private createAddClientScript(): string {
    return `
# クライアント追加スクリプト
cat > /usr/local/bin/add-client.sh << 'SCRIPT_EOF'
#!/bin/bash
set -e

if [ -z "$1" ]; then
  echo "Usage: $0 <client-name>"
  exit 1
fi

CLIENT_NAME=$1
CLIENT_DIR="/etc/wireguard/clients"
WG_CONFIG="/etc/wireguard/wg0.conf"
SERVER_PUBLIC_KEY=$(cat /etc/wireguard/server_public.key)
SERVER_ENDPOINT="$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4):${this.WIREGUARD_PORT}"

# クライアントIP割り当て（既存クライアント数+2）
CLIENT_COUNT=$(ls -1 $CLIENT_DIR/*.conf 2>/dev/null | wc -l)
CLIENT_IP="10.8.0.$((CLIENT_COUNT + 2))"

echo "Generating keys for client: $CLIENT_NAME"

# クライアント鍵生成
CLIENT_PRIVATE_KEY=$(wg genkey)
CLIENT_PUBLIC_KEY=$(echo "$CLIENT_PRIVATE_KEY" | wg pubkey)
CLIENT_PSK=$(wg genpsk)

# クライアント設定ファイル作成
cat > "$CLIENT_DIR/$CLIENT_NAME.conf" << EOF
[Interface]
Address = $CLIENT_IP/32
PrivateKey = $CLIENT_PRIVATE_KEY
DNS = 8.8.8.8

[Peer]
PublicKey = $SERVER_PUBLIC_KEY
PresharedKey = $CLIENT_PSK
Endpoint = $SERVER_ENDPOINT
AllowedIPs = 0.0.0.0/0
PersistentKeepalive = 25
EOF

chmod 600 "$CLIENT_DIR/$CLIENT_NAME.conf"

# サーバー設定にPeer追加
cat >> $WG_CONFIG << EOF

[Peer]
# $CLIENT_NAME
PublicKey = $CLIENT_PUBLIC_KEY
PresharedKey = $CLIENT_PSK
AllowedIPs = $CLIENT_IP/32
EOF

# WireGuard再起動
systemctl restart wg-quick@wg0

echo ""
echo "Client '$CLIENT_NAME' added successfully!"
echo "IP Address: $CLIENT_IP"
echo ""
echo "Configuration file: $CLIENT_DIR/$CLIENT_NAME.conf"
echo ""
cat "$CLIENT_DIR/$CLIENT_NAME.conf"
echo ""
echo "QR Code:"
qrencode -t ansiutf8 < "$CLIENT_DIR/$CLIENT_NAME.conf"
SCRIPT_EOF
`;
  }

  /**
   * クライアント削除スクリプト
   */
  private createRemoveClientScript(): string {
    return `
# クライアント削除スクリプト
cat > /usr/local/bin/remove-client.sh << 'SCRIPT_EOF'
#!/bin/bash
set -e

if [ -z "$1" ]; then
  echo "Usage: $0 <client-name>"
  exit 1
fi

CLIENT_NAME=$1
CLIENT_FILE="/etc/wireguard/clients/$CLIENT_NAME.conf"

if [ ! -f "$CLIENT_FILE" ]; then
  echo "Error: Client '$CLIENT_NAME' not found"
  exit 1
fi

read -p "Are you sure you want to remove client '$CLIENT_NAME'? (y/n): " confirm
if [ "$confirm" != "y" ]; then
  echo "Cancelled"
  exit 0
fi

# クライアント公開鍵取得
CLIENT_PUBLIC_KEY=$(grep "PublicKey" "$CLIENT_FILE" | awk '{print $3}')

# サーバー設定から削除（sedで該当Peerセクション削除）
# TODO: より堅牢な削除ロジックが必要

# クライアント設定ファイル削除
rm -f "$CLIENT_FILE"

# WireGuard再起動
systemctl restart wg-quick@wg0

echo "Client '$CLIENT_NAME' removed successfully"
SCRIPT_EOF
`;
  }

  /**
   * クライアント一覧スクリプト
   */
  private createListClientsScript(): string {
    return `
# クライアント一覧スクリプト
cat > /usr/local/bin/list-clients.sh << 'SCRIPT_EOF'
#!/bin/bash

CLIENT_DIR="/etc/wireguard/clients"

echo "Active WireGuard Clients:"
echo "========================"

if [ ! -d "$CLIENT_DIR" ] || [ -z "$(ls -A $CLIENT_DIR)" ]; then
  echo "No clients configured"
  exit 0
fi

count=0
for conf in "$CLIENT_DIR"/*.conf; do
  count=$((count + 1))
  client_name=$(basename "$conf" .conf)
  client_ip=$(grep "Address" "$conf" | awk '{print $3}')
  echo "$count. $client_name ($client_ip)"
done

echo ""
echo "Total: $count clients"
SCRIPT_EOF
`;
  }

  /**
   * Elastic IPの作成と関連付け
   */
  private createElasticIp(): ec2.CfnEIP {
    const eip = new ec2.CfnEIP(this, 'WireguardEIP', {
      domain: 'vpc',
      tags: [
        { key: 'Name', value: 'wireguard-eip' },
        { key: 'Project', value: 'WireGuard-VPN' },
      ],
    });

    new ec2.CfnEIPAssociation(this, 'WireguardEIPAssociation', {
      eip: eip.ref,
      instanceId: this.instance.instanceId,
    });

    return eip;
  }

  /**
   * Outputsの作成
   */
  private createOutputs(): void {
    new cdk.CfnOutput(this, 'InstanceId', {
      value: this.instance.instanceId,
      description: 'EC2 Instance ID',
      exportName: 'WireguardInstanceId',
    });

    new cdk.CfnOutput(this, 'ElasticIP', {
      value: this.elasticIp.ref,
      description: 'Elastic IP Address (Use this for client configuration)',
      exportName: 'WireguardElasticIP',
    });

    new cdk.CfnOutput(this, 'SecurityGroupId', {
      value: this.securityGroup.securityGroupId,
      description: 'Security Group ID',
    });

    new cdk.CfnOutput(this, 'SessionManagerCommand', {
      value: `aws ssm start-session --target ${this.instance.instanceId}`,
      description: 'Command to connect via Session Manager',
    });
  }
}
