"""Safe, actionable provider failures without exposing upstream response bodies."""

def provider_error_response(error):
    status = getattr(error, 'status_code', None)
    response = getattr(error, 'response', None)
    if status is None and response is not None:
        status = getattr(response, 'status_code', None)
    module = type(error).__module__
    name = type(error).__name__.lower()
    text = str(error).lower()
    provider = module.startswith(('openai', 'httpx', 'requests', 'google.genai'))
    codex = isinstance(error, ValueError) and any(word in text for word in ('codex credential', 'codex login', 'codex auth', 'sign in to codex'))
    if status in (401, 403) or codex or (provider and 'authentication' in name):
        return {'error': 'AI 服务认证失败或登录已过期。请在创作设置检查 API Key；使用 Codex 时，请通过创作空间菜单重新连接登录。草稿已保留。', 'code': 'provider_auth'}, 401
    if status == 429:
        return {'error': 'AI 服务额度不足或请求过于频繁。请检查服务账户额度，稍后重试。草稿已保留。', 'code': 'provider_quota'}, 429
    if provider and ('timeout' in name or isinstance(error, TimeoutError)):
        return {'error': 'AI 服务响应超时。请检查网络和服务地址后重试；草稿已保留。', 'code': 'provider_timeout'}, 504
    if provider and (status in (400, 404, 422) or 'badrequest' in name):
        return {'error': 'AI 服务不支持当前模型或请求。请在创作设置核对模型名称、兼容接口地址及服务支持范围。草稿已保留。', 'code': 'provider_configuration'}, 400
    if provider or (isinstance(error, ValueError) and ('codex' in text or 'http ' in text)):
        return {'error': '无法连接 AI 服务或服务暂不可用。请检查网络、接口地址及服务状态后重试；草稿已保留。', 'code': 'provider_unavailable'}, 503
    return None
