import type { MissionInput } from "@/content/schema";
import { netLayeredTriage } from "./net-layered-triage";
import { netIpv4Addressing } from "./net-ipv4-addressing";
import { netDnsNameVsIp } from "./net-dns-name-vs-ip";
import { netPortsListeners } from "./net-ports-listeners";
import { netSubnetPrefix } from "./net-subnet-prefix";
import { netDhcpLease } from "./net-dhcp-lease";
import { netRoutingGateway } from "./net-routing-gateway";
import { netHttpMaintenance503 } from "./net-http-maintenance-503";
import { netFirewallScopedAllow } from "./net-firewall-scoped-allow";
import { netTcpUdpDns } from "./net-tcp-udp-dns";
import { netTlsCertificates } from "./net-tls-certificates";
import { netCompoundOutage } from "./net-compound-outage";

/** Networking track, in map order: beginner 1–4, intermediate 1–4, advanced 1–4. */
export const networkingMissions: MissionInput[] = [
  netLayeredTriage,
  netIpv4Addressing,
  netDnsNameVsIp,
  netPortsListeners,
  netSubnetPrefix,
  netDhcpLease,
  netRoutingGateway,
  netHttpMaintenance503,
  netFirewallScopedAllow,
  netTcpUdpDns,
  netTlsCertificates,
  netCompoundOutage,
];
