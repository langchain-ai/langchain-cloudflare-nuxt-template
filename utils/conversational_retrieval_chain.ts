import type { VectorStore } from "@langchain/core/vectorstores";
import type { BaseLanguageModel } from "@langchain/core/language_models/base";
import type { Document } from "@langchain/core/documents";

import {
  ChatPromptTemplate,
  MessagesPlaceholder,
} from "@langchain/core/prompts";
import { RunnableSequence, RunnableBranch } from "@langchain/core/runnables";
import { StringOutputParser } from "@langchain/core/output_parsers";

const CONDENSE_QUESTION_SYSTEM_TEMPLATE = `You are an experienced researcher, expert at interpreting and answering questions based on provided sources.
Your job is to remove references to chat history from incoming questions, rephrasing them as standalone questions.`;

const CONDENSE_QUESTION_HUMAN_TEMPLATE = `Using only previous conversation as context, rephrase the following question to be a standalone question.

Do not respond with anything other than a rephrased standalone question. Be concise, but complete and resolve all references to the chat history.

<question>
  {question}
</question>`;
const condenseQuestionPrompt = ChatPromptTemplate.fromMessages([
  ["system", CONDENSE_QUESTION_SYSTEM_TEMPLATE],
  new MessagesPlaceholder("chat_history"),
  ["human", CONDENSE_QUESTION_HUMAN_TEMPLATE],
]);

const ROUTER_TEMPLATE = `You are an experienced researcher, expert at interpreting and answering questions based on provided sources.
You have access to two databases: one with information about Cloudflare, and another about artificial intelligence. 
Your job is to pick the database that would be more useful to answer the following question:

<question>
  {standalone_question}
</question>

You must respond with one of the following answers: "Cloudflare", "Artificial Intelligence", or "Neither". Do not include anything else in your response.`;

// This is equivalent to a human message
const routerPrompt = ChatPromptTemplate.fromTemplate(ROUTER_TEMPLATE);

const ANSWER_SYSTEM_TEMPLATE = `You are an experienced researcher, expert at interpreting and answering questions based on provided sources.
Using the provided context, answer the user's question to the best of your ability using only the resources provided.
Generate a concise answer for a given question based solely on the provided context.
You must only use information from the provided search results. Use an unbiased and journalistic tone. Combine search results together into a coherent answer. Do not repeat text.
If there is no information in the context relevant to the question at hand, just say "Hmm, I'm not sure."
Anything between the following \`context\` html blocks is retrieved from a knowledge bank, not part of the conversation with the user.

<context>
  {context}
</context>

REMEMBER: Be concise, and only use facts from the provided context.`;

const ANSWER_HUMAN_TEMPLATE = `Answer the following question to the best of your ability. This is extremely important for my career!

{standalone_question}`;

const answerPrompt = ChatPromptTemplate.fromMessages([
  ["system", ANSWER_SYSTEM_TEMPLATE],
  // Adding chat history as part of the final answer generation is distracting for a small model like Llama 2-7B.
  // If using a more powerful model, you can re-enable to better support meta-questions about the conversation.
  // new MessagesPlaceholder("chat_history"),
  ["human", ANSWER_HUMAN_TEMPLATE],
]);

const formatDocuments = (docs: Document[]) => {
  return docs
    .map((doc, i) => {
      return `<doc>\n${doc.pageContent}\n</doc>`;
    })
    .join("\n");
};

export function createConversationalRetrievalChain({
  model,
  largerModel,
  cloudflareKnowledgeVectorstore,
  aiKnowledgeVectorstore,
}: {
  model: BaseLanguageModel;
  largerModel?: BaseLanguageModel;
  cloudflareKnowledgeVectorstore: VectorStore;
  aiKnowledgeVectorstore: VectorStore;
}) {
  const cloudflareKnowledgeRetriever = cloudflareKnowledgeVectorstore
    .asRetriever()
    .withConfig({ runName: "CloudflareKnowledgeRetriever" });
  const aiKnowledgeRetriever = aiKnowledgeVectorstore
    .asRetriever()
    .withConfig({ runName: "AIKnowledgeRetriever" });

  const routingChain = RunnableSequence.from([
    routerPrompt,
    largerModel ?? model,
    new StringOutputParser(),
  ]).withConfig({ runName: "RoutingChain" });

  const retrievalChain = RunnableSequence.from([
    {
      standalone_question: (input) => input.standalone_question,
      knowledge_base_name: routingChain,
    },
    // Default to the AI retriever if the model does not think Cloudflare would be helpful.
    // You could change this to e.g. a general search retriever instead.
    RunnableBranch.from([
      [
        (output) =>
          output.knowledge_base_name.toLowerCase().includes("cloudflare"),
        RunnableSequence.from([
          // Retrievers only take a single string as input,
          // so we have to extract it from the previous step output.
          (output) => output.standalone_question,
          cloudflareKnowledgeRetriever,
        ]),
      ],
      RunnableSequence.from([
        (output) => output.standalone_question,
        aiKnowledgeRetriever,
      ]),
    ]),
    formatDocuments,
  ]).withConfig({ runName: "RetrievalChain" });

  const standaloneQuestionChain = RunnableSequence.from([
    condenseQuestionPrompt,
    largerModel ?? model,
    new StringOutputParser(),
  ]).withConfig({ runName: "RephraseQuestionChain" });

  const answerChain = RunnableSequence.from([
    {
      standalone_question: (input) => input.standalone_question,
      chat_history: (input) => input.chat_history,
      context: retrievalChain,
    },
    answerPrompt,
    model,
  ]).withConfig({ runName: "AnswerGenerationChain" });

  /**
   * Chain steps are:
   * 1. If there is chat history, rephrase initial question as standalone question with standaloneQuestionChain
   *   If question is not a followup, pass the user's question directly through
   * 2. Choose proper vectorstore based on the question using routingChain
   * 3. Retrieve context docs based on the output of routingChain using retrievalChain
   * 4. Generate a final answer based on context, question, and chat history in answerChain
   *
   * Illustrative trace:
   * https://smith.langchain.com/public/0474c554-01ab-4f7f-937f-b6c205fa91f5/r
   */
  return RunnableSequence.from([
    {
      standalone_question: RunnableBranch.from([
        [(input) => input.chat_history.length > 0, standaloneQuestionChain],
        (input) => input.question,
      ]),
      chat_history: (input) => input.chat_history,
    },
    answerChain,
  ]).withConfig({ runName: "ConversationalRetrievalChain" });
}
