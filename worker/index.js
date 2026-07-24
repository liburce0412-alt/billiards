/* global URL, Request, Response */

const getAsset = (request, env, pathname) => {
  const url = new URL(request.url)
  url.pathname = pathname
  return env.ASSETS.fetch(new Request(url, request))
}

export default {
  async fetch(request, env) {
    if (!env.ASSETS) {
      return new Response("Static asset binding is unavailable", { status: 500 })
    }

    const url = new URL(request.url)
    const pathname = url.pathname === "/" ? "/index.html" : url.pathname
    const response = await getAsset(request, env, pathname)
    if (response.status !== 404) return response

    const acceptsHtml = request.headers.get("accept")?.includes("text/html")
    if ((request.method === "GET" || request.method === "HEAD") && acceptsHtml) {
      return getAsset(request, env, "/index.html")
    }

    return response
  },
}
