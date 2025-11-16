import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';

/**
 * WireGuard VPC Stack
 *
 * このスタックはWireGuard VPNサーバーのためのVPCとネットワーク構成を作成します。
 *
 * 主要なリソース:
 * - VPC (10.0.0.0/16)
 * - Public Subnet (10.0.1.0/24)
 * - Internet Gateway
 * - Route Table
 */
export class WireguardVpcStack extends cdk.Stack {
  public readonly vpc: ec2.Vpc;
  public readonly publicSubnet: ec2.ISubnet;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // VPC CIDR定義
    const VPC_CIDR = '10.0.0.0/16';

    // VPC作成
    this.vpc = new ec2.Vpc(this, 'WireguardVpc', {
      ipAddresses: ec2.IpAddresses.cidr(VPC_CIDR),
      maxAzs: 1, // コスト最適化のため単一AZ
      natGateways: 0, // NATゲートウェイ不要（コスト削減）
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC,
        },
      ],
      enableDnsHostnames: true,
      enableDnsSupport: true,
    });

    // Public Subnetの取得
    this.publicSubnet = this.vpc.publicSubnets[0];

    // タグ付け
    cdk.Tags.of(this.vpc).add('Name', 'wireguard-vpc');
    cdk.Tags.of(this.vpc).add('Project', 'WireGuard-VPN');
    cdk.Tags.of(this.vpc).add('Environment', 'Production');
    cdk.Tags.of(this.vpc).add('ManagedBy', 'CDK');
    cdk.Tags.of(this.vpc).add('CostCenter', 'Infrastructure');
    cdk.Tags.of(this.vpc).add('Purpose', 'Personal-VPN');

    // Outputs
    new cdk.CfnOutput(this, 'VpcId', {
      value: this.vpc.vpcId,
      description: 'VPC ID',
      exportName: 'WireguardVpcId',
    });

    new cdk.CfnOutput(this, 'VpcCidr', {
      value: this.vpc.vpcCidrBlock,
      description: 'VPC CIDR Block',
    });

    new cdk.CfnOutput(this, 'PublicSubnetId', {
      value: this.publicSubnet.subnetId,
      description: 'Public Subnet ID',
      exportName: 'WireguardPublicSubnetId',
    });

    new cdk.CfnOutput(this, 'AvailabilityZone', {
      value: this.publicSubnet.availabilityZone,
      description: 'Availability Zone',
    });
  }
}
