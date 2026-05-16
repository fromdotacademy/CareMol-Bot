import { app, init } from "../server";

// Called once on cold start; subsequent warm invocations reuse the resolved promise
const initPromise = init();

export default async function handler(req: any, res: any) {
  await initPromise;
  return app(req, res);
}
