import { Client } from "langsmith";

export default defineEventHandler(async (event) => {
  if (!process.env.LANGCHAIN_API_KEY) {
    throw new Error("No LangChain API key set.");
  }
  const langsmithClient = new Client();
  const body = await readBody(event);
  const runId = body.run_id;
  if (!runId) {
    return Response.json(
      { error: "You must provide a run id." },
      { status: 400 },
    );
  }
  const traceUrl = await langsmithClient.shareRun(runId);
  return Response.json({ url: traceUrl }, { status: 200 });
});
