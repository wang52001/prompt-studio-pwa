// 模型服务商配置（下划线开头，不会被当作路由）

export const PROVIDERS = {
  dashscope: {
    name: '阿里云百炼',
    endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    models: ['qwen-turbo', 'qwen-plus', 'qwen-max']
  },
  deepseek: {
    name: 'DeepSeek',
    endpoint: 'https://api.deepseek.com/v1/chat/completions',
    models: ['deepseek-chat', 'deepseek-reasoner']
  },
  glm: {
    name: '智谱 GLM',
    endpoint: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
    models: ['glm-4-flash', 'glm-4-plus']
  },
  openai: {
    name: 'OpenAI',
    endpoint: 'https://api.openai.com/v1/chat/completions',
    models: ['gpt-4o-mini', 'gpt-4o']
  },
  moonshot: {
    name: 'Moonshot Kimi',
    endpoint: 'https://api.moonshot.cn/v1/chat/completions',
    models: ['moonshot-v1-8k', 'moonshot-v1-32k']
  },
  custom: {
    name: '自定义（OpenAI 兼容）',
    endpoint: '',
    models: []
  }
};

/** 把服务商标识 / 自定义 base_url 解析成完整的 chat 地址 */
export function resolveEndpoint(provider, baseUrl) {
  if (provider === 'custom') {
    let u = String(baseUrl || '').trim().replace(/\/+$/, '');
    if (!u) return '';
    return u.endsWith('/chat/completions') ? u : `${u}/chat/completions`;
  }
  return PROVIDERS[provider]?.endpoint || PROVIDERS.dashscope.endpoint;
}

export function defaultModel(provider) {
  return PROVIDERS[provider]?.models?.[0] || '';
}

/** 只给前端看的公开信息（不含任何密钥） */
export const providerOptions = () =>
  Object.entries(PROVIDERS).map(([id, v]) => ({ id, name: v.name, models: v.models }));
