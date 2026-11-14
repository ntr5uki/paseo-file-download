import { defineTranslations } from '@getpaseo/plugin/client';
export const messages = defineTranslations({ resources: {
  en: {
    title: 'File downloads', cardTitle: 'Available files', download: 'Download', preparing: 'Preparing…',
    settingsTitle: 'Download settings', settingsHint: 'Use an address this device can reach. For a remote host, localhost refers to this device.',
    publicUrl: 'Public download URL', publicUrlHint: 'For example http://192.168.1.20:6768, or an HTTPS reverse proxy URL.',
    port: 'HTTP port', listener: 'Listen on', allInterfaces: 'All network interfaces', loopback: 'This computer only',
    autoCards: 'Add cards after agent replies', autoCardsHint: 'Find explicit file links in completed replies. Files stay inside their workspace.',
    save: 'Save settings', saving: 'Saving…', saved: 'Settings saved', loading: 'Loading…',
    running: 'Download service is running', stopped: 'Download service is unavailable', started: 'Download started',
    latest: 'Add download card for the latest reply', command: 'Download a workspace file, or add files from the latest reply',
    noFiles: 'No downloadable file links were found in the latest reply.',
    browserHint: 'Your browser handles saving the file.', setupHint: 'Set a reachable public URL in settings before downloading.',
  },
  'zh-CN': {
    title: '文件下载', cardTitle: '可下载文件', download: '下载', preparing: '准备中…',
    settingsTitle: '下载设置', settingsHint: '填写当前设备可以访问的地址。连接远程主机时，localhost 指的是当前设备。',
    publicUrl: '下载访问地址', publicUrlHint: '例如 http://192.168.1.20:6768，或 HTTPS 反向代理地址。',
    port: 'HTTP 端口', listener: '监听范围', allInterfaces: '所有网络接口', loopback: '仅本机',
    autoCards: '在 Agent 回复后添加下载卡片', autoCardsHint: '识别已完成回复中的文件链接，文件限定在所属工作区内。',
    save: '保存设置', saving: '保存中…', saved: '设置已保存', loading: '加载中…',
    running: '下载服务正在运行', stopped: '下载服务不可用', started: '已发起下载',
    latest: '为最新回复添加下载卡片', command: '下载指定工作区文件，或提取最新回复中的文件',
    noFiles: '最新回复中没有找到可下载的文件链接。',
    browserHint: '文件由浏览器或桌面端下载管理器保存。', setupHint: '首次下载前，请在设置中填写可以访问的下载地址。',
  },
} });
