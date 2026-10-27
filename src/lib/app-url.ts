/** Public URLs must use APP_URL, never the Docker listener from request.url. */
export function appUrl(path: string): URL {
  const url = new URL(process.env.APP_URL!);
  const query = path.indexOf("?");
  url.pathname = query === -1 ? path : path.slice(0, query);
  url.search = query === -1 ? "" : path.slice(query);
  url.hash = "";
  return url;
}
