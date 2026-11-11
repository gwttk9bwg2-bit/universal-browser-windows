import { afterEach, describe, expect, it } from "vitest";
import { ApiServer } from "../src/api.js";
let server:ApiServer|undefined;afterEach(()=>server?.stop());describe("api",()=>{it("serves health and dashboard",async()=>{server=new ApiServer({port:0});const a=await server.start();const base=`http://${a.host}:${a.port}`;expect(await fetch(`${base}/api/health`).then(r=>r.json())).toMatchObject({ok:true});expect(await fetch(base).then(r=>r.text())).toContain("Universal Browser")})});
