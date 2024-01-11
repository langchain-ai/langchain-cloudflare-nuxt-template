import { HumanMessage, AIMessage } from "@langchain/core/messages";
import { HttpResponseOutputParser } from "langchain/output_parsers";

import { BedrockChat } from "@langchain/community/chat_models/bedrock/web";
import {
  ChatCloudflareWorkersAI,
  CloudflareVectorizeStore,
  CloudflareWorkersAIEmbeddings,
} from "@langchain/cloudflare";
import { createConversationalRetrievalChain } from "~/utils/conversational_retrieval_chain";

const formatChatHistory = (
  chatHistory: { type: "ai" | "human"; content: string }[],
) => {
  const messages = chatHistory.map((message) => {
    if (message.type === "ai") {
      return new AIMessage({ content: message.content });
    } else {
      return new HumanMessage({ content: message.content });
    }
  });

  return messages;
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

  const cloudflareModel = new ChatCloudflareWorkersAI({
    model: "@cf/meta/llama-2-7b-chat-fp16",
    cloudflareAccountId: process.env.CLOUDFLARE_ACCOUNT_ID,
    cloudflareApiToken: process.env.CLOUDFLARE_WORKERSAI_API_TOKEN,
  });

  // Set process.env.BEDROCK_AWS_ACCESS_KEY_ID to use a larger model for more reasoning-intensive,
  // low-token tasks like routing and question rephrasing
  const bedrockModel =
    process.env.BEDROCK_AWS_ACCESS_KEY_ID !== undefined
      ? new BedrockChat({
          model: "anthropic.claude-v2",
          region: process.env.BEDROCK_AWS_REGION,
          credentials: {
            accessKeyId: process.env.BEDROCK_AWS_ACCESS_KEY_ID!,
            secretAccessKey: process.env.BEDROCK_AWS_SECRET_ACCESS_KEY!,
          },
        })
      : undefined;

  const chain = createConversationalRetrievalChain({
    model: cloudflareModel,
    largerModel: bedrockModel,
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
