// Public free Xray/V2Ray subscription URLs.
// These auto-update every few hours and contain hundreds of free servers
// (VLESS, VMess, Trojan, Shadowsocks). Quality varies — pick the fastest
// in the server list after Refresh.

export const FREE_POOLS = [
  {
    id: 'mahdibland',
    name: 'V2RayAggregator',
    desc: '~600 серверов, обновляется каждые 6 часов. Самый стабильный',
    url: 'https://raw.githubusercontent.com/mahdibland/V2RayAggregator/master/sub/sub_merge_base64.txt',
  },
  {
    id: 'pawdroid',
    name: 'Pawdroid Free',
    desc: '~200 серверов, рабочие в Азии и Европе',
    url: 'https://raw.githubusercontent.com/Pawdroid/Free-servers/main/sub',
  },
  {
    id: 'freefq',
    name: 'freefq',
    desc: 'Классический пул, обновляется ежедневно',
    url: 'https://raw.githubusercontent.com/freefq/free/master/v2',
  },
  {
    id: 'barabama',
    name: 'FreeNodes',
    desc: 'Агрегатор из нескольких источников',
    url: 'https://raw.githubusercontent.com/Barabama/FreeNodes/main/nodes/v2rayn.txt',
  },
];
