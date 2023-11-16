import type { VectorStore } from "langchain/vectorstores/base";
import type { BaseLanguageModel } from "langchain/base_language";

import { ChatPromptTemplate, MessagesPlaceholder } from "langchain/prompts";
import { RunnableSequence, RunnableBranch } from "langchain/schema/runnable";
import { StringOutputParser } from "langchain/schema/output_parser";
import { formatDocumentsAsString } from "langchain/util/document";

const CONDENSE_QUESTION_SYSTEM_TEMPLATE = `You are an experienced researcher, expert at interpreting and answering questions based on provided sources.
Your job is to remove references to chat history from incoming questions, rephrasing them as standalone questions.`;

const CONDENSE_QUESTION_HUMAN_TEMPLATE = `Using only any previous conversation as context, rephrase the following question to be a standalone question.

Do not respond with anything other than a rephrased standalone question. Be concise.

<question>
  {question}
</question>`;
const condenseQuestionPrompt = ChatPromptTemplate.fromMessages([
  ["system", CONDENSE_QUESTION_SYSTEM_TEMPLATE],
  new MessagesPlaceholder("chat_history"),
  ["human", CONDENSE_QUESTION_HUMAN_TEMPLATE],
]);

const ANSWER_SYSTEM_TEMPLATE = `You are an experienced researcher, expert at interpreting and answering questions based on provided sources. Using the provided context, answer the user's question to the best of your ability using the resources provided.
Generate a concise answer for a given question based solely on the provided context. You must only use information from the provided search results. Use an unbiased and journalistic tone. Combine search results together into a coherent answer. Do not repeat text.
If there is nothing in the context relevant to the question at hand, just say "Hmm, I'm not sure." Don't try to make up an answer.
Anything between the following \`context\` html blocks is retrieved from a knowledge bank, not part of the conversation with the user.

<context>
  {context}
</context>

REMEMBER: If there is no relevant information within the context, just say "Hmm, I'm not sure." Don't try to make up an answer.`;

const ANSWER_HUMAN_TEMPLATE = `Answer the following question to the best of your ability. This is extremely important for my career!

{standalone_question}`;

const answerPrompt = ChatPromptTemplate.fromMessages([
  ["system", ANSWER_SYSTEM_TEMPLATE],
  new MessagesPlaceholder("chat_history"),
  ["human", ANSWER_HUMAN_TEMPLATE],
]);

const ROUTER_TEMPLATE = `You are an experienced researcher, expert at interpreting and answering questions based on provided sources.
You have access to two databases: one with information about Cloudflare, and another about artificial intelligence. 
Your job is to pick the database that would be more useful to answer the following question:

<question>
  {standalone_question}
</question>

You must respond with one of the following answers: "Cloudflare", "Artificial Intelligence", or "Neither". Do not include anything else in your response.`;

const routerPrompt = ChatPromptTemplate.fromTemplate(ROUTER_TEMPLATE);

export function createConversationalRetrievalChain({
  model,
  cloudflareKnowledgeVectorstore,
  aiKnowledgeVectorstore,
}: {
  model: BaseLanguageModel;
  cloudflareKnowledgeVectorstore: VectorStore;
  aiKnowledgeVectorstore: VectorStore;
}) {
  const cloudflareKnowledgeRetriever = cloudflareKnowledgeVectorstore
    .asRetriever()
    .withConfig({ runName: "CloudflareKnowledgeRetriever" });
  const aiKnowledgeRetriever = aiKnowledgeVectorstore
    .asRetriever()
    .withConfig({ runName: "AIKnowledgeRetriever" });

  const standaloneQuestionChain = RunnableSequence.from([
    {
      question: (input) => input.question,
      chat_history: (input) => input.chat_history,
    },
    condenseQuestionPrompt,
    model,
    new StringOutputParser(),
  ]).withConfig({ runName: "RephraseQuestionChain" });

  const routingChain = RunnableSequence.from([
    routerPrompt,
    model,
    new StringOutputParser(),
  ]).withConfig({ runName: "RoutingChain" });

  const retrievalChain = RunnableSequence.from([
    {
      standalone_question: (input) => input.standalone_question,
      knowledge_base_name: routingChain,
    },
    // Default to the AI retriever if the model does not think Cloudflare would be helpful.
    // You could change this to a general search retriever instead.
    RunnableBranch.from([
      [
        (output) =>
          output.knowledge_base_name.toLowerCase().includes("cloudflare"),
        RunnableSequence.from([
          (output) => output.standalone_question,
          cloudflareKnowledgeRetriever,
        ]),
      ],
      RunnableSequence.from([
        (output) => output.standalone_question,
        aiKnowledgeRetriever,
      ]),
    ]),
    formatDocumentsAsString,
  ]).withConfig({ runName: "RetrievalChain" });

  const answerChain = RunnableSequence.from([
    {
      standalone_question: (input) => input.standalone_question,
      chat_history: (input) => input.chat_history,
      context: retrievalChain,
    },
    answerPrompt,
    model,
  ]).withConfig({ runName: "AnswerGenerationChain" });

  return RunnableSequence.from([
    {
      standalone_question: standaloneQuestionChain,
      chat_history: (input) => input.chat_history,
    },
    answerChain,
  ]).withConfig({ runName: "ConversationalRetrievalChain" });
}
