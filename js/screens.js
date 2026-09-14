// 页面总表：合并 21 个页面
import { screens1 } from './screens-1.js';
import { screens2 } from './screens-2.js';
import { screens3 } from './screens-3.js';
import { screens4 } from './screens-4.js';
import { screens5 } from './screens-5.js';

export const screens = {
  ...screens1, ...screens2, ...screens3, ...screens4, ...screens5
};

// 底部 Tab 对应的页面（这些页面显示 TabBar）
export const TAB_SCREENS = ['workbench', 'editor', 'playground', 'library', 'profile'];

export const showTabBar = (id) => TAB_SCREENS.includes(id);

export const TITLES = {
  splash: 'Prompt Studio',
  login: '登录 / 注册',
  workbench: '工作台',
  editor: '编辑器',
  debug: 'AI 调试台',
  library: '素材库',
  playground: '乐园',
  gacha: '扭蛋机',
  silly: '沙雕生成器',
  arena: '竞技场',
  bingo: '本周 Bingo',
  badges: '成就徽章墙',
  koi: '每日锦鲤',
  failwall: '翻车现场墙',
  community: '社区广场',
  profile: '个人中心',
  settings: '设置',
  apikeys: 'API 密钥管理',
  stats: '统计分析',
  batchtest: '批量测试',
  offline: '离线状态'
};

export default screens;
