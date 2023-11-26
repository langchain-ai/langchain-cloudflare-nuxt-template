import { HttpResponseOutputParser } from "langchain/output_parsers";

import { BedrockChat } from "langchain/chat_models/bedrock/web";
import { CloudflareWorkersAI } from "langchain/llms/cloudflare_workersai";
import { CloudflareVectorizeStore } from "langchain/vectorstores/cloudflare_vectorize";
import { CloudflareWorkersAIEmbeddings } from "langchain/embeddings/cloudflare_workersai";
import { createConversationalRetrievalChain } from "~/utils/conversational_retrieval_chain";

const formatChatHistory = (
  chatHistory: { type: "ai" | "human"; content: string }[],
) => {
  const messages = chatHistory.map((message) => {
    if (message.type === "ai") {
      return `Assistant: ${message.content}`;
    } else {
      return `Human: ${message.content}`;
    }
  });

  return messages.join("\n");
};

export default defineEventHandler(async (event) => {
  const cloudflareBindings = event.context?.cloudflare?.env;
  if (!cloudflareBindings) {
    throw new Error("No Cloudflare bindings found.");
  }
  const body = await readBody(event);
  const { messages } = body;
  const history = messages.slice(0, -1);
  const currentMessage = messages[messages.length - 1];

  const embeddings = new CloudflareWorkersAIEmbeddings({
    binding: cloudflareBindings.AI,
    modelName: "@cf/baai/bge-base-en-v1.5",
  });

  const aiKnowledgeVectorstore = new CloudflareVectorizeStore(embeddings, {
    index: cloudflareBindings.AI_KNOWLEDGE_VECTORIZE_INDEX,
  });

  const cloudflareKnowledgeVectorstore = new CloudflareVectorizeStore(
    embeddings,
    {
      index: cloudflareBindings.CLOUDFLARE_KNOWLEDGE_VECTORIZE_INDEX,
    },
  );

  const cloudflareModel = new CloudflareWorkersAI({
    model: "@cf/mistral/mistral-7b-instruct-v0.1",
    cloudflareAccountId: process.env.CLOUDFLARE_ACCOUNT_ID,
    cloudflareApiToken: process.env.CLOUDFLARE_WORKERSAI_API_TOKEN,
  });

  // Uncomment and install peer dependencies to use a larger model for
  // more reasoning-intensive, low-token tasks like routing and question rephrasing

  const bedrockModel = new BedrockChat({
    model: "anthropic.claude-v2",
    region: process.env.BEDROCK_AWS_REGION,
    credentials: {
      accessKeyId: process.env.BEDROCK_AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.BEDROCK_AWS_SECRET_ACCESS_KEY!,
    },
  });

  const chain = createConversationalRetrievalChain({
    model: cloudflareModel,
    // largerModel: bedrockModel,
    aiKnowledgeVectorstore,
    cloudflareKnowledgeVectorstore,
  });

  let runIdResolver: (runId: string) => void;
  const runIdPromise = new Promise<string>((resolve) => {
    runIdResolver = resolve;
  });

  const stream = await chain
    .pipe(new HttpResponseOutputParser({ contentType: "text/event-stream" }))
    .stream(
      {
        chat_history: formatChatHistory(history),
        question: currentMessage.content,
      },
      {
        callbacks: [
          {
            handleChainStart(_llm, _prompts, runId) {
              runIdResolver(runId);
            },
          },
        ],
      },
    );

  const runId = await runIdPromise;
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "X-Langsmith-Run-Id": runId,
    },
  });
});
