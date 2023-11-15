import { ChatPromptTemplate, MessagesPlaceholder } from "langchain/prompts";
import { HumanMessage, AIMessage } from "langchain/schema";
import { ChatOpenAI } from "langchain/chat_models/openai";
import { ChatCloudflareWorkersAI } from "langchain/chat_models/cloudflare_workersai";
import { StringOutputParser, BytesOutputParser } from "langchain/schema/output_parser";
import { RunnableSequence, RunnablePassthrough } from "langchain/schema/runnable";

/**
 * readRequestBody reads in the incoming request body
 * Use await readRequestBody(..) in an async function to get the string
 * @param {Request} request the incoming request to read from
 */
async function readRequestBody(request) {
  console.log(request.headers);
  const contentType = request.headers.get("content-type");
  if (contentType.includes("application/json")) {
    return JSON.stringify(await request.json());
  } else if (contentType.includes("application/text")) {
    return request.text();
  } else if (contentType.includes("text/html")) {
    return request.text();
  } else if (contentType.includes("form")) {
    const formData = await request.formData();
    const body = {};
    for (const entry of formData.entries()) {
      body[entry[0]] = entry[1];
    }
    return JSON.stringify(body);
  } else {
    // Perhaps some other type of data was submitted in the form
    // like an image, or some other binary data.
    return "a file";
  }
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function onRequest(context) {
  if (context.request.method === "OPTIONS") {
    return new Response("", {
      headers: corsHeaders
    })
  }
  console.log(context);
  const body = await readRequestBody(context.request);
  console.log(body);
  const { messages } = body;
  const history = messages.slice(0, -1).map((message) => {
    if (message.type === "human") {
      return new HumanMessage({ content: message.content });
    } else {
      return new AIMessage({ content: message.content });
    }
  });
  const currentMessage = messages[messages.length - 1];

  const openAIModel = new ChatOpenAI({
    modelName: "gpt-3.5-turbo",
  });

  const extractionPrompt = ChatPromptTemplate.fromMessages([
    ["system", `Answer the user's question as best you can. Reply in short phrases, using the chat history as context.`
    ],
    new MessagesPlaceholder('history'),
    ["human", "What domain of knowledge would be most helpful in answering the following question? Try to keep answers to one word:\n{input}"],
  ]);
  
  const answerPrompt = ChatPromptTemplate.fromMessages([
    ["system", `You are an expert in {topic}. Be concise, kind, and helpful.
Format your answers to be readable in a chat interface, and logically split your answer into paragraphs for readability.`
    ],
    new MessagesPlaceholder('history'),
    ["human", "{input}"],
  ]);

  const cloudflareModel = new ChatCloudflareWorkersAI({
    cloudflareApiToken: process.env.CLOUDFLARE_WORKERSAI_API_TOKEN,
  });

  const chain = RunnableSequence.from([
    RunnablePassthrough.assign({ 
      topic: extractionPrompt.pipe(openAIModel).pipe(new StringOutputParser()) 
    }),
    answerPrompt,
    cloudflareModel,
    new BytesOutputParser(),
  ]);
  const stream = await chain.stream({
    history,
    input: currentMessage.content
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      ...corsHeaders
    }
  });
}