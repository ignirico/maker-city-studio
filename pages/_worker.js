const upstream = 'https://maker-city-reference-studio.ignirico.chatgpt.site';
const github = 'https://ignirico.github.io';
const methods = {
  '/api/board': ['GET', 'PUT'],
  '/api/auth': ['POST'],
  '/api/upload': ['POST'],
};

function applyCors(headers) {
  headers.set('Access-Control-Allow-Origin', github);
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, If-Match, Range');
  headers.set('Access-Control-Allow-Methods', 'GET, HEAD, PUT, POST, OPTIONS');
  headers.set('Access-Control-Expose-Headers', 'ETag, Content-Length, Content-Range, Accept-Ranges');
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (!pathname.startsWith('/api/') && !pathname.startsWith('/media/')) {
      return env.ASSETS.fetch(request);
    }

    const allowed = methods[pathname] || (/^\/media\/[a-f0-9-]{36}$/.test(pathname) ? ['GET','HEAD'] : []);
    const headers = new Headers();
    applyCors(headers);
    if (!allowed.length) return new Response(null, {status: 404, headers});
    if (request.method === 'OPTIONS') return new Response(null, {status: 204, headers});
    if (!allowed.includes(request.method)) return new Response(null, {status: 405, headers});

    const forwarded = new Headers();
    for (const name of ['Content-Type', 'Content-Length', 'If-Match', 'Range']) {
      if (request.headers.has(name)) forwarded.set(name, request.headers.get(name));
    }
    const write = ['POST','PUT'].includes(request.method);
    if (write && request.headers.has('Authorization')) {
      forwarded.set('Authorization', request.headers.get('Authorization'));
    }
    try {
      const response = await fetch(upstream + pathname, {
        method: request.method,
        headers: forwarded,
        body: write ? request.body : undefined,
        redirect: 'manual',
      });
      for (const name of ['Content-Type','Cache-Control','Content-Length','Content-Range','Accept-Ranges','ETag','X-Content-Type-Options']) {
        if (response.headers.has(name)) headers.set(name, response.headers.get(name));
      }
      if (pathname.startsWith('/api/')) headers.set('Cache-Control','no-store');
      return new Response(response.body, { status:response.status, headers });
    } catch {
      headers.set('Content-Type','application/json');
      headers.set('Cache-Control','no-store');
      return new Response(JSON.stringify({error:'共享服务暂时无法连接。'}), {status:502, headers});
    }
  }
};
